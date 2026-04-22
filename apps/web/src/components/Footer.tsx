export default function Footer() {
  return (
    <footer className="relative pt-16 pb-10 mt-auto">
      {/* Gradient divider */}
      <div
        className="absolute top-0 left-1/2 -translate-x-1/2 h-px"
        style={{
          width: '90%',
          background: 'linear-gradient(90deg, transparent, rgba(177,210,53,0.20), transparent)',
        }}
      />

      <div className="max-w-6xl mx-auto px-5 sm:px-8">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-10 mb-12">
          {/* Brand */}
          <div>
            <div className="flex items-center mb-4">
              <img src="/logo.svg" alt="Bindr.fun" className="h-9 opacity-70" />
            </div>
            <p style={{ color: 'rgba(242,244,243,0.30)', fontSize: '13px', lineHeight: 1.7 }}>
              Born from the nostalgia of the classic 9-pocket page. Every digital binder is a reflection of a curator&apos;s journey.
            </p>
          </div>

          {/* Navigation */}
          <div>
            <p
              className="mb-4"
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '11px',
                fontWeight: 700,
                letterSpacing: '0.1em',
                textTransform: 'uppercase',
                color: 'rgba(177,210,53,0.55)',
              }}
            >
              NAVIGATION
            </p>
            <div className="flex flex-col gap-2.5">
              <a href="#" className="nav-link text-sm">Home</a>
              <a href="#" className="nav-link text-sm">About</a>
              <a href="#" className="nav-link text-sm">Contact</a>
            </div>
          </div>

          {/* Supported */}
          <div>
            <p
              className="mb-4"
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '11px',
                fontWeight: 700,
                letterSpacing: '0.1em',
                textTransform: 'uppercase',
                color: 'rgba(177,210,53,0.55)',
              }}
            >
              SUPPORTED
            </p>
            <div className="flex flex-col gap-2.5">
              {['PSA', 'CGC', 'BGS', 'SGC', 'Courtyard'].map((name) => (
                <span key={name} className="text-sm" style={{ color: 'rgba(242,244,243,0.35)' }}>
                  {name}
                </span>
              ))}
            </div>
          </div>

          {/* Resources */}
          <div>
            <p
              className="mb-4"
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '11px',
                fontWeight: 700,
                letterSpacing: '0.1em',
                textTransform: 'uppercase',
                color: 'rgba(177,210,53,0.55)',
              }}
            >
              RESOURCES
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
          <p style={{ color: 'rgba(242,244,243,0.18)', fontSize: '12px' }}>
            &copy; 2026 Bindr.fun. Built for collectors.
          </p>
          <div className="flex items-center gap-3">
            <a
              href="https://x.com/Bindrfun"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Bindr.fun on X"
              className="footer-x-link inline-flex items-center justify-center w-8 h-8 rounded-full border transition-colors"
            >
              <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" aria-hidden="true">
                <path d="M18.244 2H21.5l-7.5 8.57L22.5 22h-6.867l-5.37-7.03L3.9 22H.64l8.02-9.17L.5 2h7.02l4.85 6.41L18.244 2Zm-1.2 18h1.9L7.05 4H5.05l12 16Z" />
              </svg>
            </a>
            <span className="pill text-[10px] uppercase tracking-widest" style={{ padding: '4px 10px' }}>
              Read-only
            </span>
            <span className="pill text-[10px] uppercase tracking-widest" style={{ padding: '4px 10px' }}>
              No custody
            </span>
          </div>
        </div>
      </div>
    </footer>
  );
}
