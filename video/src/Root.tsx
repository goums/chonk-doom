import { Composition } from 'remotion';
import { ChonkDoom, totalFrames, FPS } from './Video';

export const Root = () => (
  <Composition id="ChonkDoom" component={ChonkDoom} durationInFrames={totalFrames} fps={FPS} width={1920} height={1080} />
);
