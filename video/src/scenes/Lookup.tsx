import React from 'react';
import { AbsoluteFill, useCurrentFrame, interpolate, spring, useVideoConfig } from 'remotion';

const LIME = '#B1D235';
const ADDR = '0x52B812Ec8E204541156f1F778B0672bD044a2e79';

export const LookupScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const labelOpacity = interpolate(frame, [0, 15], [0, 1], { extrapolateRight: 'clamp' });
  const boxScale = spring({ frame, fps, config: { damping: 14, stiffness: 110 } });

  // Type the address character by character
  const charsToShow = Math.min(ADDR.length, Math.max(0, Math.floor((frame - 15) * 1.2)));
  const typedAddr = ADDR.slice(0, charsToShow);

  // Button press effect near the end
  const btnPress = interpolate(frame, [100, 110], [1, 0.95], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const flashOpacity = interpolate(frame, [108, 115, 120], [0, 0.6, 0], { extrapolateRight: 'clamp' });

  return (
    <AbsoluteFill style={{ background: '#000', justifyContent: 'center', alignItems: 'center', padding: 80 }}>
      {/* Ambient glow */}
      <div style={{
        position: 'absolute',
        top: '20%', left: '50%', transform: 'translate(-50%, -50%)',
        width: 800, height: 500,
        background: `radial-gradient(ellipse, ${LIME}18 0%, transparent 60%)`,
        filter: 'blur(60px)',
      }} />

      <p style={{
        fontFamily: 'ui-monospace, monospace',
        fontSize: 14,
        letterSpacing: '0.2em',
        color: `${LIME}`,
        opacity: labelOpacity,
        marginBottom: 16,
      }}>
        STEP 01 · LOOKUP
      </p>
      <h2 style={{
        fontSize: 64,
        fontWeight: 900,
        color: '#fff',
        letterSpacing: '-0.03em',
        margin: 0,
        marginBottom: 40,
        opacity: labelOpacity,
      }}>
        Paste your wallet
      </h2>

      <div style={{
        width: 900,
        padding: 8,
        borderRadius: 20,
        background: 'rgba(255,255,255,0.04)',
        border: '1px solid rgba(255,255,255,0.10)',
        transform: `scale(${boxScale})`,
        boxShadow: `0 0 80px ${LIME}20`,
      }}>
        <div style={{
          display: 'flex',
          gap: 12,
          padding: 8,
        }}>
          <div style={{
            flex: 1,
            height: 64,
            borderRadius: 14,
            background: '#000',
            border: '1px solid rgba(255,255,255,0.15)',
            display: 'flex',
            alignItems: 'center',
            padding: '0 24px',
            fontFamily: 'ui-monospace, monospace',
            fontSize: 20,
            color: '#fff',
          }}>
            <span>{typedAddr}</span>
            {charsToShow < ADDR.length && frame % 20 < 10 && (
              <span style={{ marginLeft: 2, width: 2, height: 24, background: LIME }} />
            )}
          </div>
          <button style={{
            height: 64,
            padding: '0 40px',
            borderRadius: 14,
            background: LIME,
            color: '#0d0f14',
            fontWeight: 800,
            fontSize: 20,
            border: 'none',
            transform: `scale(${btnPress})`,
            boxShadow: `0 8px 24px ${LIME}40`,
          }}>
            Look Up →
          </button>
        </div>
      </div>

      {/* Flash on submit */}
      <div style={{
        position: 'absolute',
        inset: 0,
        background: LIME,
        opacity: flashOpacity,
        mixBlendMode: 'overlay',
      }} />
    </AbsoluteFill>
  );
};
