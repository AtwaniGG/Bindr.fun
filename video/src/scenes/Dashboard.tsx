import React from 'react';
import { AbsoluteFill, Img, useCurrentFrame, interpolate, spring, useVideoConfig } from 'remotion';
import { SLABS } from '../data';

const LIME = '#B1D235';
const EMERALD = '#4ade80';

const graderColor = (g: string) => g === 'PSA' ? '#ef4444' : g === 'CGC' ? '#3b82f6' : '#B1D235';

export const DashboardScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const labelOpacity = interpolate(frame, [0, 15], [0, 1], { extrapolateRight: 'clamp' });
  const statSpring = spring({ frame: frame - 10, fps, config: { damping: 14, stiffness: 90 } });

  const slabCount = Math.floor(interpolate(frame, [15, 80], [0, 205], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }));
  const value = interpolate(frame, [15, 85], [0, 8484.87], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const setCount = Math.floor(interpolate(frame, [15, 80], [0, 105], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }));

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
        STEP 02 · DASHBOARD
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
        Your collection, valued live.
      </h2>

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(3, 1fr)',
        gap: 20,
        marginBottom: 40,
        transform: `scale(${statSpring})`,
        transformOrigin: 'top left',
      }}>
        <StatCard label="TOTAL SLABS" value={slabCount.toLocaleString()} color="#fff" />
        <StatCard label="EST. VALUE" value={`$${value.toLocaleString(undefined, { maximumFractionDigits: 0 })}`} color={EMERALD} />
        <StatCard label="SETS OWNED" value={setCount.toLocaleString()} color={LIME} />
      </div>

      <p style={{
        fontFamily: 'ui-monospace, monospace',
        fontSize: 12,
        letterSpacing: '0.2em',
        color: 'rgba(255,255,255,0.35)',
        textTransform: 'uppercase',
        marginBottom: 12,
      }}>
        Your Top Slabs
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 16 }}>
        {SLABS.map((slab, i) => {
          const cardDelay = 40 + i * 6;
          const cardOpacity = interpolate(frame, [cardDelay, cardDelay + 15], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
          const cardY = interpolate(frame, [cardDelay, cardDelay + 20], [40, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
          const color = graderColor(slab.grader);
          return (
            <div
              key={i}
              style={{
                aspectRatio: '3 / 4',
                borderRadius: 12,
                background: '#111',
                border: `1px solid ${color}40`,
                overflow: 'hidden',
                display: 'flex',
                flexDirection: 'column',
                opacity: cardOpacity,
                transform: `translateY(${cardY}px)`,
                boxShadow: `0 8px 30px ${color}30`,
              }}
            >
              <div style={{ flex: 1, position: 'relative', background: '#000' }}>
                <Img
                  src={slab.imageUrl}
                  style={{
                    position: 'absolute',
                    inset: 0,
                    width: '100%',
                    height: '100%',
                    objectFit: 'cover',
                  }}
                />
                <div style={{
                  position: 'absolute',
                  top: 6, left: 6,
                  background: color,
                  padding: '2px 8px',
                  borderRadius: 4,
                  fontFamily: 'ui-monospace, monospace',
                  fontSize: 10,
                  color: '#0d0f14',
                  fontWeight: 800,
                }}>
                  {slab.grader} {slab.grade}
                </div>
              </div>
              <div style={{ padding: 8, background: '#111' }}>
                <div style={{ fontSize: 11, color: '#fff', fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {slab.name}
                </div>
                <div style={{ fontSize: 10, color: EMERALD, fontFamily: 'ui-monospace, monospace', fontWeight: 700 }}>
                  ${slab.price}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};

const StatCard: React.FC<{ label: string; value: string; color: string }> = ({ label, value, color }) => (
  <div style={{
    padding: 24,
    borderRadius: 16,
    background: 'rgba(255,255,255,0.03)',
    border: '1px solid rgba(255,255,255,0.08)',
  }}>
    <div style={{
      fontFamily: 'ui-monospace, monospace',
      fontSize: 10,
      color: 'rgba(255,255,255,0.4)',
      letterSpacing: '0.2em',
      marginBottom: 8,
    }}>
      {label}
    </div>
    <div style={{ fontSize: 48, fontWeight: 900, color, letterSpacing: '-0.02em' }}>
      {value}
    </div>
  </div>
);
