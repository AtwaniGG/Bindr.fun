import Link from 'next/link';
import { api } from '@/lib/api';
import SlabListPaginated from '@/components/SlabListPaginated';

interface Props {
  params: { address: string };
}

export default async function AddressDashboard({ params }: Props) {
  let summary;
  let slabsResult;

  try {
    summary = await api.getAddressSummary(params.address);
    slabsResult = await api.getAddressSlabs(params.address);
  } catch {
    return (
      <div className="max-w-6xl mx-auto px-5 py-16 text-center">
        <div className="glass-card inline-block px-10 py-8">
          <h2 className="text-xl font-bold" style={{ color: 'rgba(255,255,255,0.85)' }}>Unable to load data</h2>
          <p style={{ color: 'rgba(255,255,255,0.40)', marginTop: '8px', fontSize: '14px' }}>
            Make sure the API server is running and the address is valid.
          </p>
          <Link href="/" className="explore-btn mt-6 text-sm inline-flex">
            <span>Go back</span>
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

  const completedSets = summary.sets.filter((s) => s.completionPct === 100).length;

  return (
    <div className="max-w-6xl mx-auto px-5 sm:px-8 py-10 animate-fade-in">
      {/* Back link */}
      <Link
        href="/"
        className="inline-flex items-center gap-1.5 mb-8 transition-all duration-200 hover:gap-2.5"
        style={{ color: 'rgba(255,255,255,0.35)', fontSize: '13px' }}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M19 12H5M12 19l-7-7 7-7" />
        </svg>
        Back
      </Link>

      {/* Page title */}
      <div className="mb-10">
        <h1
          className="text-4xl sm:text-5xl font-black"
          style={{ letterSpacing: '-0.04em', color: 'rgba(255,255,255,0.95)' }}
        >
          Dashboard
        </h1>
        <p
          className="mt-2 font-mono truncate"
          style={{ color: 'rgba(255,255,255,0.22)', fontSize: '13px' }}
        >
          {params.address}
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4 mb-12">
        <div className="stat-card">
          <p style={{ color: 'rgba(255,255,255,0.35)', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Total Slabs</p>
          <p className="text-3xl font-black mt-1.5 tabular-nums" style={{ color: 'rgba(255,255,255,0.92)' }}>{summary.totalSlabs}</p>
        </div>
        <div className="stat-card">
          <p style={{ color: 'rgba(255,255,255,0.35)', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Completed Sets</p>
          <p className="text-3xl font-black mt-1.5 tabular-nums">
            <span style={{ color: '#22c55e' }}>{completedSets}</span>
            <span style={{ color: 'rgba(255,255,255,0.20)', fontSize: '20px' }}>/{summary.totalSets}</span>
          </p>
        </div>
        <div className="stat-card">
          <p style={{ color: 'rgba(255,255,255,0.35)', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Est. Value</p>
          <p className="text-3xl font-black mt-1.5 tabular-nums" style={{ color: '#22c55e' }}>
            ${summary.estimatedValueUsd.toLocaleString()}
          </p>
        </div>
        <div className="stat-card">
          <p style={{ color: 'rgba(255,255,255,0.35)', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Platform</p>
          <p className="text-2xl font-black mt-1.5" style={{ color: 'rgba(255,255,255,0.92)' }}>Courtyard</p>
        </div>
      </div>

      {/* Slabs section */}
      <section>
        <div className="flex items-center justify-between mb-8">
          <h2 className="section-header">Your Slabs</h2>
          <Link href={`/address/${params.address}/sets`} className="explore-btn text-sm">
            <span>View Sets</span>
            <span className="arrow-circle">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 12h14M12 5l7 7-7 7" />
              </svg>
            </span>
          </Link>
        </div>
        <SlabListPaginated address={params.address} initialData={slabsResult} />
      </section>
    </div>
  );
}
