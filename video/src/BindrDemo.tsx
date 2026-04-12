import React from 'react';
import { AbsoluteFill, Audio, Sequence, staticFile } from 'remotion';
import { IntroScene } from './scenes/Intro';
import { LookupScene } from './scenes/Lookup';
import { DashboardScene } from './scenes/Dashboard';
import { SetsScene } from './scenes/Sets';
import { OutroScene } from './scenes/Outro';

// Scene timing (30fps)
const INTRO_DUR = 60;      // 2s
const LOOKUP_DUR = 120;    // 4s
const DASHBOARD_DUR = 150; // 5s
const SETS_DUR = 150;      // 5s
const OUTRO_DUR = 120;     // 4s

export const BindrDemo: React.FC = () => {
  let t = 0;
  return (
    <AbsoluteFill style={{ background: '#000000', fontFamily: 'Inter, system-ui, sans-serif' }}>
      <Audio src={staticFile('music.mp3')} volume={0.35} />

      <Sequence from={t} durationInFrames={INTRO_DUR}>
        <IntroScene />
      </Sequence>
      {(t += INTRO_DUR, null)}

      <Sequence from={t} durationInFrames={LOOKUP_DUR}>
        <LookupScene />
      </Sequence>
      {(t += LOOKUP_DUR, null)}

      <Sequence from={t} durationInFrames={DASHBOARD_DUR}>
        <DashboardScene />
      </Sequence>
      {(t += DASHBOARD_DUR, null)}

      <Sequence from={t} durationInFrames={SETS_DUR}>
        <SetsScene />
      </Sequence>
      {(t += SETS_DUR, null)}

      <Sequence from={t} durationInFrames={OUTRO_DUR}>
        <OutroScene />
      </Sequence>
    </AbsoluteFill>
  );
};
