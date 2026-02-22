import type { SlabItem } from '@/lib/api';

interface SlabCardProps {
  slab: SlabItem;
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

export default function SlabCard({ slab }: SlabCardProps) {
  return (
    <div className="glass-card-interactive group">
      {slab.imageUrl ? (
        <div className="aspect-[3/4] relative overflow-hidden" style={{ background: 'rgba(0,0,0,0.25)', borderRadius: '20px 20px 0 0' }}>
          {/* Ambient glow behind image */}
          <div
            className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none"
            style={{
              background: 'radial-gradient(circle at 50% 60%, rgba(245,185,75,0.08), transparent 70%)',
            }}
          />
          <img
            src={slab.imageUrl}
            alt={slab.cardName || 'Slab'}
            className="relative z-[1] w-full h-full object-contain transition-transform duration-500 group-hover:scale-105"
            loading="lazy"
          />
        </div>
      ) : (
        <div className="aspect-[3/4] flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.25)', borderRadius: '20px 20px 0 0' }}>
          <span style={{ color: 'rgba(255,255,255,0.12)', fontSize: '13px' }}>No image</span>
        </div>
      )}
      <div className="p-3.5">
        {slab.cardName ? (
          <h3 className="font-bold text-sm truncate" style={{ color: 'rgba(255,255,255,0.88)' }}>
            {slab.cardName}
          </h3>
        ) : (
          <h3 className="text-sm truncate italic" style={{ color: 'rgba(255,255,255,0.25)' }}>
            Unidentified Slab
          </h3>
        )}
        {(slab.setName || slab.cardNumber) && (
          <p className="mt-1 truncate" style={{ color: 'rgba(255,255,255,0.30)', fontSize: '12px' }}>
            {slab.setName || ''}
            {slab.cardNumber ? ` #${slab.cardNumber}` : ''}
          </p>
        )}
        <div className="flex items-center justify-between mt-2.5">
          {slab.grader && slab.grade && (
            <span
              className={`text-[11px] px-2.5 py-0.5 rounded-full font-semibold ${getGraderClass(slab.grader)}`}
            >
              {slab.grader} {slab.grade}
            </span>
          )}
          {slab.marketPrice != null && (
            <span
              className="text-sm font-bold px-2 py-0.5 rounded-lg"
              style={{ color: '#22c55e', background: 'rgba(34, 197, 94, 0.08)' }}
            >
              ${slab.marketPrice.toLocaleString()}
            </span>
          )}
        </div>
        {slab.certNumber && (
          <p className="mt-2" style={{ color: 'rgba(255,255,255,0.15)', fontSize: '11px' }}>
            Cert: {slab.certNumber}
          </p>
        )}
      </div>
    </div>
  );
}
