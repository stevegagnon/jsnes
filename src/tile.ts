


export function Tile() {
  let pix = new Array(64);
  let opaque = new Array(8);

  let fbIndex = null;
  let tIndex = null;
  let x = null;
  let y = null;
  let w = null;
  let h = null;
  let incX = null;
  let incY = null;
  let palIndex = null;
  let tpri = null;
  let c = null;
  let initialized = false;

 
  function setBuffer(scanline) {
    for (y = 0; y < 8; y++) {
      setScanline(y, scanline[y], scanline[y + 8]);
    }
  }

  function setScanline(sline, b1, b2) {
    initialized = true;
    tIndex = sline << 3;
    for (x = 0; x < 8; x++) {
      pix[tIndex + x] =
        ((b1 >> (7 - x)) & 1) + (((b2 >> (7 - x)) & 1) << 1);
      if (pix[tIndex + x] === 0) {
        opaque[sline] = false;
      }
    }
  }

  function render(
    buffer,
    srcx1,
    srcy1,
    srcx2,
    srcy2,
    dx,
    dy,
    palAdd,
    palette,
    flipHorizontal,
    flipVertical,
    pri,
    priTable
  ) {
    if (dx < -7 || dx >= 256 || dy < -7 || dy >= 240) {
      return;
    }

    w = srcx2 - srcx1;
    h = srcy2 - srcy1;

    if (dx < 0) {
      srcx1 -= dx;
    }
    if (dx + srcx2 >= 256) {
      srcx2 = 256 - dx;
    }

    if (dy < 0) {
      srcy1 -= dy;
    }
    if (dy + srcy2 >= 240) {
      srcy2 = 240 - dy;
    }

    if (!flipHorizontal && !flipVertical) {
      fbIndex = (dy << 8) + dx;
      tIndex = 0;
      for (y = 0; y < 8; y++) {
        for (x = 0; x < 8; x++) {
          if (
            x >= srcx1 &&
            x < srcx2 &&
            y >= srcy1 &&
            y < srcy2
          ) {
            palIndex = pix[tIndex];
            tpri = priTable[fbIndex];
            if (palIndex !== 0 && pri <= (tpri & 0xff)) {
              //console.log("Rendering upright tile to buffer");
              buffer[fbIndex] = palette[palIndex + palAdd];
              tpri = (tpri & 0xf00) | pri;
              priTable[fbIndex] = tpri;
            }
          }
          fbIndex++;
          tIndex++;
        }
        fbIndex -= 8;
        fbIndex += 256;
      }
    } else if (flipHorizontal && !flipVertical) {
      fbIndex = (dy << 8) + dx;
      tIndex = 7;
      for (y = 0; y < 8; y++) {
        for (x = 0; x < 8; x++) {
          if (
            x >= srcx1 &&
            x < srcx2 &&
            y >= srcy1 &&
            y < srcy2
          ) {
            palIndex = pix[tIndex];
            tpri = priTable[fbIndex];
            if (palIndex !== 0 && pri <= (tpri & 0xff)) {
              buffer[fbIndex] = palette[palIndex + palAdd];
              tpri = (tpri & 0xf00) | pri;
              priTable[fbIndex] = tpri;
            }
          }
          fbIndex++;
          tIndex--;
        }
        fbIndex -= 8;
        fbIndex += 256;
        tIndex += 16;
      }
    } else if (flipVertical && !flipHorizontal) {
      fbIndex = (dy << 8) + dx;
      tIndex = 56;
      for (y = 0; y < 8; y++) {
        for (x = 0; x < 8; x++) {
          if (
            x >= srcx1 &&
            x < srcx2 &&
            y >= srcy1 &&
            y < srcy2
          ) {
            palIndex = pix[tIndex];
            tpri = priTable[fbIndex];
            if (palIndex !== 0 && pri <= (tpri & 0xff)) {
              buffer[fbIndex] = palette[palIndex + palAdd];
              tpri = (tpri & 0xf00) | pri;
              priTable[fbIndex] = tpri;
            }
          }
          fbIndex++;
          tIndex++;
        }
        fbIndex -= 8;
        fbIndex += 256;
        tIndex -= 16;
      }
    } else {
      fbIndex = (dy << 8) + dx;
      tIndex = 63;
      for (y = 0; y < 8; y++) {
        for (x = 0; x < 8; x++) {
          if (
            x >= srcx1 &&
            x < srcx2 &&
            y >= srcy1 &&
            y < srcy2
          ) {
            palIndex = pix[tIndex];
            tpri = priTable[fbIndex];
            if (palIndex !== 0 && pri <= (tpri & 0xff)) {
              buffer[fbIndex] = palette[palIndex + palAdd];
              tpri = (tpri & 0xf00) | pri;
              priTable[fbIndex] = tpri;
            }
          }
          fbIndex++;
          tIndex--;
        }
        fbIndex -= 8;
        fbIndex += 256;
      }
    }
  }

  function isTransparent(x, y) {
    return pix[(y << 3) + x] === 0;
  }

  function toJSON() {
    return {
      opaque: opaque,
      pix: pix,
    };
  }

  function fromJSON(s) {
    opaque = s.opaque;
    pix = s.pix;
  }

  return {
    toJSON,
    fromJSON,
    isTransparent,
    render,
    setScanline,
    pix,
    opaque,
  }
}

export type TileFields = ReturnType<typeof Tile>;

export default Tile;
