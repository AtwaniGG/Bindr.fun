import Link from 'next/link';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';

interface Props {
  params: { address: string; slabId: string };
}

function getGraderColor(grader: string | null): string {
  if (!grader) return '#888';
  const g = grader.toUpperCase();
  if (g === 'PSA') return '#ef4444';
  if (g === 'CGC') return '#60a5fa';
  if (g === 'BGS' || g === 'BGA') return '#B1D235';
  if (g === 'SGC') return '#22c55e';
  return '#888';
}

function getGraderClass(grader: string | null): string {
  if (!grader) return '';
  const g = grader.toUpperCase();
  if (g === 'PSA') return 'grader-psa';
  if (g === 'CGC') return 'grader-cgc';
  if (g === 'BGS' || g === 'BGA') return 'grader-bgs';
  if (g === 'SGC') return 'grader-sgc';
  return '';
}

function getCertUrl(grader: string | null, certNumber: string): string | null {
  if (!grader) return null;
  const g = grader.toUpperCase();
  if (g === 'PSA') return `https://www.psacard.com/cert/${certNumber}`;
  if (g === 'CGC') return `https://www.cgccards.com/certlookup/${certNumber}`;
  if (g === 'BGS') return `https://www.beckett.com/grading/card-lookup?serial_num=${certNumber}`;
  return null;
}

export default async function SlabDetailPage({ params }: Props) {
  // Fetch all slabs and find the one matching this ID
  let slab: any = null;
  try {
    let page = 1;
    let found = false;
    while (!found) {
      const res = await fetch(
        `${API_BASE}/public/address/${params.address}/slabs?page=${page}&pageSize=50`,
        { cache: 'no-store' },
      );
      if (!res.ok) break;
      const body = await res.json();
      slab = body.data.find((s: any) => s.id === params.slabId);
      if (slab) { found = true; break; }
      if (page >= body.pagination.totalPages) break;
      page++;
    }
  } catch {}

  if (!slab) {
    return (
      <div className="max-w-4xl mx-auto px-5 sm:px-8 py-10">
        <p style={{ color: 'rgba(242,244,243,0.45)' }}>Slab not found.</p>
        <Link href={`/address/${params.address}`} className="text-sm mt-4 inline-block" style={{ color: '#B1D235' }}>
          Back to dashboard
        </Link>
      </div>
    );
  }

  const certUrl = getCertUrl(slab.grader, slab.certNumber);
  const altUrl = slab.certNumber ? `https://alt.xyz/research?certNumber=${slab.certNumber}` : null;
  const graderColor = getGraderColor(slab.grader);

  return (
    <div className="max-w-6xl mx-auto px-5 sm:px-8 py-8 animate-fade-in">
      {/* Back button */}
      <Link
        href={`/address/${params.address}`}
        className="inline-flex items-center gap-1.5 mb-6 transition-all duration-200 hover:gap-2.5"
        style={{ color: 'rgba(242,244,243,0.35)', fontSize: '13px' }}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M19 12H5M12 19l-7-7 7-7" />
        </svg>
        Back to collection
      </Link>

      {/* Two-column layout */}
      <div className="flex flex-col md:grid md:grid-cols-[40%_1fr] md:gap-x-8">

        {/* LEFT — Card image */}
        <div className="mb-6 md:mb-0">
          <div
            className="rounded-2xl overflow-hidden relative"
            style={{ background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.08)' }}
          >
            {slab.imageUrl ? (
              <img
                src={slab.imageUrl}
                alt={slab.cardName || 'Slab'}
                className="w-full object-contain"
                style={{ maxHeight: '600px' }}
              />
            ) : (
              <div className="aspect-[3/4] flex items-center justify-center">
                <span style={{ color: 'rgba(242,244,243,0.15)' }}>No image</span>
              </div>
            )}
          </div>
        </div>

        {/* RIGHT — Card details */}
        <div className="flex flex-col gap-5">

          {/* Title + badges */}
          <div>
            {slab.platform === 'courtyard' && (
              <span
                className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold mb-3"
                style={{ background: 'rgba(177,210,53,0.10)', border: '1px solid rgba(177,210,53,0.25)', color: '#B1D235' }}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                </svg>
                Vaulted &amp; Insured
              </span>
            )}
            <h1 className="text-2xl sm:text-3xl font-black" style={{ color: '#F2F4F3', letterSpacing: '-0.03em', lineHeight: 1.2 }}>
              {slab.cardName || 'Unknown Card'}
            </h1>
            {slab.setName && (
              <p className="mt-1.5" style={{ color: 'rgba(242,244,243,0.40)', fontSize: '15px' }}>
                {slab.setName}
                {slab.cardNumber ? ` #${slab.cardNumber}` : ''}
              </p>
            )}
          </div>

          {/* Stats row */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {/* Grade */}
            <div className="glass-card p-4">
              <p className="text-xs font-medium mb-1" style={{ color: 'rgba(242,244,243,0.30)', fontFamily: 'var(--font-mono)', letterSpacing: '0.05em', textTransform: 'uppercase' }}>Grade</p>
              <div className="flex items-center gap-2">
                <span
                  className={`text-xs px-2.5 py-0.5 rounded-full font-bold ${getGraderClass(slab.grader)}`}
                >
                  {slab.grader}
                </span>
                <span className="text-xl font-black" style={{ color: '#F2F4F3' }}>{slab.grade}</span>
              </div>
            </div>

            {/* Cert Number */}
            <div className="glass-card p-4">
              <p className="text-xs font-medium mb-1" style={{ color: 'rgba(242,244,243,0.30)', fontFamily: 'var(--font-mono)', letterSpacing: '0.05em', textTransform: 'uppercase' }}>Cert Number</p>
              {certUrl ? (
                <a
                  href={certUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 text-sm font-bold transition-colors hover:underline"
                  style={{ color: '#B1D235' }}
                >
                  {slab.certNumber}
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6M15 3h6v6M10 14L21 3" />
                  </svg>
                </a>
              ) : (
                <p className="text-sm font-bold" style={{ color: '#F2F4F3' }}>{slab.certNumber || '—'}</p>
              )}
            </div>

            {/* Market Value */}
            <div className="glass-card p-4">
              <p className="text-xs font-medium mb-1" style={{ color: 'rgba(242,244,243,0.30)', fontFamily: 'var(--font-mono)', letterSpacing: '0.05em', textTransform: 'uppercase' }}>Market Value</p>
              {slab.marketPrice != null ? (
                <p className="text-xl font-black" style={{ color: '#22c55e' }}>
                  ${slab.marketPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </p>
              ) : (
                <p className="text-sm" style={{ color: 'rgba(242,244,243,0.25)' }}>Not available</p>
              )}
            </div>

            {/* Platform */}
            <div className="glass-card p-4">
              <p className="text-xs font-medium mb-1" style={{ color: 'rgba(242,244,243,0.30)', fontFamily: 'var(--font-mono)', letterSpacing: '0.05em', textTransform: 'uppercase' }}>Platform</p>
              <p className="text-sm font-bold capitalize" style={{ color: '#F2F4F3' }}>{slab.platform}</p>
            </div>
          </div>

          {/* Card Details section */}
          <div className="glass-card p-5 sm:p-6">
            <h2 className="text-base font-bold mb-4" style={{ color: '#F2F4F3', letterSpacing: '-0.02em' }}>Card Details</h2>
            <div className="grid grid-cols-2 gap-y-4 gap-x-6">
              {[
                { label: 'Grader', value: slab.grader },
                { label: 'Grade', value: slab.grade },
                { label: 'Set', value: slab.setName },
                { label: 'Card Number', value: slab.cardNumber ? `#${slab.cardNumber}` : null },
                { label: 'Rarity', value: slab.rarity },
                { label: 'Type', value: slab.cardType },
                { label: 'Variant', value: slab.variant },
                { label: 'Language', value: 'English' },
              ]
                .filter((row) => row.value)
                .map((row) => (
                  <div key={row.label}>
                    <p className="text-xs mb-0.5" style={{ color: 'rgba(242,244,243,0.30)', fontFamily: 'var(--font-mono)', letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                      {row.label}
                    </p>
                    <p className="text-sm font-semibold" style={{ color: '#F2F4F3' }}>{row.value}</p>
                  </div>
                ))}
            </div>
          </div>

          {/* Pricing info */}
          {slab.marketPrice != null && (
            <div className="glass-card p-5 sm:p-6">
              <h2 className="text-base font-bold mb-4" style={{ color: '#F2F4F3', letterSpacing: '-0.02em' }}>Pricing</h2>
              <div className="flex items-baseline gap-3 mb-3">
                <span className="text-3xl font-black" style={{ color: '#22c55e' }}>
                  ${slab.marketPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
                <span className="text-xs font-medium" style={{ color: 'rgba(242,244,243,0.30)' }}>USD</span>
              </div>
              {slab.priceRetrievedAt && (
                <p className="text-xs" style={{ color: 'rgba(242,244,243,0.25)' }}>
                  Last updated: {new Date(slab.priceRetrievedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                </p>
              )}
              {altUrl && (
                <a
                  href={altUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 mt-3 text-xs font-semibold transition-colors hover:underline"
                  style={{ color: '#B1D235' }}
                >
                  View on Alt.xyz
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6M15 3h6v6M10 14L21 3" />
                  </svg>
                </a>
              )}
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
