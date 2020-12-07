

import mapper000 from './mapper000';
import { Irq } from '../cpu';

export function mapper001(nes) {
  let regBuffer = 0;
  let regBufferCounter = 0;

  // Register 0:
  let mirroring = 0;
  let oneScreenMirroring = 0;
  let prgSwitchingArea = 1;
  let prgSwitchingSize = 1;
  let vromSwitchingSize = 0;

  // Register 1:
  let romSelectionReg0 = 0;

  // Register 2:
  let romSelectionReg1 = 0;

  // Register 3:
  let romBankSelect = 0;

  // Returns the register number from the address written to:
  function getRegNumber(address) {
    if (address >= 0x8000 && address <= 0x9fff) {
      return 0;
    } else if (address >= 0xa000 && address <= 0xbfff) {
      return 1;
    } else if (address >= 0xc000 && address <= 0xdfff) {
      return 2;
    } else {
      return 3;
    }
  };

  function setReg(reg, value) {
    var tmp;

    switch (reg) {
      case 0:
        // Mirroring:
        tmp = value & 3;
        if (tmp !== this.mirroring) {
          // Set mirroring:
          this.mirroring = tmp;
          if ((this.mirroring & 2) === 0) {
            // SingleScreen mirroring overrides the other setting:
            this.nes.ppu.setMirroring(this.nes.rom.SINGLESCREEN_MIRRORING);
          } else if ((this.mirroring & 1) !== 0) {
            // Not overridden by SingleScreen mirroring.
            this.nes.ppu.setMirroring(this.nes.rom.HORIZONTAL_MIRRORING);
          } else {
            this.nes.ppu.setMirroring(this.nes.rom.VERTICAL_MIRRORING);
          }
        }

        // PRG Switching Area;
        this.prgSwitchingArea = (value >> 2) & 1;

        // PRG Switching Size:
        this.prgSwitchingSize = (value >> 3) & 1;

        // VROM Switching Size:
        this.vromSwitchingSize = (value >> 4) & 1;

        break;

      case 1:
        // ROM selection:
        this.romSelectionReg0 = (value >> 4) & 1;

        // Check whether the cart has VROM:
        if (this.nes.rom.vromCount > 0) {
          // Select VROM bank at 0x0000:
          if (this.vromSwitchingSize === 0) {
            // Swap 8kB VROM:
            if (this.romSelectionReg0 === 0) {
              this.load8kVromBank(value & 0xf, 0x0000);
            } else {
              this.load8kVromBank(
                Math.floor(this.nes.rom.vromCount / 2) + (value & 0xf),
                0x0000
              );
            }
          } else {
            // Swap 4kB VROM:
            if (this.romSelectionReg0 === 0) {
              this.loadVromBank(value & 0xf, 0x0000);
            } else {
              this.loadVromBank(
                Math.floor(this.nes.rom.vromCount / 2) + (value & 0xf),
                0x0000
              );
            }
          }
        }

        break;

      case 2:
        // ROM selection:
        this.romSelectionReg1 = (value >> 4) & 1;

        // Check whether the cart has VROM:
        if (this.nes.rom.vromCount > 0) {
          // Select VROM bank at 0x1000:
          if (this.vromSwitchingSize === 1) {
            // Swap 4kB of VROM:
            if (this.romSelectionReg1 === 0) {
              this.loadVromBank(value & 0xf, 0x1000);
            } else {
              this.loadVromBank(
                Math.floor(this.nes.rom.vromCount / 2) + (value & 0xf),
                0x1000
              );
            }
          }
        }
        break;

      default:
        // Select ROM bank:
        // -------------------------
        tmp = value & 0xf;
        var bank;
        var baseBank = 0;

        if (this.nes.rom.romCount >= 32) {
          // 1024 kB cart
          if (this.vromSwitchingSize === 0) {
            if (this.romSelectionReg0 === 1) {
              baseBank = 16;
            }
          } else {
            baseBank =
              (this.romSelectionReg0 | (this.romSelectionReg1 << 1)) << 3;
          }
        } else if (this.nes.rom.romCount >= 16) {
          // 512 kB cart
          if (this.romSelectionReg0 === 1) {
            baseBank = 8;
          }
        }

        if (this.prgSwitchingSize === 0) {
          // 32kB
          bank = baseBank + (value & 0xf);
          this.load32kRomBank(bank, 0x8000);
        } else {
          // 16kB
          bank = baseBank * 2 + (value & 0xf);
          if (this.prgSwitchingArea === 0) {
            mapper.loadRomBank(bank, 0xc000);
          } else {
            mapper.loadRomBank(bank, 0x8000);
          }
        }
    }
  }

  const mapper = mapper000(nes);
  return {
    ...mapper,
    reset() {
      mapper.reset();

      regBuffer = 0;
      regBufferCounter = 0;
      mirroring = 0;
      oneScreenMirroring = 0;
      prgSwitchingArea = 1;
      prgSwitchingSize = 1;
      vromSwitchingSize = 0;
      romSelectionReg0 = 0;
      romSelectionReg1 = 0;
      romBankSelect = 0;
    },
    write(address, value) {
      if (address < 0x8000) {
        mapper.write(address, value)
      } else {
        if ((value & 128) !== 0) {
          // Reset buffering:
          regBufferCounter = 0;
          regBuffer = 0;

          // Reset register:
          if (getRegNumber(address) === 0) {
            prgSwitchingArea = 1;
            prgSwitchingSize = 1;
          }
        } else {
          // Continue buffering:
          //regBuffer = (regBuffer & (0xFF-(1<<regBufferCounter))) | ((value & (1<<regBufferCounter))<<regBufferCounter);
          regBuffer =
            (regBuffer & (0xff - (1 << regBufferCounter))) |
            ((value & 1) << regBufferCounter);
          regBufferCounter++;

          if (this.regBufferCounter === 5) {
            // Use the buffered value:
            setReg(getRegNumber(address), this.regBuffer);

            // Reset buffer:
            regBuffer = 0;
            regBufferCounter = 0;
          }
        }
      }
    },
    loadROM() {
      if (!nes.rom.valid) {
        throw new Error("MMC1: Invalid ROM! Unable to load.");
      }
    
      // Load PRG-ROM:
      mapper.loadRomBank(0, 0x8000); //   First ROM bank..
      mapper.loadRomBank(this.nes.rom.romCount - 1, 0xc000); // ..and last ROM bank.
    
      // Load CHR-ROM:
      mapper.loadCHRROM();
    
      // Load Battery RAM (if present):
      mapper.loadBatteryRam();
    
      // Do Reset-Interrupt:
      nes.cpu.requestIrq(Irq.Reset);
    },
    switchLowHighPrgRom(oldSetting) {
      // not yet.
    },
    switch16to32() {
      // not yet.
    },
    switch32to16() {
      // not yet.
    },
    toJSON() {
      return {
        ...mapper.toJSON(),
        mirroring,
        oneScreenMirroring,
        prgSwitchingArea,
        prgSwitchingSize,
        vromSwitchingSize,
        romSelectionReg0,
        romSelectionReg1,
        romBankSelect,
        regBuffer,
        regBufferCounter,
      };
    },
    fromJSON(s) {
      mapper.fromJSON(s);
      [
        mirroring,
        oneScreenMirroring,
        prgSwitchingArea,
        prgSwitchingSize,
        vromSwitchingSize,
        romSelectionReg0,
        romSelectionReg1,
        romBankSelect,
        regBuffer,
        regBufferCounter,
      ] = s;
    }
  };
}

export default mapper001;
