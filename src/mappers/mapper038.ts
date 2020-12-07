import mapper000 from './mapper000';
import { Irq } from '../cpu';

/**
 * Mapper 038
 *
 * @description http://wiki.nesdev.com/w/index.php/INES_Mapper_038
 * @example Crime Busters
 * @constructor
 */

export function mapper038(nes) {
  const mapper = mapper000(nes);
  return {
    ...mapper,
    write(address, value) {
      if (address < 0x7000 || address > 0x7fff) {
        mapper.write(address, value);
      } else {
        // Swap in the given PRG-ROM bank at 0x8000:
        mapper.load32kRomBank(value & 3, 0x8000);

        // Swap in the given VROM bank at 0x0000:
        mapper.load8kVromBank(((value >> 2) & 3) * 2, 0x0000);
      }
    }
  };
}

export default mapper038;
