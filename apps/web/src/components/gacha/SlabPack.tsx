'use client';

import React from 'react';

type PackState = 'idle' | 'burning' | 'verifying' | 'opening';
export type PackTier = '25' | '100';

interface SlabPackProps {
  state: PackState;
  tier?: PackTier;
  /** optional serial for the pack badge — e.g. "0042" */
  serial?: string;
}

/* ──────────────────────────────────────────────────────────────────────
   SlabPack — realistic foil pouch (crimped top seal, pillow bulge, mylar
   wrinkles) in the Courtyard.io collectible pack language, branded with
   $SLAB's red/cream/black pokeball DNA.

   PRO    ($25)  — crimson foil, cream chevron rays, slab pokeball center
   MASTER ($100) — gold foil, black radial sunburst, gold-variant pokeball
   ────────────────────────────────────────────────────────────────────── */

/* Shared pouch outline: zigzag crimped top, bulging sides, rounded bottom.
   The zigzag at the top is what reads as "foil pack" at a glance. */
const POUCH_PATH = `
  M 20 38
  L 20 24
  L 30 6 L 42 24 L 54 6 L 66 24 L 78 6 L 90 24 L 102 6 L 114 24
  L 126 6 L 138 24 L 150 6 L 162 24 L 174 6 L 186 24 L 198 6
  L 210 24 L 222 6 L 234 24 L 246 6 L 258 24 L 270 6 L 282 24
  L 294 6 L 300 24
  Q 322 224 300 416
  Q 300 432 280 432
  L 40 432
  Q 20 432 20 416
  Q -2 224 20 24
  Z
`;

/* ─── $25 PRO ─────────────────────────────────────────────────────────── */

const ProPack = ({ serial = '0042' }: { serial?: string }) => (
  <svg viewBox="0 0 320 440" width="100%" height="100%" preserveAspectRatio="xMidYMid meet" xmlns="http://www.w3.org/2000/svg" style={{ display: 'block', overflow: 'visible' }}>
    <defs>
      {/* body gradient */}
      <linearGradient id="std-body" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#5a0c10" />
        <stop offset="15%" stopColor="#8a1520" />
        <stop offset="42%" stopColor="#d93c36" />
        <stop offset="70%" stopColor="#a01a22" />
        <stop offset="100%" stopColor="#3a070a" />
      </linearGradient>
      {/* crimp seal (darker, metallic) */}
      <linearGradient id="std-crimp" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#3a0508" />
        <stop offset="40%" stopColor="#6a0e14" />
        <stop offset="100%" stopColor="#2a0408" />
      </linearGradient>
      {/* pillow-bulge shading — radial center-bright → edge-dark */}
      <radialGradient id="std-bulge" cx="50%" cy="50%" r="60%">
        <stop offset="0%" stopColor="#ffffff" stopOpacity="0.14" />
        <stop offset="55%" stopColor="#ffffff" stopOpacity="0" />
        <stop offset="100%" stopColor="#000000" stopOpacity="0.5" />
      </radialGradient>
      {/* large diagonal specular band */}
      <linearGradient id="std-spec" x1="0" y1="0" x2="1" y2="1.2">
        <stop offset="0%" stopColor="#ffffff" stopOpacity="0" />
        <stop offset="38%" stopColor="#ffffff" stopOpacity="0" />
        <stop offset="47%" stopColor="#ffd5b0" stopOpacity="0.35" />
        <stop offset="52%" stopColor="#ffffff" stopOpacity="0.5" />
        <stop offset="58%" stopColor="#ffd5b0" stopOpacity="0.3" />
        <stop offset="68%" stopColor="#ffffff" stopOpacity="0" />
      </linearGradient>
      {/* chevron rays (cream) */}
      <linearGradient id="std-ray" x1="0" y1="1" x2="0" y2="0">
        <stop offset="0%" stopColor="#f5ecd2" stopOpacity="0.85" />
        <stop offset="100%" stopColor="#f5ecd2" stopOpacity="0.12" />
      </linearGradient>
      {/* foil texture noise */}
      <filter id="std-grain" x="0" y="0" width="100%" height="100%">
        <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" stitchTiles="stitch" />
        <feColorMatrix values="0 0 0 0 0.10  0 0 0 0 0.02  0 0 0 0 0.02  0 0 0 0 0.22" />
        <feComposite operator="in" in2="SourceGraphic" />
      </filter>
      <clipPath id="std-pouch"><path d={POUCH_PATH} /></clipPath>
      <clipPath id="std-body-clip">
        {/* body only — below the crimp line at y=24 */}
        <path d="M 20 24 L 300 24 Q 322 224 300 416 Q 300 432 280 432 L 40 432 Q 20 432 20 416 Q -2 224 20 24 Z" />
      </clipPath>
    </defs>

    {/* CRIMP SEAL — zigzag top band */}
    <g clipPath="url(#std-pouch)">
      <rect x="0" y="0" width="320" height="30" fill="url(#std-crimp)" />
      {/* horizontal hash marks showing heat-seal ridges */}
      {Array.from({ length: 4 }).map((_, i) => (
        <line key={`hash-${i}`} x1="24" y1={10 + i * 4} x2="296" y2={10 + i * 4} stroke="#000" strokeOpacity={0.5 - i * 0.1} strokeWidth="0.8" />
      ))}
      {/* shine on crimp */}
      <rect x="24" y="8" width="272" height="1" fill="#ffffff" opacity="0.35" />
    </g>

    {/* MAIN BODY — everything below y=24 */}
    <g clipPath="url(#std-body-clip)">
      <rect width="320" height="440" fill="url(#std-body)" />

      {/* chevron rays radiating up from bottom-center */}
      <g opacity="0.7">
        <polygon points="160,220 118,440 202,440" fill="url(#std-ray)" />
        <polygon points="160,220 70,440 134,440" fill="url(#std-ray)" opacity="0.75" />
        <polygon points="160,220 186,440 250,440" fill="url(#std-ray)" opacity="0.75" />
        <polygon points="160,220 18,440 58,440" fill="url(#std-ray)" opacity="0.45" />
        <polygon points="160,220 262,440 302,440" fill="url(#std-ray)" opacity="0.45" />
      </g>

      {/* pillow-bulge shading */}
      <rect width="320" height="440" fill="url(#std-bulge)" />

      {/* foil texture */}
      <rect width="320" height="440" filter="url(#std-grain)" opacity="0.6" />

      {/* FOIL WRINKLES — scattered bright thin lines (mylar creases) */}
      <g opacity="0.7">
        <path d="M 30 70 Q 90 76 150 58" fill="none" stroke="#ffcba0" strokeWidth="1" strokeOpacity="0.55" />
        <path d="M 210 110 Q 260 130 300 116" fill="none" stroke="#ffcba0" strokeWidth="1" strokeOpacity="0.45" />
        <path d="M 40 340 Q 100 360 140 348" fill="none" stroke="#ffcba0" strokeWidth="0.8" strokeOpacity="0.35" />
        <path d="M 180 380 Q 240 390 290 370" fill="none" stroke="#ffcba0" strokeWidth="0.8" strokeOpacity="0.4" />
        <path d="M 48 220 Q 60 260 44 300" fill="none" stroke="#ffffff" strokeWidth="0.7" strokeOpacity="0.3" />
        <path d="M 276 160 Q 290 200 278 240" fill="none" stroke="#000000" strokeWidth="0.8" strokeOpacity="0.35" />
      </g>

      {/* large diagonal spec band (main foil gloss) */}
      <rect width="320" height="440" fill="url(#std-spec)" />

      {/* vertical edge highlight + shadow */}
      <rect x="22" y="28" width="4" height="400" fill="#ffffff" opacity="0.22" />
      <rect x="296" y="28" width="3" height="400" fill="#000000" opacity="0.45" />

      {/* bottom darken */}
      <rect x="0" y="360" width="320" height="80" fill="url(#std-bulge)" opacity="0.3" />
    </g>

    {/* Slab.fun pill */}
    <g transform="translate(28 48)">
      <rect width="112" height="32" rx="16" fill="#0a0a0a" />
      <rect width="112" height="32" rx="16" fill="none" stroke="#f5ecd2" strokeOpacity="0.15" />
      <g transform="translate(18 16)">
        <circle r="10" fill="#f5ecd2" />
        <circle r="9" fill="#d93c36" />
        <path d="M -9 0 A 9 9 0 0 0 9 0 Z" fill="#f5ecd2" />
        <rect x="-9" y="-1.2" width="18" height="2.4" fill="#0a0a0a" />
        <circle r="3.5" fill="#0a0a0a" />
        <circle r="1.8" fill="#f5ecd2" />
      </g>
      <text x="36" y="21" fontFamily="ui-sans-serif, system-ui" fontSize="15" fontWeight="800" fill="#f5ecd2">
        Slab<tspan fill="#d93c36">.fun</tspan>
      </text>
    </g>

    {/* central pokeball */}
    <g transform="translate(160 230)">
      <ellipse cx="3" cy="6" rx="106" ry="104" fill="#000" opacity="0.4" />
      <circle r="104" fill="#0a0a0a" />
      <circle r="96" fill="#d93c36" />
      <path d="M -96 0 A 96 96 0 0 0 96 0 Z" fill="#f5ecd2" />
      <rect x="-96" y="-7" width="192" height="14" fill="#0a0a0a" />
      <circle r="30" fill="#0a0a0a" />
      <circle r="22" fill="#f5ecd2" />
      <circle r="14" fill="#0a0a0a" />
      <circle r="7" fill="#f5ecd2" />
      <ellipse cx="-34" cy="-54" rx="28" ry="12" fill="#ffffff" opacity="0.4" />
      <ellipse cx="-54" cy="-70" rx="11" ry="5" fill="#ffffff" opacity="0.75" />
      <ellipse cx="34" cy="54" rx="22" ry="8" fill="#ffffff" opacity="0.6" />
    </g>

    {/* REVEAL YOUR CARD tag */}
    <g transform="translate(206 304)">
      <g transform="translate(10 -6)">
        <circle r="8" fill="#f5ecd2" opacity="0.95" />
        <circle r="3" fill="#d93c36" />
      </g>
      <g transform="rotate(6)">
        <rect width="78" height="58" rx="6" fill="#0a0a0a" />
        <text x="8" y="17" fontFamily="ui-sans-serif, system-ui" fontSize="12" fontWeight="900" fill="#f5ecd2" letterSpacing="1">REVEAL</text>
        <text x="8" y="32" fontFamily="ui-sans-serif, system-ui" fontSize="12" fontWeight="900" fill="#f5ecd2" letterSpacing="1">YOUR</text>
        <text x="8" y="47" fontFamily="ui-sans-serif, system-ui" fontSize="12" fontWeight="900" fill="#f5ecd2" fillOpacity="0.5" letterSpacing="1">CARD</text>
      </g>
    </g>

    {/* CE mark */}
    <g transform="translate(28 408)">
      <text fontFamily="ui-serif, Georgia, serif" fontSize="10" fontWeight="700" fill="#f5ecd2" fillOpacity="0.75">CE</text>
      <path d="M 20 -8 L 26 2 L 14 2 Z" fill="none" stroke="#f5ecd2" strokeOpacity="0.7" strokeWidth="1.1" />
      <text x="19.5" y="0" fontFamily="ui-sans-serif, system-ui" fontSize="7" fontWeight="900" fill="#f5ecd2" fillOpacity="0.75" textAnchor="middle">!</text>
    </g>

    {/* $25 + serial */}
    <g transform="translate(260 408)">
      <text x="40" y="-5" fontFamily="ui-sans-serif, system-ui" fontSize="18" fontWeight="900" fill="#f5ecd2" textAnchor="end">$25</text>
      <text x="40" y="8" fontFamily="ui-monospace, monospace" fontSize="7" fontWeight="700" fill="#f5ecd2" fillOpacity="0.55" textAnchor="end">NO · {serial}</text>
    </g>
  </svg>
);

/* ─── $100 MASTER ─────────────────────────────────────────────────────── */

const MasterPack = ({ serial = '0007' }: { serial?: string }) => (
  <svg viewBox="0 0 320 440" width="100%" height="100%" preserveAspectRatio="xMidYMid meet" xmlns="http://www.w3.org/2000/svg" style={{ display: 'block', overflow: 'visible' }}>
    <defs>
      <linearGradient id="prm-body" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#6b5012" />
        <stop offset="18%" stopColor="#b58a20" />
        <stop offset="42%" stopColor="#f0cb50" />
        <stop offset="65%" stopColor="#c89a28" />
        <stop offset="100%" stopColor="#2a1e08" />
      </linearGradient>
      <linearGradient id="prm-crimp" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#2a1e08" />
        <stop offset="40%" stopColor="#5a4010" />
        <stop offset="100%" stopColor="#1a1204" />
      </linearGradient>
      <radialGradient id="prm-bulge" cx="50%" cy="50%" r="62%">
        <stop offset="0%" stopColor="#fff6c8" stopOpacity="0.25" />
        <stop offset="55%" stopColor="#ffffff" stopOpacity="0" />
        <stop offset="100%" stopColor="#1a1204" stopOpacity="0.55" />
      </radialGradient>
      <linearGradient id="prm-spec" x1="0" y1="0" x2="1" y2="1.2">
        <stop offset="0%" stopColor="#ffffff" stopOpacity="0" />
        <stop offset="42%" stopColor="#ffffff" stopOpacity="0" />
        <stop offset="50%" stopColor="#fff6c8" stopOpacity="0.55" />
        <stop offset="58%" stopColor="#ffffff" stopOpacity="0" />
      </linearGradient>
      <radialGradient id="prm-holo" cx="50%" cy="50%" r="50%">
        <stop offset="0%" stopColor="#ff6b9f" />
        <stop offset="33%" stopColor="#ffd24a" />
        <stop offset="66%" stopColor="#7ac8ff" />
        <stop offset="100%" stopColor="#c06bff" />
      </radialGradient>
      <filter id="prm-grain" x="0" y="0" width="100%" height="100%">
        <feTurbulence type="fractalNoise" baseFrequency="0.75" numOctaves="2" stitchTiles="stitch" />
        <feColorMatrix values="0 0 0 0 0.92  0 0 0 0 0.78  0 0 0 0 0.35  0 0 0 0 0.14" />
        <feComposite operator="in" in2="SourceGraphic" />
      </filter>
      <clipPath id="prm-pouch"><path d={POUCH_PATH} /></clipPath>
      <clipPath id="prm-body-clip">
        <path d="M 20 24 L 300 24 Q 322 224 300 416 Q 300 432 280 432 L 40 432 Q 20 432 20 416 Q -2 224 20 24 Z" />
      </clipPath>
    </defs>

    {/* crimped top seal */}
    <g clipPath="url(#prm-pouch)">
      <rect x="0" y="0" width="320" height="30" fill="url(#prm-crimp)" />
      {Array.from({ length: 4 }).map((_, i) => (
        <line key={i} x1="24" y1={10 + i * 4} x2="296" y2={10 + i * 4} stroke="#000" strokeOpacity={0.5 - i * 0.1} strokeWidth="0.8" />
      ))}
      <rect x="24" y="8" width="272" height="1" fill="#fff8d8" opacity="0.45" />
    </g>

    {/* main body */}
    <g clipPath="url(#prm-body-clip)">
      <rect width="320" height="440" fill="url(#prm-body)" />

      {/* sunburst — 24 black beams */}
      <g transform="translate(160 230)" opacity="0.75">
        {Array.from({ length: 24 }).map((_, i) => (
          <polygon key={i} points="0,0 -8,-300 8,-300" fill="#0a0a0a" opacity={i % 2 === 0 ? 0.9 : 0.55} transform={`rotate(${(i / 24) * 360})`} />
        ))}
      </g>

      {/* pillow bulge */}
      <rect width="320" height="440" fill="url(#prm-bulge)" />

      {/* noise */}
      <rect width="320" height="440" filter="url(#prm-grain)" opacity="0.55" />

      {/* gold foil wrinkles */}
      <g opacity="0.75">
        <path d="M 30 70 Q 90 78 150 58" fill="none" stroke="#fff6c8" strokeWidth="1" strokeOpacity="0.6" />
        <path d="M 210 106 Q 260 124 300 114" fill="none" stroke="#fff6c8" strokeWidth="1" strokeOpacity="0.5" />
        <path d="M 40 342 Q 100 358 140 348" fill="none" stroke="#fff6c8" strokeWidth="0.8" strokeOpacity="0.4" />
        <path d="M 180 380 Q 240 388 290 370" fill="none" stroke="#fff6c8" strokeWidth="0.8" strokeOpacity="0.45" />
        <path d="M 50 210 Q 60 252 46 292" fill="none" stroke="#ffffff" strokeWidth="0.7" strokeOpacity="0.35" />
        <path d="M 274 158 Q 290 198 276 240" fill="none" stroke="#2a1e08" strokeWidth="0.9" strokeOpacity="0.45" />
      </g>

      {/* diagonal specular band */}
      <rect width="320" height="440" fill="url(#prm-spec)" />

      {/* corner hairlines */}
      <g stroke="#0a0a0a" strokeOpacity="0.5" strokeWidth="0.8" fill="none">
        <path d="M 26 54 L 58 54 M 26 54 L 26 86" />
        <path d="M 294 54 L 262 54 M 294 54 L 294 86" />
        <path d="M 26 396 L 58 396 M 26 396 L 26 364" />
        <path d="M 294 396 L 262 396 M 294 396 L 294 364" />
      </g>

      {/* edge highlights */}
      <rect x="22" y="28" width="4" height="400" fill="#fff8d8" opacity="0.4" />
      <rect x="296" y="28" width="3" height="400" fill="#000000" opacity="0.5" />
    </g>

    {/* Slab.fun pill (gold bordered) */}
    <g transform="translate(28 48)">
      <rect width="112" height="32" rx="16" fill="#0a0a0a" />
      <rect width="112" height="32" rx="16" fill="none" stroke="#f0cb50" strokeWidth="1.2" />
      <g transform="translate(18 16)">
        <circle r="10" fill="#f5ecd2" />
        <circle r="9" fill="#d4af37" />
        <path d="M -9 0 A 9 9 0 0 0 9 0 Z" fill="#f5ecd2" />
        <rect x="-9" y="-1.2" width="18" height="2.4" fill="#0a0a0a" />
        <circle r="3.5" fill="#0a0a0a" />
        <circle r="1.8" fill="#f0cb50" />
      </g>
      <text x="36" y="21" fontFamily="ui-sans-serif, system-ui" fontSize="15" fontWeight="800" fill="#f5ecd2">
        Slab<tspan fill="#f0cb50">.fun</tspan>
      </text>
    </g>

    {/* gold pokeball */}
    <g transform="translate(160 230)">
      <ellipse cx="3" cy="6" rx="110" ry="108" fill="#000" opacity="0.5" />
      <circle r="108" fill="#0a0a0a" />
      <circle r="102" fill="none" stroke="#f0cb50" strokeWidth="2" />
      <circle r="96" fill="#d4af37" />
      <path d="M -96 0 A 96 96 0 0 0 96 0 Z" fill="#f5ecd2" />
      <rect x="-96" y="-7" width="192" height="14" fill="#0a0a0a" />
      <circle r="30" fill="#0a0a0a" />
      <circle r="22" fill="#f0cb50" />
      <circle r="14" fill="#0a0a0a" />
      <circle r="7" fill="#f5ecd2" />
      <ellipse cx="-34" cy="-54" rx="28" ry="12" fill="#fff8d8" opacity="0.55" />
      <ellipse cx="-54" cy="-70" rx="11" ry="5" fill="#ffffff" opacity="0.85" />
      <ellipse cx="34" cy="54" rx="22" ry="8" fill="#ffffff" opacity="0.65" />
      {Array.from({ length: 12 }).map((_, i) => {
        const a = (i / 12) * 2 * Math.PI;
        const x1 = Math.cos(a) * 104;
        const y1 = Math.sin(a) * 104;
        const x2 = Math.cos(a) * 108;
        const y2 = Math.sin(a) * 108;
        return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke="#f0cb50" strokeOpacity="0.8" strokeWidth="1" />;
      })}
    </g>

    {/* REVEAL YOUR CARD tag */}
    <g transform="translate(206 304)">
      <g transform="translate(10 -6)">
        <circle r="8" fill="url(#prm-holo)" opacity="0.9" />
        <circle r="3" fill="#f5ecd2" />
      </g>
      <g transform="rotate(6)">
        <rect width="78" height="58" rx="6" fill="#0a0a0a" />
        <rect width="78" height="58" rx="6" fill="none" stroke="#f0cb50" strokeWidth="0.8" strokeOpacity="0.6" />
        <text x="8" y="17" fontFamily="ui-sans-serif, system-ui" fontSize="12" fontWeight="900" fill="#f5ecd2" letterSpacing="1">REVEAL</text>
        <text x="8" y="32" fontFamily="ui-sans-serif, system-ui" fontSize="12" fontWeight="900" fill="#f5ecd2" letterSpacing="1">YOUR</text>
        <text x="8" y="47" fontFamily="ui-sans-serif, system-ui" fontSize="12" fontWeight="900" fill="#f0cb50" letterSpacing="1">CARD</text>
      </g>
    </g>

    {/* PREMIER stamp */}
    <g transform="translate(236 90) rotate(10)">
      <rect width="62" height="22" fill="#0a0a0a" stroke="#f0cb50" strokeWidth="0.6" />
      <text x="31" y="9" fontFamily="ui-sans-serif, system-ui" fontSize="6" fontWeight="700" fill="#f0cb50" letterSpacing="2" textAnchor="middle">EDITION</text>
      <text x="31" y="18" fontFamily="ui-sans-serif, system-ui" fontSize="9" fontWeight="900" fill="#f5ecd2" letterSpacing="2.5" textAnchor="middle">PREMIER</text>
    </g>

    {/* CE mark */}
    <g transform="translate(28 408)">
      <text fontFamily="ui-serif, Georgia, serif" fontSize="10" fontWeight="700" fill="#0a0a0a" fillOpacity="0.75">CE</text>
      <path d="M 20 -8 L 26 2 L 14 2 Z" fill="none" stroke="#0a0a0a" strokeOpacity="0.7" strokeWidth="1.1" />
      <text x="19.5" y="0" fontFamily="ui-sans-serif, system-ui" fontSize="7" fontWeight="900" fill="#0a0a0a" fillOpacity="0.8" textAnchor="middle">!</text>
    </g>

    {/* $100 + serial */}
    <g transform="translate(260 408)">
      <text x="40" y="-5" fontFamily="ui-sans-serif, system-ui" fontSize="18" fontWeight="900" fill="#0a0a0a" textAnchor="end">$100</text>
      <text x="40" y="8" fontFamily="ui-monospace, monospace" fontSize="7" fontWeight="700" fill="#0a0a0a" fillOpacity="0.65" textAnchor="end">PREMIER · {serial}</text>
    </g>
  </svg>
);

export default function SlabPack({ state, tier = '25', serial }: SlabPackProps) {
  const isActive = state === 'burning' || state === 'verifying';
  const isOpening = state === 'opening';
  const isPremier = tier === '100';
  const defaultSerial = isPremier ? '0007' : '0042';
  const s = serial ?? defaultSerial;

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 16,
        position: 'relative',
      }}
    >
      <div
        key={`${tier}-${state}`}
        className={isActive ? 'slab-pack-active' : ''}
        style={{
          position: 'relative',
          width: 340,
          height: 480,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {/* ambient tier halo */}
        <div
          aria-hidden
          style={{
            position: 'absolute',
            inset: '-40px',
            background: isPremier
              ? 'radial-gradient(circle at 50% 50%, rgba(240,203,80,0.32) 0%, rgba(212,175,55,0.1) 35%, transparent 65%)'
              : 'radial-gradient(circle at 50% 50%, rgba(217,60,54,0.28) 0%, rgba(217,60,54,0.08) 35%, transparent 65%)',
            filter: 'blur(14px)',
            pointerEvents: 'none',
            zIndex: 0,
          }}
        />

        {/* the pack */}
        <div
          className={`${isOpening ? 'slab-pack-dissolve' : 'slab-pack-float'} ${
            isPremier ? 'premier-emboss-pulse' : ''
          }`}
          style={{
            position: 'relative',
            width: 320,
            height: 440,
            zIndex: 2,
            filter: isPremier
              ? 'drop-shadow(0 28px 54px rgba(90,70,14,0.55)) drop-shadow(0 0 34px rgba(240,203,80,0.35))'
              : 'drop-shadow(0 28px 54px rgba(0,0,0,0.85)) drop-shadow(0 0 30px rgba(217,60,54,0.3))',
          }}
        >
          {isPremier ? <MasterPack serial={s} /> : <ProPack serial={s} />}

          {/* iridescent sheen — Master only */}
          {isPremier && (
            <div
              aria-hidden
              className="premier-iridescent absolute inset-0"
              style={{ borderRadius: 20, pointerEvents: 'none' }}
            />
          )}
        </div>

        {/* opening effects */}
        {isOpening && (
          <>
            <div className="slab-burst-glow" />
            <div className="slab-ray-burst" />
            <div className="slab-shock-ring" />
            <div className="slab-shock-ring-2" />
            <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 6 }}>
              {Array.from({ length: 22 }).map((_, i) => {
                const angle = (i / 22) * 360;
                const dist = 280;
                const tx = Math.cos((angle * Math.PI) / 180) * dist;
                const ty = Math.sin((angle * Math.PI) / 180) * dist;
                return (
                  <span
                    key={i}
                    className="slab-sparkle-v2"
                    style={
                      {
                        position: 'absolute',
                        top: '50%',
                        left: '50%',
                        width: 9,
                        height: 9,
                        borderRadius: '50%',
                        background: '#ffffff',
                        boxShadow: isPremier
                          ? '0 0 18px #f0cb50, 0 0 36px #d4af37'
                          : '0 0 18px #f5ecd2, 0 0 32px #d93c36',
                        opacity: 0,
                        animationDelay: `${200 + i * 28}ms`,
                        ['--tx' as string]: `${tx}px`,
                        ['--ty' as string]: `${ty}px`,
                      } as React.CSSProperties
                    }
                  />
                );
              })}
            </div>
          </>
        )}
      </div>

      {/* status ribbon */}
      <div className="flex flex-col items-center gap-0.5">
        <span
          className="font-mono text-[10px] tracking-[0.4em] uppercase"
          style={{ color: isPremier ? '#f0cb50' : 'var(--text-secondary)' }}
        >
          {state === 'burning' && '◆  burning $slab  ◆'}
          {state === 'verifying' && '◆  authenticating  ◆'}
          {state === 'opening' && '◆  unsealing  ◆'}
          {state === 'idle' && (isPremier ? '★  premier edition  ★' : '◆  standard edition  ◆')}
        </span>
        <span
          className="text-sm font-bold"
          style={{
            fontFamily: 'var(--font-satoshi)',
            color: isPremier ? '#f5ecd2' : 'var(--text-primary)',
          }}
        >
          {isPremier ? '$100 SLAB Master Pack' : '$25 SLAB Pro Pack'}
        </span>
      </div>
    </div>
  );
}
