
import mapper000 from './mapper000';
import mapper001 from './mapper001';
import mapper002 from './mapper002';
import mapper003 from './mapper003';
import mapper004 from './mapper004';
// import mapper005 from './mapper000'; // missing parts
import mapper007 from './mapper007';
import mapper011 from './mapper011';
import mapper034 from './mapper034';
import mapper038 from './mapper038';
import mapper066 from './mapper066';
import mapper094 from './mapper094';
import mapper140 from './mapper140';
import mapper180 from './mapper180';

export const Mappers = {
  0: mapper000,
  1: mapper001,
  2: mapper002,
  3: mapper003,
  4: mapper004,
  7: mapper007,
  11: mapper011,
  34: mapper034,
  38: mapper038,
  66: mapper066,
  94: mapper094,
  140: mapper140,
  180: mapper180,
};


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

export function getMapperName(mapperType) {
  return mapperName[mapperType] ?? `Unknown Mapper, ${mapperType}`;
}

export default Mappers;