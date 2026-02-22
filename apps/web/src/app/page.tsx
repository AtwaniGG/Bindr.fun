'use client';

import { useState, useEffect, useRef } from 'react';
import AddressInput from '@/components/AddressInput';

const ROTATING_WORDS = [
  'Pokemon', 'Japanese Sets', 'Promos', 'Vintage', 'Modern', 'Trainers',
];

function useInView(ref: React.RefObject<HTMLElement | null>) {
  const [inView, setInView] = useState(false);
  useEffect(() => {
    if (!ref.current) return;
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) setInView(true); },
      { threshold: 0.15 },
    );
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, [ref]);
  return inView;
}

function DashboardPreview() {
  return (
    <div className="glass-card overflow-hidden" style={{ borderRadius: '16px' }}>
      {/* Browser chrome */}
      <div
        className="flex items-center gap-2 px-4 py-3"
        style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}
      >
        <div className="flex gap-1.5">
          <div className="w-2.5 h-2.5 rounded-full" style={{ background: 'rgba(255,255,255,0.12)' }} />
          <div className="w-2.5 h-2.5 rounded-full" style={{ background: 'rgba(255,255,255,0.12)' }} />
          <div className="w-2.5 h-2.5 rounded-full" style={{ background: 'rgba(255,255,255,0.12)' }} />
        </div>
        <div
          className="flex-1 mx-4 h-6 rounded-md flex items-center px-3"
          style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}
        >
          <span style={{ fontSize: '10px', color: 'rgba(255,255,255,0.25)' }}>
            slabdex.io/address/0x251b...dcad
          </span>
        </div>
      </div>
      {/* Mock content */}
      <div className="p-5 space-y-4">
        <div className="grid grid-cols-3 gap-2.5">
          {[
            { label: 'Slabs', value: '127', color: 'rgba(255,255,255,0.92)' },
            { label: 'Sets', value: '18', color: '#22c55e' },
            { label: 'Value', value: '$4.2k', color: '#22c55e' },
          ].map((stat) => (
            <div
              key={stat.label}
              className="rounded-xl p-3"
              style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}
            >
              <p style={{ fontSize: '9px', color: 'rgba(255,255,255,0.30)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                {stat.label}
              </p>
              <p className="text-lg font-black mt-0.5" style={{ color: stat.color }}>{stat.value}</p>
            </div>
          ))}
        </div>
        <div className="grid grid-cols-3 gap-2">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="aspect-[3/4] rounded-lg"
              style={{
                background: `linear-gradient(135deg, rgba(245,185,75,${0.03 + i * 0.02}), rgba(255,255,255,0.02))`,
                border: '1px solid rgba(255,255,255,0.05)',
              }}
            />
          ))}
        </div>
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <span style={{ fontSize: '10px', color: 'rgba(255,255,255,0.30)' }}>Base Set</span>
            <span style={{ fontSize: '10px', color: 'rgba(255,255,255,0.30)' }}>82%</span>
          </div>
          <div className="h-1.5 rounded-full" style={{ background: 'rgba(255,255,255,0.06)' }}>
            <div className="h-full rounded-full" style={{ width: '82%', background: 'linear-gradient(90deg, var(--gold), rgba(var(--gold-rgb), 0.5))' }} />
          </div>
        </div>
      </div>
    </div>
  );
}

export default function HomePage() {
  const [wordIndex, setWordIndex] = useState(0);
  const [isAnimating, setIsAnimating] = useState(false);

  const featRef = useRef<HTMLDivElement>(null);
  const gradersRef = useRef<HTMLDivElement>(null);
  const featVisible = useInView(featRef);
  const gradersVisible = useInView(gradersRef);

  useEffect(() => {
    const interval = setInterval(() => {
      setIsAnimating(true);
      setTimeout(() => {
        setWordIndex((prev) => (prev + 1) % ROTATING_WORDS.length);
        setIsAnimating(false);
      }, 220);
    }, 1500);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="relative overflow-hidden">

      {/* ═══════════════════════════════════════════
          HERO — Side-by-side (Collectr pattern)
          ═══════════════════════════════════════════ */}
      <section className="relative min-h-[calc(100vh-8rem)] flex items-center px-5">
        {/* Ambient orbs */}
        <div
          className="absolute top-[15%] left-[30%] w-[800px] h-[800px] rounded-full pointer-events-none"
          style={{ background: 'radial-gradient(circle, rgba(245,185,75,0.07) 0%, transparent 65%)' }}
        />
        <div
          className="absolute top-[50%] right-[15%] w-[500px] h-[500px] rounded-full pointer-events-none"
          style={{ background: 'radial-gradient(circle, rgba(59,130,246,0.03) 0%, transparent 65%)' }}
        />

        <div className="max-w-6xl mx-auto w-full">
          <div className="flex flex-col lg:flex-row items-center gap-12 lg:gap-16">
            {/* LEFT: Text */}
            <div className="flex-1 text-center lg:text-left">
              <h1
                className="text-5xl sm:text-6xl md:text-7xl font-black animate-fade-in"
                style={{ letterSpacing: '-0.04em', lineHeight: 1.15 }}
              >
                <span style={{ color: 'rgba(255,255,255,0.95)' }}>
                  Step Up Your Game —
                </span>
                <br />
                <span style={{ color: 'rgba(255,255,255,0.95)' }}>
                  Unlock A New Way Of{' '}
                </span>
                <span className="text-gradient">Collecting!</span>
              </h1>

              <p
                className="text-lg sm:text-xl max-w-lg leading-relaxed mt-6 mx-auto lg:mx-0 animate-slide-up"
                style={{ color: 'rgba(255,255,255,0.45)', animationDelay: '0.15s', animationFillMode: 'backwards' }}
              >
                Track your graded Pokemon slabs. Set completion, live pricing,
                and portfolio tracking — all in one place.
              </p>

              {/* Rotating CTA Button */}
              <div
                className="mt-8 animate-slide-up"
                style={{ animationDelay: '0.25s', animationFillMode: 'backwards' }}
              >
                <button
                  className="explore-btn"
                  style={{ maxWidth: '420px' }}
                  onClick={() => document.getElementById('hero-input')?.querySelector('input')?.focus()}
                >
                  <span>
                    Track Your Slabs in{' '}
                    <span
                      className="inline-block"
                      style={{
                        transition: 'all 220ms ease',
                        opacity: isAnimating ? 0 : 1,
                        transform: isAnimating ? 'translateY(-4px)' : 'translateY(0)',
                        color: 'var(--gold)',
                      }}
                    >
                      {ROTATING_WORDS[wordIndex]}
                    </span>
                  </span>
                  <span className="arrow-circle">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M5 12h14M12 5l7 7-7 7" />
                    </svg>
                  </span>
                </button>
              </div>

              {/* Address Input */}
              <div
                id="hero-input"
                className="mt-8 max-w-lg mx-auto lg:mx-0 animate-slide-up"
                style={{ animationDelay: '0.35s', animationFillMode: 'backwards' }}
              >
                <AddressInput />
              </div>

              {/* Trust pills */}
              <div
                className="flex flex-wrap items-center justify-center lg:justify-start gap-2.5 mt-6 animate-slide-up"
                style={{ animationDelay: '0.45s', animationFillMode: 'backwards' }}
              >
                <span className="pill text-[11px] uppercase tracking-widest">No custody</span>
                <span className="pill text-[11px] uppercase tracking-widest">No approvals</span>
                <span className="pill text-[11px] uppercase tracking-widest">Read-only</span>
              </div>
            </div>

            {/* RIGHT: Dashboard Preview */}
            <div
              className="flex-1 w-full max-w-md lg:max-w-lg animate-slide-up hidden md:block"
              style={{ animationDelay: '0.2s', animationFillMode: 'backwards' }}
            >
              <DashboardPreview />
            </div>
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════
          STATS BAR
          ═══════════════════════════════════════════ */}
      <section className="border-y py-8" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
        <div className="max-w-4xl mx-auto px-5 flex flex-col sm:flex-row items-center justify-center gap-8 sm:gap-16">
          {[
            { value: '5,000+', label: 'Slabs Tracked' },
            { value: '50+', label: 'Sets Supported' },
            { value: 'Live', label: 'eBay Pricing' },
          ].map((stat) => (
            <div key={stat.label} className="text-center">
              <p className="text-2xl sm:text-3xl font-black" style={{ color: 'rgba(255,255,255,0.92)', letterSpacing: '-0.03em' }}>
                {stat.value}
              </p>
              <p style={{ color: 'rgba(255,255,255,0.35)', fontSize: '13px', marginTop: '4px' }}>
                {stat.label}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* ═══════════════════════════════════════════
          FEATURE CARDS — 3-column compact grid
          ═══════════════════════════════════════════ */}
      <section className="max-w-6xl mx-auto px-5 sm:px-8 py-24">
        <div className="text-center mb-16">
          <h2
            className="text-3xl sm:text-4xl font-black"
            style={{ letterSpacing: '-0.03em', color: 'rgba(255,255,255,0.92)' }}
          >
            Everything You Need to <span className="text-gradient">Collect</span>
          </h2>
          <p className="mt-4 max-w-lg mx-auto" style={{ color: 'rgba(255,255,255,0.40)', fontSize: '16px' }}>
            From tracking to pricing to completion — SlabDex is your all-in-one slab management tool.
          </p>
        </div>

        <div
          ref={featRef}
          className={`grid grid-cols-1 sm:grid-cols-3 gap-5 transition-all duration-700 ${featVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-12'}`}
        >
          {[
            {
              icon: (
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="rgba(245,185,75,0.85)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="3" width="7" height="7" rx="1" />
                  <rect x="14" y="3" width="7" height="7" rx="1" />
                  <rect x="3" y="14" width="7" height="7" rx="1" />
                  <rect x="14" y="14" width="7" height="7" rx="1" />
                </svg>
              ),
              title: 'Track Every Slab',
              desc: 'Import your Courtyard wallet and see every graded slab you own. PSA, CGC, BGS, SGC — all supported.',
            },
            {
              icon: (
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="rgba(245,185,75,0.85)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M9 11l3 3L22 4" />
                  <path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11" />
                </svg>
              ),
              title: 'Complete Your Sets',
              desc: 'Track your progress across every Pokemon TCG set. See which cards you own and which you still need.',
            },
            {
              icon: (
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="rgba(245,185,75,0.85)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 2v20M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6" />
                </svg>
              ),
              title: 'Live Market Pricing',
              desc: 'Real-time pricing from eBay. Know exactly what your graded slabs are worth with grade-specific data.',
            },
          ].map((feature) => (
            <div key={feature.title} className="glass-card p-6 sm:p-8 text-center">
              <div
                className="w-14 h-14 rounded-2xl mx-auto flex items-center justify-center mb-5"
                style={{ background: 'rgba(245,185,75,0.08)', border: '1px solid rgba(245,185,75,0.18)' }}
              >
                {feature.icon}
              </div>
              <h3 className="text-lg font-bold mb-3" style={{ color: 'rgba(255,255,255,0.92)', letterSpacing: '-0.02em' }}>
                {feature.title}
              </h3>
              <p style={{ color: 'rgba(255,255,255,0.40)', fontSize: '14px', lineHeight: 1.6 }}>
                {feature.desc}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* ═══════════════════════════════════════════
          PARTNER MARQUEES — 3 categorized rows
          ═══════════════════════════════════════════ */}
      <section className="py-16 space-y-6">
        <div className="text-center mb-10">
          <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'rgba(255,255,255,0.25)' }}>
            Supported Platforms & Graders
          </p>
        </div>

        {/* Row 1: Grading Partners */}
        <div className="border-y py-5 overflow-hidden" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
          <div className="marquee-track">
            {[...Array(2)].map((_, d) => (
              <div key={d} className="flex items-center gap-20 px-10">
                {['PSA', 'CGC', 'BGS', 'SGC', 'PSA', 'CGC', 'BGS', 'SGC'].map((n, i) => (
                  <span key={`${d}-${i}`} className="text-base font-bold uppercase tracking-[0.15em] whitespace-nowrap" style={{ color: 'rgba(255,255,255,0.10)' }}>
                    {n}
                  </span>
                ))}
              </div>
            ))}
          </div>
        </div>

        {/* Row 2: Marketplaces (reverse) */}
        <div className="border-y py-5 overflow-hidden" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
          <div className="marquee-track-reverse">
            {[...Array(2)].map((_, d) => (
              <div key={d} className="flex items-center gap-20 px-10">
                {['Courtyard', 'eBay', 'TCGPlayer', 'Cardmarket', 'Courtyard', 'eBay', 'TCGPlayer', 'Cardmarket'].map((n, i) => (
                  <span key={`${d}-${i}`} className="text-base font-bold uppercase tracking-[0.15em] whitespace-nowrap" style={{ color: 'rgba(255,255,255,0.10)' }}>
                    {n}
                  </span>
                ))}
              </div>
            ))}
          </div>
        </div>

        {/* Row 3: Pokemon TCG Sets */}
        <div className="border-y py-5 overflow-hidden" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
          <div className="marquee-track">
            {[...Array(2)].map((_, d) => (
              <div key={d} className="flex items-center gap-20 px-10">
                {['Pokemon TCG', 'Base Set', 'Jungle', 'Fossil', 'Team Rocket', 'Gym Heroes', 'Neo Genesis', 'Scarlet & Violet'].map((n, i) => (
                  <span key={`${d}-${i}`} className="text-base font-bold uppercase tracking-[0.15em] whitespace-nowrap" style={{ color: 'rgba(255,255,255,0.10)' }}>
                    {n}
                  </span>
                ))}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════
          SUPPORTED GRADERS — 4-column grid
          ═══════════════════════════════════════════ */}
      <section className="max-w-6xl mx-auto px-5 sm:px-8 py-24">
        <div className="text-center mb-16">
          <h2
            className="text-3xl sm:text-4xl font-black"
            style={{ letterSpacing: '-0.03em', color: 'rgba(255,255,255,0.92)' }}
          >
            Supported <span className="text-gradient">Graders</span>
          </h2>
          <p className="mt-4" style={{ color: 'rgba(255,255,255,0.40)', fontSize: '16px' }}>
            We support every major grading company. Your slabs, automatically identified.
          </p>
        </div>

        <div
          ref={gradersRef}
          className={`grid grid-cols-2 sm:grid-cols-4 gap-5 transition-all duration-700 ${gradersVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-12'}`}
        >
          {[
            { name: 'PSA', color: '#ef4444', desc: 'Professional Sports Authenticator' },
            { name: 'CGC', color: '#60a5fa', desc: 'Certified Guaranty Company' },
            { name: 'BGS', color: '#F5B94B', desc: 'Beckett Grading Services' },
            { name: 'SGC', color: '#22c55e', desc: 'Sportscard Guaranty Corporation' },
          ].map((grader) => (
            <div key={grader.name} className="glass-card p-6 text-center">
              <div
                className="w-16 h-16 rounded-full mx-auto flex items-center justify-center mb-4"
                style={{ background: `${grader.color}15`, border: `1px solid ${grader.color}35` }}
              >
                <span className="text-xl font-black" style={{ color: grader.color }}>
                  {grader.name}
                </span>
              </div>
              <h3 className="font-bold" style={{ color: 'rgba(255,255,255,0.85)' }}>
                {grader.name}
              </h3>
              <p className="mt-1" style={{ color: 'rgba(255,255,255,0.30)', fontSize: '13px' }}>
                {grader.desc}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* ═══════════════════════════════════════════
          BOTTOM CTA
          ═══════════════════════════════════════════ */}
      <section className="max-w-2xl mx-auto px-5 py-24 text-center">
        <h2
          className="text-3xl sm:text-4xl font-black mb-4"
          style={{ letterSpacing: '-0.03em', color: 'rgba(255,255,255,0.92)' }}
        >
          Ready to <span className="text-gradient">explore</span>?
        </h2>
        <p className="mb-10" style={{ color: 'rgba(255,255,255,0.40)', fontSize: '16px' }}>
          Paste your wallet address and see your collection come to life.
        </p>
        <div className="max-w-lg mx-auto">
          <AddressInput />
        </div>
      </section>
    </div>
  );
}
