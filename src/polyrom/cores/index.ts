
export enum Button {
  A = 0,
  B = 1,
  SELECT = 2,
  START = 3,
  UP = 4,
  DOWN = 5,
  LEFT = 6,
  RIGHT = 7,
};

type Controllers = Array<{
  controller: number,
  buttonsDown: Button[]
}>;

type Snapshot = unknown;

export type CoreControl = {
  createSnapshot: () => Snapshot,
  setButtons: (controllers: Controllers) => unknown, 
  buttonUp: (button: Button, controller: number) => unknown,
  buttonDown: (button: Button, controller: number) => unknown,
  clock: () => unknown
};

export type FrameCallback = (frame: number[]) => unknown;
export type AudioCallback = (l: number, r: number) => unknown;

type CoreOptions = {
  rom: ArrayBuffer,
  snapshot?: any,
  onFrame: FrameCallback,
  onAudio: AudioCallback,
};

export type Core = (opts: CoreOptions) => Promise<CoreControl>;

export { default as tsnes } from './tsnes';
