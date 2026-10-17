// Erzeugt die App-Icons (PNG) ohne externe Abhängigkeiten: node tools/icon.js
const fs = require('fs');
const zlib = require('zlib');
const path = require('path');

function crc32(buf) {
  let c, crc = 0xffffffff;
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(typ, daten) {
  const len = Buffer.alloc(4); len.writeUInt32BE(daten.length);
  const td = Buffer.concat([Buffer.from(typ), daten]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function png(gr, pixel) {
  const roh = Buffer.alloc((gr * 4 + 1) * gr);
  for (let y = 0; y < gr; y++) {
    roh[y * (gr * 4 + 1)] = 0;
    for (let x = 0; x < gr; x++) {
      const [r, g, b] = pixel(x / gr, y / gr);
      const o = y * (gr * 4 + 1) + 1 + x * 4;
      roh[o] = r; roh[o + 1] = g; roh[o + 2] = b; roh[o + 3] = 255;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(gr, 0); ihdr.writeUInt32BE(gr, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(roh)), chunk('IEND', Buffer.alloc(0)),
  ]);
}
// Stern-Test (Punkt in Polygon)
function stern(cx, cy, ra, ri) {
  const p = [];
  for (let i = 0; i < 10; i++) {
    const r = i % 2 ? ri : ra;
    const w = -Math.PI / 2 + i * Math.PI / 5;
    p.push([cx + r * Math.cos(w), cy + r * Math.sin(w)]);
  }
  return (x, y) => {
    let drin = false;
    for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
      if ((p[i][1] > y) !== (p[j][1] > y) && x < (p[j][0] - p[i][0]) * (y - p[i][1]) / (p[j][1] - p[i][1]) + p[i][0]) drin = !drin;
    }
    return drin;
  };
}
const imStern = stern(0.72, 0.28, 0.17, 0.075);
function pixel(x, y) {
  // Plus-Zeichen
  const plus = (Math.abs(x - 0.42) < 0.07 && Math.abs(y - 0.56) < 0.24) || (Math.abs(y - 0.56) < 0.07 && Math.abs(x - 0.42) < 0.24);
  if (plus) return [255, 255, 255];
  if (imStern(x, y)) return [255, 197, 49];
  const t = y;
  return [Math.round(79 - t * 20), Math.round(124 - t * 30), 255];
}
for (const gr of [192, 512]) {
  fs.writeFileSync(path.join(__dirname, '..', 'icons', `icon-${gr}.png`), png(gr, pixel));
}
console.log('Icons geschrieben');
