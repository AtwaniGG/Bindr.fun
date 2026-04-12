import React from 'react';
import { AbsoluteFill, Img, staticFile, useCurrentFrame, interpolate, spring, useVideoConfig } from 'remotion';

const LIME = '#B1D235';

export const OutroScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const titleSpring = spring({ frame, fps, config: { damping: 14, stiffness: 100 } });
  const urlOpacity = interpolate(frame, [20, 35], [0, 1], { extrapolateRight: 'clamp' });
  const ctaOpacity = interpolate(frame, [40, 55], [0, 1], { extrapolateRight: 'clamp' });

  return (
    <AbsoluteFill style={{ background: '#000', justifyContent: 'center', alignItems: 'center' }}>
      <div style={{
        position: 'absolute',
        top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
        width: 900, height: 900,
        background: `radial-gradient(circle, ${LIME}1a 0%, transparent 60%)`,
        filter: 'blur(80px)',
      }} />

      <div style={{ transform: `scale(${titleSpring})` }}>
        <Img src={staticFile('logo.svg')} style={{ height: 160 }} />
      </div>

      <p style={{
        fontSize: 24,
        color: 'rgba(255,255,255,0.55)',
        marginTop: 24,
        letterSpacing: '0.02em',
        opacity: urlOpacity,
      }}>
        The home of web3 collectors.
      </p>

      <div style={{
        marginTop: 32,
        fontSize: 32,
        fontWeight: 900,
        letterSpacing: '0.02em',
        color: LIME,
        opacity: urlOpacity,
      }}>
        bindr.fun
      </div>

      <div style={{
        marginTop: 20,
        padding: '14px 36px',
        background: LIME,
        borderRadius: 12,
        color: '#0d0f14',
        fontWeight: 800,
        fontSize: 20,
        opacity: ctaOpacity,
        boxShadow: `0 10px 40px ${LIME}40`,
      }}>
        Register for the Beta
      </div>
    </AbsoluteFill>
  );
};
