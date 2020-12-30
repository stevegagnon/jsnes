
export function ChannelSquare({ getLengthMax }, sqr1) {
  // prettier-ignore
  let dutyLookup = [
    0, 1, 0, 0, 0, 0, 0, 0,
    0, 1, 1, 0, 0, 0, 0, 0,
    0, 1, 1, 1, 1, 0, 0, 0,
    1, 0, 0, 1, 1, 1, 1, 1
  ];
  // prettier-ignore
  let impLookup = [
    1, -1, 0, 0, 0, 0, 0, 0,
    1, 0, -1, 0, 0, 0, 0, 0,
    1, 0, 0, 0, -1, 0, 0, 0,
    -1, 0, 1, 0, 0, 0, 0, 0
  ];

  let isEnabled = null;
  let lengthCounterEnable = null;
  let sweepActive = null;
  let envDecayDisable = null;
  let envDecayLoopEnable = null;
  let envReset = null;
  let sweepCarry = null;
  let updateSweepPeriod = null;

  let progTimerCount = null;
  let progTimerMax = null;
  let lengthCounter = null;
  let squareCounter = null;
  let sweepCounter = null;
  let sweepCounterMax = null;
  let sweepMode = null;
  let sweepShiftAmount = null;
  let envDecayRate = null;
  let envDecayCounter = null;
  let envVolume = null;
  let masterVolume = null;
  let dutyMode = null;
  let sweepResult = null;
  let sampleValue = null;
  let vol = null;

  function reset() {
    progTimerCount = 0;
    progTimerMax = 0;
    lengthCounter = 0;
    squareCounter = 0;
    sweepCounter = 0;
    sweepCounterMax = 0;
    sweepMode = 0;
    sweepShiftAmount = 0;
    envDecayRate = 0;
    envDecayCounter = 0;
    envVolume = 0;
    masterVolume = 0;
    dutyMode = 0;
    vol = 0;
    isEnabled = false;
    lengthCounterEnable = false;
    sweepActive = false;
    sweepCarry = false;
    envDecayDisable = false;
    envDecayLoopEnable = false;
  }

  function clockLengthCounter() {
    if (lengthCounterEnable && lengthCounter > 0) {
      lengthCounter--;
      if (lengthCounter === 0) {
        updateSampleValue();
      }
    }
  }

  function clockEnvDecay() {
    if (envReset) {
      // Reset envelope:
      envReset = false;
      envDecayCounter = envDecayRate + 1;
      envVolume = 0xf;
    } else if (--envDecayCounter <= 0) {
      // Normal handling:
      envDecayCounter = envDecayRate + 1;
      if (envVolume > 0) {
        envVolume--;
      } else {
        envVolume = envDecayLoopEnable ? 0xf : 0;
      }
    }

    if (envDecayDisable) {
      masterVolume = envDecayRate;
    } else {
      masterVolume = envVolume;
    }
    updateSampleValue();
  }

  function clockSweep() {
    if (--sweepCounter <= 0) {
      sweepCounter = sweepCounterMax + 1;
      if (
        sweepActive &&
        sweepShiftAmount > 0 &&
        progTimerMax > 7
      ) {
        // Calculate result from shifter:
        sweepCarry = false;
        if (sweepMode === 0) {
          progTimerMax += progTimerMax >> sweepShiftAmount;
          if (progTimerMax > 4095) {
            progTimerMax = 4095;
            sweepCarry = true;
          }
        } else {
          progTimerMax =
            progTimerMax -
            ((progTimerMax >> sweepShiftAmount) -
              (sqr1 ? 1 : 0));
        }
      }
    }

    if (updateSweepPeriod) {
      updateSweepPeriod = false;
      sweepCounter = sweepCounterMax + 1;
    }
  }

  function updateSampleValue() {
    if (isEnabled && lengthCounter > 0 && progTimerMax > 7) {
      if (
        sweepMode === 0 &&
        progTimerMax + (progTimerMax >> sweepShiftAmount) > 4095
      ) {
        //if (sweepCarry) {
        sampleValue = 0;
      } else {
        sampleValue =
          masterVolume *
          dutyLookup[(dutyMode << 3) + squareCounter];
      }
    } else {
      sampleValue = 0;
    }
  }

  function writeReg(address, value) {
    var addrAdd = sqr1 ? 0 : 4;
    if (address === 0x4000 + addrAdd) {
      // Volume/Envelope decay:
      envDecayDisable = (value & 0x10) !== 0;
      envDecayRate = value & 0xf;
      envDecayLoopEnable = (value & 0x20) !== 0;
      dutyMode = (value >> 6) & 0x3;
      lengthCounterEnable = (value & 0x20) === 0;
      if (envDecayDisable) {
        masterVolume = envDecayRate;
      } else {
        masterVolume = envVolume;
      }
      updateSampleValue();
    } else if (address === 0x4001 + addrAdd) {
      // Sweep:
      sweepActive = (value & 0x80) !== 0;
      sweepCounterMax = (value >> 4) & 7;
      sweepMode = (value >> 3) & 1;
      sweepShiftAmount = value & 7;
      updateSweepPeriod = true;
    } else if (address === 0x4002 + addrAdd) {
      // Programmable timer:
      progTimerMax &= 0x700;
      progTimerMax |= value;
    } else if (address === 0x4003 + addrAdd) {
      // Programmable timer, length counter
      progTimerMax &= 0xff;
      progTimerMax |= (value & 0x7) << 8;

      if (isEnabled) {
        lengthCounter = getLengthMax(value & 0xf8);
      }

      envReset = true;
    }
  }

  function setEnabled(value) {
    isEnabled = value;
    if (!value) {
      lengthCounter = 0;
    }
    updateSampleValue();
  }

  function getLengthStatus() {
    return lengthCounter === 0 || !isEnabled ? 0 : 1;
  }

  function clock(nCycles) {
    progTimerCount -= nCycles;
    if (progTimerCount <= 0) {
      progTimerCount += (progTimerMax + 1) << 1;

      squareCounter++;
      squareCounter &= 0x7;
      updateSampleValue();
    }
  }

  return {
    reset,
    clockLengthCounter,
    updateSampleValue,
    getLengthStatus,
    clockSweep,
    writeReg,
    clockEnvDecay,
    setEnabled,
    getSampleValue: () => sampleValue,
    clock
  };
}

export default ChannelSquare;
