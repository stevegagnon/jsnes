import { Core } from '../index';
import NES from './nes';

const core: Core = async (opts) => {
  const nes = NES({
    onFrame: opts.onFrame,
    onAudioSample: opts.onAudio,
  });

  
  if (opts.snapshot) {
    nes.fromJSON(opts.snapshot);
  }

  return {
    createSnapshot: () => nes.toJSON(),
    buttonUp: (button, controller = 1) => nes.buttonUp(controller, button),
    buttonDown: (button, controller = 1) => nes.buttonDown(controller, button),
    clock: () => nes.frame(),
    setButtons(controllers) {
      nes.resetButtons();
      for (const {controller, buttonsDown} of controllers) {
        for (const button of buttonsDown) {
          nes.buttonDown(controller, button);
        }
      }
    }
  };
}

export default core;
