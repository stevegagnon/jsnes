import ChannelSquare from './square';
import ChannelTriangle from './triangle';
import ChannelNoise from './noise';
import ChannelDM from './dmc';
import { Irq } from '../cpu';

const CPU_FREQ_NTSC = 1789772.5; //1789772.72727272d;

export function PAPU({cpu, mmap, preferredFrameRate, onAudioSample, sampleRate = 44100}) {
  let square1 = ChannelSquare({ getLengthMax }, true);
  let square2 = ChannelSquare({ getLengthMax }, false);
  let triangle = ChannelTriangle({ getLengthMax });
  let noise = ChannelNoise({ getLengthMax, getNoiseWaveLength });
  let dmc = ChannelDM({ getDmcFrequency, cpu, mmap });

  let frameIrqCounter = null;
  let frameIrqCounterMax = 4;
  let initCounter = 2048;
  let channelEnableValue = null;

  let lengthLookup = null;
  let dmcFreqLookup = null;
  let noiseWavelengthLookup = null;
  let square_table = null;
  let tnd_table = null;

  let frameIrqEnabled = false;
  let frameIrqActive = null;
  let frameClockNow = null;
  let startedPlaying = false;
  let recordOutput = false;
  let initingHardware = false;

  let masterFrameCounter = null;
  let derivedFrameCounter = null;
  let countSequence = null;
  let sampleTimer = null;
  let frameTime = null;
  let sampleTimerMax = null;
  let sampleCount = null;
  let triValue = 0;

  let smpSquare1 = null;
  let smpSquare2 = null;
  let smpTriangle = null;
  let smpDmc = null;
  let accCount = null;

  // DC removal vars:
  let prevSampleL = 0;
  let prevSampleR = 0;
  let smpAccumL = 0;
  let smpAccumR = 0;

  // DAC range:
  let dacRange = 0;
  let dcValue = 0;

  // Master volume:
  let masterVolume = 256;

  // Stereo positioning:
  let stereoPosLSquare1 = null;
  let stereoPosLSquare2 = null;
  let stereoPosLTriangle = null;
  let stereoPosLNoise = null;
  let stereoPosLDMC = null;
  let stereoPosRSquare1 = null;
  let stereoPosRSquare2 = null;
  let stereoPosRTriangle = null;
  let stereoPosRNoise = null;
  let stereoPosRDMC = null;

  let extraCycles = null;

  let maxSample = null;
  let minSample = null;

  // Panning:
  let panning = [80, 170, 100, 150, 128];
  setPanning(panning);

  // Initialize lookup tables:
  initLengthLookup();
  initDmcFrequencyLookup();
  initNoiseWavelengthLookup();
  initDACtables();

  // Init sound registers:
  for (var i = 0; i < 0x14; i++) {
    if (i === 0x10) {
      writeReg(0x4010, 0x10);
    } else {
      writeReg(0x4000 + i, 0);
    }
  }

  reset();

  function reset() {
    sampleTimerMax = Math.floor(
      (1024.0 * CPU_FREQ_NTSC * preferredFrameRate) /
      (sampleRate * 60.0)
    );

    frameTime = Math.floor(
      (14915.0 * preferredFrameRate) / 60.0
    );

    sampleTimer = 0;

    updateChannelEnable(0);
    masterFrameCounter = 0;
    derivedFrameCounter = 0;
    countSequence = 0;
    sampleCount = 0;
    initCounter = 2048;
    frameIrqEnabled = false;
    initingHardware = false;

    resetCounter();

    square1.reset();
    square2.reset();
    triangle.reset();
    noise.reset();
    dmc.reset();

    accCount = 0;
    smpSquare1 = 0;
    smpSquare2 = 0;
    smpTriangle = 0;
    smpDmc = 0;

    frameIrqEnabled = false;
    frameIrqCounterMax = 4;

    channelEnableValue = 0xff;
    startedPlaying = false;
    prevSampleL = 0;
    prevSampleR = 0;
    smpAccumL = 0;
    smpAccumR = 0;

    maxSample = -500000;
    minSample = 500000;
  }

  // eslint-disable-next-line no-unused-vars
  function readReg(address) {
    // Read 0x4015:
    var tmp = 0;
    tmp |= square1.getLengthStatus();
    tmp |= square2.getLengthStatus() << 1;
    tmp |= triangle.getLengthStatus() << 2;
    tmp |= noise.getLengthStatus() << 3;
    tmp |= dmc.getLengthStatus() << 4;
    tmp |= (frameIrqActive && frameIrqEnabled ? 1 : 0) << 6;
    tmp |= dmc.getIrqStatus() << 7;

    frameIrqActive = false;
    dmc.setIrqGenerated(false);

    return tmp & 0xffff;
  }

  function writeReg(address, value) {
    if (address >= 0x4000 && address < 0x4004) {
      // Square Wave 1 Control
      square1.writeReg(address, value);
      // console.log("Square Write");
    } else if (address >= 0x4004 && address < 0x4008) {
      // Square 2 Control
      square2.writeReg(address, value);
    } else if (address >= 0x4008 && address < 0x400c) {
      // Triangle Control
      triangle.writeReg(address, value);
    } else if (address >= 0x400c && address <= 0x400f) {
      // Noise Control
      noise.writeReg(address, value);
    } else if (address === 0x4010) {
      // DMC Play mode & DMA frequency
      dmc.writeReg(address, value);
    } else if (address === 0x4011) {
      // DMC Delta Counter
      dmc.writeReg(address, value);
    } else if (address === 0x4012) {
      // DMC Play code starting address
      dmc.writeReg(address, value);
    } else if (address === 0x4013) {
      // DMC Play code length
      dmc.writeReg(address, value);
    } else if (address === 0x4015) {
      // Channel enable
      updateChannelEnable(value);

      if (value !== 0 && initCounter > 0) {
        // Start hardware initialization
        initingHardware = true;
      }

      // DMC/IRQ Status
      dmc.writeReg(address, value);
    } else if (address === 0x4017) {
      // Frame counter control
      countSequence = (value >> 7) & 1;
      masterFrameCounter = 0;
      frameIrqActive = false;

      if (((value >> 6) & 0x1) === 0) {
        frameIrqEnabled = true;
      } else {
        frameIrqEnabled = false;
      }

      if (countSequence === 0) {
        // NTSC:
        frameIrqCounterMax = 4;
        derivedFrameCounter = 4;
      } else {
        // PAL:
        frameIrqCounterMax = 5;
        derivedFrameCounter = 0;
        frameCounterTick();
      }
    }
  }

  function resetCounter() {
    if (countSequence === 0) {
      derivedFrameCounter = 4;
    } else {
      derivedFrameCounter = 0;
    }
  }

  // Updates channel enable status.
  // This is done on writes to the
  // channel enable register (0x4015),
  // and when the user enables/disables channels
  // in the GUI.
  function updateChannelEnable(value) {
    channelEnableValue = value & 0xffff;
    square1.setEnabled((value & 1) !== 0);
    square2.setEnabled((value & 2) !== 0);
    triangle.setEnabled((value & 4) !== 0);
    noise.setEnabled((value & 8) !== 0);
    dmc.setEnabled((value & 16) !== 0);
  }

  // Clocks the frame counter. It should be clocked at
  // twice the cpu speed, so the cycles will be
  // divided by 2 for those counters that are
  // clocked at cpu speed.
  function clockFrameCounter(nCycles) {
    if (initCounter > 0) {
      if (initingHardware) {
        initCounter -= nCycles;
        if (initCounter <= 0) {
          initingHardware = false;
        }
        return;
      }
    }

    // Don't process ticks beyond next sampling:
    nCycles += extraCycles;
    var maxCycles = sampleTimerMax - sampleTimer;
    if (nCycles << 10 > maxCycles) {
      extraCycles = ((nCycles << 10) - maxCycles) >> 10;
      nCycles -= extraCycles;
    } else {
      extraCycles = 0;
    }

    var dmc = dmc;
    var triangle = triangle;
    var square1 = square1;
    var square2 = square2;
    var noise = noise;

    // Clock DMC:
    if (dmc.isEnabled) {
      dmc.shiftCounter -= nCycles << 3;
      while (dmc.shiftCounter <= 0 && dmc.dmaFrequency > 0) {
        dmc.shiftCounter += dmc.dmaFrequency;
        dmc.clockDmc();
      }
    }

    // Clock Triangle channel Prog timer:
    if (triangle.progTimerMax > 0) {
      triangle.progTimerCount -= nCycles;
      while (triangle.progTimerCount <= 0) {
        triangle.progTimerCount += triangle.progTimerMax + 1;
        if (triangle.linearCounter > 0 && triangle.lengthCounter > 0) {
          triangle.triangleCounter++;
          triangle.triangleCounter &= 0x1f;

          if (triangle.isEnabled) {
            if (triangle.triangleCounter >= 0x10) {
              // Normal value.
              triangle.sampleValue = triangle.triangleCounter & 0xf;
            } else {
              // Inverted value.
              triangle.sampleValue = 0xf - (triangle.triangleCounter & 0xf);
            }
            triangle.sampleValue <<= 4;
          }
        }
      }
    }

    // Clock Square channel 1 Prog timer:
    square1.progTimerCount -= nCycles;
    if (square1.progTimerCount <= 0) {
      square1.progTimerCount += (square1.progTimerMax + 1) << 1;

      square1.squareCounter++;
      square1.squareCounter &= 0x7;
      square1.updateSampleValue();
    }

    // Clock Square channel 2 Prog timer:
    square2.progTimerCount -= nCycles;
    if (square2.progTimerCount <= 0) {
      square2.progTimerCount += (square2.progTimerMax + 1) << 1;

      square2.squareCounter++;
      square2.squareCounter &= 0x7;
      square2.updateSampleValue();
    }

    // Clock noise channel Prog timer:
    var acc_c = nCycles;
    if (noise.progTimerCount - acc_c > 0) {
      // Do all cycles at once:
      noise.progTimerCount -= acc_c;
      noise.accCount += acc_c;
      noise.accValue += acc_c * noise.sampleValue;
    } else {
      // Slow-step:
      while (acc_c-- > 0) {
        if (--noise.progTimerCount <= 0 && noise.progTimerMax > 0) {
          // Update noise shift register:
          noise.shiftReg <<= 1;
          noise.tmp =
            ((noise.shiftReg << (noise.randomMode === 0 ? 1 : 6)) ^
              noise.shiftReg) &
            0x8000;
          if (noise.tmp !== 0) {
            // Sample value must be 0.
            noise.shiftReg |= 0x01;
            noise.randomBit = 0;
            noise.sampleValue = 0;
          } else {
            // Find sample value:
            noise.randomBit = 1;
            if (noise.isEnabled && noise.lengthCounter > 0) {
              noise.sampleValue = noise.masterVolume;
            } else {
              noise.sampleValue = 0;
            }
          }

          noise.progTimerCount += noise.progTimerMax;
        }

        noise.accValue += noise.sampleValue;
        noise.accCount++;
      }
    }

    // Frame IRQ handling:
    if (frameIrqEnabled && frameIrqActive) {
      cpu.requestIrq(Irq.Normal);
    }

    // Clock frame counter at double CPU speed:
    masterFrameCounter += nCycles << 1;
    if (masterFrameCounter >= frameTime) {
      // 240Hz tick:
      masterFrameCounter -= frameTime;
      frameCounterTick();
    }

    // Accumulate sample value:
    accSample(nCycles);

    // Clock sample timer:
    sampleTimer += nCycles << 10;
    if (sampleTimer >= sampleTimerMax) {
      // Sample channels:
      sample();
      sampleTimer -= sampleTimerMax;
    }
  }

  function accSample(cycles) {
    // Special treatment for triangle channel - need to interpolate.
    triValue = triangle.accSample(cycles, triValue);

    // Now sample normally:
    if (cycles === 2) {
      smpTriangle += triValue << 1;
      smpDmc += dmc.getSample() << 1;
      smpSquare1 += square1.getSampleValue() << 1;
      smpSquare2 += square2.getSampleValue() << 1;
      accCount += 2;
    } else if (cycles === 4) {
      smpTriangle += triValue << 2;
      smpDmc += dmc.getSample() << 2;
      smpSquare1 += square1.getSampleValue() << 2;
      smpSquare2 += square2.getSampleValue() << 2;
      accCount += 4;
    } else {
      smpTriangle += cycles * triValue;
      smpDmc += cycles * dmc.getSample();
      smpSquare1 += cycles * square1.getSampleValue();
      smpSquare2 += cycles * square2.getSampleValue();
      accCount += cycles;
    }
  }

  function frameCounterTick() {
    derivedFrameCounter++;
    if (derivedFrameCounter >= frameIrqCounterMax) {
      derivedFrameCounter = 0;
    }

    if (derivedFrameCounter === 1 || derivedFrameCounter === 3) {
      // Clock length & sweep:
      triangle.clockLengthCounter();
      square1.clockLengthCounter();
      square2.clockLengthCounter();
      noise.clockLengthCounter();
      square1.clockSweep();
      square2.clockSweep();
    }

    if (derivedFrameCounter >= 0 && derivedFrameCounter < 4) {
      // Clock linear & decay:
      square1.clockEnvDecay();
      square2.clockEnvDecay();
      noise.clockEnvDecay();
      triangle.clockLinearCounter();
    }

    if (derivedFrameCounter === 3 && countSequence === 0) {
      // Enable IRQ:
      frameIrqActive = true;
    }

    // End of 240Hz tick
  }

  // Samples the channels, mixes the output together, then writes to buffer.
  function sample() {
    var sq_index, tnd_index;

    if (accCount > 0) {
      smpSquare1 <<= 4;
      smpSquare1 = Math.floor(smpSquare1 / accCount);

      smpSquare2 <<= 4;
      smpSquare2 = Math.floor(smpSquare2 / accCount);

      smpTriangle = Math.floor(smpTriangle / accCount);

      smpDmc <<= 4;
      smpDmc = Math.floor(smpDmc / accCount);

      accCount = 0;
    } else {
      smpSquare1 = square1.getSampleValue() << 4;
      smpSquare2 = square2.getSampleValue() << 4;
      smpTriangle = triangle.getSampleValue();
      smpDmc = dmc.getSample() << 4;
    }

    var smpNoise = noise.acc();

    // Stereo sound.

    // Left channel:
    sq_index =
      (smpSquare1 * stereoPosLSquare1 +
        smpSquare2 * stereoPosLSquare2) >>
      8;
    tnd_index =
      (3 * smpTriangle * stereoPosLTriangle +
        (smpNoise << 1) * stereoPosLNoise +
        smpDmc * stereoPosLDMC) >>
      8;
    if (sq_index >= square_table.length) {
      sq_index = square_table.length - 1;
    }
    if (tnd_index >= tnd_table.length) {
      tnd_index = tnd_table.length - 1;
    }
    var sampleValueL =
      square_table[sq_index] + tnd_table[tnd_index] - dcValue;

    // Right channel:
    sq_index =
      (smpSquare1 * stereoPosRSquare1 +
        smpSquare2 * stereoPosRSquare2) >>
      8;
    tnd_index =
      (3 * smpTriangle * stereoPosRTriangle +
        (smpNoise << 1) * stereoPosRNoise +
        smpDmc * stereoPosRDMC) >>
      8;
    if (sq_index >= square_table.length) {
      sq_index = square_table.length - 1;
    }
    if (tnd_index >= tnd_table.length) {
      tnd_index = tnd_table.length - 1;
    }
    var sampleValueR =
      square_table[sq_index] + tnd_table[tnd_index] - dcValue;

    // Remove DC from left channel:
    var smpDiffL = sampleValueL - prevSampleL;
    prevSampleL += smpDiffL;
    smpAccumL += smpDiffL - (smpAccumL >> 10);
    sampleValueL = smpAccumL;

    // Remove DC from right channel:
    var smpDiffR = sampleValueR - prevSampleR;
    prevSampleR += smpDiffR;
    smpAccumR += smpDiffR - (smpAccumR >> 10);
    sampleValueR = smpAccumR;

    // Write:
    if (sampleValueL > maxSample) {
      maxSample = sampleValueL;
    }
    if (sampleValueL < minSample) {
      minSample = sampleValueL;
    }

    if (onAudioSample) {
      onAudioSample(sampleValueL / 32768, sampleValueR / 32768);
    }

    // Reset sampled values:
    smpSquare1 = 0;
    smpSquare2 = 0;
    smpTriangle = 0;
    smpDmc = 0;
  }

  function getLengthMax(value) {
    return lengthLookup[value >> 3];
  }

  function getDmcFrequency(value) {
    if (value >= 0 && value < 0x10) {
      return dmcFreqLookup[value];
    }
    return 0;
  }

  function getNoiseWaveLength(value) {
    if (value >= 0 && value < 0x10) {
      return noiseWavelengthLookup[value];
    }
    return 0;
  }

  function setPanning(pos) {
    for (var i = 0; i < 5; i++) {
      panning[i] = pos[i];
    }
    updateStereoPos();
  }

  function setMasterVolume(value) {
    if (value < 0) {
      value = 0;
    }
    if (value > 256) {
      value = 256;
    }
    masterVolume = value;
    updateStereoPos();
  }

  function updateStereoPos() {
    stereoPosLSquare1 = (panning[0] * masterVolume) >> 8;
    stereoPosLSquare2 = (panning[1] * masterVolume) >> 8;
    stereoPosLTriangle = (panning[2] * masterVolume) >> 8;
    stereoPosLNoise = (panning[3] * masterVolume) >> 8;
    stereoPosLDMC = (panning[4] * masterVolume) >> 8;

    stereoPosRSquare1 = masterVolume - stereoPosLSquare1;
    stereoPosRSquare2 = masterVolume - stereoPosLSquare2;
    stereoPosRTriangle = masterVolume - stereoPosLTriangle;
    stereoPosRNoise = masterVolume - stereoPosLNoise;
    stereoPosRDMC = masterVolume - stereoPosLDMC;
  }

  function initLengthLookup() {
    // prettier-ignore
    lengthLookup = [
      0x0A, 0xFE,
      0x14, 0x02,
      0x28, 0x04,
      0x50, 0x06,
      0xA0, 0x08,
      0x3C, 0x0A,
      0x0E, 0x0C,
      0x1A, 0x0E,
      0x0C, 0x10,
      0x18, 0x12,
      0x30, 0x14,
      0x60, 0x16,
      0xC0, 0x18,
      0x48, 0x1A,
      0x10, 0x1C,
      0x20, 0x1E
    ];
  }

  function initDmcFrequencyLookup() {
    dmcFreqLookup = new Array(16);

    dmcFreqLookup[0x0] = 0xd60;
    dmcFreqLookup[0x1] = 0xbe0;
    dmcFreqLookup[0x2] = 0xaa0;
    dmcFreqLookup[0x3] = 0xa00;
    dmcFreqLookup[0x4] = 0x8f0;
    dmcFreqLookup[0x5] = 0x7f0;
    dmcFreqLookup[0x6] = 0x710;
    dmcFreqLookup[0x7] = 0x6b0;
    dmcFreqLookup[0x8] = 0x5f0;
    dmcFreqLookup[0x9] = 0x500;
    dmcFreqLookup[0xa] = 0x470;
    dmcFreqLookup[0xb] = 0x400;
    dmcFreqLookup[0xc] = 0x350;
    dmcFreqLookup[0xd] = 0x2a0;
    dmcFreqLookup[0xe] = 0x240;
    dmcFreqLookup[0xf] = 0x1b0;
    //for(int i=0;i<16;i++)dmcFreqLookup[i]/=8;
  }

  function initNoiseWavelengthLookup() {
    noiseWavelengthLookup = new Array(16);

    noiseWavelengthLookup[0x0] = 0x004;
    noiseWavelengthLookup[0x1] = 0x008;
    noiseWavelengthLookup[0x2] = 0x010;
    noiseWavelengthLookup[0x3] = 0x020;
    noiseWavelengthLookup[0x4] = 0x040;
    noiseWavelengthLookup[0x5] = 0x060;
    noiseWavelengthLookup[0x6] = 0x080;
    noiseWavelengthLookup[0x7] = 0x0a0;
    noiseWavelengthLookup[0x8] = 0x0ca;
    noiseWavelengthLookup[0x9] = 0x0fe;
    noiseWavelengthLookup[0xa] = 0x17c;
    noiseWavelengthLookup[0xb] = 0x1fc;
    noiseWavelengthLookup[0xc] = 0x2fa;
    noiseWavelengthLookup[0xd] = 0x3f8;
    noiseWavelengthLookup[0xe] = 0x7f2;
    noiseWavelengthLookup[0xf] = 0xfe4;
  }

  function initDACtables() {
    var value, ival, i;
    var max_sqr = 0;
    var max_tnd = 0;

    square_table = new Array(32 * 16);
    tnd_table = new Array(204 * 16);

    for (i = 0; i < 32 * 16; i++) {
      value = 95.52 / (8128.0 / (i / 16.0) + 100.0);
      value *= 0.98411;
      value *= 50000.0;
      ival = Math.floor(value);

      square_table[i] = ival;
      if (ival > max_sqr) {
        max_sqr = ival;
      }
    }

    for (i = 0; i < 204 * 16; i++) {
      value = 163.67 / (24329.0 / (i / 16.0) + 100.0);
      value *= 0.98411;
      value *= 50000.0;
      ival = Math.floor(value);

      tnd_table[i] = ival;
      if (ival > max_tnd) {
        max_tnd = ival;
      }
    }

    dacRange = max_sqr + max_tnd;
    dcValue = dacRange / 2;
  }

  return {
    reset,
  };
}

export default PAPU;
