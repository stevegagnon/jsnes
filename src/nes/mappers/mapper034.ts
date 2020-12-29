
import mapper000 from './mapper000';

/**
 * Mapper 034 (BNROM, NINA-01)
 *
 * @description http://wiki.nesdev.com/w/index.php/INES_Mapper_034
 * @example Darkseed, Mashou, Mission Impossible 2
 */

export function mapper034(nes) {
  const mapper = mapper000(nes);
  return {
    ...mapper,
    write(address, value) {
      if (address < 0x8000) {
        mapper.write(address, value);
      } else {
        mapper.load32kRomBank(value, 0x8000);
      }
    }
  };
}

export default mapper034;
