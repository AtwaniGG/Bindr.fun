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
            <div className="flex items-center gap-3 mb-4">
              {/* Mini binder grid */}
              <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
                {[0, 1, 2].map((r) =>
                  [0, 1, 2].map((c) => (
                    <rect
                      key={`${r}-${c}`}
                      x={c * 8}
                      y={r * 8}
                      width={6}
                      height={6}
                      rx={1.5}
                      fill={r === 0 && c === 2 ? 'none' : '#B1D235'}
                      stroke={r === 0 && c === 2 ? '#B1D235' : 'none'}
                      strokeWidth={r === 0 && c === 2 ? 0.8 : 0}
                      opacity={0.7}
                    />
                  )),
                )}
              </svg>
              <span className="text-base font-black" style={{ color: '#F2F4F3', letterSpacing: '-0.03em' }}>
                Bindr<span style={{ color: 'rgba(242,244,243,0.35)' }}>.fun</span>
              </span>
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
