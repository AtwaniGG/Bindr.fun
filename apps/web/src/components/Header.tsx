'use client';

import { useState } from 'react';
import Link from 'next/link';

export default function Header() {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <header
      className="sticky top-0 z-50"
      style={{
        background: 'rgba(8, 9, 13, 0.82)',
        backdropFilter: 'blur(24px)',
        WebkitBackdropFilter: 'blur(24px)',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
      }}
    >
      <div className="max-w-6xl mx-auto px-5 sm:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-3 group">
            <div
              className="w-9 h-9 rounded-full flex items-center justify-center"
              style={{
                background: 'rgba(245, 185, 75, 0.10)',
                border: '1px solid rgba(245, 185, 75, 0.22)',
                transition: 'all 180ms ease',
              }}
            >
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="10" stroke="rgba(245,185,75,0.55)" strokeWidth="1.5" />
                <line x1="2" y1="12" x2="22" y2="12" stroke="rgba(245,185,75,0.55)" strokeWidth="1.5" />
                <circle cx="12" cy="12" r="3" stroke="rgba(245,185,75,0.55)" strokeWidth="1.5" />
                <circle cx="12" cy="12" r="1.5" fill="#F5B94B" />
              </svg>
            </div>
            <span className="text-lg font-extrabold" style={{ color: 'rgba(255,255,255,0.92)', letterSpacing: '-0.03em' }}>
              SlabDex
            </span>
          </Link>

          {/* Desktop Nav */}
          <nav className="hidden sm:flex items-center gap-1">
            <Link href="/" className="nav-link px-4 py-2 rounded-xl text-sm font-medium">
              Home
            </Link>
            <Link href="/" className="nav-link px-4 py-2 rounded-xl text-sm font-medium">
              Explore
            </Link>
            <Link href="/" className="nav-link px-4 py-2 rounded-xl text-sm font-medium">
              Help
            </Link>
            <span
              className="text-[11px] uppercase tracking-widest ml-2 px-3 py-1 rounded-full font-bold"
              style={{
                background: 'rgba(245,185,75,0.10)',
                border: '1px solid rgba(245,185,75,0.25)',
                color: '#F5B94B',
              }}
            >
              Pro
            </span>
          </nav>

          {/* Mobile hamburger */}
          <button
            onClick={() => setMobileOpen(!mobileOpen)}
            className="sm:hidden w-10 h-10 flex items-center justify-center rounded-xl"
            style={{ color: 'rgba(255,255,255,0.60)', transition: 'color 180ms ease' }}
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
            background: 'rgba(8, 9, 13, 0.95)',
            backdropFilter: 'blur(24px)',
          }}
        >
          <nav className="flex flex-col px-5 py-4 gap-1">
            <Link href="/" onClick={() => setMobileOpen(false)} className="nav-link px-4 py-3 rounded-xl text-sm font-medium">
              Home
            </Link>
            <Link href="/" onClick={() => setMobileOpen(false)} className="nav-link px-4 py-3 rounded-xl text-sm font-medium">
              Explore
            </Link>
            <Link href="/" onClick={() => setMobileOpen(false)} className="nav-link px-4 py-3 rounded-xl text-sm font-medium">
              Help
            </Link>
            <div className="mt-2 px-4">
              <span
                className="text-[11px] uppercase tracking-widest px-3 py-1 rounded-full font-bold inline-flex"
                style={{
                  background: 'rgba(245,185,75,0.10)',
                  border: '1px solid rgba(245,185,75,0.25)',
                  color: '#F5B94B',
                }}
              >
                Pro
              </span>
            </div>
          </nav>
        </div>
      )}
    </header>
  );
}
