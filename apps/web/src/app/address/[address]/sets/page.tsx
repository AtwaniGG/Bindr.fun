import Link from 'next/link';
import { api } from '@/lib/api';
import SetsPageClient from './SetsPageClient';

interface Props {
  params: { address: string };
}

export default async function SetsPage({ params }: Props) {
  let sets;

  try {
    sets = await api.getAddressSets(params.address);
  } catch {
    return (
      <div className="max-w-6xl mx-auto px-5 py-16 text-center">
        <div className="glass-card inline-block px-10 py-8">
          <p style={{ color: 'rgba(255,255,255,0.45)', fontSize: '16px' }}>Unable to load set data.</p>
          <Link
            href={`/address/${params.address}`}
            className="explore-btn mt-5 text-sm inline-flex"
          >
            <span>Back to dashboard</span>
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

  return <SetsPageClient sets={sets} address={params.address} />;
}
