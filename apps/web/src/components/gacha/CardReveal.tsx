'use client';

import { useState, useEffect } from 'react';
import type { GachaCardInfo } from '@/lib/api';

interface CardRevealProps {
  card: GachaCardInfo;
  onComplete: () => void;
}

export default function CardReveal({ card, onComplete }: CardRevealProps) {
  const [phase, setPhase] = useState<'intro' | 'flip' | 'reveal'>('intro');

  useEffect(() => {
    // Intro glow for 1s, then flip
    const t1 = setTimeout(() => setPhase('flip'), 1000);
    // Flip takes 0.8s, then reveal
    const t2 = setTimeout(() => setPhase('reveal'), 1800);
    // Auto-dismiss after 4s total
    const t3 = setTimeout(onComplete, 4000);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
    };
  }, [onComplete]);

  const tierColor =
    card.tier === 'ultra_rare'
      ? 'from-amber-500 to-yellow-300'
      : card.tier === 'rare'
        ? 'from-blue-500 to-cyan-300'
        : card.tier === 'uncommon'
          ? 'from-emerald-500 to-green-300'
          : 'from-gray-400 to-gray-300';

  const tierGlow =
    card.tier === 'ultra_rare'
      ? 'shadow-[0_0_80px_rgba(245,158,11,0.5)]'
      : card.tier === 'rare'
        ? 'shadow-[0_0_60px_rgba(59,130,246,0.4)]'
        : card.tier === 'uncommon'
          ? 'shadow-[0_0_40px_rgba(16,185,129,0.3)]'
          : '';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm cursor-pointer"
      onClick={onComplete}
    >
      {/* Glow ring */}
      <div
        className={`absolute w-[400px] h-[400px] rounded-full bg-gradient-radial ${tierColor} opacity-20 blur-[80px] transition-opacity duration-1000 ${
          phase === 'intro' ? 'opacity-0 scale-50' : 'opacity-20 scale-100'
        }`}
      />

      {/* Card container with 3D flip */}
      <div
        className="relative w-[280px] aspect-[3/4]"
        style={{ perspective: '1200px' }}
      >
        <div
          className={`relative w-full h-full transition-transform duration-700 ease-out ${tierGlow}`}
          style={{
            transformStyle: 'preserve-3d',
            transform:
              phase === 'intro'
                ? 'rotateY(0deg) scale(0.8)'
                : phase === 'flip'
                  ? 'rotateY(90deg) scale(1)'
                  : 'rotateY(0deg) scale(1)',
          }}
        >
          {phase !== 'reveal' ? (
            /* Card Back */
            <div className="absolute inset-0 rounded-xl bg-gradient-to-br from-[var(--bg-surface)] to-[#1a1f2e] border border-[var(--glass-border)] flex flex-col items-center justify-center gap-4 animate-glow-pulse">
              {/* Bindr logo pattern */}
              <div className="grid grid-cols-3 gap-1.5 opacity-30">
                {Array.from({ length: 9 }).map((_, i) => (
                  <div
                    key={i}
                    className={`w-6 h-6 rounded-sm border ${
                      i === 2
                        ? 'border-[var(--lime)] border-dashed'
                        : 'border-[var(--glass-border)] bg-[var(--glass-bg)]'
                    }`}
                  />
                ))}
              </div>
              <p className="text-xs font-mono text-[var(--text-muted)] uppercase tracking-widest">
                bindr.fun
              </p>
            </div>
          ) : (
            /* Card Front */
            <div className="absolute inset-0 rounded-xl overflow-hidden animate-fade-in">
              {card.imageUrl ? (
                <img
                  src={card.imageUrl}
                  alt={card.cardName || 'Card'}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full bg-[var(--bg-surface)] flex items-center justify-center">
                  <span className="text-lg font-bold">
                    {card.cardName || '???'}
                  </span>
                </div>
              )}
              {/* Info overlay */}
              <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-black/90 via-black/60 to-transparent">
                <p className="font-bold text-lg">{card.cardName}</p>
                <p className="text-sm text-[var(--text-secondary)]">
                  {card.setName}
                </p>
                <div className="flex items-center gap-2 mt-2">
                  <span className="text-xs font-mono text-[var(--text-muted)]">
                    {card.grader} {card.grade}
                  </span>
                  <span
                    className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-gradient-to-r ${tierColor} text-black`}
                  >
                    {card.tier?.replace('_', ' ')}
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Tap to dismiss hint */}
      {phase === 'reveal' && (
        <p className="absolute bottom-8 text-xs text-[var(--text-muted)] animate-fade-in">
          Tap anywhere to continue
        </p>
      )}
    </div>
  );
}
