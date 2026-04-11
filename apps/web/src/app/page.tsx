'use client';

import { useState, useEffect, useRef } from 'react';

function useInView(ref: React.RefObject<HTMLElement | null>, threshold = 0.15) {
  const [inView, setInView] = useState(false);
  useEffect(() => {
    if (!ref.current) return;
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) setInView(true); },
      { threshold },
    );
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, [ref, threshold]);
  return inView;
}

export default function HomePage() {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [message, setMessage] = useState('');

  const featRef = useRef<HTMLDivElement>(null);
  const featVisible = useInView(featRef);

  const peekRef = useRef<HTMLDivElement>(null);
  const peekVisible = useInView(peekRef, 0.1);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = email.trim();
    if (!trimmed) {
      setStatus('error');
      setMessage('Please enter your email address.');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      setStatus('error');
      setMessage('Please enter a valid email address.');
      return;
    }

    setStatus('loading');
    try {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api'}/beta/signup`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email }),
        },
      );
      const data = await res.json();
      if (res.ok) {
        setStatus('success');
        setMessage(data.message || "You're on the list!");
        setEmail('');
      } else {
        setStatus('error');
        setMessage(data.message || 'Something went wrong. Try again.');
      }
    } catch {
      setStatus('error');
      setMessage('Could not connect. Try again.');
    }
  }

  return (
    <div className="relative overflow-hidden">

      {/* ═══ HERO ═══ */}
      <section className="relative min-h-[calc(100vh-8rem)] flex items-center justify-center px-5">
        {/* Ambient glow */}
        <div
          className="absolute top-[5%] left-[30%] w-[700px] h-[700px] rounded-full pointer-events-none"
          style={{ background: 'radial-gradient(circle, rgba(177,210,53,0.06) 0%, transparent 60%)' }}
        />

        <div className="max-w-3xl mx-auto text-center">
          {/* Binder grid icon */}
          <div className="flex justify-center mb-8 animate-fade-in">
            <img src="/icon.svg" alt="Bindr.fun" className="h-20" />
          </div>

          {/* Beta badge */}
          <div
            className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full mb-8 animate-fade-in"
            style={{
              background: 'rgba(177,210,53,0.08)',
              border: '1px solid rgba(177,210,53,0.20)',
            }}
          >
            <span className="w-2 h-2 rounded-full animate-glow-pulse" style={{ background: '#B1D235' }} />
            <span
              className="text-xs font-bold uppercase"
              style={{
                fontFamily: 'var(--font-mono)',
                color: '#B1D235',
                letterSpacing: '0.1em',
              }}
            >
              Beta coming soon
            </span>
          </div>

          {/* Headline — Satoshi Black */}
          <h1
            className="text-5xl sm:text-6xl md:text-7xl font-black animate-fade-in"
            style={{ letterSpacing: '-0.04em', lineHeight: 1.05 }}
          >
            <span style={{ color: '#F2F4F3' }}>Collect. Connect.</span>
            <br />
            <span className="text-gradient">Complete.</span>
          </h1>

          {/* Description — Satoshi Regular */}
          <p
            className="text-lg sm:text-xl max-w-xl leading-relaxed mt-6 mx-auto animate-slide-up"
            style={{ color: 'rgba(242,244,243,0.45)', animationDelay: '0.15s', animationFillMode: 'backwards' }}
          >
            Born from the nostalgia of the classic 9-pocket page, Bindr.fun
            redefines what it means to be a collector in the digital age.
            Track your graded slabs, complete sets, and get live market pricing.
          </p>

          {/* Email signup form */}
          <form
            onSubmit={handleSubmit}
            className="mt-10 animate-slide-up"
            style={{ animationDelay: '0.3s', animationFillMode: 'backwards' }}
          >
            <div className="flex flex-col sm:flex-row gap-3 max-w-md mx-auto">
              <input
                type="text"
                value={email}
                onChange={(e) => { setEmail(e.target.value); if (status !== 'idle') setStatus('idle'); }}
                placeholder="Enter your email"
                className="glass-input flex-1"
              />
              <button
                type="button"
                onClick={(e) => {
                  const form = (e.target as HTMLElement).closest('form');
                  if (form) { form.requestSubmit(); }
                }}
                disabled={status === 'loading'}
                className="btn-lime whitespace-nowrap"
                style={{ minWidth: '160px' }}
              >
                {status === 'loading' ? 'Joining...' : 'Join the Beta'}
              </button>
            </div>

            {/* Status */}
            {status === 'success' && (
              <p className="mt-4 text-sm font-medium animate-fade-in" style={{ color: '#028E46' }}>
                {message}
              </p>
            )}
            {status === 'error' && (
              <p className="mt-4 text-sm font-medium animate-fade-in" style={{ color: '#ef4444' }}>
                {message}
              </p>
            )}
          </form>

          {/* Trust pills */}
          <div
            className="flex flex-wrap items-center justify-center gap-2.5 mt-6 animate-slide-up"
            style={{ animationDelay: '0.45s', animationFillMode: 'backwards' }}
          >
            {['Free during beta', 'No wallet needed', 'Read-only'].map((label) => (
              <span
                key={label}
                className="pill"
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: '10px',
                  letterSpacing: '0.1em',
                  textTransform: 'uppercase',
                }}
              >
                {label}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* ═══ WHAT IS BINDR ═══ */}
      <section className="max-w-6xl mx-auto px-5 sm:px-8 py-24">
        <div className="text-center mb-16">
          <p
            className="mb-3"
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '11px',
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
              color: 'rgba(177,210,53,0.60)',
            }}
          >
            Platform Overview
          </p>
          <h2
            className="text-3xl sm:text-4xl font-black"
            style={{ letterSpacing: '-0.04em', color: '#F2F4F3' }}
          >
            What is <span className="text-gradient">Bindr</span>?
          </h2>
          <p className="mt-4 max-w-lg mx-auto" style={{ color: 'rgba(242,244,243,0.40)', fontSize: '16px' }}>
            The ultimate toolkit for graded Pokemon card collectors.
            Curate your Showcase Vault. Organize by rarity, set, or sentiment.
          </p>
        </div>

        <div
          ref={featRef}
          className={`grid grid-cols-1 sm:grid-cols-3 gap-5 transition-all duration-700 ${featVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-12'}`}
        >
          {[
            {
              icon: (
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#B1D235" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="3" width="7" height="7" rx="1" />
                  <rect x="14" y="3" width="7" height="7" rx="1" />
                  <rect x="3" y="14" width="7" height="7" rx="1" />
                  <rect x="14" y="14" width="7" height="7" rx="1" />
                </svg>
              ),
              label: 'Track Every Slab',
              title: 'Track Every Slab',
              desc: 'Import your collection and see every graded slab you own. PSA, CGC, BGS, SGC — all supported automatically.',
            },
            {
              icon: (
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#B1D235" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M9 11l3 3L22 4" />
                  <path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11" />
                </svg>
              ),
              label: 'Set Completion',
              title: 'Complete Your Sets',
              desc: 'One slot remaining. Secure your Missing Piece and lock the set. Track progress across every Pokemon TCG set.',
            },
            {
              icon: (
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#B1D235" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 2v20M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6" />
                </svg>
              ),
              label: 'Live Pricing',
              title: 'Live Market Pricing',
              desc: 'Real-time pricing powered by multiple data sources. Know exactly what your graded slabs are worth.',
            },
          ].map((feature) => (
            <div key={feature.title} className="glass-card p-6 sm:p-8 text-center">
              <div
                className="w-14 h-14 rounded-2xl mx-auto flex items-center justify-center mb-5"
                style={{ background: 'rgba(177,210,53,0.08)', border: '1px solid rgba(177,210,53,0.18)' }}
              >
                {feature.icon}
              </div>
              <p
                className="mb-2"
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: '10px',
                  letterSpacing: '0.1em',
                  color: 'rgba(177,210,53,0.50)',
                }}
              >
                {feature.label}
              </p>
              <h3 className="text-lg font-bold mb-3" style={{ color: '#F2F4F3', letterSpacing: '-0.02em' }}>
                {feature.title}
              </h3>
              <p style={{ color: 'rgba(242,244,243,0.40)', fontSize: '14px', lineHeight: 1.65 }}>
                {feature.desc}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* ═══ SNEAK PEEK ═══ */}
      <section className="max-w-6xl mx-auto px-5 sm:px-8 py-24">
        <div className="text-center mb-16">
          <p
            className="mb-3"
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '11px',
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
              color: 'rgba(177,210,53,0.60)',
            }}
          >
            Sneak Peek
          </p>
          <h2
            className="text-3xl sm:text-4xl font-black"
            style={{ letterSpacing: '-0.04em', color: '#F2F4F3' }}
          >
            A look <span className="text-gradient">inside</span>
          </h2>
          <p className="mt-4 max-w-lg mx-auto" style={{ color: 'rgba(242,244,243,0.40)', fontSize: '16px' }}>
            Track your graded slabs, complete sets, and monitor your collection value — all in one place.
          </p>
        </div>

        <div
          ref={peekRef}
          className={`space-y-6 transition-all duration-700 ${peekVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-12'}`}
        >
          {/* Lookup preview (full width) */}
          <div className="glass-card overflow-hidden p-1.5">
            <div className="relative rounded-2xl overflow-hidden">
              <img
                src="/preview-lookup.png"
                alt="Collection Lookup — paste any Courtyard wallet address"
                className="w-full block"
                loading="lazy"
              />
              <div
                className="absolute bottom-0 left-0 right-0 h-1/4"
                style={{ background: 'linear-gradient(to top, rgba(46,58,58,0.9), transparent)' }}
              />
            </div>
            <div className="px-4 py-3 flex items-center gap-3">
              <span
                className="pill"
                style={{ fontFamily: 'var(--font-mono)', fontSize: '9px', letterSpacing: '0.1em', textTransform: 'uppercase' }}
              >
                Lookup
              </span>
              <span style={{ color: 'rgba(242,244,243,0.35)', fontSize: '13px' }}>
                Search any wallet instantly
              </span>
            </div>
          </div>

          {/* Dashboard + Sets side by side */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="glass-card overflow-hidden p-1.5">
              <div className="relative rounded-2xl overflow-hidden">
                <img
                  src="/preview-dashboard.png"
                  alt="Dashboard — track your total slabs, set progress, and estimated value"
                  className="w-full block"
                  loading="lazy"
                />
                <div
                  className="absolute bottom-0 left-0 right-0 h-1/3"
                  style={{ background: 'linear-gradient(to top, rgba(46,58,58,0.9), transparent)' }}
                />
              </div>
              <div className="px-4 py-3 flex items-center gap-3">
                <span
                  className="pill"
                  style={{ fontFamily: 'var(--font-mono)', fontSize: '9px', letterSpacing: '0.1em', textTransform: 'uppercase' }}
                >
                  Dashboard
                </span>
                <span style={{ color: 'rgba(242,244,243,0.35)', fontSize: '13px' }}>
                  Your collection at a glance — slabs, value, and set progress
                </span>
              </div>
            </div>

            <div className="glass-card overflow-hidden p-1.5">
              <div className="relative rounded-2xl overflow-hidden">
                <img
                  src="/preview-sets.png"
                  alt="Set Dex — track completion across 150+ Pokemon TCG sets"
                  className="w-full block"
                  loading="lazy"
                />
                <div
                  className="absolute bottom-0 left-0 right-0 h-1/3"
                  style={{ background: 'linear-gradient(to top, rgba(46,58,58,0.9), transparent)' }}
                />
              </div>
              <div className="px-4 py-3 flex items-center gap-3">
                <span
                  className="pill"
                  style={{ fontFamily: 'var(--font-mono)', fontSize: '9px', letterSpacing: '0.1em', textTransform: 'uppercase' }}
                >
                  Set Dex
                </span>
                <span style={{ color: 'rgba(242,244,243,0.35)', fontSize: '13px' }}>
                  150+ sets with progress tracking
                </span>
              </div>
            </div>

            <div className="glass-card overflow-hidden p-1.5">
              <div className="relative rounded-2xl overflow-hidden">
                <img
                  src="/preview-gacha-before.png"
                  alt="$SLAB Gacha — connect wallet and burn $SLAB"
                  className="w-full block"
                  loading="lazy"
                />
                <div
                  className="absolute bottom-0 left-0 right-0 h-1/3"
                  style={{ background: 'linear-gradient(to top, rgba(46,58,58,0.9), transparent)' }}
                />
              </div>
              <div className="px-4 py-3 flex items-center gap-3">
                <span
                  className="pill"
                  style={{ fontFamily: 'var(--font-mono)', fontSize: '9px', letterSpacing: '0.1em', textTransform: 'uppercase' }}
                >
                  Gacha
                </span>
                <span style={{ color: 'rgba(242,244,243,0.35)', fontSize: '13px' }}>
                  Burn $SLAB, pull a card
                </span>
              </div>
            </div>

            <div className="glass-card overflow-hidden p-1.5">
              <div className="relative rounded-2xl overflow-hidden">
                <img
                  src="/preview-gacha.png"
                  alt="$SLAB Gacha — pulled a Charizard VMAX"
                  className="w-full block"
                  loading="lazy"
                />
                <div
                  className="absolute bottom-0 left-0 right-0 h-1/3"
                  style={{ background: 'linear-gradient(to top, rgba(46,58,58,0.9), transparent)' }}
                />
              </div>
              <div className="px-4 py-3 flex items-center gap-3">
                <span
                  className="pill"
                  style={{ fontFamily: 'var(--font-mono)', fontSize: '9px', letterSpacing: '0.1em', textTransform: 'uppercase' }}
                >
                  Result
                </span>
                <span style={{ color: 'rgba(242,244,243,0.35)', fontSize: '13px' }}>
                  Reveal your graded card
                </span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ═══ MARQUEE ═══ */}
      <section className="py-16 space-y-6">
        <div className="text-center mb-10">
          <p
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '10px',
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
              color: 'rgba(242,244,243,0.20)',
            }}
          >
            Supported Platforms & Graders
          </p>
        </div>

        <div className="border-y py-5 overflow-hidden" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
          <div className="marquee-track">
            {[...Array(2)].map((_, d) => (
              <div key={d} className="flex items-center gap-20 px-10">
                {['PSA', 'CGC', 'BGS', 'SGC', 'Courtyard', 'eBay', 'TCGPlayer', 'PSA', 'CGC', 'BGS', 'SGC', 'Courtyard'].map((n, i) => (
                  <span
                    key={`${d}-${i}`}
                    className="text-base font-bold uppercase whitespace-nowrap"
                    style={{
                      fontFamily: 'var(--font-mono)',
                      letterSpacing: '0.15em',
                      color: 'rgba(242,244,243,0.08)',
                    }}
                  >
                    {n}
                  </span>
                ))}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══ BOTTOM CTA ═══ */}
      <section className="max-w-2xl mx-auto px-5 py-24 text-center">
        <h2
          className="text-3xl sm:text-4xl font-black mb-4"
          style={{ letterSpacing: '-0.04em', color: '#F2F4F3' }}
        >
          Be the first to <span className="text-gradient">try it</span>.
        </h2>
        <p className="mb-10" style={{ color: 'rgba(242,244,243,0.40)', fontSize: '16px' }}>
          Sign up for early access and we&apos;ll email you when Bindr.fun is ready.
        </p>
        <form
          onSubmit={handleSubmit}
          className="flex flex-col sm:flex-row gap-3 max-w-md mx-auto"
        >
          <input
            type="text"
            value={email}
            onChange={(e) => { setEmail(e.target.value); if (status !== 'idle') setStatus('idle'); }}
            placeholder="Enter your email"
            className="glass-input flex-1"
          />
          <button
            type="button"
            onClick={(e) => {
              const form = (e.target as HTMLElement).closest('form');
              if (form) { form.requestSubmit(); }
            }}
            disabled={status === 'loading'}
            className="btn-lime whitespace-nowrap"
          >
            {status === 'loading' ? 'Joining...' : 'Join the Beta'}
          </button>
        </form>
        {status === 'success' && (
          <p className="mt-4 text-sm font-medium animate-fade-in" style={{ color: '#028E46' }}>
            {message}
          </p>
        )}
        {status === 'error' && (
          <p className="mt-4 text-sm font-medium animate-fade-in" style={{ color: '#ef4444' }}>
            {message}
          </p>
        )}
      </section>
    </div>
  );
}
