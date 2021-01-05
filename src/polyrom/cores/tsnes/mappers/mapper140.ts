import mapper000 from './mapper000';
import { Irq } from '../cpu';

/**
 * Mapper 140
 *
 * @description http://wiki.nesdev.com/w/index.php/INES_Mapper_140
 * @example Bio Senshi Dan - Increaser Tono Tatakai
 * @constructor
 */

export function mapper140(nes, opts) {
  const mapper = mapper000(nes, opts);
  return {
    ...mapper,
    write(address, value) {
      if (address < 0x6000 || address > 0x7fff) {
        mapper.write(address, value);
      } else {
        // Swap in the given PRG-ROM bank at 0x8000:
        mapper.load32kRomBank((value >> 4) & 3, 0x8000);

        // Swap in the given VROM bank at 0x0000:
        mapper.load8kVromBank((value & 0xf) * 2, 0x0000);
      }
    }
  };
}

export default mapper140;
