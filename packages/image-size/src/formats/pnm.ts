import { latin1, NeedMore, startsWith, u8 } from '../bytes.js';
import { InvalidInputError } from '../errors.js';
import type { Size } from '../parse.js';
import type { Format } from './format.js';

const isSpace = (byte: number) => byte === 0x20 || (byte >= 0x09 && byte <= 0x0d);

function* tokens(input: Uint8Array, final: boolean): Generator<string> {
  let offset = 2;
  for (;;) {
    while (offset < input.length && (isSpace(input[offset]!) || input[offset] === 0x23)) {
      if (input[offset] === 0x23) {
        while (offset < input.length && input[offset] !== 0x0a && input[offset] !== 0x0d) {
          offset++;
        }
      } else {
        offset++;
      }
    }
    const start = offset;
    while (offset < input.length && !isSpace(input[offset]!) && input[offset] !== 0x23) {
      offset++;
    }
    if (offset === input.length && (!final || start === offset)) {
      throw new NeedMore(offset + 1);
    }
    yield latin1(input.subarray(start, offset));
  }
}

const dimension = (token: string | undefined) =>
  token !== undefined && /^\d+$/.test(token) ? Number(token) : undefined;

function netpbm(input: Uint8Array, final: boolean): Size {
  const header = tokens(input, final);
  const width = dimension(header.next().value);
  const height = dimension(header.next().value);
  if (!width || !height) {
    throw new InvalidInputError('Invalid PNM');
  }
  return { width, height, type: 'pnm' };
}

function pam(input: Uint8Array, final: boolean): Size {
  let width: number | undefined;
  let height: number | undefined;
  const header = tokens(input, final);
  for (let token = header.next(); !token.done; token = header.next()) {
    if (token.value === 'ENDHDR') {
      break;
    }
    if (token.value === 'WIDTH') {
      width = dimension(header.next().value);
    }
    if (token.value === 'HEIGHT') {
      height = dimension(header.next().value);
    }
    if (width && height) {
      return { width, height, type: 'pnm' };
    }
  }
  throw new InvalidInputError('Invalid PAM');
}

export const pnm: Format = {
  validate: (input) =>
    startsWith(input, 0, 'P') && /[1-7Ff]/.test(String.fromCharCode(u8(input, 1))),
  calculate: (input, final) => (u8(input, 1) === 0x37 ? pam(input, final) : netpbm(input, final)),
};
