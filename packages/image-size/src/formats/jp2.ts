import { ascii, findBox, startsWith, u32 } from '../bytes.js';
import { InvalidInputError } from '../errors.js';
import type { Format } from './format.js';

export const jp2: Format = {
  validate(input) {
    if (!startsWith(input, 4, 'jP  ')) {
      return false;
    }
    const ftyp = findBox(input, 'ftyp', 0, Infinity);
    return ftyp !== undefined && ascii(input, ftyp.offset + 8, ftyp.offset + 12) === 'jp2 ';
  },
  calculate(input) {
    const jp2h = findBox(input, 'jp2h', 0, Infinity);
    const ihdr = jp2h && findBox(input, 'ihdr', jp2h.offset + 8, jp2h.offset + jp2h.size);
    if (!ihdr) {
      throw new InvalidInputError('Unsupported JPEG 2000 format');
    }
    return {
      width: u32(input, ihdr.offset + 12, true),
      height: u32(input, ihdr.offset + 8, true),
      type: 'jp2',
    };
  },
};
