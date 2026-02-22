'use client';

import { useState } from 'react';
import Link from 'next/link';
import type { SetProgressItem } from '@/lib/api';

interface SetCardProps {
  set: SetProgressItem;
  address: string;
}

function getProgressColor(pct: number): string {
  if (pct === 100) return '#22c55e';
  if (pct > 75) return '#facc15';
  if (pct > 50) return '#f59e0b';
  return '#F5B94B';
}

function getBadgeTier(pct: number): { label: string; className: string } | null {
  if (pct === 100) return { label: 'COMPLETE', className: 'badge-gold' };
  if (pct >= 75) return { label: `${Math.round(pct)}%`, className: 'badge-silver' };
  if (pct >= 50) return { label: `${Math.round(pct)}%`, className: 'badge-bronze' };
  return null;
}

export default function SetCard({ set, address }: SetCardProps) {
  const [imgError, setImgError] = useState(false);

  const knownTotal = set.totalCards > 0;
  const pct = Math.min(set.completionPct, 100);
  const progressColor = getProgressColor(pct);
  const badge = knownTotal ? getBadgeTier(pct) : null;

  const radius = 22;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference - (pct / 100) * circumference;

  const showLogo = set.logoUrl && !imgError;
  const showPreview = !showLogo && set.previewImageUrl;
  const showSymbol = !showLogo && !showPreview && set.symbolUrl;
  const showInitial = !showLogo && !showPreview && !showSymbol;

  return (
    <Link
      href={`/address/${address}/sets/${encodeURIComponent(set.setName)}`}
      className="glass-card-interactive group block"
    >
      {/* Image Area */}
      <div
        className="aspect-[4/3] relative flex items-center justify-center overflow-hidden"
        style={{ borderRadius: '20px 20px 0 0', background: 'rgba(0,0,0,0.25)' }}
      >
        {/* Ambient glow */}
        {(showLogo || showPreview) && (
          <div
            className="ambient-glow group-hover:opacity-20"
            style={{ backgroundColor: progressColor }}
          />
        )}

        {/* Set Image */}
        {showLogo ? (
          <img
            src={set.logoUrl!}
            alt={set.setName}
            className="relative z-10 max-w-[80%] max-h-[70%] object-contain drop-shadow-lg transition-transform duration-500 group-hover:scale-108"
            loading="lazy"
            onError={() => setImgError(true)}
          />
        ) : showPreview ? (
          <>
            <div className="relative z-10 flex items-center justify-center h-full">
              <img
                src={set.previewImageUrl!}
                alt={set.setName}
                className="h-[85%] object-contain transition-transform duration-500 group-hover:scale-105"
                style={{ transform: 'rotate(3deg)', filter: 'drop-shadow(0 8px 24px rgba(0,0,0,0.5))' }}
                loading="lazy"
              />
            </div>
            {/* Bottom gradient for legibility */}
            <div
              className="absolute bottom-0 left-0 right-0 h-1/3 z-10"
              style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.5), transparent)' }}
            />
            {/* Slab badge */}
            <div
              className="absolute top-2.5 left-2.5 z-20 text-[9px] px-2 py-0.5 rounded-full uppercase tracking-widest font-bold"
              style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)', color: 'rgba(255,255,255,0.35)' }}
            >
              Slab
            </div>
          </>
        ) : showSymbol ? (
          <img
            src={set.symbolUrl!}
            alt={set.setName}
            className="relative z-10 w-12 h-12 object-contain opacity-25"
            loading="lazy"
          />
        ) : (
          <div
            className="relative z-10 w-14 h-14 rounded-full flex items-center justify-center"
            style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.10)' }}
          >
            <span style={{ color: 'rgba(255,255,255,0.25)', fontSize: '20px', fontWeight: 800 }}>
              {set.setName.charAt(0).toUpperCase()}
            </span>
          </div>
        )}

        {/* Progress Ring */}
        {knownTotal && (
          <div className="absolute bottom-2.5 right-2.5 z-20">
            <svg width="52" height="52" viewBox="0 0 52 52">
              <circle className="progress-ring-track" cx="26" cy="26" r={radius} />
              <circle
                className="progress-ring-fill"
                cx="26" cy="26" r={radius}
                stroke={progressColor}
                strokeDasharray={circumference}
                strokeDashoffset={dashOffset}
              />
              <text
                x="26" y="26"
                textAnchor="middle"
                dominantBaseline="central"
                style={{ fill: 'rgba(255,255,255,0.92)', fontSize: '10px', fontWeight: 700 }}
              >
                {Math.round(pct)}%
              </text>
            </svg>
          </div>
        )}

        {/* Badge */}
        {badge && (
          <div className={`absolute top-2.5 right-2.5 z-20 text-[10px] px-2.5 py-1 rounded-full ${badge.className}`}>
            {badge.label}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="p-3.5">
        <h3 className="font-bold text-sm truncate" style={{ color: 'rgba(255,255,255,0.85)' }}>
          {set.setName}
        </h3>
        <div className="flex items-center justify-between mt-1.5">
          <span style={{ color: 'rgba(255,255,255,0.30)', fontSize: '12px' }}>
            {knownTotal ? `${set.ownedCount} / ${set.totalCards}` : `${set.ownedCount} cards`}
          </span>
          {set.releaseYear && (
            <span className="tabular-nums" style={{ color: 'rgba(255,255,255,0.18)', fontSize: '11px' }}>
              {set.releaseYear}
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}
