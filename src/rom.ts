import Mappers from './mappers';
import Tile from './tile';

export enum Flags {
  VERTICAL_MIRRORING = 0,
  HORIZONTAL_MIRRORING = 1,
  FOURSCREEN_MIRRORING = 2,
  SINGLESCREEN_MIRRORING = 3,
  SINGLESCREEN_MIRRORING2 = 4,
  SINGLESCREEN_MIRRORING3 = 5,
  SINGLESCREEN_MIRRORING4 = 6,
  CHRROM_MIRRORING = 7,
}

const mapperName = [];

mapperName[0] = "Direct Access";
mapperName[1] = "Nintendo MMC1";
mapperName[2] = "UNROM";
mapperName[3] = "CNROM";
mapperName[4] = "Nintendo MMC3";
mapperName[5] = "Nintendo MMC5";
mapperName[6] = "FFE F4xxx";
mapperName[7] = "AOROM";
mapperName[8] = "FFE F3xxx";
mapperName[9] = "Nintendo MMC2";
mapperName[10] = "Nintendo MMC4";
mapperName[11] = "Color Dreams Chip";
mapperName[12] = "FFE F6xxx";
mapperName[15] = "100-in-1 switch";
mapperName[16] = "Bandai chip";
mapperName[17] = "FFE F8xxx";
mapperName[18] = "Jaleco SS8806 chip";
mapperName[19] = "Namcot 106 chip";
mapperName[20] = "Famicom Disk System";
mapperName[21] = "Konami VRC4a";
mapperName[22] = "Konami VRC2a";
mapperName[23] = "Konami VRC2a";
mapperName[24] = "Konami VRC6";
mapperName[25] = "Konami VRC4b";
mapperName[32] = "Irem G-101 chip";
mapperName[33] = "Taito TC0190/TC0350";
mapperName[34] = "32kB ROM switch";

mapperName[64] = "Tengen RAMBO-1 chip";
mapperName[65] = "Irem H-3001 chip";
mapperName[66] = "GNROM switch";
mapperName[67] = "SunSoft3 chip";
mapperName[68] = "SunSoft4 chip";
mapperName[69] = "SunSoft5 FME-7 chip";
mapperName[71] = "Camerica chip";
mapperName[78] = "Irem 74HC161/32-based";
mapperName[91] = "Pirate HK-SF3 chip";



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
      return Flags.FOURSCREEN_MIRRORING;
    }
    if (mirroring === 0) {
      return Flags.HORIZONTAL_MIRRORING;
    }
    return Flags.VERTICAL_MIRRORING;
  }

  function getMapperName() {
    return mapperName[mapperType] ?? `Unknown Mapper, ${mapperType}`;
  }

  function mapperSupported() {
    return typeof Mappers[mapperType] !== "undefined";
  }

  function createMapper() {
    if (mapperSupported()) {
      return new Mappers[mapperType](nes);
    } else {
      throw new Error(
        "This ROM uses a mapper not supported by JSNES: " +
        getMapperName() +
        "(" +
        mapperType +
        ")"
      );
    }
  }
};
