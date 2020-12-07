
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
    if (this.lengthCounterEnable && this.lengthCounter > 0) {
      this.lengthCounter--;
      if (this.lengthCounter === 0) {
        this.updateSampleCondition();
      }
    }
  }

  function clockLinearCounter() {
    if (this.lcHalt) {
      // Load:
      this.linearCounter = this.lcLoadValue;
      this.updateSampleCondition();
    } else if (this.linearCounter > 0) {
      // Decrement:
      this.linearCounter--;
      this.updateSampleCondition();
    }
    if (!this.lcControl) {
      // Clear halt flag:
      this.lcHalt = false;
    }
  }

  function getLengthStatus() {
    return this.lengthCounter === 0 || !this.isEnabled ? 0 : 1;
  }

  // eslint-disable-next-line no-unused-vars
  function readReg(address) {
    return 0;
  }

  function writeReg(address, value) {
    if (address === 0x4008) {
      // New values for linear counter:
      this.lcControl = (value & 0x80) !== 0;
      this.lcLoadValue = value & 0x7f;

      // Length counter enable:
      this.lengthCounterEnable = !this.lcControl;
    } else if (address === 0x400a) {
      // Programmable timer:
      this.progTimerMax &= 0x700;
      this.progTimerMax |= value;
    } else if (address === 0x400b) {
      // Programmable timer, length counter
      this.progTimerMax &= 0xff;
      this.progTimerMax |= (value & 0x07) << 8;
      this.lengthCounter = this.getLengthMax(value & 0xf8);
      this.lcHalt = true;
    }

    this.updateSampleCondition();
  }

  function clockProgrammableTimer(nCycles) {
    if (this.progTimerMax > 0) {
      this.progTimerCount += nCycles;
      while (
        this.progTimerMax > 0 &&
        this.progTimerCount >= this.progTimerMax
      ) {
        this.progTimerCount -= this.progTimerMax;
        if (
          this.isEnabled &&
          this.lengthCounter > 0 &&
          this.linearCounter > 0
        ) {
          this.clockTriangleGenerator();
        }
      }
    }
  }

  function clockTriangleGenerator() {
    this.triangleCounter++;
    this.triangleCounter &= 0x1f;
  }

  function setEnabled(value) {
    this.isEnabled = value;
    if (!value) {
      this.lengthCounter = 0;
    }
    this.updateSampleCondition();
  }

  function updateSampleCondition() {
    this.sampleCondition =
      this.isEnabled &&
      this.progTimerMax > 7 &&
      this.linearCounter > 0 &&
      this.lengthCounter > 0;
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
    updateSampleCondition
  };
}

export default ChannelTriangle;
