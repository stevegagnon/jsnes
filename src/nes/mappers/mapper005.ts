import mapper000 from './mapper000';
import { Irq } from '../cpu';

export const mapper005 = mapper000;

export default mapper000;

// /**
//  * Mapper005 (MMC5,ExROM)
//  *
//  * @example Castlevania 3, Just Breed, Uncharted Waters, Romance of the 3 Kingdoms 2, Laser Invasion, Metal Slader Glory, Uchuu Keibitai SDF, Shin 4 Nin Uchi Mahjong - Yakuman Tengoku
//  * @description http://wiki.nesdev.com/w/index.php/INES_Mapper_005
//  * @constructor
//  */

// export function mapper005(nes) {
//   const mapper = mapper000(nes);
//   return {
//     ...mapper,
//     write(address, value) {
//       // Writes to addresses other than MMC registers are handled by NoMapper.
//       if (address < 0x5000) {
//         mapper.write(address, value)
//         return;
//       }

//       switch (address) {
//         case 0x5100:
//           prg_size = value & 3;
//           break;
//         case 0x5101:
//           chr_size = value & 3;
//           break;
//         case 0x5102:
//           sram_we_a = value & 3;
//           break;
//         case 0x5103:
//           sram_we_b = value & 3;
//           break;
//         case 0x5104:
//           graphic_mode = value & 3;
//           break;
//         case 0x5105:
//           nametable_mode = value;
//           nametable_type[0] = value & 3;
//           load1kVromBank(value & 3, 0x2000);
//           value >>= 2;
//           nametable_type[1] = value & 3;
//           load1kVromBank(value & 3, 0x2400);
//           value >>= 2;
//           nametable_type[2] = value & 3;
//           load1kVromBank(value & 3, 0x2800);
//           value >>= 2;
//           nametable_type[3] = value & 3;
//           load1kVromBank(value & 3, 0x2c00);
//           break;
//         case 0x5106:
//           fill_chr = value;
//           break;
//         case 0x5107:
//           fill_pal = value & 3;
//           break;
//         case 0x5113:
//           SetBank_SRAM(3, value & 3);
//           break;
//         case 0x5114:
//         case 0x5115:
//         case 0x5116:
//         case 0x5117:
//           SetBank_CPU(address, value);
//           break;
//         case 0x5120:
//         case 0x5121:
//         case 0x5122:
//         case 0x5123:
//         case 0x5124:
//         case 0x5125:
//         case 0x5126:
//         case 0x5127:
//           chr_mode = 0;
//           chr_page[0][address & 7] = value;
//           SetBank_PPU();
//           break;
//         case 0x5128:
//         case 0x5129:
//         case 0x512a:
//         case 0x512b:
//           chr_mode = 1;
//           chr_page[1][(address & 3) + 0] = value;
//           chr_page[1][(address & 3) + 4] = value;
//           SetBank_PPU();
//           break;
//         case 0x5200:
//           split_control = value;
//           break;
//         case 0x5201:
//           split_scroll = value;
//           break;
//         case 0x5202:
//           split_page = value & 0x3f;
//           break;
//         case 0x5203:
//           irq_line = value;
//           nes.cpu.ClearIRQ();
//           break;
//         case 0x5204:
//           irq_enable = value;
//           nes.cpu.ClearIRQ();
//           break;
//         case 0x5205:
//           mult_a = value;
//           break;
//         case 0x5206:
//           mult_b = value;
//           break;
//         default:
//           if (address >= 0x5000 && address <= 0x5015) {
//             nes.papu.exWrite(address, value);
//           } else if (address >= 0x5c00 && address <= 0x5fff) {
//             if (graphic_mode === 2) {
//               // ExRAM
//               // vram write
//             } else if (graphic_mode !== 3) {
//               // Split,ExGraphic
//               if (irq_status & 0x40) {
//                 // vram write
//               } else {
//                 // vram write
//               }
//             }
//           } else if (address >= 0x6000 && address <= 0x7fff) {
//             if (sram_we_a === 2 && sram_we_b === 1) {
//               // additional ram write
//             }
//           }
//           break;
//       }
//     },
//     loadROM() {
//       if (!nes.rom.isValid()) {
//         throw new Error("UNROM: Invalid ROM! Unable to load.");
//       }

//       // Load PRG-ROM:
//       mapper.load8kRomBank(nes.rom.getRomCount() * 2 - 1, 0x8000);
//       mapper.load8kRomBank(nes.rom.getRomCount() * 2 - 1, 0xa000);
//       mapper.load8kRomBank(nes.rom.getRomCount() * 2 - 1, 0xc000);
//       mapper.load8kRomBank(nes.rom.getRomCount() * 2 - 1, 0xe000);

//       // Load CHR-ROM:
//       mapper.loadCHRROM();

//       // Do Reset-Interrupt:
//       nes.cpu.requestIrq(Irq.Reset);
//     }
//   };
// }

// export default mapper005;

