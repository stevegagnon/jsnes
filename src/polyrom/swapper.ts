import * as cores from './cores';
import {
  cacheRoms,
  fetchRom,
  saveSnapshot,
  fetchSnapshot,
} from './storage';

type Options = {
  roms: string[],
  onFrame: cores.FrameCallback,
  onAudio: cores.AudioCallback,
};

export function swapper({ roms, onFrame, onAudio }: Options) {
  let core: cores.CoreControl;
  let loaded;
  let buttons = new Array(2);

  cacheRoms(roms);


  async function swap(rom: string) {
    if (loaded !== rom) {
      const [
        romData,
        snapshot,
      ] = await Promise.all([
        fetchRom(rom),
        fetchSnapshot(rom),
      ]);

      const newCore = await cores.tsnes({
        rom: romData,
        snapshot,
        onFrame,
        onAudio,
      });

      const oldSnapshot = core.createSnapshot();

      newCore.setButtons(buttons);

      core = newCore;

      const wasLoaded = loaded;

      loaded = rom;

      await saveSnapshot(wasLoaded, oldSnapshot);
    }
  }

  function swapRandom() {
    if (roms.length > 1) {
      let loading = Math.random() * roms.length - 1;
      if (roms[loading] === roms[loaded]) {
        loading = loading + 1;
        if (loading >= roms.length) {
          loading = 0;
        }
      }
      swap(roms[loading]);
    }
  }

  function buttonUp(button: cores.Button, controller: number) {
    buttons[controller][button] = true;

    if (core) {
      core.buttonUp(button, controller);
    }
  }

  function buttonDown(button: cores.Button, controller: number) {
    buttons[controller][button] = false;

    if (core) {
      core.buttonDown(button, controller);
    }
  }

  function clock() {
    if (core) {
      core.clock();
    }
  }

  return {
    swap,
    swapRandom,
    buttonUp,
    buttonDown,
    clock,
  };
}

export default swapper;
