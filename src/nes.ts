import CPU from './cpu';
import PPU from './ppu';
import PAPU from './papu';

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
  const frameTime = 1000 / preferredFrameRate;

  let fpsFrameCount = 0;
  let romData = null;

  const ui = {
    writeFrame: this.opts.onFrame,
    updateStatus: this.opts.onStatusUpdate,
  };

  const cpu = CPU({mmap, halt});

  const ppu = PPU({ui, cpu, mmap});

  this.papu = PAPU({cpu, mmap, preferredFrameRate, onAudioSample});

  this.mmap = null; // set in loadROM()
  const controllers = {
    1: new Array(8).fill(0x40),
    2: new Array(8).fill(0x40),
  };

  function halt(message) {
  }

  function buttonDown(controller: number, button: number) {
    this.controllers[controller][button] = 0x41;
  }

  function buttonUp(controller: number, button: number) {
    this.controllers[controller][button] = 0x40;
  }

  onStatusUpdate("Ready to load a ROM.");

  this.frame = this.frame.bind(this);

  this.zapperMove = this.zapperMove.bind(this);
  this.zapperFireDown = this.zapperFireDown.bind(this);
  this.zapperFireUp = this.zapperFireUp.bind(this);



  // Resets the system
  function reset() {
    if (this.mmap !== null) {
      this.mmap.reset();
    }

    this.cpu.reset();
    this.ppu.reset();
    this.papu.reset();

    this.lastFpsTime = null;
    this.fpsFrameCount = 0;
  }

  function frame() {
    this.ppu.startFrame();
    var cycles = 0;
    var emulateSound = this.opts.emulateSound;
    var cpu = this.cpu;
    var ppu = this.ppu;
    var papu = this.papu;
    FRAMELOOP: for (; ;) {
      if (cpu.cyclesToHalt === 0) {
        // Execute a CPU instruction
        cycles = cpu.emulate();
        if (emulateSound) {
          papu.clockFrameCounter(cycles);
        }
        cycles *= 3;
      } else {
        if (cpu.cyclesToHalt > 8) {
          cycles = 24;
          if (emulateSound) {
            papu.clockFrameCounter(8);
          }
          cpu.cyclesToHalt -= 8;
        } else {
          cycles = cpu.cyclesToHalt * 3;
          if (emulateSound) {
            papu.clockFrameCounter(cpu.cyclesToHalt);
          }
          cpu.cyclesToHalt = 0;
        }
      }

      if (ppu.doCycles(cycles) > 0) {
        break FRAMELOOP;
      }
    }
    this.fpsFrameCount++;
  }

  function zapperMove(x, y) {
    if (!this.mmap) return;
    this.mmap.zapperX = x;
    this.mmap.zapperY = y;
  }

  function zapperFireDown() {
    if (!this.mmap) return;
    this.mmap.zapperFired = true;
  }

  function zapperFireUp() {
    if (!this.mmap) return;
    this.mmap.zapperFired = false;
  }

  function getFPS() {
    var now = +new Date();
    var fps = null;
    if (this.lastFpsTime) {
      fps = this.fpsFrameCount / ((now - this.lastFpsTime) / 1000);
    }
    this.fpsFrameCount = 0;
    this.lastFpsTime = now;
    return fps;
  }

  function reloadROM() {
    if (this.romData !== null) {
      this.loadROM(this.romData);
    }
  }

  // Loads a ROM file into the CPU and PPU.
  // The ROM file is validated first.
  function loadROM(data) {
    // Load ROM file:
    this.rom = new ROM(this);
    this.rom.load(data);

    this.reset();
    this.mmap = this.rom.createMapper();
    this.mmap.loadROM();
    this.ppu.setMirroring(this.rom.getMirroringType());
    this.romData = data;
    this.cpu = CPU(this.mmap, halt);
  }

  function setFramerate(rate) {
    this.opts.preferredFrameRate = rate;
    this.frameTime = 1000 / rate;
    this.papu.setSampleRate(this.opts.sampleRate, false);
  }

  function toJSON() {
    return {
      romData: this.romData,
      cpu: this.cpu.toJSON(),
      mmap: this.mmap.toJSON(),
      ppu: this.ppu.toJSON(),
    };
  }

  function fromJSON(s) {
    this.loadROM(s.romData);
    this.cpu.fromJSON(s.cpu);
    this.mmap.fromJSON(s.mmap);
    this.ppu.fromJSON(s.ppu);
  }
};

module.exports = NES;
