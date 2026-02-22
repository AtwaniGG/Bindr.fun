import Link from 'next/link';

export default function Footer() {
  return (
    <footer className="relative pt-16 pb-10 mt-auto">
      {/* Gradient divider */}
      <div
        className="absolute top-0 left-1/2 -translate-x-1/2 h-px"
        style={{
          width: '90%',
          background: 'linear-gradient(90deg, transparent, rgba(245,185,75,0.15), transparent)',
        }}
      />

      <div className="max-w-6xl mx-auto px-5 sm:px-8">
        {/* 4-column grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-10 mb-12">
          {/* Column 1: Brand + Social */}
          <div>
            <div className="flex items-center gap-3 mb-4">
              <div
                className="w-8 h-8 rounded-full flex items-center justify-center"
                style={{
                  background: 'rgba(245, 185, 75, 0.10)',
                  border: '1px solid rgba(245, 185, 75, 0.22)',
                }}
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
                  <circle cx="12" cy="12" r="10" stroke="rgba(245,185,75,0.55)" strokeWidth="1.5" />
                  <line x1="2" y1="12" x2="22" y2="12" stroke="rgba(245,185,75,0.55)" strokeWidth="1.5" />
                  <circle cx="12" cy="12" r="3" stroke="rgba(245,185,75,0.55)" strokeWidth="1.5" />
                  <circle cx="12" cy="12" r="1.5" fill="#F5B94B" />
                </svg>
              </div>
              <span className="text-base font-extrabold" style={{ color: 'rgba(255,255,255,0.85)', letterSpacing: '-0.02em' }}>
                SlabDex
              </span>
            </div>
            <p style={{ color: 'rgba(255,255,255,0.25)', fontSize: '13px', lineHeight: 1.6, marginBottom: '16px' }}>
              Track your tokenized Pokemon slabs. Collection tracking, set completion, and live market pricing.
            </p>
            {/* Social icons */}
            <div className="flex items-center gap-2.5">
              {/* Twitter/X */}
              <a
                href="#"
                className="w-9 h-9 rounded-xl flex items-center justify-center nav-link"
                style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.10)' }}
                aria-label="Twitter"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                </svg>
              </a>
              {/* Discord */}
              <a
                href="#"
                className="w-9 h-9 rounded-xl flex items-center justify-center nav-link"
                style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.10)' }}
                aria-label="Discord"
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M20.317 4.37a19.791 19.791 0 00-4.885-1.515.074.074 0 00-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 00-5.487 0 12.64 12.64 0 00-.617-1.25.077.077 0 00-.079-.037A19.736 19.736 0 003.677 4.37a.07.07 0 00-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 00.031.057 19.9 19.9 0 005.993 3.03.078.078 0 00.084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 00-.041-.106 13.107 13.107 0 01-1.872-.892.077.077 0 01-.008-.128 10.2 10.2 0 00.372-.292.074.074 0 01.077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 01.078.01c.12.098.246.198.373.292a.077.077 0 01-.006.127 12.299 12.299 0 01-1.873.892.077.077 0 00-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 00.084.028 19.839 19.839 0 006.002-3.03.077.077 0 00.032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 00-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.095 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.095 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" />
                </svg>
              </a>
              {/* YouTube */}
              <a
                href="#"
                className="w-9 h-9 rounded-xl flex items-center justify-center nav-link"
                style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.10)' }}
                aria-label="YouTube"
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M23.498 6.186a3.016 3.016 0 00-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 00.502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 002.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 002.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
                </svg>
              </a>
            </div>
          </div>

          {/* Column 2: Navigation */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest mb-4" style={{ color: 'rgba(255,255,255,0.35)' }}>
              Navigation
            </p>
            <div className="flex flex-col gap-2.5">
              <Link href="/" className="nav-link text-sm">Home</Link>
              <Link href="/" className="nav-link text-sm">Explore</Link>
              <Link href="/" className="nav-link text-sm">Help</Link>
              <Link href="/" className="nav-link text-sm">Contact</Link>
            </div>
          </div>

          {/* Column 3: Supported */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest mb-4" style={{ color: 'rgba(255,255,255,0.35)' }}>
              Supported
            </p>
            <div className="flex flex-col gap-2.5">
              {['PSA', 'CGC', 'BGS', 'SGC', 'Courtyard'].map((name) => (
                <span key={name} className="text-sm" style={{ color: 'rgba(255,255,255,0.40)' }}>
                  {name}
                </span>
              ))}
            </div>
          </div>

          {/* Column 4: Resources */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest mb-4" style={{ color: 'rgba(255,255,255,0.35)' }}>
              Resources
            </p>
            <div className="flex flex-col gap-2.5">
              <a href="#" className="nav-link text-sm">Privacy Policy</a>
              <a href="#" className="nav-link text-sm">Terms of Use</a>
            </div>
          </div>
        </div>

        {/* Bottom bar */}
        <div
          className="pt-6 flex flex-col sm:flex-row items-center justify-between gap-3"
          style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}
        >
          <p style={{ color: 'rgba(255,255,255,0.18)', fontSize: '12px' }}>
            &copy; 2024–2026 SlabDex. Built for collectors.
          </p>
          <div className="flex items-center gap-3">
            <span className="pill text-[10px] uppercase tracking-widest" style={{ padding: '4px 10px' }}>
              No custody
            </span>
            <span className="pill text-[10px] uppercase tracking-widest" style={{ padding: '4px 10px' }}>
              Read-only
            </span>
          </div>
        </div>
      </div>
    </footer>
  );
}
