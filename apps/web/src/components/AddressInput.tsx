'use client';

import { useState, FormEvent } from 'react';
import { useRouter } from 'next/navigation';

const ETH_ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;

export default function AddressInput() {
  const [address, setAddress] = useState('');
  const [error, setError] = useState('');
  const router = useRouter();

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const trimmed = address.trim();
    if (!trimmed) {
      setError('Please enter a wallet address.');
      return;
    }
    if (!ETH_ADDRESS_RE.test(trimmed)) {
      setError('Enter a valid Ethereum address (0x followed by 40 hex characters).');
      return;
    }
    setError('');
    router.push(`/address/${trimmed}`);
  }

  return (
    <form onSubmit={handleSubmit} className="w-full">
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <svg
            className="absolute left-4 top-1/2 -translate-y-1/2 w-[18px] h-[18px] pointer-events-none transition-colors duration-200"
            style={{ color: 'rgba(255,255,255,0.22)' }}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            value={address}
            onChange={(e) => {
              setAddress(e.target.value);
              if (error) setError('');
            }}
            placeholder="Paste your Courtyard wallet address (0x...)"
            className={`glass-input ${error ? 'error' : ''}`}
          />
        </div>
        <button type="submit" className="explore-btn flex-shrink-0">
          <span>Look Up</span>
          <span className="arrow-circle">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 12h14M12 5l7 7-7 7" />
            </svg>
          </span>
        </button>
      </div>
      {error && (
        <p className="mt-2.5 text-sm" style={{ color: 'rgba(239, 68, 68, 0.85)' }}>{error}</p>
      )}
    </form>
  );
}
