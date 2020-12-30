import CPU from './cpu';
import PPU from './ppu';
import PAPU from './papu';
import ROM from './rom';

export enum Button {
  A = 0,
  B = 1,
  SELECT = 2,
  START = 3,
  UP = 4,
  DOWN = 5,
  LEFT = 6,
  RIGHT = 7,
}

type NesOpts = {
  onFrame?: (b: number[]) => unknown,
  onAudioSample?: (l: number, r: number) => unknown,
  onStatusUpdate?: (text: string) => unknown,
  onBatteryRamWrite?: () => unknown,
  preferredFrameRate?: number,
  emulateSound?: boolean,
  sampleRate?: number
};

function NES({
  onFrame,
  onAudioSample,
  onStatusUpdate = () => undefined,
  onBatteryRamWrite,
  preferredFrameRate = 60,
  emulateSound = true,
  sampleRate = 48000
}: NesOpts) {
  let frameTime = 1000 / preferredFrameRate;
  let fpsFrameCount = 0;
  let romData = null;
  let lastFpsTime;

  const components = {
    mem: new Array(0x10000),
    mmap: undefined,
    rom: undefined,
    cpu: undefined,
    ppu: undefined,
    papu: undefined,
    controllers: {
      1: new Array(8).fill(0x40),
      2: new Array(8).fill(0x40),
    }
  };

  components.cpu = CPU(components);
  components.ppu = PPU(components, { onFrame });
  components.papu = PAPU(components, { preferredFrameRate, onAudioSample });

  function buttonDown(controller: number, button: number) {
    components.controllers[controller][button] = 0x41;
  }

  function buttonUp(controller: number, button: number) {
    components.controllers[controller][button] = 0x40;
  }

  onStatusUpdate("Ready to load a ROM.");

  // Resets the system
  function reset() {
    let { mem, mmap, cpu, ppu, papu } = components;

    for (let i = 0; i < 0x2000; i++) {
      mem[i] = 0xff;
    }
    for (let p = 0; p < 4; p++) {
      let j = p * 0x800;
      mem[j + 0x008] = 0xf7;
      mem[j + 0x009] = 0xef;
      mem[j + 0x00a] = 0xdf;
      mem[j + 0x00f] = 0xbf;
    }
    for (let k = 0x2001; k < mem.length; k++) {
      mem[k] = 0;
    }

    if (mmap) {
      mmap.reset();
    }

    cpu.reset();
    ppu.reset();
    papu.reset();

    lastFpsTime = null;
    fpsFrameCount = 0;
  }

  function frame() {
    let { mmap, cpu, ppu } = components;

    if (mmap) {
      ppu.startFrame();

      while (1) {
        let cycles = cpu.frameLoop();
        if (ppu.doCycles(cycles) > 0) {
          break;
        }
      }
  
      fpsFrameCount++;
    }
  }

  function zapperMove(x, y) {
    let { mmap } = components;
    if (!mmap) return;
    mmap.setZapperPosition(x, y);
  }

  function zapperFireDown() {
    let { mmap } = components;
    if (!mmap) return;
    mmap.setZapperFiring(true);
  }

  function zapperFireUp() {
    let { mmap } = components;
    if (!mmap) return;
    mmap.setZapperFiring(false);
  }

  function getFPS() {
    var now = Date.now();
    var fps = null;
    if (lastFpsTime) {
      fps = fpsFrameCount / ((now - lastFpsTime) / 1000);
    }
    fpsFrameCount = 0;
    lastFpsTime = now;
    return fps;
  }

  function reloadROM() {
    if (romData !== null) {
      loadROM(romData);
    }
  }

  // Loads a ROM file into the CPU and PPU.
  // The ROM file is validated first.
  function loadROM(data) {
    reset();
    console.log(components);
    
    components.rom = ROM();
    components.rom.load(data);

    components.mmap = components.rom.createMapper(components, { onBatteryRamWrite });

    components.cpu = CPU(components);

    components.mmap.loadROM();

    components.ppu.setMirroring(
      components.rom.getMirroringType()
    );

    console.log(components);

    romData = data;
  }

  function toJSON() {
    return {
      romData,
      cpu: components.cpu.toJSON(),
      mmap: components.mmap.toJSON(),
      ppu: components.ppu.toJSON(),
    };
  }

  function fromJSON(s) {
    loadROM(s.romData);
    components.cpu.fromJSON(s.cpu);
    components.mmap.fromJSON(s.mmap);
    components.ppu.fromJSON(s.ppu);
  }

  return {
    loadROM,
    frame,
    buttonDown,
    buttonUp
  }
};

export default NES;
