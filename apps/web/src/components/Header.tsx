'use client';

import { useState } from 'react';
import Link from 'next/link';

export default function Header() {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <header
      className="sticky top-0 z-50"
      style={{
        background: 'rgba(0, 0, 0, 0.88)',
        backdropFilter: 'blur(24px)',
        WebkitBackdropFilter: 'blur(24px)',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
      }}
    >
      <div className="max-w-6xl mx-auto px-5 sm:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <Link href="/" className="flex items-center group">
            <img src="/logo.svg" alt="Bindr.fun" className="h-10" />
          </Link>

          {/* Desktop Nav */}
          <nav className="hidden sm:flex items-center gap-3">
            <Link href="/gacha" className="nav-link px-3 py-1.5 rounded-lg text-sm font-medium">
              Gacha
            </Link>
            <span
              className="text-[11px] uppercase tracking-widest px-3 py-1 rounded-full font-bold"
              style={{
                fontFamily: 'var(--font-mono)',
                background: 'rgba(177,210,53,0.10)',
                border: '1px solid rgba(177,210,53,0.25)',
                color: '#B1D235',
                letterSpacing: '0.1em',
              }}
            >
              BETA
            </span>
          </nav>

          {/* Mobile hamburger */}
          <button
            onClick={() => setMobileOpen(!mobileOpen)}
            className="sm:hidden w-10 h-10 flex items-center justify-center rounded-xl"
            style={{ color: 'rgba(242,244,243,0.60)' }}
            aria-label="Menu"
          >
            {mobileOpen ? (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            ) : (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M3 12h18M3 6h18M3 18h18" />
              </svg>
            )}
          </button>
        </div>
      </div>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div
          className="sm:hidden border-t animate-fade-in"
          style={{
            borderColor: 'rgba(255,255,255,0.06)',
            background: 'rgba(0, 0, 0, 0.96)',
            backdropFilter: 'blur(24px)',
          }}
        >
          <nav className="flex flex-col px-5 py-4 gap-1">
            <Link href="/" onClick={() => setMobileOpen(false)} className="nav-link px-4 py-3 rounded-xl text-sm font-medium">
              Home
            </Link>
            <Link href="/gacha" onClick={() => setMobileOpen(false)} className="nav-link px-4 py-3 rounded-xl text-sm font-medium">
              Gacha
            </Link>
          </nav>
        </div>
      )}
    </header>
  );
}
