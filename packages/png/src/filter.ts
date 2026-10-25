import { InvalidInputError } from './errors.js';

/** PNG scanline filter: 0 none, 1 sub, 2 up, 3 average, 4 Paeth. */
export type FilterType = 0 | 1 | 2 | 3 | 4;

export function unfilter(
  raw: Uint8Array,
  start: number,
  stride: number,
  rows: number,
  bpp: number,
): void {
  let prev = -1;
  for (let row = 0, pos = start; row < rows; row++, pos += stride + 1) {
    const line = pos + 1;
    const filter = raw[pos];
    if (filter === 1 || (filter === 4 && prev < 0)) {
      for (let i = bpp; i < stride; i++) {
        raw[line + i] = raw[line + i]! + raw[line + i - bpp]!;
      }
    } else if (filter === 2) {
      if (prev >= 0) {
        for (let i = 0; i < stride; i++) {
          raw[line + i] = raw[line + i]! + raw[prev + i]!;
        }
      }
    } else if (filter === 3) {
      if (prev < 0) {
        for (let i = bpp; i < stride; i++) {
          raw[line + i] = raw[line + i]! + (raw[line + i - bpp]! >> 1);
        }
      } else {
        for (let i = 0; i < bpp; i++) {
          raw[line + i] = raw[line + i]! + (raw[prev + i]! >> 1);
        }
        for (let i = bpp; i < stride; i++) {
          raw[line + i] = raw[line + i]! + ((raw[line + i - bpp]! + raw[prev + i]!) >> 1);
        }
      }
    } else if (filter === 4) {
      for (let i = 0; i < bpp; i++) {
        raw[line + i] = raw[line + i]! + raw[prev + i]!;
      }
      for (let i = bpp; i < stride; i++) {
        const a = raw[line + i - bpp]!;
        const b = raw[prev + i]!;
        const c = raw[prev + i - bpp]!;
        raw[line + i] = raw[line + i]! + paeth(a, b, c);
      }
    } else if (filter !== 0) {
      throw new InvalidInputError(`Unknown filter type ${filter}.`);
    }
    prev = line;
  }
}

export function filterRows(
  pixels: Uint8Array,
  stride: number,
  height: number,
  bpp: number,
  filters: readonly FilterType[],
): Uint8Array {
  const out = new Uint8Array((stride + 1) * height);
  const zeros = new Uint8Array(stride);
  const costs = [0, 0, 0, 0, 0];
  for (let y = 0; y < height; y++) {
    const line = y * stride;
    const above = y > 0 ? pixels : zeros;
    const prev = y > 0 ? line - stride : 0;
    let chosen = filters[0]!;
    if (filters.length > 1) {
      rowCosts(pixels, line, above, prev, stride, bpp, costs);
      for (const f of filters) {
        if (costs[f]! < costs[chosen]!) {
          chosen = f;
        }
      }
    }
    const target = y * (stride + 1);
    out[target] = chosen;
    applyFilter(chosen, pixels, line, above, prev, stride, bpp, out, target + 1);
  }
  return out;
}

function rowCosts(
  src: Uint8Array,
  line: number,
  above: Uint8Array,
  prev: number,
  stride: number,
  bpp: number,
  costs: number[],
) {
  let none = 0;
  let sub = 0;
  let up = 0;
  let average = 0;
  let paethCost = 0;
  for (let i = 0; i < stride; i++) {
    const x = src[line + i]!;
    const left = i >= bpp;
    const a = left ? src[line + i - bpp]! : 0;
    const b = above[prev + i]!;
    const c = left ? above[prev + i - bpp]! : 0;
    none += x < 128 ? x : 256 - x;
    let v = (x - a) & 0xff;
    sub += v < 128 ? v : 256 - v;
    v = (x - b) & 0xff;
    up += v < 128 ? v : 256 - v;
    v = (x - ((a + b) >> 1)) & 0xff;
    average += v < 128 ? v : 256 - v;
    v = (x - paeth(a, b, c)) & 0xff;
    paethCost += v < 128 ? v : 256 - v;
  }
  costs[0] = none;
  costs[1] = sub;
  costs[2] = up;
  costs[3] = average;
  costs[4] = paethCost;
}

function applyFilter(
  filter: FilterType,
  src: Uint8Array,
  line: number,
  above: Uint8Array,
  prev: number,
  stride: number,
  bpp: number,
  out: Uint8Array,
  target: number,
) {
  const head = Math.min(bpp, stride);
  if (filter === 0) {
    out.set(src.subarray(line, line + stride), target);
  } else if (filter === 1) {
    for (let i = 0; i < head; i++) {
      out[target + i] = src[line + i]!;
    }
    for (let i = bpp; i < stride; i++) {
      out[target + i] = src[line + i]! - src[line + i - bpp]!;
    }
  } else if (filter === 2) {
    for (let i = 0; i < stride; i++) {
      out[target + i] = src[line + i]! - above[prev + i]!;
    }
  } else if (filter === 3) {
    for (let i = 0; i < head; i++) {
      out[target + i] = src[line + i]! - (above[prev + i]! >> 1);
    }
    for (let i = bpp; i < stride; i++) {
      out[target + i] = src[line + i]! - ((src[line + i - bpp]! + above[prev + i]!) >> 1);
    }
  } else {
    for (let i = 0; i < head; i++) {
      out[target + i] = src[line + i]! - above[prev + i]!;
    }
    for (let i = bpp; i < stride; i++) {
      out[target + i] =
        src[line + i]! - paeth(src[line + i - bpp]!, above[prev + i]!, above[prev + i - bpp]!);
    }
  }
}

// `paeth` is branch-free, because on photographic images the comparisons are unpredictable and
// the mispredictions cost more than the arithmetic.
function paeth(a: number, b: number, c: number): number {
  let pa = b - c;
  let pb = a - c;
  let pc = pa + pb;
  pa = (pa ^ (pa >> 31)) - (pa >> 31);
  pb = (pb ^ (pb >> 31)) - (pb >> 31);
  pc = (pc ^ (pc >> 31)) - (pc >> 31);
  const notA = ((pb - pa) | (pc - pa)) >> 31;
  const notB = (pc - pb) >> 31;
  return (a & ~notA) | (((b & ~notB) | (c & notB)) & notA);
}
