import {Mappers, getMapperName} from './mappers';
import Tile from './tile';

export enum RomFlags {
  VERTICAL_MIRRORING = 0,
  HORIZONTAL_MIRRORING = 1,
  FOURSCREEN_MIRRORING = 2,
  SINGLESCREEN_MIRRORING = 3,
  SINGLESCREEN_MIRRORING2 = 4,
  SINGLESCREEN_MIRRORING3 = 5,
  SINGLESCREEN_MIRRORING4 = 6,
  CHRROM_MIRRORING = 7,
}

export function ROM(nes) {
  let header = null;
  let rom = null;
  let vrom = null;
  let vromTile = null;

  let romCount = null;
  let vromCount = null;
  let mirroring = null;
  let batteryRam = null;
  let trainer = null;
  let fourScreen = null;
  let mapperType = null;
  let valid = false;

  function load(data) {
    var i, j, v;

    if (data.indexOf("NES\x1a") === -1) {
      throw new Error("Not a valid NES ROM.");
    }
    header = new Array(16);
    for (i = 0; i < 16; i++) {
      header[i] = data.charCodeAt(i) & 0xff;
    }
    romCount = header[4];
    vromCount = header[5] * 2; // Get the number of 4kB banks, not 8kB
    mirroring = (header[6] & 1) !== 0 ? 1 : 0;
    batteryRam = (header[6] & 2) !== 0;
    trainer = (header[6] & 4) !== 0;
    fourScreen = (header[6] & 8) !== 0;
    mapperType = (header[6] >> 4) | (header[7] & 0xf0);
    /* TODO
        if (batteryRam)
            loadBatteryRam();*/
    // Check whether byte 8-15 are zero's:
    var foundError = false;
    for (i = 8; i < 16; i++) {
      if (header[i] !== 0) {
        foundError = true;
        break;
      }
    }
    if (foundError) {
      mapperType &= 0xf; // Ignore byte 7
    }
    // Load PRG-ROM banks:
    rom = new Array(romCount);
    var offset = 16;
    for (i = 0; i < romCount; i++) {
      rom[i] = new Array(16384);
      for (j = 0; j < 16384; j++) {
        if (offset + j >= data.length) {
          break;
        }
        rom[i][j] = data.charCodeAt(offset + j) & 0xff;
      }
      offset += 16384;
    }
    // Load CHR-ROM banks:
    vrom = new Array(vromCount);
    for (i = 0; i < vromCount; i++) {
      vrom[i] = new Array(4096);
      for (j = 0; j < 4096; j++) {
        if (offset + j >= data.length) {
          break;
        }
        vrom[i][j] = data.charCodeAt(offset + j) & 0xff;
      }
      offset += 4096;
    }

    // Create VROM tiles:
    vromTile = new Array(vromCount);
    for (i = 0; i < vromCount; i++) {
      vromTile[i] = new Array(256);
      for (j = 0; j < 256; j++) {
        vromTile[i][j] = Tile();
      }
    }

    // Convert CHR-ROM banks to tiles:
    var tileIndex;
    var leftOver;
    for (v = 0; v < vromCount; v++) {
      for (i = 0; i < 4096; i++) {
        tileIndex = i >> 4;
        leftOver = i % 16;
        if (leftOver < 8) {
          vromTile[v][tileIndex].setScanline(
            leftOver,
            vrom[v][i],
            vrom[v][i + 8]
          );
        } else {
          vromTile[v][tileIndex].setScanline(
            leftOver - 8,
            vrom[v][i - 8],
            vrom[v][i]
          );
        }
      }
    }

    valid = true;
  }

  function getMirroringType() {
    if (fourScreen) {
      return RomFlags.FOURSCREEN_MIRRORING;
    }
    if (mirroring === 0) {
      return RomFlags.HORIZONTAL_MIRRORING;
    }
    return RomFlags.VERTICAL_MIRRORING;
  }

  function createMapper() {
    if (Mappers[mapperType]) {
      return new Mappers[mapperType](nes);
    } else {
      const name = getMapperName(mapperType);
      throw new Error(`ROM not supported: ${name}(${mapperType})`);
    }
  }

  return {
    load,
    getMirroringType,
    createMapper,
    isValid() {
      return valid;
    },
    getBatteryRom() {
      return batteryRam;
    },
    getRomCount() {
      return romCount;
    },
    getVRomCount() {
      return vromCount;
    },
    getRom(bank) {
      return rom[bank];
    },
    getVRom(bank) {
      return vrom[bank];
    },
    getVRomTile(bank) {
      return vromTile[bank];
    }
  };
};

export default ROM;
