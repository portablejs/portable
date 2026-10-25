import { need, u16 } from '../bytes.js';
import type { Image } from '../parse.js';
import type { Format } from './format.js';

function icon(kind: 1 | 2, type: 'ico' | 'cur'): Format {
  return {
    validate: (input) =>
      u16(input, 0, false) === 0 && u16(input, 4, false) !== 0 && u16(input, 2, false) === kind,
    calculate(input) {
      const count = u16(input, 4, false);
      need(input, 6 + count * 16);
      const entry = (i: number): Image => ({
        width: input[6 + i * 16]! || 256,
        height: input[7 + i * 16]! || 256,
      });
      const { width, height } = entry(0);
      if (count === 1) {
        return { width, height, type };
      }
      return { width, height, type, images: Array.from({ length: count }, (_, i) => entry(i)) };
    },
  };
}

export const ico: Format = icon(1, 'ico');
export const cur: Format = icon(2, 'cur');
