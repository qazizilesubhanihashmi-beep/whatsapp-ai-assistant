import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Buffer): Buffer {
  const typeBuf = Buffer.from(type, 'ascii');
  const lenBuf = Buffer.alloc(4);
  lenBuf.writeUInt32BE(data.length, 0);
  const crcInput = Buffer.concat([typeBuf, data]);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(crcInput), 0);
  return Buffer.concat([lenBuf, typeBuf, data, crcBuf]);
}

function renderIconPng(size: number, maskable: boolean): Buffer {
  const raw = Buffer.alloc(size * (1 + size * 4));
  const cx = size / 2;
  const cy = size / 2;
  const scale = maskable ? 0.72 : 0.88;
  const radius = (size * scale) / 2;
  const cornerRadius = maskable ? 0 : size * 0.22;

  for (let y = 0; y < size; y++) {
    const rowStart = y * (1 + size * 4);
    raw[rowStart] = 0; // filter type 0
    for (let x = 0; x < size; x++) {
      const idx = rowStart + 1 + x * 4;
      let inBg = true;
      if (!maskable && cornerRadius > 0) {
        const dx = Math.max(cornerRadius - x, 0, x - (size - 1 - cornerRadius));
        const dy = Math.max(cornerRadius - y, 0, y - (size - 1 - cornerRadius));
        inBg = dx * dx + dy * dy <= cornerRadius * cornerRadius;
      }

      if (!inBg) {
        raw[idx] = 0;
        raw[idx + 1] = 0;
        raw[idx + 2] = 0;
        raw[idx + 3] = 0;
        continue;
      }

      // Background teal (#0F766E)
      let r = 15;
      let g = 118;
      let b = 110;
      const a = 255;

      // White chat bubble circle + tail in safe zone
      const nx = (x - cx) / radius;
      const ny = (y - cy) / radius;
      const distSq = nx * nx + ny * ny;
      const inBubble = distSq <= 0.54 * 0.54;
      const inTail =
        nx >= -0.64 &&
        nx <= -0.18 &&
        ny >= 0.2 &&
        ny <= 0.64 &&
        nx + ny <= 0.35 &&
        ny - nx <= 1.05 &&
        ny - 0.8 * nx <= 0.88;

      if (inBubble || inTail) {
        r = 255;
        g = 255;
        b = 255;
        // Inner 4-point spark
        const sx = Math.abs(nx);
        const sy = Math.abs(ny);
        const inSpark = Math.pow(sx / 0.28, 0.55) + Math.pow(sy / 0.28, 0.55) <= 1;
        if (inSpark) {
          r = 15;
          g = 118;
          b = 110;
        }
      }

      raw[idx] = r;
      raw[idx + 1] = g;
      raw[idx + 2] = b;
      raw[idx + 3] = a;
    }
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const compressed = zlib.deflateSync(raw, { level: 9 });
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  return Buffer.concat([
    signature,
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', compressed),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

const outDir = path.resolve(process.cwd(), 'public');
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'pwa-192x192.png'), renderIconPng(192, false));
fs.writeFileSync(path.join(outDir, 'pwa-512x512.png'), renderIconPng(512, false));
fs.writeFileSync(path.join(outDir, 'pwa-maskable-512x512.png'), renderIconPng(512, true));
fs.writeFileSync(path.join(outDir, 'apple-touch-icon.png'), renderIconPng(180, false));
console.log('Generated PWA PNG icons in public/');
