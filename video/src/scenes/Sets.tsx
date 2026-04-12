import React from 'react';
import { AbsoluteFill, Img, useCurrentFrame, interpolate, useVideoConfig } from 'remotion';
import { SETS } from '../data';

const LIME = '#B1D235';

export const SetsScene: React.FC = () => {
  const frame = useCurrentFrame();

  const labelOpacity = interpolate(frame, [0, 15], [0, 1], { extrapolateRight: 'clamp' });

  return (
    <AbsoluteFill style={{ background: '#000', padding: 60 }}>
      <div style={{
        position: 'absolute',
        top: '30%', left: '50%', transform: 'translate(-50%, -50%)',
        width: 1000, height: 600,
        background: `radial-gradient(ellipse, ${LIME}14 0%, transparent 60%)`,
        filter: 'blur(80px)',
      }} />

      <p style={{
        fontFamily: 'ui-monospace, monospace',
        fontSize: 14,
        letterSpacing: '0.2em',
        color: LIME,
        opacity: labelOpacity,
        marginBottom: 8,
      }}>
        STEP 03 · SET DEX
      </p>
      <h2 style={{
        fontSize: 56,
        fontWeight: 900,
        color: '#fff',
        letterSpacing: '-0.03em',
        margin: 0,
        marginBottom: 32,
        opacity: labelOpacity,
      }}>
        Track every set you own.
      </h2>

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(4, 1fr)',
        gap: 20,
      }}>
        {SETS.map((set, i) => {
          const delay = 20 + i * 5;
          const opacity = interpolate(frame, [delay, delay + 15], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
          const y = interpolate(frame, [delay, delay + 20], [30, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
          const pct = Math.round((set.owned / set.total) * 100);
          const barStart = delay + 20;
          const barProgress = interpolate(frame, [barStart, barStart + 30], [0, pct], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

          return (
            <div
              key={set.name}
              style={{
                padding: 20,
                borderRadius: 14,
                background: 'rgba(255,255,255,0.03)',
                border: '1px solid rgba(255,255,255,0.08)',
                opacity,
                transform: `translateY(${y}px)`,
              }}
            >
              <div style={{
                height: 56,
                marginBottom: 12,
                display: 'flex',
                alignItems: 'center',
              }}>
                <Img
                  src={set.logoUrl}
                  style={{
                    maxHeight: 56,
                    maxWidth: '100%',
                    objectFit: 'contain',
                    filter: 'drop-shadow(0 4px 12px rgba(255,255,255,0.15))',
                  }}
                />
              </div>
              <div style={{ fontSize: 15, fontWeight: 800, color: '#fff', marginBottom: 2 }}>
                {set.name}
              </div>
              <div style={{ fontSize: 11, fontFamily: 'ui-monospace, monospace', color: 'rgba(255,255,255,0.4)', marginBottom: 12 }}>
                {set.year}
              </div>

              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)', marginBottom: 6 }}>
                {set.owned} / {set.total}
              </div>
              <div style={{
                width: '100%',
                height: 6,
                borderRadius: 3,
                background: 'rgba(255,255,255,0.08)',
                overflow: 'hidden',
              }}>
                <div style={{
                  width: `${barProgress}%`,
                  height: '100%',
                  background: LIME,
                  borderRadius: 3,
                }} />
              </div>
              <div style={{
                fontFamily: 'ui-monospace, monospace',
                fontSize: 10,
                color: LIME,
                marginTop: 4,
                letterSpacing: '0.1em',
              }}>
                {Math.round(barProgress)}%
              </div>
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};
