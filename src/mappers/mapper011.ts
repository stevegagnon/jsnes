import mapper000 from './mapper000';

/**
 * Mapper 011 (Color Dreams)
 *
 * @description http://wiki.nesdev.com/w/index.php/Color_Dreams
 * @example Crystal Mines, Metal Fighter
 * @constructor
 */

export function mapper011(nes) {
  const mapper = mapper000(nes);
  return {
    ...mapper,
    write(address, value) {
      if (address < 0x8000) {
        mapper.write(address, value)
      } else {
        // Swap in the given PRG-ROM bank:
        var prgbank1 = ((value & 0xf) * 2) % nes.rom.romCount;
        var prgbank2 = ((value & 0xf) * 2 + 1) % nes.rom.romCount;
    
        mapper.loadRomBank(prgbank1, 0x8000);
        mapper.loadRomBank(prgbank2, 0xc000);
    
        if (nes.rom.vromCount > 0) {
          // Swap in the given VROM bank at 0x0000:
          var bank = ((value >> 4) * 2) % nes.rom.vromCount;
          mapper.loadVromBank(bank, 0x0000);
          mapper.loadVromBank(bank + 1, 0x1000);
        }
      }
    }
  };
}

export default mapper011;
