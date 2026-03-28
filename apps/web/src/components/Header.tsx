'use client';

import { useState } from 'react';
import Link from 'next/link';

/* 3x3 binder grid icon from brand guidelines */
function BindrIcon({ size = 28 }: { size?: number }) {
  const gap = 2;
  const cellSize = (size - gap * 2) / 3;
  const r = cellSize * 0.25;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} fill="none">
      {[0, 1, 2].map((row) =>
        [0, 1, 2].map((col) => (
          <rect
            key={`${row}-${col}`}
            x={col * (cellSize + gap)}
            y={row * (cellSize + gap)}
            width={cellSize}
            height={cellSize}
            rx={r}
            fill={row === 0 && col === 2 ? 'none' : '#B1D235'}
            stroke={row === 0 && col === 2 ? '#B1D235' : 'none'}
            strokeWidth={row === 0 && col === 2 ? 1.2 : 0}
          />
        )),
      )}
    </svg>
  );
}

export default function Header() {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <header
      className="sticky top-0 z-50"
      style={{
        background: 'rgba(46, 58, 58, 0.88)',
        backdropFilter: 'blur(24px)',
        WebkitBackdropFilter: 'blur(24px)',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
      }}
    >
      <div className="max-w-6xl mx-auto px-5 sm:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-3 group">
            <BindrIcon size={28} />
            <span
              className="text-lg font-black"
              style={{ color: '#F2F4F3', letterSpacing: '-0.04em' }}
            >
              Bindr<span style={{ color: 'rgba(242,244,243,0.40)' }}>.fun</span>
            </span>
          </Link>

          {/* Desktop Nav */}
          <nav className="hidden sm:flex items-center gap-1">
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
            background: 'rgba(46, 58, 58, 0.96)',
            backdropFilter: 'blur(24px)',
          }}
        >
          <nav className="flex flex-col px-5 py-4 gap-1">
            <Link href="/" onClick={() => setMobileOpen(false)} className="nav-link px-4 py-3 rounded-xl text-sm font-medium">
              Home
            </Link>
          </nav>
        </div>
      )}
    </header>
  );
}
