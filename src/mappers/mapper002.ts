import mapper000 from './mapper000';
import { Irq } from '../cpu';

export function mapper002(nes) {
  const mapper = mapper000(nes);
  return {
    ...mapper,
    write(address, value) {
      if (address < 0x8000) {
        mapper.write(address, value);
      } else {
        mapper.loadRomBank(value, 0x8000);
      }
    },
    loadROM() {
      if (!nes.rom.valid) {
        throw new Error("UNROM: Invalid ROM! Unable to load.");
      }
    
      // Load PRG-ROM:
      mapper.loadRomBank(0, 0x8000);
      mapper.loadRomBank(nes.rom.romCount - 1, 0xc000);
    
      // Load CHR-ROM:
      mapper.loadCHRROM();
    
      // Do Reset-Interrupt:
      nes.cpu.requestIrq(Irq.Reset);
    }
  };
}

export default mapper002;
