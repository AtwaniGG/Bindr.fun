import type { CardRefItem } from '@/lib/api';

interface NeededCardProps {
  card: CardRefItem;
}

export default function NeededCard({ card }: NeededCardProps) {
  return (
    <div className="needed-card glass-card-interactive group relative">
      {card.imageSmall ? (
        <div className="aspect-[3/4] relative overflow-hidden" style={{ background: 'rgba(0,0,0,0.25)', borderRadius: '20px 20px 0 0' }}>
          <img
            src={card.imageSmall}
            alt={card.cardName}
            className="w-full h-full object-contain grayscale-[70%] group-hover:grayscale-0 transition-all duration-500"
            loading="lazy"
          />
          <div className="needed-overlay" style={{ borderRadius: '20px 20px 0 0' }}>
            <div className="flex flex-col items-center gap-1.5">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'rgba(255,255,255,0.35)' }}>
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                <path d="M7 11V7a5 5 0 0110 0v4" />
              </svg>
              <span style={{ fontSize: '10px', color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 600 }}>Needed</span>
            </div>
          </div>
        </div>
      ) : (
        <div className="aspect-[3/4] flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.25)', borderRadius: '20px 20px 0 0' }}>
          <span style={{ color: 'rgba(255,255,255,0.12)', fontSize: '13px' }}>No image</span>
        </div>
      )}

      <div className="p-3.5">
        <h3 className="font-bold text-sm truncate" style={{ color: 'rgba(255,255,255,0.40)' }}>
          {card.cardName}
        </h3>
        <p className="mt-1" style={{ color: 'rgba(255,255,255,0.18)', fontSize: '12px' }}>#{card.cardNumber}</p>
      </div>
    </div>
  );
}
