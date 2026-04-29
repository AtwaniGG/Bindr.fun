'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { usePrivy } from '@privy-io/react-auth';
import { useAccount, useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { api } from '@/lib/api';
import type { WalletNft, WalletValuation } from '@/lib/api';

const ETH_ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;
const COURTYARD_KEY = 'bindr.courtyardDepositAddress';

const ERC721_ABI = [
  {
    type: 'function',
    name: 'safeTransferFrom',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'from', type: 'address' },
      { name: 'to', type: 'address' },
      { name: 'tokenId', type: 'uint256' },
    ],
    outputs: [],
  },
] as const;

type ModalState =
  | { kind: 'closed' }
  | { kind: 'transfer'; nft: WalletNft }
  | { kind: 'courtyard'; nft: WalletNft };

export default function CardsClient() {
  const { ready, authenticated, login, logout } = usePrivy();
  const { address: polygonAddress } = useAccount();

  const [nfts, setNfts] = useState<WalletNft[] | null>(null);
  const [valuation, setValuation] = useState<WalletValuation | null>(null);
  const [loading, setLoading] = useState(false);
  const [modal, setModal] = useState<ModalState>({ kind: 'closed' });
  const [addressCopied, setAddressCopied] = useState(false);
  const [courtyardAddr, setCourtyardAddr] = useState('');

  useEffect(() => {
    try {
      const saved = localStorage.getItem(COURTYARD_KEY) || '';
      setCourtyardAddr(saved);
    } catch {
      /* ignore */
    }
  }, []);

  const refresh = useCallback(async () => {
    if (!polygonAddress) {
      setNfts(null);
      setValuation(null);
      return;
    }
    setLoading(true);
    try {
      const [nftsData, valuationData] = await Promise.all([
        api.gacha.getWalletNfts(polygonAddress),
        api.wallet.getValuation(polygonAddress).catch(() => null),
      ]);
      setNfts(nftsData);
      setValuation(valuationData);
    } catch {
      setNfts([]);
      setValuation(null);
    } finally {
      setLoading(false);
    }
  }, [polygonAddress]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const copyAddress = async () => {
    if (!polygonAddress) return;
    try {
      await navigator.clipboard.writeText(polygonAddress);
      setAddressCopied(true);
      setTimeout(() => setAddressCopied(false), 1500);
    } catch {
      /* ignore */
    }
  };

  return (
    <main className="min-h-screen pt-24 pb-16 px-4">
      <div className="max-w-5xl mx-auto">
        <div className="flex items-start justify-between gap-3 mb-8">
          <div className="min-w-0">
            <p className="data-label mb-2">YOUR_CARDS</p>
            <h1 className="text-2xl sm:text-3xl md:text-4xl font-black tracking-tight">
              Wallet
            </h1>
          </div>
          <Link
            href="/gacha"
            className="btn-ghost text-[10px] sm:text-xs uppercase tracking-widest px-3 py-2 whitespace-nowrap shrink-0"
          >
            <span className="sm:hidden">← Pull</span>
            <span className="hidden sm:inline">← Back to pull</span>
          </Link>
        </div>

        {!ready ? (
          <div className="glass p-8 text-center text-sm text-[var(--text-muted)]">
            Loading…
          </div>
        ) : !authenticated ? (
          <div className="glass p-8 text-center space-y-4">
            <p className="text-sm text-[var(--text-secondary)]">
              Connect to see the cards in your Privy wallet.
            </p>
            <button onClick={login} className="btn-lime">
              Connect
            </button>
          </div>
        ) : (
          <>
            <div className="glass-card p-4 mb-6 space-y-3">
              <p className="text-xs text-[var(--text-muted)] leading-relaxed">
                Your NFTs live in a Privy-provisioned Polygon wallet. They won't
                show in MetaMask unless you import this address. Use the buttons
                on each card to send them somewhere else.
              </p>
              <code className="block font-mono text-[11px] sm:text-sm text-[var(--lime)] bg-[var(--bg-surface)] border border-[var(--glass-border)] rounded px-3 py-2 truncate">
                {polygonAddress || '—'}
              </code>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={copyAddress}
                  disabled={!polygonAddress}
                  className="btn-ghost text-[11px] uppercase tracking-widest px-3 py-2 whitespace-nowrap disabled:opacity-40 flex-1 sm:flex-initial"
                >
                  {addressCopied ? 'Copied' : 'Copy'}
                </button>
                <a
                  href={
                    polygonAddress
                      ? `https://polygonscan.com/address/${polygonAddress}#nfttransfers`
                      : '#'
                  }
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn-ghost text-[11px] uppercase tracking-widest px-3 py-2 whitespace-nowrap text-center flex-1 sm:flex-initial"
                >
                  Polygonscan
                </a>
                <button
                  onClick={logout}
                  className="btn-ghost text-[11px] uppercase tracking-widest px-3 py-2 whitespace-nowrap flex-1 sm:flex-initial"
                >
                  Disconnect
                </button>
              </div>
            </div>

            {valuation && nfts && nfts.length > 0 && (
              <div className="glass-card p-4 mb-4 flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <p className="data-label mb-1">Estimated value</p>
                  <p className="text-2xl sm:text-3xl font-black tracking-tight text-[var(--lime)]">
                    {valuation.totalUsd > 0
                      ? `$${valuation.totalUsd.toLocaleString(undefined, { maximumFractionDigits: 2 })}`
                      : '—'}
                  </p>
                </div>
                <div className="text-right text-[10px] uppercase tracking-widest space-y-1">
                  <span
                    className={`inline-block px-2 py-0.5 rounded-full border ${
                      valuation.freshness === 'fresh'
                        ? 'border-emerald-500/40 text-emerald-400'
                        : valuation.freshness === 'stale'
                          ? 'border-amber-500/40 text-amber-400'
                          : 'border-white/10 text-[var(--text-muted)]'
                    }`}
                  >
                    {valuation.freshness}
                  </span>
                  <p className="text-[var(--text-muted)]">
                    {valuation.counts.priced} / {valuation.counts.total} priced
                  </p>
                </div>
              </div>
            )}

            {loading ? (
              <div className="glass p-8 text-center text-sm text-[var(--text-muted)]">
                Loading cards…
              </div>
            ) : !nfts || nfts.length === 0 ? (
              <div className="glass p-8 text-center">
                <p className="text-sm text-[var(--text-secondary)] mb-1">
                  No cards in this wallet yet
                </p>
                <p className="text-xs text-[var(--text-muted)]">
                  Pulls land here on-chain within ~30 seconds of confirming.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {nfts.map((nft, i) => {
                  const valued = valuation?.cards.find(
                    (c) => c.tokenId === nft.tokenId,
                  );
                  // Stable composite key — never use Math.random() in a list
                  // key because it differs across SSR/hydration and forces
                  // re-mount on every render.
                  const key = `${nft.contractAddress ?? 'x'}:${nft.tokenId ?? `idx${i}`}`;
                  return (
                    <NftCard
                      key={key}
                      nft={nft}
                      priceUsd={valued?.priceUsd ?? null}
                      priceUpdatedAt={valued?.priceUpdatedAt ?? null}
                      onTransfer={() => setModal({ kind: 'transfer', nft })}
                      onCourtyard={() => setModal({ kind: 'courtyard', nft })}
                    />
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>

      {modal.kind === 'transfer' && polygonAddress && (
        <TransferModal
          nft={modal.nft}
          from={polygonAddress}
          onClose={() => setModal({ kind: 'closed' })}
          onComplete={() => {
            setModal({ kind: 'closed' });
            refresh();
          }}
        />
      )}

      {modal.kind === 'courtyard' && polygonAddress && (
        <CourtyardModal
          nft={modal.nft}
          from={polygonAddress}
          savedAddress={courtyardAddr}
          onSaveAddress={(addr) => {
            setCourtyardAddr(addr);
            try {
              localStorage.setItem(COURTYARD_KEY, addr);
            } catch {
              /* ignore */
            }
          }}
          onClose={() => setModal({ kind: 'closed' })}
          onComplete={() => {
            setModal({ kind: 'closed' });
            refresh();
          }}
        />
      )}
    </main>
  );
}

function NftCard({
  nft,
  priceUsd,
  priceUpdatedAt,
  onTransfer,
  onCourtyard,
}: {
  nft: WalletNft;
  priceUsd: number | null;
  priceUpdatedAt: string | null;
  onTransfer: () => void;
  onCourtyard: () => void;
}) {
  // Validate the tokenIdHex shape before injecting into a URL — never trust
  // upstream API responses with raw href values.
  const courtyardUrl = nft.tokenIdHex && /^0x[a-fA-F0-9]+$/.test(nft.tokenIdHex)
    ? `https://courtyard.io/asset/${nft.tokenIdHex.slice(2)}`
    : null;

  return (
    <div className="rounded-xl bg-[var(--bg-surface)] border border-[var(--glass-border)] overflow-hidden flex flex-col">
      <div className="aspect-[3/4] bg-black/40 flex items-center justify-center">
        {nft.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={nft.imageUrl}
            alt={nft.name || 'Card'}
            className="w-full h-full object-cover"
          />
        ) : (
          <span className="text-xs text-[var(--text-muted)]">No image</span>
        )}
      </div>
      <div className="p-3 flex flex-col gap-2 flex-1">
        <div className="flex items-start justify-between gap-2">
          <p className="text-sm font-medium truncate flex-1" title={nft.name || ''}>
            {nft.name || 'Unknown'}
          </p>
          {priceUsd !== null && (
            <span
              className="text-sm font-mono text-[var(--lime)] whitespace-nowrap"
              title={priceUpdatedAt ? `Updated ${new Date(priceUpdatedAt).toLocaleString()}` : undefined}
            >
              ${priceUsd.toLocaleString(undefined, { maximumFractionDigits: 2 })}
            </span>
          )}
        </div>
        <p className="text-[11px] text-[var(--text-muted)] truncate">
          {[nft.setName, nft.grader, nft.grade].filter(Boolean).join(' · ') || '—'}
        </p>
        {courtyardUrl && (
          <a
            href={courtyardUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[10px] uppercase tracking-widest text-[var(--lime)] hover:underline"
          >
            View on Courtyard ↗
          </a>
        )}
        <div className="flex gap-2 mt-auto pt-2">
          <button
            onClick={onTransfer}
            className="btn-ghost flex-1 text-[11px] uppercase tracking-widest"
          >
            Transfer
          </button>
          <button
            onClick={onCourtyard}
            className="btn-lime flex-1 text-[11px] uppercase tracking-widest"
          >
            To Courtyard
          </button>
        </div>
      </div>
    </div>
  );
}

function TransferModal({
  nft,
  from,
  onClose,
  onComplete,
}: {
  nft: WalletNft;
  from: string;
  onClose: () => void;
  onComplete: () => void;
}) {
  const [to, setTo] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  return (
    <TxModal
      title="Transfer card"
      nft={nft}
      from={from}
      to={to}
      onClose={onClose}
      onComplete={onComplete}
      destValid={ETH_ADDRESS_RE.test(to)}
      header={
        <>
          <label className="data-label mb-2 block">Destination address</label>
          <input
            type="text"
            value={to}
            onChange={(e) => setTo(e.target.value.trim())}
            placeholder="0x…"
            autoComplete="off"
            className="w-full bg-[var(--bg-surface)] border border-[var(--glass-border)] rounded-lg px-3 py-2 font-mono text-sm focus:outline-none focus:border-[var(--lime)]"
          />
          <label className="mt-3 flex items-start gap-2 text-xs text-[var(--text-muted)] select-none">
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(e) => setConfirmed(e.target.checked)}
              className="mt-0.5"
            />
            <span>
              I double-checked the address. NFT transfers are irreversible — if I paste
              the wrong address, the card is gone.
            </span>
          </label>
        </>
      }
      disabled={!confirmed}
    />
  );
}

function CourtyardModal({
  nft,
  from,
  savedAddress,
  onSaveAddress,
  onClose,
  onComplete,
}: {
  nft: WalletNft;
  from: string;
  savedAddress: string;
  onSaveAddress: (addr: string) => void;
  onClose: () => void;
  onComplete: () => void;
}) {
  const [input, setInput] = useState(savedAddress);
  const valid = ETH_ADDRESS_RE.test(input);
  return (
    <TxModal
      title="Send to your Courtyard wallet"
      nft={nft}
      from={from}
      to={input}
      destValid={valid}
      onClose={onClose}
      onComplete={onComplete}
      header={
        <>
          <p className="text-xs text-[var(--text-muted)] leading-relaxed mb-3">
            Paste the wallet address Courtyard shows on your profile's
            <em> deposit / receive</em> screen. We'll remember it for next time.
            This transfer puts the NFT back in Courtyard's custody so it appears
            in your Courtyard collection.
          </p>
          <label className="data-label mb-2 block">Courtyard deposit address</label>
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value.trim())}
            placeholder="0x…"
            autoComplete="off"
            className="w-full bg-[var(--bg-surface)] border border-[var(--glass-border)] rounded-lg px-3 py-2 font-mono text-sm focus:outline-none focus:border-[var(--lime)]"
          />
          <button
            onClick={() => onSaveAddress(input)}
            disabled={!valid || input === savedAddress}
            className="btn-ghost mt-2 text-[10px] uppercase tracking-widest px-3 py-1.5 disabled:opacity-40"
          >
            {input === savedAddress && savedAddress ? 'Saved' : 'Save'}
          </button>
        </>
      }
    />
  );
}

function TxModal({
  title,
  nft,
  from,
  to,
  destValid,
  disabled = false,
  header,
  onClose,
  onComplete,
}: {
  title: string;
  nft: WalletNft;
  from: string;
  to: string;
  destValid: boolean;
  disabled?: boolean;
  header: React.ReactNode;
  onClose: () => void;
  onComplete: () => void;
}) {
  const { writeContract, data: hash, isPending, error, reset } = useWriteContract();
  const { isLoading: confirming, isSuccess } = useWaitForTransactionReceipt({ hash });

  useEffect(() => {
    if (isSuccess) {
      const t = setTimeout(onComplete, 1500);
      return () => clearTimeout(t);
    }
  }, [isSuccess, onComplete]);

  const submit = () => {
    if (!destValid || !nft.tokenId) return;
    reset();
    writeContract({
      address: nft.contractAddress as `0x${string}`,
      abi: ERC721_ABI,
      functionName: 'safeTransferFrom',
      args: [from as `0x${string}`, to as `0x${string}`, BigInt(nft.tokenId)],
    });
  };

  const busy = isPending || confirming;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/80 backdrop-blur-sm p-4 pt-16 pb-16"
      onClick={onClose}
    >
      <div
        className="glass w-full max-w-md p-6 relative"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          aria-label="Close"
          className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center rounded-full bg-[var(--bg-surface)] border border-[var(--glass-border)] text-[var(--text-muted)] hover:text-white transition-colors"
        >
          ×
        </button>
        <p className="data-label mb-2">{title.toUpperCase()}</p>
        <h2 className="text-xl font-bold mb-4">{title}</h2>
        <div className="flex gap-3 mb-5 p-3 rounded-lg bg-[var(--bg-surface)] border border-[var(--glass-border)]">
          {nft.imageUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={nft.imageUrl}
              alt={nft.name || ''}
              className="w-12 h-16 rounded object-cover"
            />
          )}
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium truncate">{nft.name || 'Unknown'}</p>
            <p className="text-[11px] text-[var(--text-muted)] truncate">
              {[nft.setName, nft.grader, nft.grade].filter(Boolean).join(' · ') || '—'}
            </p>
          </div>
        </div>

        {header}

        {error && (
          <p className="mt-3 text-red-400 text-xs">
            {(error as any)?.shortMessage || error.message}
          </p>
        )}

        {isSuccess && hash && (
          <div className="mt-3 text-xs text-[var(--lime)]">
            Sent.&nbsp;
            <a
              href={`https://polygonscan.com/tx/${hash}`}
              target="_blank"
              rel="noopener noreferrer"
              className="underline"
            >
              View on Polygonscan ↗
            </a>
          </div>
        )}

        <button
          onClick={submit}
          disabled={busy || !destValid || disabled || isSuccess}
          className="btn-lime w-full mt-5 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {isSuccess
            ? 'Sent ✓'
            : confirming
              ? 'Confirming…'
              : isPending
                ? 'Confirm in wallet…'
                : 'Send'}
        </button>
      </div>
    </div>
  );
}
