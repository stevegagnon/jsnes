import { Tile, TileFields } from './tile';
import { RomFlags } from './rom';
import { Irq } from './cpu';

export enum PpuStatus {
  VRAMWRITE = 4,
  SLSPRITECOUNT = 5,
  SPRITE0HIT = 6,
  VBLANK = 7,
};

export function PPU(nes, { onFrame }) {
  let vramMem = null;
  let spriteMem = null;
  let vramAddress = null;
  let vramTmpAddress = null;
  let vramBufferedReadValue = null;
  let firstWrite = null;
  let sramAddress = null;
  let currentMirroring = null;
  let requestEndFrame = null;
  let nmiOk = null;
  let dummyCycleToggle = null;
  let validTileData = null;
  let nmiCounter = null;
  let scanlineAlreadyRendered = null;
  let f_nmiOnVblank = null;
  let f_spriteSize = null;
  let f_bgPatternTable = null;
  let f_spPatternTable = null;
  let f_addrInc = null;
  let f_nTblAddress = null;
  let f_color = null;
  let f_spVisibility = null;
  let f_bgVisibility = null;
  let f_spClipping = null;
  let f_bgClipping = null;
  let f_dispType = null;
  let cntFV = null;
  let cntV = null;
  let cntH = null;
  let cntVT = null;
  let cntHT = null;
  let regFV = null;
  let regV = null;
  let regH = null;
  let regVT = null;
  let regHT = null;
  let regFH = null;
  let regS = null;
  let curNt = null;
  let attrib = null;
  let buffer = null;
  let bgbuffer = null;
  let pixrendered = null;

  let scantile = null;
  let scanline = null;
  let lastRenderedScanline = null;
  let curX = null;
  let sprX = null;
  let sprY = null;
  let sprTile = null;
  let sprCol = null;
  let vertFlip = null;
  let horiFlip = null;
  let bgPriority = null;
  let spr0HitX = null;
  let spr0HitY = null;
  let hitSpr0 = null;
  let sprPalette = null;
  let imgPalette = null;
  let ptTile: TileFields[] = null;
  let ntable1 = null;
  let nameTable = null;
  let vramMirrorTable = null;
  let palTable = null;

  // Rendering Options:
  let showSpr0Hit = false;
  let clipToTvSize = true;

  function reset() {
    // Memory
    vramMem = new Uint32Array(0x8000).fill(0);
    spriteMem = new Uint32Array(0x100).fill(0);

    // VRAM I/O:
    vramAddress = null;
    vramTmpAddress = null;
    vramBufferedReadValue = 0;
    firstWrite = true; // VRAM/Scroll Hi/Lo latch

    // SPR-RAM I/O:
    sramAddress = 0; // 8-bit only.

    currentMirroring = -1;
    requestEndFrame = false;
    nmiOk = false;
    dummyCycleToggle = false;
    validTileData = false;
    nmiCounter = 0;
    scanlineAlreadyRendered = null;

    // Control Flags Register 1:
    f_nmiOnVblank = 0; // NMI on VBlank. 0=disable, 1=enable
    f_spriteSize = 0; // Sprite size. 0=8x8, 1=8x16
    f_bgPatternTable = 0; // Background Pattern Table address. 0=0x0000,1=0x1000
    f_spPatternTable = 0; // Sprite Pattern Table address. 0=0x0000,1=0x1000
    f_addrInc = 0; // PPU Address Increment. 0=1,1=32
    f_nTblAddress = 0; // Name Table Address. 0=0x2000,1=0x2400,2=0x2800,3=0x2C00

    // Control Flags Register 2:
    f_color = 0; // Background color. 0=black, 1=blue, 2=green, 4=red
    f_spVisibility = 0; // Sprite visibility. 0=not displayed,1=displayed
    f_bgVisibility = 0; // Background visibility. 0=Not Displayed,1=displayed
    f_spClipping = 0; // Sprite clipping. 0=Sprites invisible in left 8-pixel column,1=No clipping
    f_bgClipping = 0; // Background clipping. 0=BG invisible in left 8-pixel column, 1=No clipping
    f_dispType = 0; // Display type. 0=color, 1=monochrome

    // Counters:
    cntFV = 0;
    cntV = 0;
    cntH = 0;
    cntVT = 0;
    cntHT = 0;

    // Registers:
    regFV = 0;
    regV = 0;
    regH = 0;
    regVT = 0;
    regHT = 0;
    regFH = 0;
    regS = 0;

    // These are temporary variables used in rendering and sound procedures.
    // Their states outside of those procedures can be ignored.
    // TODO: the use of this is a bit weird, investigate
    curNt = null;

    // Variables used when rendering:
    attrib = new Uint32Array(32);
    buffer = new Uint32Array(256 * 240);
    bgbuffer = new Uint32Array(256 * 240);
    pixrendered = new Uint32Array(256 * 240);

    validTileData = null;

    scantile = new Array(32);

    // Initialize misc vars:
    scanline = 0;
    lastRenderedScanline = -1;
    curX = 0;

    // Sprite data:
    sprX = new Array(64); // X coordinate
    sprY = new Array(64); // Y coordinate
    sprTile = new Array(64); // Tile Index (into pattern table)
    sprCol = new Array(64); // Upper two bits of color
    vertFlip = new Array(64); // Vertical Flip
    horiFlip = new Array(64); // Horizontal Flip
    bgPriority = new Array(64); // Background priority
    spr0HitX = 0; // Sprite #0 hit X coordinate
    spr0HitY = 0; // Sprite #0 hit Y coordinate
    hitSpr0 = false;

    // Palette data:
    sprPalette = new Uint32Array(16);
    imgPalette = new Array(16);

    // Create pattern table tile buffers:
    ptTile = new Array(512);
    for (let i = 0; i < 512; i++) {
      ptTile[i] = Tile();
    }

    // Create nametable buffers:
    // Name table data:
    ntable1 = new Array(4);
    currentMirroring = -1;
    nameTable = new Array(4);
    for (let i = 0; i < 4; i++) {
      nameTable[i] = {
        width: 32,
        height: 32,
        name: `Nt${i}`,
        tile: new Array(32 * 32).fill(0),
        attrib: new Array(32 * 32).fill(0),
      };
    }

    // Initialize mirroring lookup table:
    vramMirrorTable = new Uint32Array(0x8000);
    for (let i = 0; i < 0x8000; i++) {
      vramMirrorTable[i] = i;
    }

    palTable = {
      curTable: new Array(64),
      emphTable: new Array(8),
      currentEmph: -1
    };

    loadNTSCPalette();

    updateControlReg1(0);
    updateControlReg2(0);
  }


  function getEntry(yiq) {
    return palTable.curTable[yiq];
  }

  function makeTables() {
    var r, g, b, col, i, rFactor, gFactor, bFactor;

    // Calculate a table for each possible emphasis setting:
    for (var emph = 0; emph < 8; emph++) {
      // Determine color component factors:
      rFactor = 1.0;
      gFactor = 1.0;
      bFactor = 1.0;

      if ((emph & 1) !== 0) {
        rFactor = 0.75;
        bFactor = 0.75;
      }
      if ((emph & 2) !== 0) {
        rFactor = 0.75;
        gFactor = 0.75;
      }
      if ((emph & 4) !== 0) {
        gFactor = 0.75;
        bFactor = 0.75;
      }

      palTable.emphTable[emph] = new Array(64);

      // Calculate table:
      for (i = 0; i < 64; i++) {
        col = palTable.curTable[i];
        r = Math.floor(getRed(col) * rFactor);
        g = Math.floor(getGreen(col) * gFactor);
        b = Math.floor(getBlue(col) * bFactor);
        palTable.emphTable[emph][i] = getRgb(r, g, b);
      }
    }
  }


  function loadNTSCPalette() {
    palTable.curTable = [0x525252, 0xB40000, 0xA00000, 0xB1003D, 0x740069, 0x00005B, 0x00005F, 0x001840, 0x002F10, 0x084A08, 0x006700, 0x124200, 0x6D2800, 0x000000, 0x000000, 0x000000, 0xC4D5E7, 0xFF4000, 0xDC0E22, 0xFF476B, 0xD7009F, 0x680AD7, 0x0019BC, 0x0054B1, 0x006A5B, 0x008C03, 0x00AB00, 0x2C8800, 0xA47200, 0x000000, 0x000000, 0x000000, 0xF8F8F8, 0xFFAB3C, 0xFF7981, 0xFF5BC5, 0xFF48F2, 0xDF49FF, 0x476DFF, 0x00B4F7, 0x00E0FF, 0x00E375, 0x03F42B, 0x78B82E, 0xE5E218, 0x787878, 0x000000, 0x000000, 0xFFFFFF, 0xFFF2BE, 0xF8B8B8, 0xF8B8D8, 0xFFB6FF, 0xFFC3FF, 0xC7D1FF, 0x9ADAFF, 0x88EDF8, 0x83FFDD, 0xB8F8B8, 0xF5F8AC, 0xFFFFB0, 0xF8D8F8, 0x000000, 0x000000];
    makeTables();
    setEmphasis(0);
  }

  function setEmphasis(emph) {
    if (emph !== palTable.currentEmph) {
      palTable.currentEmph = emph;
      for (var i = 0; i < 64; i++) {
        palTable.curTable[i] = palTable.emphTable[emph][i];
      }
    }
  }

  function setMirroring(mirroring) {
    if (mirroring === currentMirroring) {
      return;
    }

    currentMirroring = mirroring;
    triggerRendering();

    // Remove mirroring:
    if (vramMirrorTable === null) {
      vramMirrorTable = new Uint32Array(0x8000);
    }
    for (var i = 0; i < 0x8000; i++) {
      vramMirrorTable[i] = i;
    }

    // Palette mirroring:
    defineMirrorRegion(0x3f20, 0x3f00, 0x20);
    defineMirrorRegion(0x3f40, 0x3f00, 0x20);
    defineMirrorRegion(0x3f80, 0x3f00, 0x20);
    defineMirrorRegion(0x3fc0, 0x3f00, 0x20);

    // Additional mirroring:
    defineMirrorRegion(0x3000, 0x2000, 0xf00);
    defineMirrorRegion(0x4000, 0x0000, 0x4000);

    if (mirroring === RomFlags.HORIZONTAL_MIRRORING) {
      // Horizontal mirroring.

      ntable1[0] = 0;
      ntable1[1] = 0;
      ntable1[2] = 1;
      ntable1[3] = 1;

      defineMirrorRegion(0x2400, 0x2000, 0x400);
      defineMirrorRegion(0x2c00, 0x2800, 0x400);
    } else if (mirroring === RomFlags.VERTICAL_MIRRORING) {
      // Vertical mirroring.

      ntable1[0] = 0;
      ntable1[1] = 1;
      ntable1[2] = 0;
      ntable1[3] = 1;

      defineMirrorRegion(0x2800, 0x2000, 0x400);
      defineMirrorRegion(0x2c00, 0x2400, 0x400);
    } else if (mirroring === RomFlags.SINGLESCREEN_MIRRORING) {
      // Single Screen mirroring

      ntable1[0] = 0;
      ntable1[1] = 0;
      ntable1[2] = 0;
      ntable1[3] = 0;

      defineMirrorRegion(0x2400, 0x2000, 0x400);
      defineMirrorRegion(0x2800, 0x2000, 0x400);
      defineMirrorRegion(0x2c00, 0x2000, 0x400);
    } else if (mirroring === RomFlags.SINGLESCREEN_MIRRORING2) {
      ntable1[0] = 1;
      ntable1[1] = 1;
      ntable1[2] = 1;
      ntable1[3] = 1;

      defineMirrorRegion(0x2400, 0x2400, 0x400);
      defineMirrorRegion(0x2800, 0x2400, 0x400);
      defineMirrorRegion(0x2c00, 0x2400, 0x400);
    } else {
      // Assume Four-screen mirroring.

      ntable1[0] = 0;
      ntable1[1] = 1;
      ntable1[2] = 2;
      ntable1[3] = 3;
    }
  }

  function defineMirrorRegion(fromStart, toStart, size) {
    for (var i = 0; i < size; i++) {
      vramMirrorTable[fromStart + i] = toStart + i;
    }
  }

  function startVBlank() {
    // Do NMI:
    nes.cpu.requestIrq(Irq.Nmi);

    // Make sure everything is rendered:
    if (lastRenderedScanline < 239) {
      renderFramePartially(
        lastRenderedScanline + 1,
        240 - lastRenderedScanline
      );
    }

    // End frame:
    endFrame();

    // Reset scanline counter:
    lastRenderedScanline = -1;
  }

  function endScanline() {
    switch (scanline) {
      case 19:
        // Dummy scanline.
        // May be variable length:
        if (dummyCycleToggle) {
          // Remove dead cycle at end of scanline,
          // for next scanline:
          curX = 1;
          dummyCycleToggle = !dummyCycleToggle;
        }
        break;

      case 20:
        // Clear VBlank flag:
        setStatusFlag(PpuStatus.VBLANK, false);

        // Clear Sprite #0 hit flag:
        setStatusFlag(PpuStatus.SPRITE0HIT, false);
        hitSpr0 = false;
        spr0HitX = -1;
        spr0HitY = -1;

        if (f_bgVisibility === 1 || f_spVisibility === 1) {
          // Update counters:
          cntFV = regFV;
          cntV = regV;
          cntH = regH;
          cntVT = regVT;
          cntHT = regHT;

          if (f_bgVisibility === 1) {
            // Render dummy scanline:
            renderBgScanline(false, 0);
          }
        }

        if (f_bgVisibility === 1 && f_spVisibility === 1) {
          // Check sprite 0 hit for first scanline:
          checkSprite0(0);
        }

        if (f_bgVisibility === 1 || f_spVisibility === 1) {
          // Clock mapper IRQ Counter:
          nes.mmap.clockIrqCounter();
        }
        break;

      case 261:
        // Dead scanline, no rendering.
        // Set VINT:
        setStatusFlag(PpuStatus.VBLANK, true);
        requestEndFrame = true;
        nmiCounter = 9;

        // Wrap around:
        scanline = -1; // will be incremented to 0

        break;

      default:
        if (scanline >= 21 && scanline <= 260) {
          // Render normally:
          if (f_bgVisibility === 1) {
            if (!scanlineAlreadyRendered) {
              // update scroll:
              cntHT = regHT;
              cntH = regH;
              renderBgScanline(true, scanline + 1 - 21);
            }
            scanlineAlreadyRendered = false;

            // Check for sprite 0 (next scanline):
            if (!hitSpr0 && f_spVisibility === 1) {
              if (
                sprX[0] >= -7 &&
                sprX[0] < 256 &&
                sprY[0] + 1 <= scanline - 20 &&
                sprY[0] + 1 + (f_spriteSize === 0 ? 8 : 16) >=
                scanline - 20
              ) {
                if (checkSprite0(scanline - 20)) {
                  hitSpr0 = true;
                }
              }
            }
          }

          if (f_bgVisibility === 1 || f_spVisibility === 1) {
            // Clock mapper IRQ Counter:
            nes.mmap.clockIrqCounter();
          }
        }
    }

    scanline++;
    regsToAddress();
    cntsToAddress();
  }


  function startFrame() {
    // Set background color:
    var bgColor = 0;

    if (f_dispType === 0) {
      // Color display.
      // f_color determines color emphasis.
      // Use first entry of image palette as BG color.
      bgColor = imgPalette[0];
    } else {
      // Monochrome display.
      // f_color determines the bg color.
      switch (f_color) {
        case 0:
          // Black
          bgColor = 0x00000;
          break;
        case 1:
          // Green
          bgColor = 0x00ff00;
          break;
        case 2:
          // Blue
          bgColor = 0xff0000;
          break;
        case 3:
          // Invalid. Use black.
          bgColor = 0x000000;
          break;
        case 4:
          // Red
          bgColor = 0x0000ff;
          break;
        default:
          // Invalid. Use black.
          bgColor = 0x0;
      }
    }

    var i;
    for (i = 0; i < 256 * 240; i++) {
      buffer[i] = bgColor;
    }
    for (i = 0; i < pixrendered.length; i++) {
      pixrendered[i] = 65;
    }
  }

  function endFrame() {
    var i, x, y;

    // Draw spr#0 hit coordinates:
    if (showSpr0Hit) {
      // Spr 0 position:
      if (
        sprX[0] >= 0 &&
        sprX[0] < 256 &&
        sprY[0] >= 0 &&
        sprY[0] < 240
      ) {
        for (i = 0; i < 256; i++) {
          buffer[(sprY[0] << 8) + i] = 0xff5555;
        }
        for (i = 0; i < 240; i++) {
          buffer[(i << 8) + sprX[0]] = 0xff5555;
        }
      }
      // Hit position:
      if (
        spr0HitX >= 0 &&
        spr0HitX < 256 &&
        spr0HitY >= 0 &&
        spr0HitY < 240
      ) {
        for (i = 0; i < 256; i++) {
          buffer[(spr0HitY << 8) + i] = 0x55ff55;
        }
        for (i = 0; i < 240; i++) {
          buffer[(i << 8) + spr0HitX] = 0x55ff55;
        }
      }
    }

    // This is a bit lazy..
    // if either the sprites or the background should be clipped,
    // both are clipped after rendering is finished.
    if (
      clipToTvSize ||
      f_bgClipping === 0 ||
      f_spClipping === 0
    ) {
      // Clip left 8-pixels column:
      for (y = 0; y < 240; y++) {
        for (x = 0; x < 8; x++) {
          buffer[(y << 8) + x] = 0;
        }
      }
    }

    if (clipToTvSize) {
      // Clip right 8-pixels column too:
      for (y = 0; y < 240; y++) {
        for (x = 0; x < 8; x++) {
          buffer[(y << 8) + 255 - x] = 0;
        }
      }
    }

    // Clip top and bottom 8 pixels:
    if (clipToTvSize) {
      for (y = 0; y < 8; y++) {
        for (x = 0; x < 256; x++) {
          buffer[(y << 8) + x] = 0;
          buffer[((239 - y) << 8) + x] = 0;
        }
      }
    }

    onFrame(buffer);
  }

  function updateControlReg1(value) {
    triggerRendering();

    f_nmiOnVblank = (value >> 7) & 1;
    f_spriteSize = (value >> 5) & 1;
    f_bgPatternTable = (value >> 4) & 1;
    f_spPatternTable = (value >> 3) & 1;
    f_addrInc = (value >> 2) & 1;
    f_nTblAddress = value & 3;

    regV = (value >> 1) & 1;
    regH = value & 1;
    regS = (value >> 4) & 1;
  }

  function updateControlReg2(value) {
    triggerRendering();

    f_color = (value >> 5) & 7;
    f_spVisibility = (value >> 4) & 1;
    f_bgVisibility = (value >> 3) & 1;
    f_spClipping = (value >> 2) & 1;
    f_bgClipping = (value >> 1) & 1;
    f_dispType = value & 1;

    if (f_dispType === 0) {
      setEmphasis(f_color);
    }
    updatePalettes();
  }

  function setStatusFlag(flag, value) {
    var n = 1 << flag;
    nes.mem[0x2002] = (nes.mem[0x2002] & (255 - n)) | (value ? n : 0);
  }

  // CPU Register $2002:
  // Read the Status Register.
  function readStatusRegister() {
    var tmp = nes.mem[0x2002];

    // Reset scroll & VRAM Address toggle:
    firstWrite = true;

    // Clear VBlank flag:
    setStatusFlag(PpuStatus.VBLANK, false);

    // Fetch status data:
    return tmp;
  }

  // CPU Register $2003:
  // Write the SPR-RAM address that is used for sramWrite (Register 0x2004 in CPU memory map)
  function writeSRAMAddress(address) {
    sramAddress = address;
  }


  // CPU Register $2004 (R):
  // Read from SPR-RAM (Sprite RAM).
  // The address should be set first.
  function sramLoad() {
    /*short tmp = sprMem.load(sramAddress);
        sramAddress++; // Increment address
        sramAddress%=0x100;
        return tmp;*/
    return spriteMem[sramAddress];
  }

  // CPU Register $2004 (W):
  // Write to SPR-RAM (Sprite RAM).
  // The address should be set first.
  function sramWrite(value) {
    spriteMem[sramAddress] = value;
    spriteRamWriteUpdate(sramAddress, value);
    sramAddress++; // Increment address
    sramAddress %= 0x100;
  }


  // CPU Register $2005:
  // Write to scroll registers.
  // The first write is the vertical offset, the second is the
  // horizontal offset:
  function scrollWrite(value) {
    triggerRendering();

    if (firstWrite) {
      // First write, horizontal scroll:
      regHT = (value >> 3) & 31;
      regFH = value & 7;
    } else {
      // Second write, vertical scroll:
      regFV = value & 7;
      regVT = (value >> 3) & 31;
    }
    firstWrite = !firstWrite;
  }

  // CPU Register $2006:
  // Sets the adress used when reading/writing from/to VRAM.
  // The first write sets the high byte, the second the low byte.
  function writeVRAMAddress(address) {
    if (firstWrite) {
      regFV = (address >> 4) & 3;
      regV = (address >> 3) & 1;
      regH = (address >> 2) & 1;
      regVT = (regVT & 7) | ((address & 3) << 3);
    } else {
      triggerRendering();

      regVT = (regVT & 24) | ((address >> 5) & 7);
      regHT = address & 31;

      cntFV = regFV;
      cntV = regV;
      cntH = regH;
      cntVT = regVT;
      cntHT = regHT;

      checkSprite0(scanline - 20);
    }

    firstWrite = !firstWrite;

    // Invoke mapper latch:
    cntsToAddress();
    if (vramAddress < 0x2000) {
      nes.mmap.latchAccess(vramAddress);
    }
  }

  // CPU Register $2007(R):
  // Read from PPU memory. The address should be set first.
  function vramLoad() {
    var tmp;

    cntsToAddress();
    regsToAddress();

    // If address is in range 0x0000-0x3EFF, return buffered values:
    if (vramAddress <= 0x3eff) {
      tmp = vramBufferedReadValue;

      // Update buffered value:
      if (vramAddress < 0x2000) {
        vramBufferedReadValue = vramMem[vramAddress];
      } else {
        vramBufferedReadValue = mirroredLoad(vramAddress);
      }

      // Mapper latch access:
      if (vramAddress < 0x2000) {
        nes.mmap.latchAccess(vramAddress);
      }

      // Increment by either 1 or 32, depending on d2 of Control Register 1:
      vramAddress += f_addrInc === 1 ? 32 : 1;

      cntsFromAddress();
      regsFromAddress();

      return tmp; // Return the previous buffered value.
    }

    // No buffering in this mem range. Read normally.
    tmp = mirroredLoad(vramAddress);

    // Increment by either 1 or 32, depending on d2 of Control Register 1:
    vramAddress += f_addrInc === 1 ? 32 : 1;

    cntsFromAddress();
    regsFromAddress();

    return tmp;
  }

  // CPU Register $2007(W):
  // Write to PPU memory. The address should be set first.
  function vramWrite(value) {
    triggerRendering();
    cntsToAddress();
    regsToAddress();

    if (vramAddress >= 0x2000) {
      // Mirroring is used.
      mirroredWrite(vramAddress, value);
    } else {
      // Write normally.
      writeMem(vramAddress, value);

      // Invoke mapper latch:
      nes.mmap.latchAccess(vramAddress);
    }

    // Increment by either 1 or 32, depending on d2 of Control Register 1:
    vramAddress += f_addrInc === 1 ? 32 : 1;
    regsFromAddress();
    cntsFromAddress();
  }


  // CPU Register $4014:
  // Write 256 bytes of main memory
  // into Sprite RAM.
  function sramDMA(value) {
    var baseAddress = value * 0x100;
    var data;
    for (var i = sramAddress; i < 256; i++) {
      data = nes.mem[baseAddress + i];
      spriteMem[i] = data;
      spriteRamWriteUpdate(i, data);
    }

    nes.cpu.haltCycles(513);
  }

  // Updates the scroll registers from a new VRAM address.
  function regsFromAddress() {
    var address = (vramTmpAddress >> 8) & 0xff;
    regFV = (address >> 4) & 7;
    regV = (address >> 3) & 1;
    regH = (address >> 2) & 1;
    regVT = (regVT & 7) | ((address & 3) << 3);

    address = vramTmpAddress & 0xff;
    regVT = (regVT & 24) | ((address >> 5) & 7);
    regHT = address & 31;
  }

  // Updates the scroll registers from a new VRAM address.
  function cntsFromAddress() {
    var address = (vramAddress >> 8) & 0xff;
    cntFV = (address >> 4) & 3;
    cntV = (address >> 3) & 1;
    cntH = (address >> 2) & 1;
    cntVT = (cntVT & 7) | ((address & 3) << 3);

    address = vramAddress & 0xff;
    cntVT = (cntVT & 24) | ((address >> 5) & 7);
    cntHT = address & 31;
  }

  function regsToAddress() {
    var b1 = (regFV & 7) << 4;
    b1 |= (regV & 1) << 3;
    b1 |= (regH & 1) << 2;
    b1 |= (regVT >> 3) & 3;

    var b2 = (regVT & 7) << 5;
    b2 |= regHT & 31;

    vramTmpAddress = ((b1 << 8) | b2) & 0x7fff;
  }

  function cntsToAddress() {
    var b1 = (cntFV & 7) << 4;
    b1 |= (cntV & 1) << 3;
    b1 |= (cntH & 1) << 2;
    b1 |= (cntVT >> 3) & 3;

    var b2 = (cntVT & 7) << 5;
    b2 |= cntHT & 31;

    vramAddress = ((b1 << 8) | b2) & 0x7fff;
  }

  function incTileCounter(count) {
    for (var i = count; i !== 0; i--) {
      cntHT++;
      if (cntHT === 32) {
        cntHT = 0;
        cntVT++;
        if (cntVT >= 30) {
          cntH++;
          if (cntH === 2) {
            cntH = 0;
            cntV++;
            if (cntV === 2) {
              cntV = 0;
              cntFV++;
              cntFV &= 0x7;
            }
          }
        }
      }
    }
  }

  // Reads from memory, taking into account
  // mirroring/mapping of address ranges.
  function mirroredLoad(address) {
    return vramMem[vramMirrorTable[address]];
  }

  // Writes to memory, taking into account
  // mirroring/mapping of address ranges.
  function mirroredWrite(address, value) {
    if (address >= 0x3f00 && address < 0x3f20) {
      // Palette write mirroring.
      if (address === 0x3f00 || address === 0x3f10) {
        writeMem(0x3f00, value);
        writeMem(0x3f10, value);
      } else if (address === 0x3f04 || address === 0x3f14) {
        writeMem(0x3f04, value);
        writeMem(0x3f14, value);
      } else if (address === 0x3f08 || address === 0x3f18) {
        writeMem(0x3f08, value);
        writeMem(0x3f18, value);
      } else if (address === 0x3f0c || address === 0x3f1c) {
        writeMem(0x3f0c, value);
        writeMem(0x3f1c, value);
      } else {
        writeMem(address, value);
      }
    } else {
      // Use lookup table for mirrored address:
      if (address < vramMirrorTable.length) {
        writeMem(vramMirrorTable[address], value);
      } else {
        throw new Error("Invalid VRAM address: " + address.toString(16));
      }
    }
  }

  function triggerRendering() {
    if (scanline >= 21 && scanline <= 260) {
      // Render sprites, and combine:
      renderFramePartially(
        lastRenderedScanline + 1,
        scanline - 21 - lastRenderedScanline
      );

      // Set last rendered scanline:
      lastRenderedScanline = scanline - 21;
    }
  }

  function renderFramePartially(startScan, scanCount) {
    if (f_spVisibility === 1) {
      renderSpritesPartially(startScan, scanCount, true);
    }

    if (f_bgVisibility === 1) {
      var si = startScan << 8;
      var ei = (startScan + scanCount) << 8;
      if (ei > 0xf000) {
        ei = 0xf000;
      }

      for (var destIndex = si; destIndex < ei; destIndex++) {
        if (pixrendered[destIndex] > 0xff) {
          buffer[destIndex] = bgbuffer[destIndex];
        }
      }
    }

    if (f_spVisibility === 1) {
      renderSpritesPartially(startScan, scanCount, false);
    }

    validTileData = false;
  }

  function renderBgScanline(useBgbuffer, scan) {
    var baseTile = regS === 0 ? 0 : 256;
    var destIndex = (scan << 8) - regFH;

    curNt = ntable1[cntV + cntV + cntH];

    cntHT = regHT;
    cntH = regH;
    curNt = ntable1[cntV + cntV + cntH];

    if (scan < 240 && scan - cntFV >= 0) {
      var tscanoffset = cntFV << 3;
      var targetBuffer = useBgbuffer ? bgbuffer : buffer;
      var t: TileFields;
      var tpix, att, col;

      for (var tile = 0; tile < 32; tile++) {
        if (scan >= 0) {
          // Fetch tile & attrib data:
          if (validTileData) {
            // Get data from array:
            t = scantile[tile];
            if (typeof t === "undefined") {
              continue;
            }
            tpix = t.pix;
            att = attrib[tile];
          } else {
            // Fetch data:
            t =
              ptTile[
              baseTile +
              getTileIndex(curNt, cntHT, cntVT)
              ];
            if (typeof t === "undefined") {
              continue;
            }
            tpix = t.pix;
            att = getAttrib(curNt, cntHT, cntVT);
            scantile[tile] = t;
            attrib[tile] = att;
          }

          // Render tile scanline:
          var sx = 0;
          var x = (tile << 3) - regFH;

          if (x > -8) {
            if (x < 0) {
              destIndex -= x;
              sx = -x;
            }
            if (t.opaque[cntFV]) {
              for (; sx < 8; sx++) {
                targetBuffer[destIndex] =
                  imgPalette[tpix[tscanoffset + sx] + att];
                pixrendered[destIndex] |= 256;
                destIndex++;
              }
            } else {
              for (; sx < 8; sx++) {
                col = tpix[tscanoffset + sx];
                if (col !== 0) {
                  targetBuffer[destIndex] = imgPalette[col + att];
                  pixrendered[destIndex] |= 256;
                }
                destIndex++;
              }
            }
          }
        }

        // Increase Horizontal Tile Counter:
        if (++cntHT === 32) {
          cntHT = 0;
          cntH++;
          cntH %= 2;
          curNt = ntable1[(cntV << 1) + cntH];
        }
      }

      // Tile data for one row should now have been fetched,
      // so the data in the array is valid.
      validTileData = true;
    }

    // update vertical scroll:
    cntFV++;
    if (cntFV === 8) {
      cntFV = 0;
      cntVT++;
      if (cntVT === 30) {
        cntVT = 0;
        cntV++;
        cntV %= 2;
        curNt = ntable1[(cntV << 1) + cntH];
      } else if (cntVT === 32) {
        cntVT = 0;
      }

      // Invalidate fetched data:
      validTileData = false;
    }
  }

  function renderSpritesPartially(startscan, scancount, bgPri) {
    if (f_spVisibility === 1) {
      for (var i = 0; i < 64; i++) {
        if (
          bgPriority[i] === bgPri &&
          sprX[i] >= 0 &&
          sprX[i] < 256 &&
          sprY[i] + 8 >= startscan &&
          sprY[i] < startscan + scancount
        ) {
          // Show sprite.
          if (f_spriteSize === 0) {
            // 8x8 sprites

            srcy1 = 0;
            srcy2 = 8;

            if (sprY[i] < startscan) {
              srcy1 = startscan - sprY[i] - 1;
            }

            if (sprY[i] + 8 > startscan + scancount) {
              srcy2 = startscan + scancount - sprY[i] + 1;
            }

            if (f_spPatternTable === 0) {
              ptTile[sprTile[i]].render(
                buffer,
                0,
                srcy1,
                8,
                srcy2,
                sprX[i],
                sprY[i] + 1,
                sprCol[i],
                sprPalette,
                horiFlip[i],
                vertFlip[i],
                i,
                pixrendered
              );
            } else {
              ptTile[sprTile[i] + 256].render(
                buffer,
                0,
                srcy1,
                8,
                srcy2,
                sprX[i],
                sprY[i] + 1,
                sprCol[i],
                sprPalette,
                horiFlip[i],
                vertFlip[i],
                i,
                pixrendered
              );
            }
          } else {
            // 8x16 sprites
            var top = sprTile[i];
            if ((top & 1) !== 0) {
              top = sprTile[i] - 1 + 256;
            }

            var srcy1 = 0;
            var srcy2 = 8;

            if (sprY[i] < startscan) {
              srcy1 = startscan - sprY[i] - 1;
            }

            if (sprY[i] + 8 > startscan + scancount) {
              srcy2 = startscan + scancount - sprY[i];
            }

            ptTile[top + (vertFlip[i] ? 1 : 0)].render(
              buffer,
              0,
              srcy1,
              8,
              srcy2,
              sprX[i],
              sprY[i] + 1,
              sprCol[i],
              sprPalette,
              horiFlip[i],
              vertFlip[i],
              i,
              pixrendered
            );

            srcy1 = 0;
            srcy2 = 8;

            if (sprY[i] + 8 < startscan) {
              srcy1 = startscan - (sprY[i] + 8 + 1);
            }

            if (sprY[i] + 16 > startscan + scancount) {
              srcy2 = startscan + scancount - (sprY[i] + 8);
            }

            ptTile[top + (vertFlip[i] ? 0 : 1)].render(
              buffer,
              0,
              srcy1,
              8,
              srcy2,
              sprX[i],
              sprY[i] + 1 + 8,
              sprCol[i],
              sprPalette,
              horiFlip[i],
              vertFlip[i],
              i,
              pixrendered
            );
          }
        }
      }
    }
  }

  function checkSprite0(scan) {
    spr0HitX = -1;
    spr0HitY = -1;

    var toffset;
    var tIndexAdd = f_spPatternTable === 0 ? 0 : 256;
    var x, y, i;
    var t: TileFields;
    var bufferIndex;

    x = sprX[0];
    y = sprY[0] + 1;

    if (f_spriteSize === 0) {
      // 8x8 sprites.

      // Check range:
      if (y <= scan && y + 8 > scan && x >= -7 && x < 256) {
        // Sprite is in range.
        // Draw scanline:
        t = ptTile[sprTile[0] + tIndexAdd];

        if (vertFlip[0]) {
          toffset = 7 - (scan - y);
        } else {
          toffset = scan - y;
        }
        toffset *= 8;

        bufferIndex = scan * 256 + x;
        if (horiFlip[0]) {
          for (i = 7; i >= 0; i--) {
            if (x >= 0 && x < 256) {
              if (
                bufferIndex >= 0 &&
                bufferIndex < 61440 &&
                pixrendered[bufferIndex] !== 0
              ) {
                if (t.pix[toffset + i] !== 0) {
                  spr0HitX = bufferIndex % 256;
                  spr0HitY = scan;
                  return true;
                }
              }
            }
            x++;
            bufferIndex++;
          }
        } else {
          for (i = 0; i < 8; i++) {
            if (x >= 0 && x < 256) {
              if (
                bufferIndex >= 0 &&
                bufferIndex < 61440 &&
                pixrendered[bufferIndex] !== 0
              ) {
                if (t.pix[toffset + i] !== 0) {
                  spr0HitX = bufferIndex % 256;
                  spr0HitY = scan;
                  return true;
                }
              }
            }
            x++;
            bufferIndex++;
          }
        }
      }
    } else {
      // 8x16 sprites:

      // Check range:
      if (y <= scan && y + 16 > scan && x >= -7 && x < 256) {
        // Sprite is in range.
        // Draw scanline:

        if (vertFlip[0]) {
          toffset = 15 - (scan - y);
        } else {
          toffset = scan - y;
        }

        if (toffset < 8) {
          // first half of sprite.
          t = ptTile[
            sprTile[0] +
            (vertFlip[0] ? 1 : 0) +
            ((sprTile[0] & 1) !== 0 ? 255 : 0)
          ];
        } else {
          // second half of sprite.
          t = ptTile[
            sprTile[0] +
            (vertFlip[0] ? 0 : 1) +
            ((sprTile[0] & 1) !== 0 ? 255 : 0)
          ];
          if (vertFlip[0]) {
            toffset = 15 - toffset;
          } else {
            toffset -= 8;
          }
        }
        toffset *= 8;

        bufferIndex = scan * 256 + x;
        if (horiFlip[0]) {
          for (i = 7; i >= 0; i--) {
            if (x >= 0 && x < 256) {
              if (
                bufferIndex >= 0 &&
                bufferIndex < 61440 &&
                pixrendered[bufferIndex] !== 0
              ) {
                if (t.pix[toffset + i] !== 0) {
                  spr0HitX = bufferIndex % 256;
                  spr0HitY = scan;
                  return true;
                }
              }
            }
            x++;
            bufferIndex++;
          }
        } else {
          for (i = 0; i < 8; i++) {
            if (x >= 0 && x < 256) {
              if (
                bufferIndex >= 0 &&
                bufferIndex < 61440 &&
                pixrendered[bufferIndex] !== 0
              ) {
                if (t.pix[toffset + i] !== 0) {
                  spr0HitX = bufferIndex % 256;
                  spr0HitY = scan;
                  return true;
                }
              }
            }
            x++;
            bufferIndex++;
          }
        }
      }
    }

    return false;
  }

  // This will write to PPU memory, and
  // update internally buffered data
  // appropriately.
  function writeMem(address, value) {
    vramMem[address] = value;

    // Update internally buffered data:
    if (address < 0x2000) {
      vramMem[address] = value;
      patternWrite(address, value);
    } else if (address >= 0x2000 && address < 0x23c0) {
      nameTableWrite(ntable1[0], address - 0x2000, value);
    } else if (address >= 0x23c0 && address < 0x2400) {
      writeAttrib(ntable1[0], address - 0x23c0, value);
    } else if (address >= 0x2400 && address < 0x27c0) {
      nameTableWrite(ntable1[1], address - 0x2400, value);
    } else if (address >= 0x27c0 && address < 0x2800) {
      writeAttrib(ntable1[1], address - 0x27c0, value);
    } else if (address >= 0x2800 && address < 0x2bc0) {
      nameTableWrite(ntable1[2], address - 0x2800, value);
    } else if (address >= 0x2bc0 && address < 0x2c00) {
      writeAttrib(ntable1[2], address - 0x2bc0, value);
    } else if (address >= 0x2c00 && address < 0x2fc0) {
      nameTableWrite(ntable1[3], address - 0x2c00, value);
    } else if (address >= 0x2fc0 && address < 0x3000) {
      writeAttrib(ntable1[3], address - 0x2fc0, value);
    } else if (address >= 0x3f00 && address < 0x3f20) {
      updatePalettes();
    }
  }

  // Reads data from $3f00 to $f20
  // into the two buffered palettes.
  function updatePalettes() {
    var i;

    for (i = 0; i < 16; i++) {
      if (f_dispType === 0) {
        imgPalette[i] = getEntry(
          vramMem[0x3f00 + i] & 63
        );
      } else {
        imgPalette[i] = getEntry(
          vramMem[0x3f00 + i] & 32
        );
      }
    }
    for (i = 0; i < 16; i++) {
      if (f_dispType === 0) {
        sprPalette[i] = getEntry(
          vramMem[0x3f10 + i] & 63
        );
      } else {
        sprPalette[i] = getEntry(
          vramMem[0x3f10 + i] & 32
        );
      }
    }
  }

  // Updates the internal pattern
  // table buffers with this new byte.
  // In vNES, there is a version of this with 4 arguments which isn't used.
  function patternWrite(address, value) {
    var tileIndex = Math.floor(address / 16);
    var leftOver = address % 16;
    if (leftOver < 8) {
      ptTile[tileIndex].setScanline(
        leftOver,
        value,
        vramMem[address + 8]
      );
    } else {
      ptTile[tileIndex].setScanline(
        leftOver - 8,
        vramMem[address - 8],
        value
      );
    }
  }

  // Updates the internal name table buffers
  // with this new byte.
  function nameTableWrite(index, address, value) {
    nameTable[index].tile[address] = value;

    // Update Sprite #0 hit:
    //updateSpr0Hit();
    checkSprite0(scanline - 20);
  }

  // Updates the internally buffered sprite
  // data with this new byte of info.
  function spriteRamWriteUpdate(address, value) {
    var tIndex = Math.floor(address / 4);

    if (tIndex === 0) {
      //updateSpr0Hit();
      checkSprite0(scanline - 20);
    }

    if (address % 4 === 0) {
      // Y coordinate
      sprY[tIndex] = value;
    } else if (address % 4 === 1) {
      // Tile index
      sprTile[tIndex] = value;
    } else if (address % 4 === 2) {
      // Attributes
      vertFlip[tIndex] = (value & 0x80) !== 0;
      horiFlip[tIndex] = (value & 0x40) !== 0;
      bgPriority[tIndex] = (value & 0x20) !== 0;
      sprCol[tIndex] = (value & 3) << 2;
    } else if (address % 4 === 3) {
      // X coordinate
      sprX[tIndex] = value;
    }
  }

  function doNMI() {
    // Set VBlank flag:
    setStatusFlag(PpuStatus.VBLANK, true);
    //nes.getCpu().doNonMaskableInterrupt();
    nes.cpu.requestIrq(Irq.Nmi);
  }

  function isPixelWhite(x, y) {
    triggerRendering();
    return buffer[(y << 8) + x] === 0xffffff;
  }


  function toJSON() {
    return {
      // Memory
      vramMem,
      spriteMem,
      // Counters
      cntFV,
      cntV,
      cntH,
      cntVT,
      cntHT,
      // Registers
      regFV,
      regV,
      regH,
      regVT,
      regHT,
      regFH,
      regS,
      // VRAM addr
      vramAddress,
      vramTmpAddress,
      // Control/Status registers
      f_nmiOnVblank,
      f_spriteSize,
      f_bgPatternTable,
      f_spPatternTable,
      f_addrInc,
      f_nTblAddress,
      f_color,
      f_spVisibility,
      f_bgVisibility,
      f_spClipping,
      f_bgClipping,
      f_dispType,
      // VRAM I/O
      vramBufferedReadValue,
      firstWrite,
      // Mirroring
      currentMirroring,
      vramMirrorTable,
      ntable1,
      // SPR-RAM I/O
      sramAddress,
      // Sprites. Most sprite data is rebuilt from spriteMem
      hitSpr0,
      // Palettes
      sprPalette,
      imgPalette,
      // Rendering progression
      curX,
      scanline,
      lastRenderedScanline,
      curNt,
      scantile:  scantile.map(p => p.toJSON()),
      // Used during rendering
      attrib,
      buffer,
      bgbuffer,
      pixrendered,
      // Misc
      requestEndFrame,
      nmiOk,
      dummyCycleToggle,
      nmiCounter,
      validTileData,
      scanlineAlreadyRendered,
      nameTable: nameTable.map(({ tile, attrib }) => ({ tile, attrib })),
      ptTile: ptTile.map(p => p.toJSON()),
    };
  }

  function fromJSON(state) {
    ({
      // Memory
      // vramMem,
      // spriteMem,
      // Counters
      cntFV,
      cntV,
      cntH,
      cntVT,
      cntHT,
      // Registers
      regFV,
      regV,
      regH,
      regVT,
      regHT,
      regFH,
      regS,
      // VRAM addr
      vramAddress,
      vramTmpAddress,
      // Control/Status registers
      f_nmiOnVblank,
      f_spriteSize,
      f_bgPatternTable,
      f_spPatternTable,
      f_addrInc,
      f_nTblAddress,
      f_color,
      f_spVisibility,
      f_bgVisibility,
      f_spClipping,
      f_bgClipping,
      f_dispType,
      // VRAM I/O
      vramBufferedReadValue,
      firstWrite,
      // Mirroring
      currentMirroring,
      // vramMirrorTable,
      // ntable1,
      // SPR-RAM I/O
      sramAddress,
      // Sprites. Most sprite data is rebuilt from spriteMem
      hitSpr0,
      // Palettes
      // sprPalette,
      // imgPalette,
      // Rendering progression
      curX,
      scanline,
      lastRenderedScanline,
      curNt,
      // scantile,
      // Used during rendering
      // attrib,
      // buffer,
      // bgbuffer,
      // pixrendered,
      // Misc
      requestEndFrame,
      nmiOk,
      dummyCycleToggle,
      nmiCounter,
      validTileData,
      scanlineAlreadyRendered,
    } = state);

    attrib = new Uint32Array(state.attrib, 32);
    buffer = new Uint32Array(state.buffer, 256 * 240);
    bgbuffer = new Uint32Array(state.bgbuffer, 256 * 240);
    pixrendered = new Uint32Array(state.pixrendered, 256 * 240);

    sprPalette = new Uint32Array(state.sprPalette, 16);
    imgPalette = new Uint32Array(state.sprPalette, 16);

    ntable1 = new Uint32Array(state.ntable1, 4);

    spriteMem = new Uint32Array(state.spriteMem, spriteMem.length);
    vramMem = new Uint32Array(state.vramMem, vramMem.length);

    vramMirrorTable = new Uint32Array(state.vramMirrorTable, vramMem.vramMirrorTable);

    for (let i = 0; i < nameTable.length; i++) {
      const s = state.nameTable[i];
      nameTable[i].tile = new Uint32Array(s.tile);
      nameTable[i].attrib = new Uint32Array(s.attrib);
    }

    for (let i = 0; i < ptTile.length; i++) {
      ptTile[i].fromJSON(state.ptTile[i]);
    }

    for (let i = 0; i < scantile.length; i++) {
      scantile[i].fromJSON(state.scantile[i]);
    }

    // Sprite data:
    for (let i = 0; i < spriteMem.length; i++) {
      spriteRamWriteUpdate(i, spriteMem[i]);
    }
  }

  function getTileIndex(i, x, y) {
    return nameTable[i].tile[y * nameTable[i].width + x];
  }

  function getAttrib(i, x, y) {
    return nameTable[i].attrib[y * nameTable[i].width + x];
  }

  function writeAttrib(i, index, value) {
    var basex = (index % 8) * 4;
    var basey = Math.floor(index / 8) * 4;
    var add;
    var tx, ty;
    var attindex;

    for (var sqy = 0; sqy < 2; sqy++) {
      for (var sqx = 0; sqx < 2; sqx++) {
        add = (value >> (2 * (sqy * 2 + sqx))) & 3;
        for (var y = 0; y < 2; y++) {
          for (var x = 0; x < 2; x++) {
            tx = basex + sqx * 2 + x;
            ty = basey + sqy * 2 + y;
            attindex = ty * nameTable[i].width + tx;
            nameTable[i].attrib[attindex] = (add << 2) & 12;
          }
        }
      }
    }
  }

  function doCycles(cycles) {
    for (; cycles > 0; cycles--) {
      if (
        curX === spr0HitX &&
        f_spVisibility === 1 &&
        scanline - 21 === spr0HitY
      ) {
        // Set sprite 0 hit flag:
        setStatusFlag(PpuStatus.SPRITE0HIT, true);
      }

      if (requestEndFrame) {
        nmiCounter--;
        if (nmiCounter === 0) {
          requestEndFrame = false;
          startVBlank();
          return 1;
        }
      }

      curX++;
      if (curX === 341) {
        curX = 0;
        endScanline();
      }
    }
  }

  reset();

  return {
    reset,
    startFrame,
    doCycles,
    setMirroring,
    toJSON,
    fromJSON,
    readStatusRegister,
    sramLoad,
    isPixelWhite,
    updateControlReg1,
    updateControlReg2,
    writeSRAMAddress,
    sramWrite,
    scrollWrite,
    writeVRAMAddress,
    vramWrite,
    sramDMA,
    triggerRendering,
    vramLoad,
    getVramMem: _ => vramMem,
    getPtTile: _ => ptTile,
  };
};

function getRed(rgb) {
  return (rgb >> 16) & 0xff;
}

function getGreen(rgb) {
  return (rgb >> 8) & 0xff;
}

function getBlue(rgb) {
  return rgb & 0xff;
}

function getRgb(r, g, b) {
  return (r << 16) | (g << 8) | b;
}

export default PPU;
