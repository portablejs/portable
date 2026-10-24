import { ascii, need, startsWith, u16, u24le } from '../bytes.js';
import { InvalidInputError } from '../errors.js';
import type { Format } from './format.js';

export const webp: Format = {
  validate: (input) =>
    startsWith(input, 0, 'RIFF') && startsWith(input, 8, 'WEBP') && startsWith(input, 12, 'VP8'),
  calculate(input) {
    const chunk = ascii(input, 12, 16);
    need(input, 30);
    const flags = input[20]!;
    if (chunk === 'VP8X') {
      if ((flags & 0xc1) !== 0) {
        throw new InvalidInputError('Invalid WebP');
      }
      return { width: 1 + u24le(input, 24), height: 1 + u24le(input, 27), type: 'webp' };
    }
    if (chunk === 'VP8 ' && flags !== 0x2f) {
      return {
        width: u16(input, 26, false) & 0x3fff,
        height: u16(input, 28, false) & 0x3fff,
        type: 'webp',
      };
    }
    if (chunk === 'VP8L' && !startsWith(input, 23, '\x9d\x01\x2a')) {
      const [b1, b2, b3, b4] = input.subarray(21, 25);
      return {
        width: 1 + (((b2! & 0x3f) << 8) | b1!),
        height: 1 + (((b4! & 0xf) << 10) | (b3! << 2) | ((b2! & 0xc0) >> 6)),
        type: 'webp',
      };
    }
    throw new InvalidInputError('Invalid WebP');
  },
};
