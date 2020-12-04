import CPU from './cpu';

var PAPU = require("./papu");
var ROM = require("./rom");

import PPU from './ppu';

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

  const ui = {
    writeFrame: this.opts.onFrame,
    updateStatus: this.opts.onStatusUpdate,
  };

  const cpu = new CPU(this);

  const ppu = new PPU(this);

  this.papu = new PAPU(this);
  this.mmap = null; // set in loadROM()
  const controllers = {
    1: new Array(8).fill(0x40),
    2: new Array(8).fill(0x40),
  };

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
};

NES.prototype = {
  fpsFrameCount: 0,
  romData: null,

  // Resets the system
  reset: function () {
    if (this.mmap !== null) {
      this.mmap.reset();
    }

    this.cpu.reset();
    this.ppu.reset();
    this.papu.reset();

    this.lastFpsTime = null;
    this.fpsFrameCount = 0;
  },

  frame: function () {
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

      for (; cycles > 0; cycles--) {
        if (
          ppu.curX === ppu.spr0HitX &&
          ppu.f_spVisibility === 1 &&
          ppu.scanline - 21 === ppu.spr0HitY
        ) {
          // Set sprite 0 hit flag:
          ppu.setStatusFlag(ppu.STATUS_SPRITE0HIT, true);
        }

        if (ppu.requestEndFrame) {
          ppu.nmiCounter--;
          if (ppu.nmiCounter === 0) {
            ppu.requestEndFrame = false;
            ppu.startVBlank();
            break FRAMELOOP;
          }
        }

        ppu.curX++;
        if (ppu.curX === 341) {
          ppu.curX = 0;
          ppu.endScanline();
        }
      }
    }
    this.fpsFrameCount++;
  },

  zapperMove: function (x, y) {
    if (!this.mmap) return;
    this.mmap.zapperX = x;
    this.mmap.zapperY = y;
  },

  zapperFireDown: function () {
    if (!this.mmap) return;
    this.mmap.zapperFired = true;
  },

  zapperFireUp: function () {
    if (!this.mmap) return;
    this.mmap.zapperFired = false;
  },

  getFPS: function () {
    var now = +new Date();
    var fps = null;
    if (this.lastFpsTime) {
      fps = this.fpsFrameCount / ((now - this.lastFpsTime) / 1000);
    }
    this.fpsFrameCount = 0;
    this.lastFpsTime = now;
    return fps;
  },

  reloadROM: function () {
    if (this.romData !== null) {
      this.loadROM(this.romData);
    }
  },

  // Loads a ROM file into the CPU and PPU.
  // The ROM file is validated first.
  loadROM: function (data) {
    // Load ROM file:
    this.rom = new ROM(this);
    this.rom.load(data);

    this.reset();
    this.mmap = this.rom.createMapper();
    this.mmap.loadROM();
    this.ppu.setMirroring(this.rom.getMirroringType());
    this.romData = data;
  },

  setFramerate: function (rate) {
    this.opts.preferredFrameRate = rate;
    this.frameTime = 1000 / rate;
    this.papu.setSampleRate(this.opts.sampleRate, false);
  },

  toJSON: function () {
    return {
      romData: this.romData,
      cpu: this.cpu.toJSON(),
      mmap: this.mmap.toJSON(),
      ppu: this.ppu.toJSON(),
    };
  },

  fromJSON: function (s) {
    this.loadROM(s.romData);
    this.cpu.fromJSON(s.cpu);
    this.mmap.fromJSON(s.mmap);
    this.ppu.fromJSON(s.ppu);
  },
};

module.exports = NES;
