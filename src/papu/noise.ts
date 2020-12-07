
export function ChannelNoise({ getLengthMax, getNoiseWaveLength }) {
  let isEnabled = null;
  let envDecayDisable = null;
  let envDecayLoopEnable = null;
  let lengthCounterEnable = null;
  let envReset = null;
  let shiftNow = null;

  let lengthCounter = null;
  let progTimerCount = null;
  let progTimerMax = null;
  let envDecayRate = null;
  let envDecayCounter = null;
  let envVolume = null;
  let masterVolume = null;
  let shiftReg = 1 << 14;
  let randomBit = null;
  let randomMode = null;
  let sampleValue = null;
  let accValue = 0;
  let accCount = 1;
  let tmp = null;

  function reset() {
    progTimerCount = 0;
    progTimerMax = 0;
    isEnabled = false;
    lengthCounter = 0;
    lengthCounterEnable = false;
    envDecayDisable = false;
    envDecayLoopEnable = false;
    shiftNow = false;
    envDecayRate = 0;
    envDecayCounter = 0;
    envVolume = 0;
    masterVolume = 0;
    shiftReg = 1;
    randomBit = 0;
    randomMode = 0;
    sampleValue = 0;
    tmp = 0;
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

  function updateSampleValue() {
    if (isEnabled && lengthCounter > 0) {
      sampleValue = randomBit * masterVolume;
    }
  }

  function writeReg(address, value) {
    if (address === 0x400c) {
      // Volume/Envelope decay:
      envDecayDisable = (value & 0x10) !== 0;
      envDecayRate = value & 0xf;
      envDecayLoopEnable = (value & 0x20) !== 0;
      lengthCounterEnable = (value & 0x20) === 0;
      if (envDecayDisable) {
        masterVolume = envDecayRate;
      } else {
        masterVolume = envVolume;
      }
    } else if (address === 0x400e) {
      // Programmable timer:
      progTimerMax = getNoiseWaveLength(value & 0xf);
      randomMode = value >> 7;
    } else if (address === 0x400f) {
      // Length counter
      lengthCounter = getLengthMax(value & 248);
      envReset = true;
    }
    // Update:
    //updateSampleValue();
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

  return {
    reset,
    clockLengthCounter,
    clockEnvDecay,
    updateSampleValue,
    writeReg,
    setEnabled,
    getLengthStatus,
  };
}

export default ChannelNoise;
