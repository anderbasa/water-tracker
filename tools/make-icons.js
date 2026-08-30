/* make-icons.js — genera los PNG de iconos sin dependencias externas.
   Uso:  node tools/make-icons.js
   Crea icons/icon-192.png, icon-512.png y apple-touch-icon.png (180). */

const zlib = require('zlib');
const fs = require('fs');
const path = require('path');

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crc]);
}

function encodePNG(width, height, rgba) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;   // bit depth
  ihdr[9] = 6;   // color type RGBA
  ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;

  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0; // filtro none
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride);
  }
  const idat = zlib.deflateSync(raw, { level: 9 });

  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', idat),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function lerp(a, b, t) { return a + (b - a) * t; }

function drawIcon(size) {
  const rgba = Buffer.alloc(size * size * 4);
  const r = size * 0.219;                 // radio esquinas
  const cx = size * 0.5;
  const circleCy = size * 0.605;
  const circleR = size * 0.200;
  const apexY = size * 0.155;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;

      // máscara rounded-rect
      let inRect = true;
      const rx = Math.min(x, size - x);
      const ry = Math.min(y, size - y);
      if (rx < r && ry < r) {
        const dx = r - rx, dy = r - ry;
        if (dx * dx + dy * dy > r * r) inRect = false;
      }
      if (!inRect) { rgba[i + 3] = 0; continue; }

      // fondo degradado
      const t = y / size;
      let cr = lerp(0x4f, 0x0a, t);
      let cg = lerp(0xb8, 0x63, t);
      let cb = lerp(0xff, 0xc9, t);

      // gota: círculo inferior + triángulo hacia el vértice
      const inCircle = (x - cx) ** 2 + (y - circleCy) ** 2 <= circleR * circleR;
      let inTriangle = false;
      if (y >= apexY && y <= circleCy) {
        const k = (y - apexY) / (circleCy - apexY);
        const half = circleR * Math.pow(k, 1.7);
        inTriangle = Math.abs(x - cx) <= half;
      }
      if (inCircle || inTriangle) {
        // sombra suave dentro de la gota
        const sh = inCircle ? Math.max(0, 1 - ((x - cx + circleR * 0.4) ** 2 + (y - circleCy + circleR * 0.4) ** 2) / (circleR * circleR * 2.2)) : 0;
        cr = lerp(255, 200, sh * 0.35);
        cg = lerp(255, 226, sh * 0.35);
        cb = 255;
      }

      rgba[i] = cr | 0;
      rgba[i + 1] = cg | 0;
      rgba[i + 2] = cb | 0;
      rgba[i + 3] = 255;
    }
  }
  return encodePNG(size, size, rgba);
}

const outDir = path.join(__dirname, '..', 'icons');
const targets = [
  ['icon-192.png', 192],
  ['icon-512.png', 512],
  ['apple-touch-icon.png', 180],
];
for (const [name, size] of targets) {
  fs.writeFileSync(path.join(outDir, name), drawIcon(size));
  console.log('escrito', name, `(${size}x${size})`);
}
