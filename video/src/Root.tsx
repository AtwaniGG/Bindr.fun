import React from 'react';
import { Composition } from 'remotion';
import { BindrDemo } from './BindrDemo';

export const Root: React.FC = () => {
  return (
    <>
      <Composition
        id="BindrDemo"
        component={BindrDemo}
        durationInFrames={30 * 20} // 20 seconds at 30fps
        fps={30}
        width={1280}
        height={800}
      />
    </>
  );
};
