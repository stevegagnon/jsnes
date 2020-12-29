
function copyArrayElements(src, srcPos, dest, destPos, length) {
  for (var i = 0; i < length; ++i) {
    dest[destPos + i] = src[srcPos + i];
  }
}

export function mapper00(nes) {
  let joy1StrobeState = 0;
  let joy2StrobeState = 0;
  let joypadLastWrite = 0;

  let zapperFired = false;
  let zapperX = null;
  let zapperY = null;

  function reset() {
    joy1StrobeState = 0;
    joy2StrobeState = 0;
    joypadLastWrite = 0;

    zapperFired = false;
    zapperX = null;
    zapperY = null;
  }

  function write(address, value) {
    if (address < 0x2000) {
      // Mirroring of RAM:
      nes.cpu.mem[address & 0x7ff] = value;
    } else if (address > 0x4017) {
      nes.cpu.mem[address] = value;
      if (address >= 0x6000 && address < 0x8000) {
        // Write to persistent RAM
        nes.onBatteryRamWrite(address, value);
      }
    } else if (address > 0x2007 && address < 0x4000) {
      regWrite(0x2000 + (address & 0x7), value);
    } else {
      regWrite(address, value);
    }
  }

  function writelow(address, value) {
    if (address < 0x2000) {
      // Mirroring of RAM:
      nes.cpu.mem[address & 0x7ff] = value;
    } else if (address > 0x4017) {
      nes.cpu.mem[address] = value;
    } else if (address > 0x2007 && address < 0x4000) {
      regWrite(0x2000 + (address & 0x7), value);
    } else {
      regWrite(address, value);
    }
  }

  function load(address) {
    // Wrap around:
    address &= 0xffff;

    // Check address range:
    if (address > 0x4017) {
      // ROM:
      return nes.cpu.mem[address];
    } else if (address >= 0x2000) {
      // I/O Ports.
      return regLoad(address);
    } else {
      // RAM (mirrored)
      return nes.cpu.mem[address & 0x7ff];
    }
  }


  function regLoad(address) {
    switch (
    address >> 12 // use fourth nibble (0xF000)
    ) {
      case 0:
        break;

      case 1:
        break;

      case 2:
      // Fall through to case 3
      case 3:
        // PPU Registers
        switch (address & 0x7) {
          case 0x0:
            // 0x2000:
            // PPU Control Register 1.
            // (the value is stored both
            // in main memory and in the
            // PPU as flags):
            // (not in the real NES)
            return nes.cpu.mem[0x2000];

          case 0x1:
            // 0x2001:
            // PPU Control Register 2.
            // (the value is stored both
            // in main memory and in the
            // PPU as flags):
            // (not in the real NES)
            return nes.cpu.mem[0x2001];

          case 0x2:
            // 0x2002:
            // PPU Status Register.
            // The value is stored in
            // main memory in addition
            // to as flags in the PPU.
            // (not in the real NES)
            return nes.ppu.readStatusRegister();

          case 0x3:
            return 0;

          case 0x4:
            // 0x2004:
            // Sprite Memory read.
            return nes.ppu.sramLoad();
          case 0x5:
            return 0;

          case 0x6:
            return 0;

          case 0x7:
            // 0x2007:
            // VRAM read:
            return nes.ppu.vramLoad();
        }
        break;
      case 4:
        // Sound+Joypad registers
        switch (address - 0x4015) {
          case 0:
            // 0x4015:
            // Sound channel enable, DMC Status
            return nes.papu.readReg(address);

          case 1:
            // 0x4016:
            // Joystick 1 + Strobe
            return joy1Read();

          case 2:
            // 0x4017:
            // Joystick 2 + Strobe
            // https://wiki.nesdev.com/w/index.php/Zapper
            var w;

            if (
              zapperX !== null &&
              zapperY !== null &&
              nes.ppu.isPixelWhite(zapperX, zapperY)
            ) {
              w = 0;
            } else {
              w = 0x1 << 3;
            }

            if (zapperFired) {
              w |= 0x1 << 4;
            }
            return (joy2Read() | w) & 0xffff;
        }
        break;
    }
    return 0;
  }


  function regWrite(address, value) {
    switch (address) {
      case 0x2000:
        // PPU Control register 1
        nes.cpu.mem[address] = value;
        nes.ppu.updateControlReg1(value);
        break;

      case 0x2001:
        // PPU Control register 2
        nes.cpu.mem[address] = value;
        nes.ppu.updateControlReg2(value);
        break;

      case 0x2003:
        // Set Sprite RAM address:
        nes.ppu.writeSRAMAddress(value);
        break;

      case 0x2004:
        // Write to Sprite RAM:
        nes.ppu.sramWrite(value);
        break;

      case 0x2005:
        // Screen Scroll offsets:
        nes.ppu.scrollWrite(value);
        break;

      case 0x2006:
        // Set VRAM address:
        nes.ppu.writeVRAMAddress(value);
        break;

      case 0x2007:
        // Write to VRAM:
        nes.ppu.vramWrite(value);
        break;

      case 0x4014:
        // Sprite Memory DMA Access
        nes.ppu.sramDMA(value);
        break;

      case 0x4015:
        // Sound Channel Switch, DMC Status
        nes.papu.writeReg(address, value);
        break;

      case 0x4016:
        // Joystick 1 + Strobe
        if ((value & 1) === 0 && (joypadLastWrite & 1) === 1) {
          joy1StrobeState = 0;
          joy2StrobeState = 0;
        }
        joypadLastWrite = value;
        break;

      case 0x4017:
        // Sound channel frame sequencer:
        nes.papu.writeReg(address, value);
        break;

      default:
        // Sound registers
        // console.log("write to sound reg");
        if (address >= 0x4000 && address <= 0x4017) {
          nes.papu.writeReg(address, value);
        }
    }
  }


  function joy1Read() {
    var ret;

    switch (joy1StrobeState) {
      case 0:
      case 1:
      case 2:
      case 3:
      case 4:
      case 5:
      case 6:
      case 7:
        ret = nes.controllers[1].state[joy1StrobeState];
        break;
      case 8:
      case 9:
      case 10:
      case 11:
      case 12:
      case 13:
      case 14:
      case 15:
      case 16:
      case 17:
      case 18:
        ret = 0;
        break;
      case 19:
        ret = 1;
        break;
      default:
        ret = 0;
    }

    joy1StrobeState++;
    if (joy1StrobeState === 24) {
      joy1StrobeState = 0;
    }

    return ret;
  }

  function joy2Read() {
    var ret;

    switch (joy2StrobeState) {
      case 0:
      case 1:
      case 2:
      case 3:
      case 4:
      case 5:
      case 6:
      case 7:
        ret = nes.controllers[2].state[joy2StrobeState];
        break;
      case 8:
      case 9:
      case 10:
      case 11:
      case 12:
      case 13:
      case 14:
      case 15:
      case 16:
      case 17:
      case 18:
        ret = 0;
        break;
      case 19:
        ret = 1;
        break;
      default:
        ret = 0;
    }

    joy2StrobeState++;
    if (joy2StrobeState === 24) {
      joy2StrobeState = 0;
    }

    return ret;
  }

  function loadROM() {
    if (!nes.rom.isValid() || nes.rom.getRomCount() < 1) {
      throw new Error("NoMapper: Invalid ROM! Unable to load.");
    }

    // Load ROM into memory:
    loadPRGROM();

    // Load CHR-ROM:
    loadCHRROM();

    // Load Battery RAM (if present):
    loadBatteryRam();

    // Reset IRQ:
    //nes.getCpu().doResetInterrupt();
    nes.cpu.requestIrq(nes.cpu.IRQ_RESET);
  }

  function loadPRGROM() {
    if (nes.rom.getRomCount() > 1) {
      // Load the two first banks into memory.
      loadRomBank(0, 0x8000);
      loadRomBank(1, 0xc000);
    } else {
      // Load the one bank into both memory locations:
      loadRomBank(0, 0x8000);
      loadRomBank(0, 0xc000);
    }
  }

  function loadCHRROM() {
    // console.log("Loading CHR ROM..");
    if (nes.rom.getVRomCount() > 0) {
      if (nes.rom.getVRomCount() === 1) {
        loadVromBank(0, 0x0000);
        loadVromBank(0, 0x1000);
      } else {
        loadVromBank(0, 0x0000);
        loadVromBank(1, 0x1000);
      }
    } else {
      //System.out.println("There aren't any CHR-ROM banks..");
    }
  }

  function loadBatteryRam() {
    if (nes.rom.getBatteryRom()) {
      var ram = nes.rom.getBatteryRom();
      if (ram !== null && ram.length === 0x2000) {
        // Load Battery RAM into memory:
        copyArrayElements(ram, 0, nes.cpu.mem, 0x6000, 0x2000);
      }
    }
  }

  function loadRomBank(bank, address) {
    // Loads a ROM bank into the specified address.
    bank %= nes.rom.getRomCount();
    //var data = nes.rom.getRom(bank);
    //cpuMem.write(address,data,data.length);
    copyArrayElements(
      nes.rom.getRom(bank),
      0,
      nes.cpu.mem,
      address,
      16384
    );
  }

  function loadVromBank(bank, address) {
    if (nes.rom.getVRomCount() === 0) {
      return;
    }
    nes.ppu.triggerRendering();

    copyArrayElements(
      nes.rom.getVRom(bank % nes.rom.getVRomCount()),
      0,
      nes.ppu.getVramMem(),
      address,
      4096
    );

    var vromTile = nes.rom.getVRomTile(bank % nes.rom.getVRomCount());
    copyArrayElements(
      vromTile,
      0,
      nes.ppu.getPtTile(),
      address >> 4,
      256
    );
  }

  function load32kRomBank(bank, address) {
    loadRomBank((bank * 2) % nes.rom.getRomCount(), address);
    loadRomBank((bank * 2 + 1) % nes.rom.getRomCount(), address + 16384);
  }

  function load8kVromBank(bank4kStart, address) {
    if (nes.rom.getVRomCount() === 0) {
      return;
    }
    nes.ppu.triggerRendering();

    loadVromBank(bank4kStart % nes.rom.getVRomCount(), address);
    loadVromBank(
      (bank4kStart + 1) % nes.rom.getVRomCount(),
      address + 4096
    );
  }

  function load1kVromBank(bank1k, address) {
    if (nes.rom.getVRomCount() === 0) {
      return;
    }
    nes.ppu.triggerRendering();

    var bank4k = Math.floor(bank1k / 4) % nes.rom.getVRomCount();
    var bankoffset = (bank1k % 4) * 1024;
    copyArrayElements(
      nes.rom.getVRom(bank4k),
      bankoffset,
      nes.ppu.getVramMem(),
      address,
      1024
    );

    // Update tiles:
    var vromTile = nes.rom.getVRomTile(bank4k);
    var baseIndex = address >> 4;
    for (var i = 0; i < 64; i++) {
      nes.ppu.getPtTile()[baseIndex + i] = vromTile[(bank1k % 4 << 6) + i];
    }
  }

  function load2kVromBank(bank2k, address) {
    if (nes.rom.getVRomCount() === 0) {
      return;
    }
    nes.ppu.triggerRendering();

    var bank4k = Math.floor(bank2k / 2) % nes.rom.getVRomCount();
    var bankoffset = (bank2k % 2) * 2048;
    copyArrayElements(
      nes.rom.getVRom(bank4k),
      bankoffset,
      nes.ppu.getVramMem(),
      address,
      2048
    );

    // Update tiles:
    var vromTile = nes.rom.getVRomTile(bank4k);
    var baseIndex = address >> 4;
    for (var i = 0; i < 128; i++) {
      nes.ppu.getPtTile()[baseIndex + i] = vromTile[(bank2k % 2 << 7) + i];
    }
  }

  function load8kRomBank (bank8k, address) {
    var bank16k = Math.floor(bank8k / 2) % nes.rom.getRomCount();
    var offset = (bank8k % 2) * 8192;

    //nes.cpu.mem.write(address,nes.rom.getRom(bank16k),offset,8192);
    copyArrayElements(
      nes.rom.getRom(bank16k),
      offset,
      nes.cpu.mem,
      address,
      8192
    );
  }

  function clockIrqCounter() {
    // Does nothing. This is used by the MMC3 mapper.
  }

  // eslint-disable-next-line no-unused-vars
  function latchAccess(address) {
    // Does nothing. This is used by MMC2.
  }

  function toJSON() {
    return {
      joy1StrobeState: joy1StrobeState,
      joy2StrobeState: joy2StrobeState,
      joypadLastWrite: joypadLastWrite,
    };
  }

  function fromJSON(s) {
    joy1StrobeState = s.joy1StrobeState;
    joy2StrobeState = s.joy2StrobeState;
    joypadLastWrite = s.joypadLastWrite;
  }


  return {
    reset,
    write,
    load32kRomBank,
    loadRomBank,
    loadCHRROM,
    loadBatteryRam,
    toJSON,
    fromJSON,
    loadVromBank,
    load8kVromBank,
    load8kRomBank,
    load1kVromBank,
    loadPRGROM,
  };
}

export default mapper00;
