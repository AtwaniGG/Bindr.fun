'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { usePrivy } from '@privy-io/react-auth';
import {
  useWallets as useSolanaWallets,
  useSignAndSendTransaction,
} from '@privy-io/react-auth/solana';
import { useAccount } from 'wagmi';
import {
  PublicKey,
  Transaction,
  Connection,
} from '@solana/web3.js';
import {
  createBurnInstruction,
  getAssociatedTokenAddress,
} from '@solana/spl-token';
import bs58 from 'bs58';
import { api } from '@/lib/api';
import type {
  GachaPriceInfo,
  GachaPullStatus,
  GachaInventoryStats,
  GachaHistoryItem,
} from '@/lib/api';
import Link from 'next/link';
import CardReveal from '@/components/gacha/CardReveal';
import SlabPack from '@/components/gacha/SlabPack';

const SLAB_MINT = new PublicKey(
  process.env.NEXT_PUBLIC_SLAB_MINT_ADDRESS ||
    '8d198qeKHyXf1aYQVoGNU9RMBnbdhHZFkvYpJMt8pump',
);

const SOLANA_RPC_URL =
  process.env.NEXT_PUBLIC_SOLANA_RPC_URL ||
  'https://api.mainnet-beta.solana.com';

type PullState =
  | 'idle'
  | 'burning'
  | 'verifying'
  | 'revealing'
  | 'complete'
  | 'error';

export default function GachaPage() {
  const { ready, authenticated, login, logout } = usePrivy();
  const { wallets: solanaWallets } = useSolanaWallets();
  const { signAndSendTransaction } = useSignAndSendTransaction();
  const { address: evmAddress } = useAccount();

  // Only treat addresses as real once Privy has finished hydrating.
  // `ready === true` means Privy has restored its session; before that,
  // wallets[0] may briefly be undefined and we'd otherwise compute a
  // stale `walletsReady`.
  const solanaWallet = ready ? solanaWallets[0] : undefined;
  const solanaAddress = ready ? solanaWallet?.address ?? '' : '';
  const polygonAddress = ready ? evmAddress ?? '' : '';
  const walletsReady = ready && authenticated && !!solanaAddress && !!polygonAddress;

  const [price, setPrice] = useState<GachaPriceInfo | null>(null);
  const [stats, setStats] = useState<GachaInventoryStats | null>(null);
  const [pullState, setPullState] = useState<PullState>('idle');
  const [pullResult, setPullResult] = useState<GachaPullStatus | null>(null);
  const [error, setError] = useState('');
  const [history, setHistory] = useState<GachaHistoryItem[]>([]);
  const [beta, setBeta] = useState<{ active: boolean; priceUsd: number; whitelisted: boolean } | null>(null);
  const [code, setCode] = useState('');
  const [redeeming, setRedeeming] = useState(false);
  const [redeemError, setRedeemError] = useState('');
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        const [priceData, statsData] = await Promise.all([
          api.gacha.getPrice(),
          api.gacha.getInventoryStats(),
        ]);
        setPrice(priceData);
        setStats(statsData);
      } catch {
        // Price feed may not be configured yet
      }
    };
    load();
    const interval = setInterval(load, 60_000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    // Filter history to the connected wallet so users see their own pulls.
    // Without a wallet filter the page shows global pulls, which is leaky.
    if (!solanaAddress) {
      setHistory([]);
      return;
    }
    let cancelled = false;
    api.gacha
      .getHistory({ wallet: solanaAddress, page: 1 })
      .then((res) => {
        if (!cancelled) setHistory(res.data);
      })
      .catch(() => {
        if (!cancelled) setHistory([]);
      });
    return () => {
      cancelled = true;
    };
  }, [pullState, solanaAddress]);

  useEffect(() => {
    // Skip while Privy is still hydrating — an empty address would return
    // whitelisted:false and flicker the gate on refresh.
    if (!solanaAddress) {
      setBeta(null);
      return;
    }
    let cancelled = false;
    api.gacha
      .getBetaStatus(solanaAddress)
      .then((r) => {
        if (!cancelled) setBeta(r);
      })
      .catch(() => {
        if (!cancelled) setBeta(null);
      });
    return () => {
      cancelled = true;
    };
  }, [solanaAddress]);

  const handleRedeem = useCallback(async () => {
    if (!solanaAddress || !code.trim()) return;
    setRedeemError('');
    setRedeeming(true);
    try {
      await api.gacha.redeemCode({ code: code.trim().toUpperCase(), solanaAddress });
      const next = await api.gacha.getBetaStatus(solanaAddress);
      setBeta(next);
      setCode('');
    } catch (err: any) {
      setRedeemError(err?.message || 'Could not redeem code');
    } finally {
      setRedeeming(false);
    }
  }, [code, solanaAddress]);

  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  const betaBlocked = !!beta?.active && !beta?.whitelisted;
  const canPull =
    walletsReady &&
    price &&
    stats &&
    stats.total > 0 &&
    pullState === 'idle' &&
    !betaBlocked;

  const handlePull = useCallback(async () => {
    if (!solanaWallet || !solanaAddress || !polygonAddress || !price || !canPull) return;

    setError('');
    setPullState('burning');

    try {
      const publicKey = new PublicKey(solanaAddress);
      const connection = new Connection(SOLANA_RPC_URL, 'confirmed');

      // 1. Build the SPL Token burn transaction
      const ata = await getAssociatedTokenAddress(SLAB_MINT, publicKey);
      const burnAmount = BigInt(price.tokensRequiredRaw);

      // Pre-check balance
      try {
        const tokenAccount = await connection.getTokenAccountBalance(ata);
        const balance = BigInt(tokenAccount.value.amount);
        if (balance < burnAmount) {
          const have = Number(tokenAccount.value.uiAmount ?? 0);
          const need = Number(price.tokensRequired);
          throw new Error(
            `Insufficient $SLAB. You have ${have.toLocaleString()} but need ${need.toLocaleString()}. Get $SLAB on a Solana DEX first.`,
          );
        }
      } catch (err: any) {
        if (err?.message?.includes('could not find account')) {
          throw new Error('No $SLAB in this wallet. Buy some on a Solana DEX first.');
        }
        if (err?.message?.startsWith('Insufficient')) throw err;
        // Other errors (RPC issues) — continue, burn will just fail with a clearer msg
      }

      const burnIx = createBurnInstruction(
        ata,
        SLAB_MINT,
        publicKey,
        burnAmount,
      );

      const tx = new Transaction().add(burnIx);
      tx.feePayer = publicKey;
      tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;

      // 2. Sign and send via Privy (works for embedded + external Solana wallets)
      const serialized = new Uint8Array(
        tx.serialize({ requireAllSignatures: false }),
      );
      const { signature: sigBytes } = await signAndSendTransaction({
        transaction: serialized,
        wallet: solanaWallet,
      });
      const signature = bs58.encode(sigBytes);
      await connection.confirmTransaction(signature, 'confirmed');

      // 3. Submit to backend
      setPullState('verifying');
      const result = await api.gacha.submitPull({
        txSignature: signature,
        polygonAddress: polygonAddress.toLowerCase(),
        solanaAddress,
      });

      setPullResult(result as any);
      setPullState('revealing');
    } catch (err: any) {
      const msg = err?.message || 'Transaction failed. Please try again.';
      setError(msg);
      setPullState('error');
    }
  }, [
    solanaWallet,
    solanaAddress,
    polygonAddress,
    price,
    canPull,
    signAndSendTransaction,
  ]);

  const handleRevealComplete = () => {
    setPullState('complete');
  };

  const handleReset = () => {
    setPullState('idle');
    setPullResult(null);
    setError('');
  };

  return (
    <main className="min-h-screen pt-24 pb-16 px-4">
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[600px] h-[600px] bg-[var(--lime)] opacity-[0.04] rounded-full blur-[120px]" />
      </div>

      {walletsReady && (
        <Link
          href="/cards"
          className="fixed top-20 right-4 sm:right-6 z-20 btn-ghost text-[10px] sm:text-xs uppercase tracking-widest px-3 py-2 whitespace-nowrap"
        >
          View My Profile ↗
        </Link>
      )}

      <div className="max-w-4xl mx-auto relative z-10">
        <div className="text-center mb-12">
          <img
            src="/Slab_Logo.jpeg"
            alt="$SLAB"
            className="w-16 h-16 mx-auto mb-4 rounded-xl"
          />
          <p className="data-label mb-3">SLAB_GACHA</p>
          <h1 className="text-4xl md:text-5xl font-black tracking-tight mb-4">
            Burn <span className="text-gradient">$SLAB</span>. Pull a card.
          </h1>
          <p className="text-[var(--text-secondary)] max-w-lg mx-auto">
            Burn ${price?.burnAmountUsd ?? 25} worth of $SLAB tokens on Solana and receive a random graded
            Pokemon card NFT on Polygon.
          </p>
          {beta?.active && (
            <div className="mt-4 inline-block px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-400 text-xs font-medium tracking-wider">
              BETA &middot; ${beta.priceUsd} per pull &middot; access code required
            </div>
          )}
        </div>

        {!ready ? (
          <div className="glass p-8 text-center text-sm text-[var(--text-muted)] mb-8">
            Loading…
          </div>
        ) : !authenticated ? (
          <div className="glass p-8 md:p-10 mb-8 text-center space-y-5 max-w-md mx-auto">
            <div>
              <p className="data-label mb-2">GET_STARTED</p>
              <h2 className="text-xl font-bold">Connect to continue</h2>
              <p className="text-sm text-[var(--text-muted)] mt-2">
                Connect a Privy wallet (email, social, or external) to enter your beta access code.
              </p>
            </div>
            <button onClick={login} className="btn-lime w-full">Connect</button>
          </div>
        ) : walletsReady && betaBlocked ? (
          <div className="glass p-6 md:p-10 mb-8 max-w-md mx-auto space-y-5">
            <div className="text-center">
              <p className="data-label mb-2">BETA_ACCESS</p>
              <h2 className="text-xl font-bold mb-2">Enter access code</h2>
              <p className="text-sm text-[var(--text-muted)]">
                $SLAB Gacha is in closed beta. Enter your invite code to unlock pulls.
              </p>
            </div>

            <div className="glass-card p-3 flex justify-between items-center gap-3">
              <div className="font-mono text-[11px] text-[var(--text-secondary)] leading-relaxed min-w-0">
                <div className="truncate">
                  <span className="text-[var(--text-muted)]">SOL </span>
                  {solanaAddress ? `${solanaAddress.slice(0, 4)}…${solanaAddress.slice(-4)}` : 'provisioning…'}
                </div>
                <div className="truncate">
                  <span className="text-[var(--text-muted)]">POLY </span>
                  {polygonAddress ? `${polygonAddress.slice(0, 6)}…${polygonAddress.slice(-4)}` : 'provisioning…'}
                </div>
              </div>
              <button
                onClick={logout}
                className="text-[10px] uppercase tracking-widest text-[var(--text-muted)] hover:text-white transition-colors whitespace-nowrap"
              >
                Disconnect
              </button>
            </div>

            <div>
              <input
                type="text"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !redeeming && code.trim()) handleRedeem();
                }}
                placeholder="B3X7K9ZM"
                autoComplete="off"
                maxLength={32}
                className="w-full bg-[var(--bg-surface)] border border-[var(--glass-border)] rounded-lg px-4 py-3 font-mono text-base tracking-widest text-center focus:outline-none focus:border-[var(--lime)]"
              />
            </div>
            <button
              onClick={handleRedeem}
              disabled={redeeming || !code.trim()}
              className="btn-lime w-full disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {redeeming ? 'Redeeming…' : 'Redeem'}
            </button>
            {redeemError && (
              <p className="text-red-400 text-xs text-center">{redeemError}</p>
            )}
          </div>
        ) : (
        <div className="glass p-6 md:p-8 mb-8">
          <div className="grid md:grid-cols-2 gap-8">
            <div className="flex items-center justify-center">
              <div className="relative w-full max-w-[280px] aspect-[3/4] rounded-xl overflow-hidden">
                {pullState === 'complete' && pullResult?.card ? (
                  <div className="w-full h-full">
                    {pullResult.card.imageUrl ? (
                      <img
                        src={pullResult.card.imageUrl}
                        alt={pullResult.card.cardName || 'Card'}
                        className="w-full h-full object-cover rounded-xl"
                      />
                    ) : (
                      <div className="w-full h-full bg-[var(--bg-surface)] flex items-center justify-center rounded-xl">
                        <span className="text-[var(--text-muted)]">
                          {pullResult.card.cardName || 'Unknown Card'}
                        </span>
                      </div>
                    )}
                    <div className="absolute bottom-0 left-0 right-0 p-3 bg-gradient-to-t from-black/80 to-transparent">
                      <p className="font-bold text-sm">
                        {pullResult.card.cardName}
                      </p>
                      <p className="text-xs text-[var(--text-secondary)]">
                        {pullResult.card.setName} &middot;{' '}
                        {pullResult.card.grader} {pullResult.card.grade}
                      </p>
                      <span
                        className={`inline-block mt-1 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${
                          pullResult.card.tier === 'ultra_rare'
                            ? 'bg-amber-500/20 text-amber-400'
                            : pullResult.card.tier === 'rare'
                              ? 'bg-blue-500/20 text-blue-400'
                              : pullResult.card.tier === 'uncommon'
                                ? 'bg-emerald-500/20 text-emerald-400'
                                : 'bg-white/10 text-[var(--text-secondary)]'
                        }`}
                      >
                        {pullResult.card.tier?.replace('_', ' ')}
                      </span>
                    </div>
                  </div>
                ) : (
                  <SlabPack
                    state={
                      pullState === 'revealing'
                        ? 'opening'
                        : pullState === 'burning'
                          ? 'burning'
                          : pullState === 'verifying'
                            ? 'verifying'
                            : 'idle'
                    }
                  />
                )}
              </div>
            </div>

            <div className="flex flex-col gap-5">
              <div>
                <label className="data-label mb-2 block">Wallet</label>
                <div className="glass-card p-3 flex justify-between items-center gap-3">
                  <div className="font-mono text-[11px] text-[var(--text-secondary)] leading-relaxed min-w-0">
                    <div className="truncate">
                      <span className="text-[var(--text-muted)]">SOL </span>
                      {solanaAddress
                        ? `${solanaAddress.slice(0, 4)}…${solanaAddress.slice(-4)}`
                        : 'provisioning…'}
                    </div>
                    <div className="truncate">
                      <span className="text-[var(--text-muted)]">POLY </span>
                      {polygonAddress
                        ? `${polygonAddress.slice(0, 6)}…${polygonAddress.slice(-4)}`
                        : 'provisioning…'}
                    </div>
                  </div>
                  <button
                    onClick={logout}
                    className="text-[10px] uppercase tracking-widest text-[var(--text-muted)] hover:text-white transition-colors whitespace-nowrap"
                  >
                    Disconnect
                  </button>
                </div>
              </div>

              {price && (
                <div className="glass-card p-4">
                  <div className="flex justify-between items-center">
                    <span className="data-label">Burn Amount</span>
                    <span className="font-mono text-sm text-[var(--lime)]">
                      {Number(price.tokensRequired).toLocaleString()} $SLAB
                    </span>
                  </div>
                  <div className="flex justify-between items-center mt-1">
                    <span className="text-xs text-[var(--text-muted)]">
                      $SLAB Price
                    </span>
                    <span className="font-mono text-xs text-[var(--text-secondary)]">
                      ${price.priceUsd.toFixed(6)}
                    </span>
                  </div>
                  <div className="flex justify-between items-center mt-1">
                    <span className="text-xs text-[var(--text-muted)]">
                      USD Value
                    </span>
                    <span className="font-mono text-xs text-[var(--text-secondary)]">
                      ${price.burnAmountUsd}
                    </span>
                  </div>
                </div>
              )}

              {stats && (
                <div className="flex gap-2 flex-wrap">
                  {[
                    { label: 'Common', count: stats.common, color: 'text-[var(--text-secondary)]' },
                    { label: 'Uncommon', count: stats.uncommon, color: 'text-emerald-400' },
                    { label: 'Rare', count: stats.rare, color: 'text-blue-400' },
                    { label: 'Ultra Rare', count: stats.ultraRare, color: 'text-amber-400' },
                  ].map(({ label, count, color }) => (
                    <span key={label} className="pill">
                      <span className={`${color} font-mono`}>{count}</span>{' '}
                      <span className="text-[var(--text-muted)]">{label}</span>
                    </span>
                  ))}
                </div>
              )}

              {pullState === 'complete' || pullState === 'error' ? (
                <button onClick={handleReset} className="btn-ghost w-full">
                  {pullState === 'error' ? 'Try Again' : 'Pull Again'}
                </button>
              ) : (
                <button
                  onClick={handlePull}
                  disabled={!canPull}
                  className="btn-lime w-full disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {pullState === 'idle'
                    ? 'PULL'
                    : pullState === 'burning'
                      ? 'Confirm in wallet...'
                      : 'Processing...'}
                </button>
              )}

              {error && (
                <p className="text-red-400 text-sm text-center">{error}</p>
              )}

              {pullState === 'complete' && pullResult?.polygonTxHash && (
                <a
                  href={`https://polygonscan.com/tx/${pullResult.polygonTxHash}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-center text-xs text-[var(--lime)] hover:underline"
                >
                  View NFT transfer on Polygonscan &rarr;
                </a>
              )}
            </div>
          </div>
        </div>
        )}

        {history.length > 0 && !betaBlocked && authenticated && (
          <div className="glass p-6">
            <h2 className="data-label mb-4">Recent Pulls</h2>
            <div className="space-y-3">
              {history.map((item) => (
                <div
                  key={item.pullId}
                  className="flex items-center gap-4 p-3 rounded-lg bg-[var(--bg-surface)] border border-[var(--glass-border)]"
                >
                  {item.card?.imageUrl ? (
                    <img
                      src={item.card.imageUrl}
                      alt={item.card.cardName || ''}
                      className="w-10 h-14 rounded object-cover"
                    />
                  ) : (
                    <div className="w-10 h-14 rounded bg-[var(--glass-bg)] flex items-center justify-center">
                      <span className="text-xs text-[var(--text-muted)]">?</span>
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">
                      {item.card?.cardName || 'Unknown'}
                    </p>
                    <p className="text-xs text-[var(--text-muted)]">
                      {item.card?.setName} &middot; {item.card?.grader}{' '}
                      {item.card?.grade}
                    </p>
                  </div>
                  <div className="text-right">
                    <span
                      className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${
                        item.card?.tier === 'ultra_rare'
                          ? 'bg-amber-500/20 text-amber-400'
                          : item.card?.tier === 'rare'
                            ? 'bg-blue-500/20 text-blue-400'
                            : item.card?.tier === 'uncommon'
                              ? 'bg-emerald-500/20 text-emerald-400'
                              : 'bg-white/10 text-[var(--text-secondary)]'
                      }`}
                    >
                      {item.card?.tier?.replace('_', ' ')}
                    </span>
                    <p className="text-[10px] text-[var(--text-muted)] mt-1 font-mono">
                      {new Date(item.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {pullState === 'revealing' && pullResult?.card && (
        <CardReveal card={pullResult.card} onComplete={handleRevealComplete} />
      )}
    </main>
  );
}
