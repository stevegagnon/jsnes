import mapper000 from './mapper000';
import { Irq } from '../cpu';

/**
 * Mapper 180
 *
 * @description http://wiki.nesdev.com/w/index.php/INES_Mapper_180
 * @example Crazy Climber
 * @constructor
 */

export function mapper180(nes, opts) {
  const mapper = mapper000(nes, opts);
  return {
    ...mapper,
    write(address, value) {
      // Writes to addresses other than MMC registers are handled by NoMapper.
      if (address < 0x8000) {
        mapper.write(address, value);
      } else {
        // This is a ROM bank select command.
        // Swap in the given ROM bank at 0xc000:
        mapper.loadRomBank(value, 0xc000);
      }
    },
    loadROM() {
      if (!nes.rom.isValid()) {
        throw new Error("Mapper 180: Invalid ROM! Unable to load.");
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

export default mapper180;
