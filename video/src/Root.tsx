import React from 'react';
import { Composition } from 'remotion';
import { BindrDemo } from './BindrDemo';
import { SlabPackScene } from './scenes/SlabPackScene';

export const Root: React.FC = () => {
  return (
    <>
      <Composition
        id="BindrDemo"
        component={BindrDemo}
        durationInFrames={30 * 20}
        fps={30}
        width={1280}
        height={800}
      />
      <Composition
        id="SlabPack"
        component={SlabPackScene}
        durationInFrames={30 * 12}
        fps={30}
        width={720}
        height={1080}
      />
    </>
  );
};
