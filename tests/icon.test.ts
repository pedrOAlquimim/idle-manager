import { inflateSync } from 'node:zlib';
import { describe, expect, test } from 'vitest';
import { renderPng } from '../scripts/generate-icon.mjs';

const SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const BACKGROUND = [0x3b, 0x34, 0x66];
const LETTERS = [0xd6, 0xcc, 0xff];

interface Decoded {
  width: number;
  height: number;
  colorType: number;
  pixel(x: number, y: number): number[];
}

// Reads back what the encoder wrote: every row starts with filter 0, so rows are plain RGBA.
function decode(png: Buffer): Decoded {
  const width = png.readUInt32BE(16);
  const height = png.readUInt32BE(20);
  const colorType = png[25] ?? -1;
  const idat: Buffer[] = [];
  for (let offset = 8; offset < png.length; ) {
    const length = png.readUInt32BE(offset);
    const type = png.toString('latin1', offset + 4, offset + 8);
    if (type === 'IDAT') idat.push(png.subarray(offset + 8, offset + 8 + length));
    offset += 12 + length;
  }
  const raw = inflateSync(Buffer.concat(idat));
  return {
    width,
    height,
    colorType,
    pixel: (x, y) => {
      const at = y * (1 + width * 4) + 1 + x * 4;
      return [raw[at] ?? -1, raw[at + 1] ?? -1, raw[at + 2] ?? -1, raw[at + 3] ?? -1];
    },
  };
}

describe.each([32, 512])('icon %ipx', (size) => {
  const png = renderPng(size);
  const image = decode(png);

  test('is a PNG of the requested size, 8-bit RGBA', () => {
    expect(png.subarray(0, 8)).toEqual(SIGNATURE);
    expect(png.toString('latin1', 12, 16)).toBe('IHDR');
    expect([image.width, image.height, image.colorType, png[24]]).toEqual([size, size, 6, 8]);
    expect(png.subarray(png.length - 12, png.length - 8).readUInt32BE(0)).toBe(0);
    expect(png.toString('latin1', png.length - 8, png.length - 4)).toBe('IEND');
  });

  test('has rounded corners and a solid body', () => {
    expect(image.pixel(0, 0)[3]).toBe(0);
    expect(image.pixel(size - 1, size - 1)[3]).toBe(0);
    const edge = image.pixel(Math.floor(size * 0.1), Math.floor(size * 0.5));
    expect(edge).toEqual([...BACKGROUND, 255]);
  });

  test('draws the letters I and M in the light color', () => {
    let letterPixels = 0;
    for (let y = 0; y < size; y += 1) {
      for (let x = 0; x < size; x += 1) {
        const [r, g, b, a] = image.pixel(x, y);
        if (a === 255 && r === LETTERS[0] && g === LETTERS[1] && b === LETTERS[2]) letterPixels += 1;
      }
    }
    const share = letterPixels / (size * size);
    expect(share).toBeGreaterThan(0.05);
    expect(share).toBeLessThan(0.35);
  });

  test('puts the I on the left half and the M on the right half', () => {
    const lightIn = (from: number, to: number): number => {
      let count = 0;
      for (let y = 0; y < size; y += 1) {
        for (let x = Math.floor(size * from); x < Math.floor(size * to); x += 1) {
          if (image.pixel(x, y).slice(0, 3).join() === LETTERS.join()) count += 1;
        }
      }
      return count;
    };
    expect(lightIn(0.15, 0.42)).toBeGreaterThan(0);
    expect(lightIn(0.44, 0.85)).toBeGreaterThan(lightIn(0.15, 0.42));
  });
});
