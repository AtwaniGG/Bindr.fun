import React from 'react';
import {
  AbsoluteFill,
  useCurrentFrame,
  useVideoConfig,
  interpolate,
  Easing,
} from 'remotion';

/* ──────────────────────────────────────────────────────────────────────
   SlabPack showcase video — cycles the $25 Pro pack and $100 Master pack
   through their full lifecycle (idle → burning → verifying → opening →
   empty) for a social-ready 12 s portrait-format promo.
   ────────────────────────────────────────────────────────────────────── */

type Tier = 'pro' | 'master';
type PackState = 'idle' | 'burning' | 'verifying' | 'opening' | 'empty';

/* ─── timeline ────────────────────────────────────────────────────────── */
interface Segment {
  tier: Tier;
  state: PackState;
  duration: number; // seconds
}

const TIMELINE: Segment[] = [
  { tier: 'pro', state: 'idle', duration: 1.2 },
  { tier: 'pro', state: 'burning', duration: 1.4 },
  { tier: 'pro', state: 'verifying', duration: 0.8 },
  { tier: 'pro', state: 'opening', duration: 1.6 },
  { tier: 'pro', state: 'empty', duration: 0.8 },
  { tier: 'master', state: 'idle', duration: 1.2 },
  { tier: 'master', state: 'burning', duration: 1.4 },
  { tier: 'master', state: 'verifying', duration: 0.8 },
  { tier: 'master', state: 'opening', duration: 1.6 },
  { tier: 'master', state: 'empty', duration: 1.2 },
];

function segmentAt(t: number): { tier: Tier; state: PackState; localT: number } {
  let acc = 0;
  for (const seg of TIMELINE) {
    if (t < acc + seg.duration) {
      return { tier: seg.tier, state: seg.state, localT: t - acc };
    }
    acc += seg.duration;
  }
  const last = TIMELINE[TIMELINE.length - 1];
  return { tier: last.tier, state: last.state, localT: last.duration };
}

/* ─── shared pouch outline (zigzag crimped top, bulging sides) ───────── */
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
const BODY_PATH = `M 20 24 L 300 24 Q 322 224 300 416 Q 300 432 280 432 L 40 432 Q 20 432 20 416 Q -2 224 20 24 Z`;

/* ─── $25 PRO SVG ─────────────────────────────────────────────────────── */

const ProPackDefs = () => (
  <defs>
    <linearGradient id="std-body" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stopColor="#5a0c10" />
      <stop offset="15%" stopColor="#8a1520" />
      <stop offset="42%" stopColor="#d93c36" />
      <stop offset="70%" stopColor="#a01a22" />
      <stop offset="100%" stopColor="#3a070a" />
    </linearGradient>
    <linearGradient id="std-crimp" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stopColor="#3a0508" />
      <stop offset="40%" stopColor="#6a0e14" />
      <stop offset="100%" stopColor="#2a0408" />
    </linearGradient>
    <radialGradient id="std-bulge" cx="50%" cy="50%" r="60%">
      <stop offset="0%" stopColor="#ffffff" stopOpacity="0.14" />
      <stop offset="55%" stopColor="#ffffff" stopOpacity="0" />
      <stop offset="100%" stopColor="#000000" stopOpacity="0.5" />
    </radialGradient>
    <linearGradient id="std-spec" x1="0" y1="0" x2="1" y2="1.2">
      <stop offset="0%" stopColor="#ffffff" stopOpacity="0" />
      <stop offset="38%" stopColor="#ffffff" stopOpacity="0" />
      <stop offset="47%" stopColor="#ffd5b0" stopOpacity="0.35" />
      <stop offset="52%" stopColor="#ffffff" stopOpacity="0.5" />
      <stop offset="58%" stopColor="#ffd5b0" stopOpacity="0.3" />
      <stop offset="68%" stopColor="#ffffff" stopOpacity="0" />
    </linearGradient>
    <linearGradient id="std-ray" x1="0" y1="1" x2="0" y2="0">
      <stop offset="0%" stopColor="#f5ecd2" stopOpacity="0.85" />
      <stop offset="100%" stopColor="#f5ecd2" stopOpacity="0.12" />
    </linearGradient>
    <filter id="std-grain" x="0" y="0" width="100%" height="100%">
      <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" stitchTiles="stitch" />
      <feColorMatrix values="0 0 0 0 0.10  0 0 0 0 0.02  0 0 0 0 0.02  0 0 0 0 0.22" />
      <feComposite operator="in" in2="SourceGraphic" />
    </filter>
    <clipPath id="std-pouch"><path d={POUCH_PATH} /></clipPath>
    <clipPath id="std-body-clip"><path d={BODY_PATH} /></clipPath>
  </defs>
);

const ProPack: React.FC<{ sheenX?: number }> = ({ sheenX = 0 }) => (
  <svg viewBox="0 0 320 440" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg" style={{ display: 'block', overflow: 'visible' }}>
    <ProPackDefs />

    {/* crimped top seal */}
    <g clipPath="url(#std-pouch)">
      <rect width="320" height="30" fill="url(#std-crimp)" />
      {Array.from({ length: 4 }).map((_, i) => (
        <line key={i} x1="24" y1={10 + i * 4} x2="296" y2={10 + i * 4} stroke="#000" strokeOpacity={0.5 - i * 0.1} strokeWidth="0.8" />
      ))}
      <rect x="24" y="8" width="272" height="1" fill="#ffffff" opacity="0.35" />
    </g>

    {/* main body */}
    <g clipPath="url(#std-body-clip)">
      <rect width="320" height="440" fill="url(#std-body)" />
      <g opacity="0.7">
        <polygon points="160,220 118,440 202,440" fill="url(#std-ray)" />
        <polygon points="160,220 70,440 134,440" fill="url(#std-ray)" opacity="0.75" />
        <polygon points="160,220 186,440 250,440" fill="url(#std-ray)" opacity="0.75" />
        <polygon points="160,220 18,440 58,440" fill="url(#std-ray)" opacity="0.45" />
        <polygon points="160,220 262,440 302,440" fill="url(#std-ray)" opacity="0.45" />
      </g>
      <rect width="320" height="440" fill="url(#std-bulge)" />
      <rect width="320" height="440" filter="url(#std-grain)" opacity="0.6" />
      {/* wrinkles */}
      <g opacity="0.7">
        <path d="M 30 70 Q 90 76 150 58" fill="none" stroke="#ffcba0" strokeWidth="1" strokeOpacity="0.55" />
        <path d="M 210 110 Q 260 130 300 116" fill="none" stroke="#ffcba0" strokeWidth="1" strokeOpacity="0.45" />
        <path d="M 40 340 Q 100 360 140 348" fill="none" stroke="#ffcba0" strokeWidth="0.8" strokeOpacity="0.35" />
        <path d="M 180 380 Q 240 390 290 370" fill="none" stroke="#ffcba0" strokeWidth="0.8" strokeOpacity="0.4" />
        <path d="M 48 220 Q 60 260 44 300" fill="none" stroke="#ffffff" strokeWidth="0.7" strokeOpacity="0.3" />
        <path d="M 276 160 Q 290 200 278 240" fill="none" stroke="#000" strokeWidth="0.8" strokeOpacity="0.35" />
      </g>
      <rect width="320" height="440" fill="url(#std-spec)" />
      {/* animated sheen */}
      <rect x={sheenX - 80} y="24" width="40" height="408" fill="#ffffff" opacity="0.25" transform="skewX(-18)" style={{ mixBlendMode: 'screen' } as React.CSSProperties} />
      <rect x="22" y="28" width="4" height="400" fill="#ffffff" opacity="0.22" />
      <rect x="296" y="28" width="3" height="400" fill="#000" opacity="0.45" />
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

    {/* pokeball */}
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

    {/* tag */}
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
      <text x="40" y="8" fontFamily="ui-monospace, monospace" fontSize="7" fontWeight="700" fill="#f5ecd2" fillOpacity="0.55" textAnchor="end">NO · 0042</text>
    </g>
  </svg>
);

/* ─── $100 MASTER SVG ─────────────────────────────────────────────────── */

const MasterPackDefs = () => (
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
      <feTurbulence type="fractalNoise" baseFrequency="0.72" numOctaves="2" stitchTiles="stitch" />
      <feColorMatrix values="0 0 0 0 0.92  0 0 0 0 0.78  0 0 0 0 0.35  0 0 0 0 0.14" />
      <feComposite operator="in" in2="SourceGraphic" />
    </filter>
    <clipPath id="prm-pouch"><path d={POUCH_PATH} /></clipPath>
    <clipPath id="prm-body-clip"><path d={BODY_PATH} /></clipPath>
  </defs>
);

const MasterPack: React.FC<{ sheenX?: number }> = ({ sheenX = 0 }) => (
  <svg viewBox="0 0 320 440" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg" style={{ display: 'block', overflow: 'visible' }}>
    <MasterPackDefs />

    {/* crimped top seal */}
    <g clipPath="url(#prm-pouch)">
      <rect width="320" height="30" fill="url(#prm-crimp)" />
      {Array.from({ length: 4 }).map((_, i) => (
        <line key={i} x1="24" y1={10 + i * 4} x2="296" y2={10 + i * 4} stroke="#000" strokeOpacity={0.5 - i * 0.1} strokeWidth="0.8" />
      ))}
      <rect x="24" y="8" width="272" height="1" fill="#fff8d8" opacity="0.45" />
    </g>

    {/* main body */}
    <g clipPath="url(#prm-body-clip)">
      <rect width="320" height="440" fill="url(#prm-body)" />
      {/* sunburst */}
      <g transform="translate(160 230)" opacity="0.75">
        {Array.from({ length: 24 }).map((_, i) => (
          <polygon key={i} points="0,0 -8,-300 8,-300" fill="#0a0a0a" opacity={i % 2 === 0 ? 0.9 : 0.55} transform={`rotate(${(i / 24) * 360})`} />
        ))}
      </g>
      <rect width="320" height="440" fill="url(#prm-bulge)" />
      <rect width="320" height="440" filter="url(#prm-grain)" opacity="0.55" />
      {/* gold wrinkles */}
      <g opacity="0.75">
        <path d="M 30 70 Q 90 78 150 58" fill="none" stroke="#fff6c8" strokeWidth="1" strokeOpacity="0.6" />
        <path d="M 210 106 Q 260 124 300 114" fill="none" stroke="#fff6c8" strokeWidth="1" strokeOpacity="0.5" />
        <path d="M 40 342 Q 100 358 140 348" fill="none" stroke="#fff6c8" strokeWidth="0.8" strokeOpacity="0.4" />
        <path d="M 180 380 Q 240 388 290 370" fill="none" stroke="#fff6c8" strokeWidth="0.8" strokeOpacity="0.45" />
        <path d="M 50 210 Q 60 252 46 292" fill="none" stroke="#ffffff" strokeWidth="0.7" strokeOpacity="0.35" />
        <path d="M 274 158 Q 290 198 276 240" fill="none" stroke="#2a1e08" strokeWidth="0.9" strokeOpacity="0.45" />
      </g>
      <rect width="320" height="440" fill="url(#prm-spec)" />
      {/* animated iridescent sheen */}
      <rect x={sheenX - 80} y="24" width="40" height="408" fill="#fff6c8" opacity="0.4" transform="skewX(-18)" style={{ mixBlendMode: 'screen' } as React.CSSProperties} />
      {/* corner hairlines */}
      <g stroke="#0a0a0a" strokeOpacity="0.5" strokeWidth="0.8" fill="none">
        <path d="M 26 54 L 58 54 M 26 54 L 26 86" />
        <path d="M 294 54 L 262 54 M 294 54 L 294 86" />
        <path d="M 26 396 L 58 396 M 26 396 L 26 364" />
        <path d="M 294 396 L 262 396 M 294 396 L 294 364" />
      </g>
      <rect x="22" y="28" width="4" height="400" fill="#fff8d8" opacity="0.4" />
      <rect x="296" y="28" width="3" height="400" fill="#000" opacity="0.5" />
    </g>

    {/* gold pill */}
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

    {/* tag */}
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
      <text x="40" y="8" fontFamily="ui-monospace, monospace" fontSize="7" fontWeight="700" fill="#0a0a0a" fillOpacity="0.65" textAnchor="end">PREMIER · 0007</text>
    </g>
  </svg>
);

/* ─── pack wrapper with state-driven transforms ───────────────────────── */
const PackBody: React.FC<{
  tier: Tier;
  sheenX: number;
  scale: number;
  opacity: number;
  shakeX: number;
  shakeY: number;
  rotate: number;
  brightness: number;
}> = ({ tier, sheenX, scale, opacity, shakeX, shakeY, rotate, brightness }) => (
  <div
    style={{
      width: 320,
      height: 440,
      transform: `translate(${shakeX}px, ${shakeY}px) scale(${scale}) rotate(${rotate}deg)`,
      opacity,
      filter: `brightness(${brightness})`,
      transformOrigin: 'center',
    }}
  >
    {tier === 'pro' ? <ProPack sheenX={sheenX} /> : <MasterPack sheenX={sheenX} />}
  </div>
);

/* ─── main scene ──────────────────────────────────────────────────────── */

export const SlabPackScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const globalT = frame / fps;
  const { tier, state, localT } = segmentAt(globalT);
  const isPremier = tier === 'master';
  const isActive = state === 'burning' || state === 'verifying';

  // idle float
  const floatY = state === 'idle' ? Math.sin(globalT * Math.PI * 0.9) * 10 : 0;
  const floatRot = state === 'idle' ? Math.sin(globalT * Math.PI * 0.9) * 1.6 : 0;

  // active shake
  const shakeX = isActive ? Math.sin(localT * 60) * 4 : 0;
  const shakeY = isActive ? Math.cos(localT * 55) * 3 : 0;
  const shakeRot = isActive ? Math.sin(localT * 62) * 2 : 0;

  // animated foil sheen sweep
  const sheenX = ((globalT * 220) % 460);

  // opening: scale pop + brightness spike + fade
  let packScale = 1;
  let packOpacity = 1;
  let packBrightness = 1;
  if (state === 'opening') {
    packScale = interpolate(localT, [0, 0.3, 0.55, 1.2, 1.6], [1, 1.1, 1.22, 0.6, 0.1], {
      extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.bezier(0.4, 0, 0.6, 1),
    });
    packOpacity = interpolate(localT, [0, 0.5, 1.2, 1.6], [1, 1, 0.3, 0], {
      extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
    });
    packBrightness = interpolate(localT, [0, 0.3, 0.8, 1.2], [1, 1.4, 2.6, 3.2], {
      extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
    });
  }
  if (state === 'empty') {
    packOpacity = 0;
  }

  // opening burst particles
  const burstScale = state === 'opening'
    ? interpolate(localT, [0.15, 0.5, 1.0, 1.6], [0, 2.2, 5.5, 8], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.out(Easing.cubic) })
    : 0;
  const burstOpacity = state === 'opening'
    ? interpolate(localT, [0.15, 0.35, 1.0, 1.6], [0, 1, 0.7, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })
    : 0;

  const rayRot = state === 'opening'
    ? interpolate(localT, [0.2, 1.6], [0, 220], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })
    : 0;
  const rayScale = state === 'opening'
    ? interpolate(localT, [0.2, 0.6, 1.6], [0.3, 1.2, 2.2], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })
    : 0;
  const rayOpacity = state === 'opening'
    ? interpolate(localT, [0.2, 0.4, 1.0, 1.6], [0, 1, 0.65, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })
    : 0;

  // shock rings
  const ringScale = (delay: number) =>
    state === 'opening'
      ? interpolate(localT, [delay, delay + 0.8], [0.3, 9], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })
      : 0;
  const ringOpacity = (delay: number) =>
    state === 'opening'
      ? interpolate(localT, [delay, delay + 0.15, delay + 0.8], [0, 1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })
      : 0;

  // active halo
  const activeGlowOpacity = isActive ? 0.7 + Math.sin(localT * 8) * 0.25 : 0;

  // sparkles
  const sparkles = state === 'opening'
    ? Array.from({ length: 28 }).map((_, i) => {
        const angle = (i / 28) * 360;
        const dist = 280 + (i % 3) * 30;
        const tx = Math.cos((angle * Math.PI) / 180) * dist;
        const ty = Math.sin((angle * Math.PI) / 180) * dist;
        const delay = 0.15 + (i % 4) * 0.04;
        const sparkleT = Math.max(0, localT - delay);
        const progress = Math.min(sparkleT / 1.1, 1);
        const x = tx * progress;
        const y = ty * progress;
        const opacity = progress === 0 ? 0 : progress < 0.2 ? progress * 5 : 1 - (progress - 0.2) / 0.8;
        const scale = progress < 0.3 ? progress * 6 : Math.max(0.3, 1 - (progress - 0.3) / 0.7);
        return { x, y, opacity: Math.max(0, opacity), scale };
      })
    : [];

  const accentColor = isPremier ? '#f0cb50' : '#d93c36';
  const accentBright = isPremier ? '#fff0b0' : '#ffd5b0';

  const statusText = {
    idle: isPremier ? 'PREMIER EDITION' : 'STANDARD EDITION',
    burning: 'BURNING $SLAB',
    verifying: 'AUTHENTICATING',
    opening: 'UNSEALING',
    empty: '',
  }[state];

  const tierLabel = isPremier ? '$100 · SLAB Master Pack' : '$25 · SLAB Pro Pack';

  return (
    <AbsoluteFill style={{ background: 'radial-gradient(ellipse at center, #1a0a0e 0%, #0a0506 65%, #000 100%)' }}>
      {/* ambient tier halo behind pack */}
      <div
        style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          width: 700,
          height: 700,
          transform: 'translate(-50%, -50%)',
          background: isPremier
            ? 'radial-gradient(circle, rgba(240,203,80,0.28) 0%, rgba(212,175,55,0.10) 30%, rgba(0,0,0,0) 65%)'
            : 'radial-gradient(circle, rgba(217,60,54,0.32) 0%, rgba(217,60,54,0.10) 30%, rgba(0,0,0,0) 65%)',
          opacity: state === 'empty' ? 0 : 1,
          filter: 'blur(18px)',
          pointerEvents: 'none',
          zIndex: 1,
        }}
      />

      {/* active-state pulsing glow */}
      {isActive && (
        <div
          style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            width: 560,
            height: 560,
            transform: 'translate(-50%, -50%)',
            background: `radial-gradient(circle, ${accentColor}66 0%, ${accentColor}22 30%, rgba(0,0,0,0) 60%)`,
            opacity: activeGlowOpacity,
            filter: 'blur(12px)',
            pointerEvents: 'none',
            zIndex: 1,
          }}
        />
      )}

      {/* ray burst during opening */}
      {state === 'opening' && (
        <div
          style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            width: 1400,
            height: 1400,
            transform: `translate(-50%, -50%) scale(${rayScale}) rotate(${rayRot}deg)`,
            background: isPremier
              ? `conic-gradient(from 0deg, rgba(240,203,80,0) 0deg, rgba(240,203,80,0.95) 6deg, rgba(240,203,80,0) 14deg, rgba(240,203,80,0) 50deg, rgba(255,246,200,0.95) 58deg, rgba(240,203,80,0) 66deg, rgba(240,203,80,0) 112deg, rgba(240,203,80,0.95) 120deg, rgba(240,203,80,0) 128deg, rgba(240,203,80,0) 172deg, rgba(255,246,200,0.95) 180deg, rgba(240,203,80,0) 188deg, rgba(240,203,80,0) 232deg, rgba(240,203,80,0.95) 240deg, rgba(240,203,80,0) 248deg, rgba(240,203,80,0) 292deg, rgba(255,246,200,0.95) 300deg, rgba(240,203,80,0) 308deg, rgba(240,203,80,0) 352deg, rgba(240,203,80,0.95) 360deg)`
              : `conic-gradient(from 0deg, rgba(217,60,54,0) 0deg, rgba(255,213,176,0.95) 6deg, rgba(217,60,54,0) 14deg, rgba(217,60,54,0) 50deg, rgba(245,236,210,0.95) 58deg, rgba(217,60,54,0) 66deg, rgba(217,60,54,0) 112deg, rgba(255,213,176,0.95) 120deg, rgba(217,60,54,0) 128deg, rgba(217,60,54,0) 172deg, rgba(245,236,210,0.95) 180deg, rgba(217,60,54,0) 188deg, rgba(217,60,54,0) 232deg, rgba(255,213,176,0.95) 240deg, rgba(217,60,54,0) 248deg, rgba(217,60,54,0) 292deg, rgba(245,236,210,0.95) 300deg, rgba(217,60,54,0) 308deg, rgba(217,60,54,0) 352deg, rgba(255,213,176,0.95) 360deg)`,
            borderRadius: '50%',
            mixBlendMode: 'screen',
            opacity: rayOpacity,
            pointerEvents: 'none',
            zIndex: 3,
          }}
        />
      )}

      {/* burst glow */}
      {state === 'opening' && (
        <div
          style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            width: 200,
            height: 200,
            transform: `translate(-50%, -50%) scale(${burstScale})`,
            background: isPremier
              ? 'radial-gradient(circle, rgba(255,255,255,1) 0%, rgba(255,246,200,0.95) 12%, rgba(240,203,80,0.9) 30%, rgba(212,175,55,0.4) 60%, rgba(212,175,55,0) 80%)'
              : 'radial-gradient(circle, rgba(255,255,255,1) 0%, rgba(255,230,200,0.95) 12%, rgba(255,150,90,0.9) 30%, rgba(217,60,54,0.45) 60%, rgba(217,60,54,0) 80%)',
            borderRadius: '50%',
            filter: 'blur(3px)',
            mixBlendMode: 'screen',
            opacity: burstOpacity,
            pointerEvents: 'none',
            zIndex: 4,
          }}
        />
      )}

      {/* shock rings */}
      {state === 'opening' && (
        <>
          <div
            style={{
              position: 'absolute',
              top: '50%',
              left: '50%',
              width: 80,
              height: 80,
              transform: `translate(-50%, -50%) scale(${ringScale(0.15)})`,
              borderRadius: '50%',
              border: `4px solid ${accentBright}ee`,
              boxShadow: `0 0 30px ${accentColor}`,
              opacity: ringOpacity(0.15),
              pointerEvents: 'none',
              zIndex: 5,
            }}
          />
          <div
            style={{
              position: 'absolute',
              top: '50%',
              left: '50%',
              width: 80,
              height: 80,
              transform: `translate(-50%, -50%) scale(${ringScale(0.45)})`,
              borderRadius: '50%',
              border: `3px solid rgba(255,255,255,0.85)`,
              boxShadow: `0 0 24px rgba(255,255,255,0.8)`,
              opacity: ringOpacity(0.45),
              pointerEvents: 'none',
              zIndex: 5,
            }}
          />
        </>
      )}

      {/* sparkles */}
      {state === 'opening' && (
        <div style={{ position: 'absolute', top: '50%', left: '50%', width: 0, height: 0, zIndex: 6 }}>
          {sparkles.map((sp, i) => (
            <span
              key={i}
              style={{
                position: 'absolute',
                left: sp.x,
                top: sp.y,
                width: 10,
                height: 10,
                marginLeft: -5,
                marginTop: -5,
                borderRadius: '50%',
                background: '#ffffff',
                boxShadow: `0 0 16px ${accentBright}, 0 0 32px ${accentColor}`,
                opacity: sp.opacity,
                transform: `scale(${sp.scale})`,
              }}
            />
          ))}
        </div>
      )}

      {/* pack */}
      {state !== 'empty' && (
        <div
          style={{
            position: 'absolute',
            top: '46%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            zIndex: 2,
            filter: isPremier
              ? `drop-shadow(0 26px 50px rgba(90,70,14,0.6)) drop-shadow(0 0 36px rgba(240,203,80,${isActive ? 0.7 : 0.35}))`
              : `drop-shadow(0 26px 50px rgba(0,0,0,0.85)) drop-shadow(0 0 30px rgba(217,60,54,${isActive ? 0.75 : 0.3}))`,
          }}
        >
          <PackBody
            tier={tier}
            sheenX={sheenX}
            scale={packScale}
            opacity={packOpacity}
            shakeX={shakeX}
            shakeY={shakeY + floatY}
            rotate={shakeRot + floatRot}
            brightness={packBrightness}
          />
        </div>
      )}

      {/* status ribbon + tier label */}
      {statusText && (
        <>
          <div
            style={{
              position: 'absolute',
              bottom: 140,
              left: 0,
              right: 0,
              textAlign: 'center',
              fontFamily: 'ui-monospace, SF Mono, monospace',
              fontSize: 13,
              color: isPremier ? '#f0cb50' : 'rgba(255,255,255,0.7)',
              textTransform: 'uppercase',
              letterSpacing: '0.4em',
              fontWeight: 700,
              zIndex: 7,
            }}
          >
            ◆  {statusText}  ◆
          </div>
          <div
            style={{
              position: 'absolute',
              bottom: 100,
              left: 0,
              right: 0,
              textAlign: 'center',
              fontFamily: 'ui-sans-serif, system-ui',
              fontSize: 22,
              color: isPremier ? '#f5ecd2' : '#f5f5f0',
              fontWeight: 800,
              letterSpacing: '-0.01em',
              zIndex: 7,
            }}
          >
            {tierLabel}
          </div>
        </>
      )}

      {/* bottom brand bar */}
      <div
        style={{
          position: 'absolute',
          bottom: 32,
          left: 0,
          right: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 14,
          fontFamily: 'ui-sans-serif, system-ui',
          fontSize: 18,
          fontWeight: 800,
          color: '#f5f5f0',
          letterSpacing: '-0.02em',
          zIndex: 7,
        }}
      >
        <svg width="28" height="28" viewBox="0 0 36 36">
          <rect x="2" y="2" width="9" height="9" rx="2" fill="#B1D235" />
          <rect x="13" y="2" width="9" height="9" rx="2" fill="#B1D235" />
          <rect x="24" y="2" width="9" height="9" rx="2" fill="none" stroke="#B1D235" strokeWidth="1.6" />
          <rect x="2" y="13" width="9" height="9" rx="2" fill="#B1D235" />
          <rect x="13" y="13" width="9" height="9" rx="2" fill="#B1D235" />
          <rect x="24" y="13" width="9" height="9" rx="2" fill="#B1D235" />
          <rect x="2" y="24" width="9" height="9" rx="2" fill="#B1D235" />
          <rect x="13" y="24" width="9" height="9" rx="2" fill="#B1D235" />
          <rect x="24" y="24" width="9" height="9" rx="2" fill="#B1D235" />
        </svg>
        Bindr<span style={{ color: '#B1D235' }}>.fun</span>
      </div>
    </AbsoluteFill>
  );
};
