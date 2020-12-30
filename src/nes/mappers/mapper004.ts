import mapper000 from './mapper000';
import { Irq } from '../cpu';

export function mapper004(nes, opts) {
  const mapper = mapper000(nes, opts);

  let CMD_SEL_2_1K_VROM_0000 = 0;
  let CMD_SEL_2_1K_VROM_0800 = 1;
  let CMD_SEL_1K_VROM_1000 = 2;
  let CMD_SEL_1K_VROM_1400 = 3;
  let CMD_SEL_1K_VROM_1800 = 4;
  let CMD_SEL_1K_VROM_1C00 = 5;
  let CMD_SEL_ROM_PAGE1 = 6;
  let CMD_SEL_ROM_PAGE2 = 7;
  let command = null;
  let prgAddressSelect = null;
  let chrAddressSelect = null;
  let pageNumber = null;
  let irqCounter = null;
  let irqLatchValue = null;
  let irqEnable = null;
  let prgAddressChanged = false;

  function executeCommand(cmd, arg) {
    switch (cmd) {
      case CMD_SEL_2_1K_VROM_0000:
        // Select 2 1KB VROM pages at 0x0000:
        if (chrAddressSelect === 0) {
          mapper.load1kVromBank(arg, 0x0000);
          mapper.load1kVromBank(arg + 1, 0x0400);
        } else {
          mapper.load1kVromBank(arg, 0x1000);
          mapper.load1kVromBank(arg + 1, 0x1400);
        }
        break;

      case CMD_SEL_2_1K_VROM_0800:
        // Select 2 1KB VROM pages at 0x0800:
        if (chrAddressSelect === 0) {
          mapper.load1kVromBank(arg, 0x0800);
          mapper.load1kVromBank(arg + 1, 0x0c00);
        } else {
          mapper.load1kVromBank(arg, 0x1800);
          mapper.load1kVromBank(arg + 1, 0x1c00);
        }
        break;

      case CMD_SEL_1K_VROM_1000:
        // Select 1K VROM Page at 0x1000:
        if (chrAddressSelect === 0) {
          mapper.load1kVromBank(arg, 0x1000);
        } else {
          mapper.load1kVromBank(arg, 0x0000);
        }
        break;

      case CMD_SEL_1K_VROM_1400:
        // Select 1K VROM Page at 0x1400:
        if (chrAddressSelect === 0) {
          mapper.load1kVromBank(arg, 0x1400);
        } else {
          mapper.load1kVromBank(arg, 0x0400);
        }
        break;

      case CMD_SEL_1K_VROM_1800:
        // Select 1K VROM Page at 0x1800:
        if (chrAddressSelect === 0) {
          mapper.load1kVromBank(arg, 0x1800);
        } else {
          mapper.load1kVromBank(arg, 0x0800);
        }
        break;

      case CMD_SEL_1K_VROM_1C00:
        // Select 1K VROM Page at 0x1C00:
        if (chrAddressSelect === 0) {
          mapper.load1kVromBank(arg, 0x1c00);
        } else {
          mapper.load1kVromBank(arg, 0x0c00);
        }
        break;

      case CMD_SEL_ROM_PAGE1:
        if (prgAddressChanged) {
          // Load the two hardwired banks:
          if (prgAddressSelect === 0) {
            mapper.load8kRomBank((nes.rom.getRomCount() - 1) * 2, 0xc000);
          } else {
            mapper.load8kRomBank((nes.rom.getRomCount() - 1) * 2, 0x8000);
          }
          prgAddressChanged = false;
        }

        // Select first switchable ROM page:
        if (prgAddressSelect === 0) {
          mapper.load8kRomBank(arg, 0x8000);
        } else {
          mapper.load8kRomBank(arg, 0xc000);
        }
        break;

      case CMD_SEL_ROM_PAGE2:
        // Select second switchable ROM page:
        mapper.load8kRomBank(arg, 0xa000);

        // hardwire appropriate bank:
        if (prgAddressChanged) {
          // Load the two hardwired banks:
          if (prgAddressSelect === 0) {
            mapper.load8kRomBank((nes.rom.getRomCount() - 1) * 2, 0xc000);
          } else {
            mapper.load8kRomBank((nes.rom.getRomCount() - 1) * 2, 0x8000);
          }
          prgAddressChanged = false;
        }
    }
  }


  return {
    ...mapper,
    write(address, value) {
      // Writes to addresses other than MMC registers are handled by NoMapper.
      if (address < 0x8000) {
        mapper.write(address, value);
      } else {
        switch (address) {
          case 0x8000:
            // Command/Address Select register
            command = value & 7;
            var tmp = (value >> 6) & 1;
            if (tmp !== prgAddressSelect) {
              prgAddressChanged = true;
            }
            prgAddressSelect = tmp;
            chrAddressSelect = (value >> 7) & 1;
            break;

          case 0x8001:
            // Page number for command
            executeCommand(command, value);
            break;

          case 0xa000:
            // Mirroring select
            if ((value & 1) !== 0) {
              nes.ppu.setMirroring(nes.rom.HORIZONTAL_MIRRORING);
            } else {
              nes.ppu.setMirroring(nes.rom.VERTICAL_MIRRORING);
            }
            break;

          case 0xa001:
            // SaveRAM Toggle
            // TODO
            //nes.getRom().setSaveState((value&1)!=0);
            break;

          case 0xc000:
            // IRQ Counter register
            irqCounter = value;
            //nes.ppu.mapperIrqCounter = 0;
            break;

          case 0xc001:
            // IRQ Latch register
            irqLatchValue = value;
            break;

          case 0xe000:
            // IRQ Control Reg 0 (disable)
            //irqCounter = irqLatchValue;
            irqEnable = 0;
            break;

          case 0xe001:
            // IRQ Control Reg 1 (enable)
            irqEnable = 1;
            break;

          default:
          // Not a MMC3 register.
          // The game has probably crashed,
          // since it tries to write to ROM..
          // IGNORE.
        }
      }
    },
    loadROM() {
      if (!nes.rom.isValid()) {
        throw new Error("MMC3: Invalid ROM! Unable to load.");
      }

      // Load hardwired PRG banks (0xC000 and 0xE000):
      mapper.load8kRomBank((nes.rom.getRomCount() - 1) * 2, 0xc000);
      mapper.load8kRomBank((nes.rom.getRomCount() - 1) * 2 + 1, 0xe000);

      // Load swappable PRG banks (0x8000 and 0xA000):
      mapper.load8kRomBank(0, 0x8000);
      mapper.load8kRomBank(1, 0xa000);

      // Load CHR-ROM:
      mapper.loadCHRROM();

      // Load Battery RAM (if present):
      mapper.loadBatteryRam();

      // Do Reset-Interrupt:
      nes.cpu.requestIrq(Irq.Reset);
    },
    clockIrqCounter() {
      if (irqEnable === 1) {
        irqCounter--;
        if (irqCounter < 0) {
          // Trigger IRQ:
          //nes.getCpu().doIrq();
          nes.cpu.requestIrq(Irq.Normal);
          irqCounter = irqLatchValue;
        }
      }
    },
    toJSON() {
      return {
        ...mapper.toJSON(),
        command,
        prgAddressSelect,
        chrAddressSelect,
        pageNumber,
        irqCounter,
        irqLatchValue,
        irqEnable,
        prgAddressChanged,
      };
    },
    fromJSON(s) {
      mapper.fromJSON(s);
      [
        command,
        prgAddressSelect,
        chrAddressSelect,
        pageNumber,
        irqCounter,
        irqLatchValue,
        irqEnable,
        prgAddressChanged,
      ] = s;
    }
  };
}

export default mapper004;
