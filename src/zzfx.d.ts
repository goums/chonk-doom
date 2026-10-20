declare module 'zzfx' {
  export const ZZFX: {
    volume: number;
    sampleRate: number;
    audioContext: AudioContext;
    buildSamples(...params: (number | undefined)[]): number[];
  };
  export function zzfx(...params: (number | undefined)[]): AudioBufferSourceNode;
}
