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
  onFrame?: () => unknown,
  onAudioSample?: () => unknown,
  onStatusUpdate?: (text: string) => unknown,
  onBatteryRamWrite?: () => unknown,
  preferredFrameRate?: number,
  emulateSound?: boolean,
  sampleRate?: number
};

function NES({
  onFrame,
  onAudioSample,
  onStatusUpdate,
  onBatteryRamWrite,
  preferredFrameRate = 60,
  emulateSound = true,
  sampleRate = 48000
}: NesOpts) {
  let frameTime = 1000 / preferredFrameRate;
  let fpsFrameCount = 0;
  let romData = null;
  let mmap;
  let rom;
  let cpu = CPU({ mmap, halt });
  const ppu = PPU({
    ui: {
      writeFrame: onFrame,
      updateStatus: onStatusUpdate,
    },
    cpu,
    mmap
  });
  const papu = PAPU({ cpu, mmap, preferredFrameRate, onAudioSample });
  let lastFpsTime;

  const controllers = {
    1: new Array(8).fill(0x40),
    2: new Array(8).fill(0x40),
  };

  function halt(message) {
  }

  function buttonDown(controller: number, button: number) {
    controllers[controller][button] = 0x41;
  }

  function buttonUp(controller: number, button: number) {
    controllers[controller][button] = 0x40;
  }

  onStatusUpdate("Ready to load a ROM.");

  // Resets the system
  function reset() {
    if (mmap !== null) {
      mmap.reset();
    }

    cpu.reset();
    ppu.reset();
    papu.reset();

    lastFpsTime = null;
    fpsFrameCount = 0;
  }

  function frame() {
    ppu.startFrame();

    while (1) {
      let cycles = cpu.frameLoop(papu);
      if (ppu.doCycles(cycles) > 0) {
        break;
      }
    }

    fpsFrameCount++;
  }

  function zapperMove(x, y) {
    if (!mmap) return;
    mmap.zapperX = x;
    mmap.zapperY = y;
  }

  function zapperFireDown() {
    if (!mmap) return;
    mmap.zapperFired = true;
  }

  function zapperFireUp() {
    if (!mmap) return;
    mmap.zapperFired = false;
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

    mmap = rom.createMapper();
    mmap.loadROM();
    
    cpu = CPU({ mmap, halt });

    // Load ROM file:
    rom = ROM({
      cpu,
      onBatteryRamWrite,
      ppu,
      papu,
      controllers,
      rom
    });

    rom.load(data);

    reset();

    ppu.setMirroring(rom.getMirroringType());
    romData = data;
  }

  function toJSON() {
    return {
      romData,
      cpu: cpu.toJSON(),
      mmap: mmap.toJSON(),
      ppu: ppu.toJSON(),
    };
  }

  function fromJSON(s) {
    loadROM(s.romData);
    cpu.fromJSON(s.cpu);
    mmap.fromJSON(s.mmap);
    ppu.fromJSON(s.ppu);
  }
};

export default NES;
