import mapper000 from './mapper000';
import { Irq } from '../cpu';

/**
 * Mapper 094 (UN1ROM)
 *
 * @description http://wiki.nesdev.com/w/index.php/INES_Mapper_094
 * @example Senjou no Ookami
 * @constructor
 */

export function mapper094(nes, opts) {
  const mapper = mapper000(nes, opts);
  return {
    ...mapper,
    write(address, value) {
      if (address < 0x8000) {
        mapper.write(address, value);
      } else {
        // This is a ROM bank select command.
        // Swap in the given ROM bank at 0x8000:
        mapper.loadRomBank(value >> 2, 0x8000);
      }
    },
    loadROM() {
      if (!nes.rom.isValid()) {
        throw new Error("UN1ROM: Invalid ROM! Unable to load.");
      }

      // Load PRG-ROM:
      mapper.loadRomBank(0, 0x8000);
      mapper.loadRomBank(nes.rom.getRomCount() - 1, 0xc000);

      // Load CHR-ROM:
      mapper.loadCHRROM();

      // Do Reset-Interrupt:
      nes.cpu.requestIrq(Irq.Reset);
    }
  };
}

export default mapper094;
