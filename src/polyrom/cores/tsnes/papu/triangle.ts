
export function ChannelTriangle({ getLengthMax }) {
  let isEnabled = null;
  let sampleCondition = null;
  let lengthCounterEnable = null;
  let lcHalt = null;
  let lcControl = null;

  let progTimerCount = null;
  let progTimerMax = null;
  let triangleCounter = null;
  let lengthCounter = null;
  let linearCounter = null;
  let lcLoadValue = null;
  let sampleValue = null;
  let tmp = null;

  function reset() {
    progTimerCount = 0;
    progTimerMax = 0;
    triangleCounter = 0;
    isEnabled = false;
    sampleCondition = false;
    lengthCounter = 0;
    lengthCounterEnable = false;
    linearCounter = 0;
    lcLoadValue = 0;
    lcHalt = true;
    lcControl = false;
    tmp = 0;
    sampleValue = 0xf;
  }

  function clockLengthCounter() {
    if (lengthCounterEnable && lengthCounter > 0) {
      lengthCounter--;
      if (lengthCounter === 0) {
        updateSampleCondition();
      }
    }
  }

  function clockLinearCounter() {
    if (lcHalt) {
      // Load:
      linearCounter = lcLoadValue;
      updateSampleCondition();
    } else if (linearCounter > 0) {
      // Decrement:
      linearCounter--;
      updateSampleCondition();
    }
    if (!lcControl) {
      // Clear halt flag:
      lcHalt = false;
    }
  }

  function getLengthStatus() {
    return lengthCounter === 0 || !isEnabled ? 0 : 1;
  }

  // eslint-disable-next-line no-unused-vars
  function readReg(address) {
    return 0;
  }

  function writeReg(address, value) {
    if (address === 0x4008) {
      // New values for linear counter:
      lcControl = (value & 0x80) !== 0;
      lcLoadValue = value & 0x7f;

      // Length counter enable:
      lengthCounterEnable = !lcControl;
    } else if (address === 0x400a) {
      // Programmable timer:
      progTimerMax &= 0x700;
      progTimerMax |= value;
    } else if (address === 0x400b) {
      // Programmable timer, length counter
      progTimerMax &= 0xff;
      progTimerMax |= (value & 0x07) << 8;
      lengthCounter = getLengthMax(value & 0xf8);
      lcHalt = true;
    }

    updateSampleCondition();
  }

  function clockProgrammableTimer(nCycles) {
    if (progTimerMax > 0) {
      progTimerCount += nCycles;
      while (
        progTimerMax > 0 &&
        progTimerCount >= progTimerMax
      ) {
        progTimerCount -= progTimerMax;
        if (
          isEnabled &&
          lengthCounter > 0 &&
          linearCounter > 0
        ) {
          clockTriangleGenerator();
        }
      }
    }
  }

  function clockTriangleGenerator() {
    triangleCounter++;
    triangleCounter &= 0x1f;
  }

  function setEnabled(value) {
    isEnabled = value;
    if (!value) {
      lengthCounter = 0;
    }
    updateSampleCondition();
  }

  function updateSampleCondition() {
    sampleCondition =
      isEnabled &&
      progTimerMax > 7 &&
      linearCounter > 0 &&
      lengthCounter > 0;
  }

  function accSample(cycles, triValue) {
    if (sampleCondition) {
      triValue = Math.floor(
        (progTimerCount << 4) / (progTimerMax + 1)
      );
      if (triValue > 16) {
        triValue = 16;
      }
      if (triangleCounter >= 16) {
        triValue = 16 - triValue;
      }

      // Add non-interpolated sample value:
      triValue += sampleValue;
    }

    return triValue;
  }

  function clock(nCycles) {
    if (progTimerMax > 0) {
      progTimerCount -= nCycles;
      while (progTimerCount <= 0) {
        progTimerCount += progTimerMax + 1;
        if (linearCounter > 0 && lengthCounter > 0) {
          triangleCounter++;
          triangleCounter &= 0x1f;

          if (isEnabled) {
            if (triangleCounter >= 0x10) {
              // Normal value.
              sampleValue = triangleCounter & 0xf;
            } else {
              // Inverted value.
              sampleValue = 0xf - (triangleCounter & 0xf);
            }
            sampleValue <<= 4;
          }
        }
      }
    }
  }

  return {
    reset,
    clockLengthCounter,
    clockLinearCounter,
    getLengthStatus,
    readReg,
    writeReg,
    clockProgrammableTimer,
    clockTriangleGenerator,
    setEnabled,
    updateSampleCondition,
    accSample,
    getSampleValue: () => sampleValue,
    clock
  };
}

export default ChannelTriangle;
