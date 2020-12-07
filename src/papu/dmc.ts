import { Irq } from '../cpu';

function ChannelDM({ getDmcFrequency, cpu, mmap }) {
  let MODE_NORMAL = 0;
  let MODE_LOOP = 1;
  let MODE_IRQ = 2;

  let isEnabled = null;
  let hasSample = null;
  let irqGenerated = false;

  let playMode = null;
  let dmaFrequency = null;
  let dmaCounter = null;
  let deltaCounter = null;
  let playStartAddress = null;
  let playAddress = null;
  let playLength = null;
  let playLengthCounter = null;
  let shiftCounter = null;
  let reg4012 = null;
  let reg4013 = null;
  let sample = null;
  let dacLsb = null;
  let data = null;

  function reset() {
    isEnabled = false;
    irqGenerated = false;
    playMode = MODE_NORMAL;
    dmaFrequency = 0;
    dmaCounter = 0;
    deltaCounter = 0;
    playStartAddress = 0;
    playAddress = 0;
    playLength = 0;
    playLengthCounter = 0;
    sample = 0;
    dacLsb = 0;
    shiftCounter = 0;
    reg4012 = 0;
    reg4013 = 0;
    data = 0;
  }


  function clockDmc() {
    // Only alter DAC value if the sample buffer has data:
    if (hasSample) {
      if ((data & 1) === 0) {
        // Decrement delta:
        if (deltaCounter > 0) {
          deltaCounter--;
        }
      } else {
        // Increment delta:
        if (deltaCounter < 63) {
          deltaCounter++;
        }
      }

      // Update sample value:
      sample = isEnabled ? (deltaCounter << 1) + dacLsb : 0;

      // Update shift register:
      data >>= 1;
    }

    dmaCounter--;
    if (dmaCounter <= 0) {
      // No more sample bits.
      hasSample = false;
      endOfSample();
      dmaCounter = 8;
    }

    if (irqGenerated) {
      cpu.requestIrq(Irq.Normal);
    }
  }

  function endOfSample() {
    if (playLengthCounter === 0 && playMode === MODE_LOOP) {
      // Start from beginning of sample:
      playAddress = playStartAddress;
      playLengthCounter = playLength;
    }

    if (playLengthCounter > 0) {
      // Fetch next sample:
      nextSample();

      if (playLengthCounter === 0) {
        // Last byte of sample fetched, generate IRQ:
        if (playMode === MODE_IRQ) {
          // Generate IRQ:
          irqGenerated = true;
        }
      }
    }
  }

  function nextSample() {
    // Fetch byte:
    data = mmap.load(playAddress);
    cpu.haltCycles(4);

    playLengthCounter--;
    playAddress++;
    if (playAddress > 0xffff) {
      playAddress = 0x8000;
    }

    hasSample = true;
  }

  function writeReg(address, value) {
    if (address === 0x4010) {
      // Play mode, DMA Frequency
      if (value >> 6 === 0) {
        playMode = MODE_NORMAL;
      } else if (((value >> 6) & 1) === 1) {
        playMode = MODE_LOOP;
      } else if (value >> 6 === 2) {
        playMode = MODE_IRQ;
      }

      if ((value & 0x80) === 0) {
        irqGenerated = false;
      }

      dmaFrequency = getDmcFrequency(value & 0xf);
    } else if (address === 0x4011) {
      // Delta counter load register:
      deltaCounter = (value >> 1) & 63;
      dacLsb = value & 1;
      sample = (deltaCounter << 1) + dacLsb; // update sample value
    } else if (address === 0x4012) {
      // DMA address load register
      playStartAddress = (value << 6) | 0x0c000;
      playAddress = playStartAddress;
      reg4012 = value;
    } else if (address === 0x4013) {
      // Length of play code
      playLength = (value << 4) + 1;
      playLengthCounter = playLength;
      reg4013 = value;
    } else if (address === 0x4015) {
      // DMC/IRQ Status
      if (((value >> 4) & 1) === 0) {
        // Disable:
        playLengthCounter = 0;
      } else {
        // Restart:
        playAddress = playStartAddress;
        playLengthCounter = playLength;
      }
      irqGenerated = false;
    }
  }

  function setEnabled(value) {
    if (!isEnabled && value) {
      playLengthCounter = playLength;
    }
    isEnabled = value;
  }

  function getLengthStatus() {
    return playLengthCounter === 0 || !isEnabled ? 0 : 1;
  }

  function getIrqStatus() {
    return irqGenerated ? 1 : 0;
  }

  return {
    reset,
    clockDmc,
    endOfSample,
    nextSample,
    writeReg,
    setEnabled,
    getLengthStatus,
    getIrqStatus,
  };
}

export default ChannelDM;
