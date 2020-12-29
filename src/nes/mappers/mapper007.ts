import mapper000 from './mapper000';
import { Irq } from '../cpu';
import { RomFlags } from '../rom';

/**
 * Mapper007 (AxROM)
 * @example Battletoads, Time Lord, Marble Madness
 * @description http://wiki.nesdev.com/w/index.php/INES_Mapper_007
 * @constructor
 */

export function mapper007(nes) {
  const mapper = mapper000(nes);
  return {
    ...mapper,
    write(address, value) {
      if (address < 0x8000) {
        mapper.write(address, value);
      } else {
        mapper.load32kRomBank(value & 0x7, 0x8000);
        if (value & 0x10) {
          nes.ppu.setMirroring(RomFlags.SINGLESCREEN_MIRRORING2);
        } else {
          nes.ppu.setMirroring(RomFlags.SINGLESCREEN_MIRRORING);
        }
      }
    },
    loadROM() {
      if (!nes.rom.isValid()) {
        throw new Error("AOROM: Invalid ROM! Unable to load.");
      }

      // Load PRG-ROM:
      mapper.loadPRGROM();

      // Load CHR-ROM:
      mapper.loadCHRROM();

      // Do Reset-Interrupt:
      nes.cpu.requestIrq(Irq.Reset);
    }
  };
}

export default mapper007;
