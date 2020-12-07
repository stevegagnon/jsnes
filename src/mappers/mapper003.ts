import mapper000 from './mapper000';
import { Irq } from '../cpu';

/**
 * Mapper 003 (CNROM)
 *
 * @constructor
 * @example Solomon's Key, Arkanoid, Arkista's Ring, Bump 'n' Jump, Cybernoid
 * @description http://wiki.nesdev.com/w/index.php/INES_Mapper_003
 */

export function mapper003(nes) {
  const mapper = mapper000(nes);
  return {
    ...mapper,
    write(address, value) {
      if (address < 0x8000) {
        mapper.write(address, value);
        return;
      } else {
        // This is a ROM bank select command.
        // Swap in the given ROM bank at 0x8000:
        // This is a VROM bank select command.
        // Swap in the given VROM bank at 0x0000:
        var bank = (value % (this.nes.rom.vromCount / 2)) * 2;
        mapper.loadVromBank(bank, 0x0000);
        mapper.loadVromBank(bank + 1, 0x1000);
        mapper.load8kVromBank(value * 2, 0x0000);
      }
    }
  };
}

export default mapper003;
