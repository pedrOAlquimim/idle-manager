// Draws the IdleManager icon (the letters I and M on a rounded square) as a PNG, with no dependencies:
//   node scripts/generate-icon.mjs   writes build/icon.png (512px) and assets/tray.png (32px)
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { crc32, deflateSync } from 'node:zlib';

const BACKGROUND = [0x3b, 0x34, 0x66];
const LETTERS = [0xd6, 0xcc, 0xff];
const CORNER = 0.2;
const SUBSAMPLES = 2;

const inside = (x, y, left, top, right, bottom) => x >= left && x <= right && y >= top && y <= bottom;

function distanceToSegment(x, y, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const along = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(x - (ax + along * dx), y - (ay + along * dy));
}

// Coordinates are fractions of the icon: 0 is the left or top edge, 1 the right or bottom edge.
function isLetter(x, y) {
  const stroke = 0.04;
  const letterI =
    inside(x, y, 0.24, 0.28, 0.34, 0.72) || inside(x, y, 0.18, 0.28, 0.4, 0.35) || inside(x, y, 0.18, 0.65, 0.4, 0.72);
  const letterM =
    inside(x, y, 0.46, 0.28, 0.54, 0.72) ||
    inside(x, y, 0.74, 0.28, 0.82, 0.72) ||
    distanceToSegment(x, y, 0.5, 0.3, 0.64, 0.58) <= stroke ||
    distanceToSegment(x, y, 0.78, 0.3, 0.64, 0.58) <= stroke;
  return letterI || letterM;
}

function isBody(x, y) {
  const cx = Math.min(Math.max(x, CORNER), 1 - CORNER);
  const cy = Math.min(Math.max(y, CORNER), 1 - CORNER);
  return Math.hypot(x - cx, y - cy) <= CORNER;
}

function chunk(type, data) {
  const header = Buffer.alloc(8);
  header.writeUInt32BE(data.length, 0);
  header.write(type, 4, 'latin1');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([header.subarray(4), data])), 0);
  return Buffer.concat([header, data, crc]);
}

export function renderPng(size) {
  const stride = 1 + size * 4;
  const raw = Buffer.alloc(size * stride);
  for (let y = 0; y < size; y += 1) {
    raw[y * stride] = 0;
    for (let x = 0; x < size; x += 1) {
      let body = 0;
      let letters = 0;
      for (let sy = 0; sy < SUBSAMPLES; sy += 1) {
        for (let sx = 0; sx < SUBSAMPLES; sx += 1) {
          const fx = (x + (sx + 0.5) / SUBSAMPLES) / size;
          const fy = (y + (sy + 0.5) / SUBSAMPLES) / size;
          if (!isBody(fx, fy)) continue;
          body += 1;
          if (isLetter(fx, fy)) letters += 1;
        }
      }
      const total = SUBSAMPLES * SUBSAMPLES;
      const at = y * stride + 1 + x * 4;
      if (body === 0) continue;
      // Straight alpha: the color is the mix of letters and background inside the shape.
      for (let channel = 0; channel < 3; channel += 1) {
        const mixed = (LETTERS[channel] * letters + BACKGROUND[channel] * (body - letters)) / body;
        raw[at + channel] = Math.round(mixed);
      }
      raw[at + 3] = Math.round((255 * body) / total);
    }
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header.set([8, 6, 0, 0, 0], 8);
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const root = join(dirname(fileURLToPath(import.meta.url)), '..');
  for (const [file, size] of [['build/icon.png', 512], ['assets/tray.png', 32]]) {
    mkdirSync(dirname(join(root, file)), { recursive: true });
    writeFileSync(join(root, file), renderPng(size));
    console.log(`wrote ${file} (${size}x${size})`);
  }
}
