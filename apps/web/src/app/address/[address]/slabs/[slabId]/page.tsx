import Link from 'next/link';

interface Props {
  params: { address: string; slabId: string };
}

export default async function SlabDetailPage({ params }: Props) {
  return (
    <div className="max-w-4xl mx-auto px-5 sm:px-8 py-10 animate-fade-in">
      <Link
        href={`/address/${params.address}`}
        className="inline-flex items-center gap-1.5 mb-8 transition-all duration-200 hover:gap-2.5"
        style={{ color: 'rgba(255,255,255,0.35)', fontSize: '13px' }}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M19 12H5M12 19l-7-7 7-7" />
        </svg>
        Back to dashboard
      </Link>

      <div className="glass-card p-6 sm:p-8">
        <h1 className="text-xl font-black mb-4" style={{ color: 'rgba(255,255,255,0.92)' }}>Slab Detail</h1>
        <p style={{ color: 'rgba(255,255,255,0.45)' }}>
          Slab ID: <span className="font-mono text-sm">{params.slabId}</span>
        </p>
        <p className="mt-4" style={{ color: 'rgba(255,255,255,0.30)', fontSize: '14px' }}>
          Detailed slab view coming soon — cert number, grade, set info, price snapshot, and price history.
        </p>
      </div>
    </div>
  );
}
