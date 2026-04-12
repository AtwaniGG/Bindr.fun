import React from 'react';
import { AbsoluteFill, Img, staticFile, useCurrentFrame, useVideoConfig, interpolate, spring } from 'remotion';

const LIME = '#B1D235';

export const IntroScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const logoScale = spring({ frame, fps, config: { damping: 12, stiffness: 120 } });
  const tagOpacity = interpolate(frame, [20, 40], [0, 1], { extrapolateRight: 'clamp' });

  return (
    <AbsoluteFill style={{ background: '#000', justifyContent: 'center', alignItems: 'center' }}>
      <div style={{
        position: 'absolute',
        top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
        width: 700, height: 700,
        background: `radial-gradient(circle, ${LIME}22 0%, transparent 60%)`,
        filter: 'blur(40px)',
      }} />

      <div style={{ transform: `scale(${logoScale})` }}>
        <Img src={staticFile('logo.svg')} style={{ height: 140 }} />
      </div>

      <p style={{
        fontSize: 22,
        color: 'rgba(255,255,255,0.55)',
        marginTop: 24,
        letterSpacing: '0.04em',
        opacity: tagOpacity,
        textTransform: 'uppercase',
        fontFamily: 'ui-monospace, monospace',
      }}>
        Collect · Connect · Complete
      </p>
    </AbsoluteFill>
  );
};
