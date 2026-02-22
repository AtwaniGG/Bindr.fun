import Link from 'next/link';
import { api } from '@/lib/api';
import SlabCard from '@/components/SlabCard';
import NeededCard from '@/components/NeededCard';

interface Props {
  params: { address: string; set: string };
}

function getProgressColor(pct: number): string {
  if (pct === 100) return '#22c55e';
  if (pct > 75) return '#facc15';
  if (pct > 50) return '#f59e0b';
  return '#F5B94B';
}

export default async function SetDetailPage({ params }: Props) {
  const setName = decodeURIComponent(params.set);

  let detail;
  try {
    detail = await api.getAddressSetDetail(params.address, setName);
  } catch {
    return (
      <div className="max-w-6xl mx-auto px-5 py-16 text-center">
        <div className="glass-card inline-block px-10 py-8">
          <p style={{ color: 'rgba(255,255,255,0.45)' }}>Unable to load this set.</p>
          <Link href={`/address/${params.address}/sets`} className="explore-btn mt-5 text-sm inline-flex">
            <span>Back to sets</span>
            <span className="arrow-circle">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M19 12H5M12 19l-7-7 7-7" />
              </svg>
            </span>
          </Link>
        </div>
      </div>
    );
  }

  if (!detail) {
    return (
      <div className="max-w-6xl mx-auto px-5 py-16 text-center">
        <div className="glass-card inline-block px-10 py-8">
          <p style={{ color: 'rgba(255,255,255,0.45)' }}>Set not found.</p>
          <Link href={`/address/${params.address}/sets`} className="explore-btn mt-5 text-sm inline-flex">
            <span>Back to sets</span>
            <span className="arrow-circle">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M19 12H5M12 19l-7-7 7-7" />
              </svg>
            </span>
          </Link>
        </div>
      </div>
    );
  }

  const knownTotal = detail.totalCards > 0;
  const isComplete = knownTotal && detail.completionPct === 100;
  const pct = Math.min(detail.completionPct, 100);
  const progressColor = getProgressColor(pct);

  const radius = 54;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference - (pct / 100) * circumference;

  return (
    <div className="max-w-6xl mx-auto px-5 sm:px-8 py-10 animate-fade-in">
      {/* Back */}
      <Link
        href={`/address/${params.address}/sets`}
        className="inline-flex items-center gap-1.5 mb-8 transition-all duration-200 hover:gap-2.5"
        style={{ color: 'rgba(255,255,255,0.35)', fontSize: '13px' }}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M19 12H5M12 19l-7-7 7-7" />
        </svg>
        Back to sets
      </Link>

      {/* Hero */}
      <div className="glass-card p-6 sm:p-8 mb-12 relative overflow-hidden">
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background: `radial-gradient(ellipse at 20% 50%, ${progressColor}, transparent 70%)`,
            opacity: 0.04,
          }}
        />

        <div className="relative z-10 flex flex-col sm:flex-row items-center gap-8">
          {/* Progress Ring */}
          {knownTotal && (
            <div className="flex-shrink-0">
              <svg width="128" height="128" viewBox="0 0 128 128">
                <circle className="progress-ring-track" cx="64" cy="64" r={radius} strokeWidth="6" />
                <circle
                  className="progress-ring-fill"
                  cx="64" cy="64" r={radius}
                  stroke={progressColor}
                  strokeWidth="6"
                  strokeDasharray={circumference}
                  strokeDashoffset={dashOffset}
                />
                <text
                  x="64" y="58"
                  textAnchor="middle"
                  dominantBaseline="central"
                  style={{ fill: 'rgba(255,255,255,0.92)', fontSize: '24px', fontWeight: 800 }}
                >
                  {Math.round(pct)}%
                </text>
                <text
                  x="64" y="78"
                  textAnchor="middle"
                  dominantBaseline="central"
                  style={{ fill: 'rgba(255,255,255,0.30)', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.08em' }}
                >
                  {isComplete ? 'Complete' : 'Progress'}
                </text>
              </svg>
            </div>
          )}

          {/* Set Info */}
          <div className="flex-1 text-center sm:text-left">
            {detail.logoUrl && (
              <img
                src={detail.logoUrl}
                alt={detail.setName}
                className="h-14 sm:h-16 object-contain mb-4 mx-auto sm:mx-0 drop-shadow-lg"
              />
            )}
            <h1
              className="text-2xl sm:text-3xl font-black"
              style={{ letterSpacing: '-0.03em', color: 'rgba(255,255,255,0.95)' }}
            >
              {detail.setName}
            </h1>
            <div className="flex flex-wrap items-center gap-2 mt-3 justify-center sm:justify-start">
              {detail.series && (
                <span className="pill text-[11px]">{detail.series}</span>
              )}
              {detail.releaseYear && (
                <span className="pill text-[11px]">{detail.releaseYear}</span>
              )}
              {isComplete && (
                <span className="badge-gold text-[11px] px-3 py-1 rounded-full">COMPLETE</span>
              )}
            </div>

            {/* Stats */}
            <div className="flex items-center gap-5 mt-5 justify-center sm:justify-start">
              <div>
                <p className="text-xl font-black tabular-nums" style={{ color: 'rgba(255,255,255,0.92)' }}>{detail.ownedCount}</p>
                <p style={{ color: 'rgba(255,255,255,0.30)', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Owned</p>
              </div>
              <div style={{ width: '1px', height: '32px', background: 'rgba(255,255,255,0.08)' }} />
              <div>
                <p className="text-xl font-black tabular-nums" style={{ color: 'rgba(255,255,255,0.92)' }}>{detail.totalCards}</p>
                <p style={{ color: 'rgba(255,255,255,0.30)', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Total</p>
              </div>
              <div style={{ width: '1px', height: '32px', background: 'rgba(255,255,255,0.08)' }} />
              <div>
                <p className="text-xl font-black tabular-nums" style={{ color: '#F5B94B' }}>{detail.neededCards.length}</p>
                <p style={{ color: 'rgba(255,255,255,0.30)', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Needed</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Cards You Own */}
      <section className="mb-12">
        <h2 className="section-header mb-8">
          Cards You Own
          <span className="ml-3 font-normal" style={{ color: 'rgba(255,255,255,0.25)', fontSize: '14px' }}>
            {detail.ownedCards.length}
          </span>
        </h2>
        {detail.ownedCards.length > 0 ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
            {detail.ownedCards.map((slab, i) => (
              <div
                key={slab.id}
                className="stagger-item"
                style={{ animationDelay: `${Math.min(i * 50, 500)}ms` }}
              >
                <SlabCard slab={slab} />
              </div>
            ))}
          </div>
        ) : (
          <div className="glass-card py-12 text-center">
            <p style={{ color: 'rgba(255,255,255,0.30)', fontSize: '14px' }}>No cards owned in this set yet.</p>
          </div>
        )}
      </section>

      {/* Cards You Need */}
      {detail.neededCards.length > 0 && (
        <section>
          <h2 className="section-header mb-8">
            Cards You Need
            <span className="ml-3 font-normal" style={{ color: 'rgba(255,255,255,0.25)', fontSize: '14px' }}>
              {detail.neededCards.length}
            </span>
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
            {detail.neededCards.map((card, i) => (
              <div
                key={card.ptcgCardId}
                className="stagger-item"
                style={{ animationDelay: `${Math.min(i * 50, 500)}ms` }}
              >
                <NeededCard card={card} />
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
