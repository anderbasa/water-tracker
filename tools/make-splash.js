/* make-splash.js — genera las pantallas de carga (apple-touch-startup-image)
   para los tamaños de iPhone más comunes, en claro y oscuro. Sin dependencias
   (mismo encoder PNG casero que make-icons.js).
   Uso:  node tools/make-splash.js */

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
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;

  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0;
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride);
  }
  const idat = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))]);
}

const THEMES = {
  light: { bg: [0xee, 0xf6, 0xff], drop: [0x0a, 0x84, 0xff], dropLight: [0xff, 0xff, 0xff] },
  dark: { bg: [0x0b, 0x12, 0x20], drop: [0x4f, 0xb8, 0xff], dropLight: [0x0b, 0x12, 0x20] },
};

function drawSplash(width, height, theme) {
  const rgba = Buffer.alloc(width * height * 4);
  const [br, bg, bb] = theme.bg;
  const cx = width / 2;
  const size = Math.min(width, height);
  const circleR = size * 0.085;
  const circleCy = height / 2 + circleR * 0.42;
  const apexY = circleCy - circleR * 2.05;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      let r = br, g = bg, b = bb;

      const inCircle = (x - cx) ** 2 + (y - circleCy) ** 2 <= circleR * circleR;
      let inTriangle = false;
      if (y >= apexY && y <= circleCy) {
        const k = (y - apexY) / (circleCy - apexY);
        const half = circleR * Math.pow(k, 1.7);
        inTriangle = Math.abs(x - cx) <= half;
      }
      if (inCircle || inTriangle) { [r, g, b] = theme.drop; }

      rgba[i] = r; rgba[i + 1] = g; rgba[i + 2] = b; rgba[i + 3] = 255;
    }
  }
  return encodePNG(width, height, rgba);
}

// [width, height, device-pixel-ratio, etiqueta] — tamaños DIP x ratio = px
const SIZES = [
  [375, 667, 2, 'se-8'],
  [375, 812, 3, 'x-11pro-12mini-13mini'],
  [414, 896, 2, 'xr-11'],
  [414, 896, 3, 'xsmax-11promax'],
  [390, 844, 3, '12-13-14'],
  [428, 926, 3, '12promax-13promax-14plus'],
  [393, 852, 3, '14pro-15-16'],
  [430, 932, 3, '14promax-15promax-15plus-16plus'],
  [402, 874, 3, '16pro'],
  [440, 956, 3, '16promax'],
];

const outDir = path.join(__dirname, '..', 'icons', 'splash');
fs.mkdirSync(outDir, { recursive: true });

const links = [];
for (const [wDip, hDip, ratio, label] of SIZES) {
  const w = wDip * ratio, h = hDip * ratio;
  for (const themeName of ['light', 'dark']) {
    const png = drawSplash(w, h, THEMES[themeName]);
    const name = `${label}-${themeName}.png`;
    fs.writeFileSync(path.join(outDir, name), png);
    const scheme = themeName === 'dark' ? 'dark' : 'light';
    links.push(
      `<link rel="apple-touch-startup-image" href="icons/splash/${name}" media="screen and (device-width: ${wDip}px) and (device-height: ${hDip}px) and (-webkit-device-pixel-ratio: ${ratio}) and (orientation: portrait) and (prefers-color-scheme: ${scheme})" />`
    );
    console.log('escrito', name, `(${w}x${h})`);
  }
}

fs.writeFileSync(path.join(outDir, 'links.html'), links.join('\n') + '\n');
console.log('\nEtiquetas <link> escritas en icons/splash/links.html — pégalas en <head>.');
