'use client';

import { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { GachaCardInfo } from '@/lib/api';

interface CardRevealProps {
  card: GachaCardInfo;
  onComplete: () => void;
}

type Act = 'tear' | 'extract' | 'spin' | 'stamp' | 'ascension' | 'details';

type GradeTier = 'gem_mint' | 'mint' | 'near_mint' | 'played';

/* ─────────────────────────────────────────────────────────────────
   Grade classification
   PSA 10 / BGS 10 / CGC 10 / SGC 10 = gem_mint (god tier)
   PSA 9-9.5 / BGS 9.5 / CGC 9.5-9.8 = mint
   PSA 8 / BGS 9 / CGC 9 = near_mint
   everything else = played
   ───────────────────────────────────────────────────────────────── */
function classifyGrade(grader: string | null, grade: string | null): GradeTier {
  if (!grade) return 'played';
  const n = parseFloat(grade);
  const g = (grader || '').toUpperCase();
  if (!isFinite(n)) return 'played';
  if (n >= 10) return 'gem_mint';
  if (n >= 9.5) return 'mint';
  if (n >= 9) return g === 'PSA' ? 'mint' : 'near_mint';
  if (n >= 8) return 'near_mint';
  return 'played';
}

const TIER_META: Record<GradeTier, {
  label: string;
  accent: string;
  accentBright: string;
  crown: string;
  holdMs: number;
}> = {
  gem_mint: {
    label: 'GEM MINT',
    accent: '#d4af37',
    accentBright: '#f0cb50',
    crown: '♕',
    holdMs: 2400,
  },
  mint: {
    label: 'MINT',
    accent: '#B1D235',
    accentBright: '#d4ef62',
    crown: '◆',
    holdMs: 1200,
  },
  near_mint: {
    label: 'NEAR MINT',
    accent: '#7ac8ff',
    accentBright: '#a8dcff',
    crown: '◇',
    holdMs: 800,
  },
  played: {
    label: 'COLLECTOR',
    accent: '#e8dfc6',
    accentBright: '#f5ecd2',
    crown: '·',
    holdMs: 600,
  },
};

/* timeline (ms) per act (linear progression; see useEffect) */
const TIMELINE: Record<Act, number> = {
  tear: 0,
  extract: 320,
  spin: 820,
  stamp: 1560,
  ascension: 2180,
  details: 0, // computed from tier
};

export default function CardReveal({ card, onComplete }: CardRevealProps) {
  const tier = useMemo(() => classifyGrade(card.grader, card.grade), [card.grader, card.grade]);
  const meta = TIER_META[tier];
  const isGemMint = tier === 'gem_mint';

  const [act, setAct] = useState<Act>('tear');

  useEffect(() => {
    const tiers = ['tear', 'extract', 'spin', 'stamp', 'ascension'] as const;
    const detailsDelay = TIMELINE.ascension + meta.holdMs;
    const dismissDelay = detailsDelay + 3200;

    const timers: ReturnType<typeof setTimeout>[] = [];
    for (const t of tiers) {
      if (t === 'tear') continue;
      timers.push(setTimeout(() => setAct(t), TIMELINE[t]));
    }
    timers.push(setTimeout(() => setAct('details'), detailsDelay));
    timers.push(setTimeout(onComplete, dismissDelay));

    return () => timers.forEach(clearTimeout);
  }, [meta.holdMs, onComplete]);

  const showCard = act !== 'tear';
  const flipped = act === 'stamp' || act === 'ascension' || act === 'details';
  const showStamp = act === 'stamp' || act === 'ascension' || act === 'details';
  const showAscension = act === 'ascension' || (isGemMint && act === 'details');
  const showDetails = act === 'details';

  return (
    <div
      className="fixed inset-0 z-[60] cursor-pointer overflow-hidden"
      onClick={onComplete}
      style={{ background: '#050305' }}
    >
      {/* ── LAYER 1: void backdrop ── */}
      <div className="absolute inset-0 reveal-void" />

      {/* ── LAYER 2: gem-mint curtain drop + chromatic backdrop ── */}
      {isGemMint && showAscension && (
        <>
          <motion.div
            className="absolute inset-0 reveal-curtain"
            style={{
              background:
                'linear-gradient(180deg, #1a0a0a 0%, #0a0a0a 50%, #050305 100%)',
            }}
            initial={{ y: '-100%' }}
            animate={{ y: 0 }}
            transition={{ duration: 0.6, ease: [0.25, 0.8, 0.3, 1] }}
          />
          {/* radial gold spotlight */}
          <div
            aria-hidden
            className="absolute inset-0 pointer-events-none"
            style={{
              background:
                'radial-gradient(circle at 50% 45%, rgba(240,203,80,0.30) 0%, rgba(90,14,26,0.10) 35%, transparent 65%)',
            }}
          />
          {/* gold rain particles */}
          {Array.from({ length: 40 }).map((_, i) => (
            <span
              key={i}
              className="reveal-gold-particle"
              style={
                {
                  left: `${(i * 53) % 100}%`,
                  animationDelay: `${(i * 0.17) % 3.5}s`,
                  ['--drift' as any]: `${Math.sin(i) * 40}px`,
                } as React.CSSProperties
              }
            />
          ))}
        </>
      )}

      {/* ── LAYER 3: ambient tier halo (mint / near_mint) ── */}
      {!isGemMint && showAscension && (
        <div
          aria-hidden
          className="absolute inset-0 pointer-events-none reveal-tier-pulse"
          style={{
            background: `radial-gradient(circle at 50% 50%, ${meta.accent}33 0%, transparent 55%)`,
          }}
        />
      )}

      {/* ── LAYER 4: grain overlay (texture) ── */}
      <div className="reveal-grain" />

      {/* ── CENTER STAGE ── */}
      <div className="relative z-10 w-full h-full flex items-center justify-center px-6">
        <div className="relative" style={{ perspective: '1600px' }}>
          {/* hairline vertical registration marks (auction-catalog vibe) */}
          <div
            aria-hidden
            className="absolute -left-14 top-1/2 -translate-y-1/2 flex flex-col items-center gap-1 font-mono text-[8px] tracking-widest"
            style={{ color: meta.accent, opacity: showCard ? 0.5 : 0 }}
          >
            <span>01</span>
            <span className="w-px h-10" style={{ background: meta.accent, opacity: 0.3 }} />
            <span>02</span>
            <span className="w-px h-10" style={{ background: meta.accent, opacity: 0.3 }} />
            <span>03</span>
          </div>

          {/* Act 1 — tear flash */}
          <AnimatePresence>
            {act === 'tear' && (
              <motion.div
                initial={{ scaleX: 0, opacity: 0 }}
                animate={{ scaleX: 1.2, opacity: [0, 1, 0] }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.3, ease: 'easeOut' }}
                className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 h-1 w-[440px] rounded-full"
                style={{
                  background: `linear-gradient(90deg, transparent, #fff, ${meta.accentBright}, #fff, transparent)`,
                  boxShadow: `0 0 32px ${meta.accentBright}, 0 0 64px ${meta.accent}`,
                  filter: 'blur(0.5px)',
                }}
              />
            )}
          </AnimatePresence>

          {/* Card container — 3D */}
          <motion.div
            className="relative"
            style={{
              width: 300,
              aspectRatio: '3 / 4',
              transformStyle: 'preserve-3d',
            }}
            initial={{ y: 200, opacity: 0, scale: 0.7 }}
            animate={{
              y: showCard ? 0 : 200,
              opacity: showCard ? 1 : 0,
              scale: showCard ? 1 : 0.7,
              rotateY: flipped ? 0 : act === 'extract' ? -8 : 180,
            }}
            transition={{
              y: { duration: 0.5, ease: [0.2, 0.8, 0.3, 1] },
              opacity: { duration: 0.4 },
              scale: { duration: 0.5, ease: [0.2, 0.8, 0.3, 1] },
              rotateY: { duration: 0.7, ease: [0.4, 0, 0.2, 1], delay: act === 'spin' ? 0 : 0 },
            }}
          >
            {/* Card back (shows during extract + spin first half) */}
            <div
              className="absolute inset-0 rounded-[14px] overflow-hidden"
              style={{
                backfaceVisibility: 'hidden',
                transform: 'rotateY(180deg)',
                background:
                  'linear-gradient(135deg, #1c0c0c 0%, #0a0a0a 55%, #1a0a1a 100%)',
                border: `1px solid ${meta.accent}66`,
                boxShadow: `0 0 48px ${meta.accent}33, inset 0 0 24px rgba(0,0,0,0.85)`,
              }}
            >
              {/* back artwork — monogram + cert lattice */}
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 p-8">
                <div className="grid grid-cols-3 gap-1.5">
                  {Array.from({ length: 9 }).map((_, i) => (
                    <div
                      key={i}
                      className="w-8 h-8 rounded-sm"
                      style={{
                        border: `1px solid ${i === 4 ? meta.accent : 'rgba(232,223,198,0.12)'}`,
                        background: i === 4 ? meta.accent + '22' : 'transparent',
                      }}
                    />
                  ))}
                </div>
                <div
                  className="font-display italic text-base"
                  style={{ fontFamily: 'var(--font-display)', color: meta.accent }}
                >
                  bindr
                </div>
                <div className="absolute bottom-6 left-6 right-6 flex justify-between font-mono text-[8px] uppercase tracking-widest" style={{ color: meta.accent, opacity: 0.5 }}>
                  <span>cert pending</span>
                  <span>{card.certNumber?.slice(0, 8) || 'authenticating'}</span>
                </div>
              </div>
            </div>

            {/* Card front — Pokemon image */}
            <div
              className="absolute inset-0 rounded-[14px] overflow-hidden"
              style={{
                backfaceVisibility: 'hidden',
                background: '#0a0a0a',
                border: `2px solid ${meta.accent}`,
                boxShadow: isGemMint
                  ? `0 0 40px ${meta.accent}, 0 0 96px ${meta.accentBright}77, inset 0 0 32px rgba(0,0,0,0.5)`
                  : `0 0 36px ${meta.accent}99, inset 0 0 24px rgba(0,0,0,0.45)`,
              }}
            >
              {card.imageUrl ? (
                <img
                  src={card.imageUrl}
                  alt={card.cardName || 'Card'}
                  className="w-full h-full object-cover"
                  draggable={false}
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center bg-[#1a1a1a]">
                  <span className="font-display italic text-lg text-[var(--text-muted)]">
                    {card.cardName || '???'}
                  </span>
                </div>
              )}

              {/* Shutter flash — mid-spin */}
              {act === 'spin' && (
                <div
                  className="reveal-shutter absolute inset-0 pointer-events-none"
                />
              )}

              {/* Laser scan line (during stamp act) */}
              {act === 'stamp' && (
                <div className="reveal-laser absolute left-0 right-0 h-[220%] top-[-80%] pointer-events-none" />
              )}

              {/* Grade stamp — materializes into the top-left */}
              <AnimatePresence>
                {showStamp && (
                  <motion.div
                    className="absolute top-3 left-3 flex items-center gap-2 px-2.5 py-1.5 rounded-sm reveal-stamp-ink"
                    style={{
                      background: 'rgba(10,10,10,0.92)',
                      border: `1.5px solid ${meta.accent}`,
                      boxShadow: `0 0 16px ${meta.accent}55`,
                    }}
                    initial={{ opacity: 0, scale: 1.4 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ duration: 0.45, ease: [0.2, 0.8, 0.3, 1] }}
                  >
                    <span
                      className="font-mono font-bold text-[9px] leading-none tracking-[0.22em]"
                      style={{ color: meta.accent }}
                    >
                      {card.grader || 'CERT'}
                    </span>
                    <span
                      className="font-display font-bold leading-none"
                      style={{
                        fontFamily: 'var(--font-display)',
                        fontSize: '22px',
                        color: meta.accentBright,
                      }}
                    >
                      {card.grade || '—'}
                    </span>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Vertical certNumber strip — right edge */}
              {showStamp && card.certNumber && (
                <motion.div
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 0.6, x: 0 }}
                  transition={{ duration: 0.5, delay: 0.15 }}
                  className="absolute right-1 top-1/2 -translate-y-1/2 font-mono text-[8px] tracking-[0.3em]"
                  style={{
                    color: meta.accent,
                    writingMode: 'vertical-rl',
                    textOrientation: 'mixed',
                  }}
                >
                  CERT · {card.certNumber.slice(0, 12)}
                </motion.div>
              )}
            </div>
          </motion.div>

          {/* Act 5 — gem-mint display typography (only for gem mint) */}
          <AnimatePresence>
            {isGemMint && showAscension && (
              <motion.div
                className="absolute left-1/2 -translate-x-1/2 pointer-events-none whitespace-nowrap"
                style={{ top: -120 }}
                initial={{ opacity: 0, scale: 0.8, y: 40 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                transition={{ duration: 0.6, ease: [0.2, 0.8, 0.3, 1] }}
              >
                <div className="flex items-center gap-3 justify-center">
                  <span
                    className="font-display font-bold reveal-chromatic"
                    style={{
                      fontFamily: 'var(--font-display)',
                      fontSize: '14px',
                      letterSpacing: '0.4em',
                      color: meta.accent,
                      fontVariationSettings: "'opsz' 9",
                    }}
                  >
                    {meta.crown}
                  </span>
                  <span
                    className="font-display font-bold italic reveal-chromatic"
                    style={{
                      fontFamily: 'var(--font-display)',
                      fontSize: '64px',
                      lineHeight: 0.85,
                      letterSpacing: '-0.02em',
                      color: meta.accentBright,
                      fontVariationSettings: "'opsz' 144",
                    }}
                  >
                    Gem Mint
                  </span>
                  <span
                    className="font-display font-bold reveal-chromatic"
                    style={{
                      fontFamily: 'var(--font-display)',
                      fontSize: '14px',
                      letterSpacing: '0.4em',
                      color: meta.accent,
                    }}
                  >
                    {meta.crown}
                  </span>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Tier badge for non-gem-mint pulls */}
          <AnimatePresence>
            {!isGemMint && showAscension && (
              <motion.div
                className="absolute left-1/2 -translate-x-1/2 pointer-events-none whitespace-nowrap"
                style={{ top: -64 }}
                initial={{ opacity: 0, y: 20, scale: 0.9 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ duration: 0.4 }}
              >
                <div className="flex items-center gap-2.5">
                  <span
                    className="font-mono text-[10px] tracking-[0.4em]"
                    style={{ color: meta.accent, opacity: 0.7 }}
                  >
                    {meta.crown}
                  </span>
                  <span
                    className="font-display italic font-bold"
                    style={{
                      fontFamily: 'var(--font-display)',
                      fontSize: '28px',
                      letterSpacing: '0.06em',
                      color: meta.accentBright,
                      textShadow: `0 0 24px ${meta.accent}`,
                    }}
                  >
                    {meta.label}
                  </span>
                  <span
                    className="font-mono text-[10px] tracking-[0.4em]"
                    style={{ color: meta.accent, opacity: 0.7 }}
                  >
                    {meta.crown}
                  </span>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Details — card name, set, CTA */}
          <AnimatePresence>
            {showDetails && (
              <motion.div
                className="absolute left-1/2 -translate-x-1/2 flex flex-col items-center gap-3 text-center"
                style={{ top: 'calc(100% + 20px)', width: 380 }}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.1 }}
              >
                <div className="flex items-center gap-2 font-mono text-[9px] tracking-[0.3em]" style={{ color: meta.accent, opacity: 0.55 }}>
                  <span>─</span>
                  <span>GRADED SLAB</span>
                  <span>─</span>
                </div>
                <h2
                  className="font-display italic font-bold px-6"
                  style={{
                    fontFamily: 'var(--font-display)',
                    fontSize: '26px',
                    letterSpacing: '-0.015em',
                    lineHeight: 1.1,
                    color: '#f5ecd2',
                  }}
                >
                  {card.cardName || 'Unnamed Slab'}
                </h2>
                <p
                  className="font-display italic text-sm"
                  style={{
                    fontFamily: 'var(--font-display)',
                    color: 'rgba(232,223,198,0.6)',
                  }}
                >
                  {card.setName || 'Unknown Set'}
                  {card.grader && card.grade ? ` · ${card.grader} ${card.grade}` : ''}
                </p>
                <div
                  className="mt-1 px-3 py-1 font-mono text-[9px] tracking-[0.3em] uppercase rounded"
                  style={{
                    border: `1px solid ${meta.accent}77`,
                    color: meta.accent,
                  }}
                >
                  Tap anywhere to dismiss
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Bottom-corner auction-catalog meta */}
      <div className="absolute bottom-5 left-5 flex flex-col gap-0.5 font-mono text-[9px] tracking-widest pointer-events-none" style={{ color: meta.accent, opacity: 0.45 }}>
        <span>LOT · {card.id.slice(0, 8).toUpperCase()}</span>
        <span>REF · {tier.toUpperCase()}</span>
      </div>
      <div className="absolute bottom-5 right-5 flex flex-col items-end gap-0.5 font-mono text-[9px] tracking-widest pointer-events-none" style={{ color: meta.accent, opacity: 0.45 }}>
        <span>BINDR · FUN</span>
        <span>MMXXVI</span>
      </div>
    </div>
  );
}
