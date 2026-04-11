'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useWallet, useConnection } from '@solana/wallet-adapter-react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import {
  PublicKey,
  Transaction,
} from '@solana/web3.js';
import {
  createBurnInstruction,
  getAssociatedTokenAddress,
} from '@solana/spl-token';
import { api } from '@/lib/api';
import type {
  GachaPriceInfo,
  GachaPullStatus,
  GachaInventoryStats,
  GachaHistoryItem,
} from '@/lib/api';
import CardReveal from '@/components/gacha/CardReveal';

const SLAB_MINT = new PublicKey(
  process.env.NEXT_PUBLIC_SLAB_MINT_ADDRESS ||
    '8d198qeKHyXf1aYQVoGNU9RMBnbdhHZFkvYpJMt8pump',
);

type PullState =
  | 'idle'
  | 'burning'
  | 'verifying'
  | 'revealing'
  | 'complete'
  | 'error';

export default function GachaPage() {
  const { publicKey, sendTransaction, connected } = useWallet();
  const { connection } = useConnection();

  const [polygonAddress, setPolygonAddress] = useState('');
  const [price, setPrice] = useState<GachaPriceInfo | null>(null);
  const [stats, setStats] = useState<GachaInventoryStats | null>(null);
  const [pullState, setPullState] = useState<PullState>('idle');
  const [pullResult, setPullResult] = useState<GachaPullStatus | null>(null);
  const [error, setError] = useState('');
  const [history, setHistory] = useState<GachaHistoryItem[]>([]);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Fetch price and inventory on mount
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

  // Fetch history
  useEffect(() => {
    api.gacha
      .getHistory({ page: 1 })
      .then((res) => setHistory(res.data))
      .catch(() => {});
  }, [pullState]);

  // Cleanup poll on unmount
  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  const isValidPolygon = /^0x[a-fA-F0-9]{40}$/.test(polygonAddress);
  const canPull =
    connected &&
    isValidPolygon &&
    price &&
    stats &&
    stats.total > 0 &&
    pullState === 'idle';

  const handlePull = useCallback(async () => {
    if (!publicKey || !price || !canPull) return;

    setError('');
    setPullState('burning');

    try {
      // 1. Build the SPL Token burn transaction
      const ata = await getAssociatedTokenAddress(SLAB_MINT, publicKey);
      const burnAmount = BigInt(price.tokensRequiredRaw);

      const burnIx = createBurnInstruction(
        ata,
        SLAB_MINT,
        publicKey,
        burnAmount,
      );

      const tx = new Transaction().add(burnIx);
      tx.feePayer = publicKey;
      tx.recentBlockhash = (
        await connection.getLatestBlockhash()
      ).blockhash;

      // 2. Send and confirm
      const signature = await sendTransaction(tx, connection);
      await connection.confirmTransaction(signature, 'finalized');

      // 3. Submit to backend
      setPullState('verifying');
      const result = await api.gacha.submitPull({
        txSignature: signature,
        polygonAddress: polygonAddress.toLowerCase(),
        solanaAddress: publicKey.toBase58(),
      });

      // 4. Poll for status
      pollRef.current = setInterval(async () => {
        try {
          const status = await api.gacha.getPullStatus(result.pullId);
          if (status.status === 'completed') {
            if (pollRef.current) clearInterval(pollRef.current);
            setPullResult(status);
            setPullState('revealing');
          } else if (
            status.status === 'failed' ||
            status.status === 'refund_needed'
          ) {
            if (pollRef.current) clearInterval(pollRef.current);
            setError(
              status.status === 'refund_needed'
                ? 'NFT transfer failed. Your pull has been flagged for manual resolution.'
                : 'Burn verification failed. Please check your transaction.',
            );
            setPullState('error');
          }
        } catch {
          // Keep polling
        }
      }, 3000);
    } catch (err: any) {
      const msg =
        err?.message || 'Transaction failed. Please try again.';
      setError(msg);
      setPullState('error');
    }
  }, [
    publicKey,
    price,
    canPull,
    connection,
    sendTransaction,
    polygonAddress,
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
      {/* Ambient glow */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[600px] h-[600px] bg-[var(--lime)] opacity-[0.04] rounded-full blur-[120px]" />
      </div>

      <div className="max-w-4xl mx-auto relative z-10">
        {/* Header */}
        <div className="text-center mb-12">
          <p className="data-label mb-3">SLAB_GACHA</p>
          <h1 className="text-4xl md:text-5xl font-black tracking-tight mb-4">
            Burn <span className="text-gradient">$SLAB</span>. Pull a card.
          </h1>
          <p className="text-[var(--text-secondary)] max-w-lg mx-auto">
            Burn $25 worth of $SLAB tokens on Solana and receive a random graded
            Pokemon card NFT on Polygon.
          </p>
        </div>

        {/* Main Machine Panel */}
        <div className="glass p-6 md:p-8 mb-8">
          <div className="grid md:grid-cols-2 gap-8">
            {/* Left: Mystery Card / Result */}
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
                  <div
                    className={`w-full h-full bg-[var(--bg-surface)] border border-[var(--glass-border)] rounded-xl flex flex-col items-center justify-center gap-3 ${
                      pullState === 'burning' || pullState === 'verifying'
                        ? 'animate-pulse'
                        : ''
                    }`}
                  >
                    <div className="w-16 h-16 rounded-full border-2 border-[var(--lime)] flex items-center justify-center opacity-40">
                      <span className="text-2xl">?</span>
                    </div>
                    <p className="text-xs text-[var(--text-muted)] uppercase tracking-wider">
                      {pullState === 'burning'
                        ? 'Burning tokens...'
                        : pullState === 'verifying'
                          ? 'Verifying burn...'
                          : 'Mystery Card'}
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* Right: Controls */}
            <div className="flex flex-col gap-5">
              {/* Wallet Connect */}
              <div>
                <label className="data-label mb-2 block">Solana Wallet</label>
                <WalletMultiButton
                  style={{
                    background: 'var(--glass-bg)',
                    border: '1px solid var(--glass-border)',
                    borderRadius: '0.75rem',
                    fontSize: '0.875rem',
                    height: '44px',
                    width: '100%',
                    justifyContent: 'center',
                  }}
                />
              </div>

              {/* Price Display */}
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

              {/* Polygon Address Input */}
              <div>
                <label className="data-label mb-2 block">
                  Polygon Address (to receive NFT)
                </label>
                <input
                  type="text"
                  placeholder="0x..."
                  value={polygonAddress}
                  onChange={(e) => setPolygonAddress(e.target.value)}
                  className={`glass-input w-full ${
                    polygonAddress && !isValidPolygon
                      ? 'border-red-500/50'
                      : ''
                  }`}
                  disabled={pullState !== 'idle' && pullState !== 'complete' && pullState !== 'error'}
                />
                {polygonAddress && !isValidPolygon && (
                  <p className="text-red-400 text-xs mt-1">
                    Enter a valid Polygon address (0x...)
                  </p>
                )}
              </div>

              {/* Inventory Stats */}
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

              {/* Pull Button */}
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

              {/* Error Message */}
              {error && (
                <p className="text-red-400 text-sm text-center">{error}</p>
              )}

              {/* Completed Pull Info */}
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

        {/* Pull History */}
        {history.length > 0 && (
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

      {/* Card Reveal Overlay */}
      {pullState === 'revealing' && pullResult?.card && (
        <CardReveal card={pullResult.card} onComplete={handleRevealComplete} />
      )}
    </main>
  );
}
