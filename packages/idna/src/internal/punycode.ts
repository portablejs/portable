const base = 36;
const tMin = 1;
const tMax = 26;
const skew = 38;
const damp = 700;
const initialBias = 72;
const initialN = 128;
const maxInt = 0x7fffffff;

function adapt(delta: number, points: number, first: boolean): number {
  delta = first ? Math.floor(delta / damp) : delta >> 1;
  delta += Math.floor(delta / points);
  let k = 0;
  for (; delta > ((base - tMin) * tMax) >> 1; k += base) {
    delta = Math.floor(delta / (base - tMin));
  }
  return k + Math.floor(((base - tMin + 1) * delta) / (delta + skew));
}

function digitValue(code: number): number {
  if (code >= 0x30 && code <= 0x39) {
    return code - 22;
  }
  if (code >= 0x41 && code <= 0x5a) {
    return code - 0x41;
  }
  if (code >= 0x61 && code <= 0x7a) {
    return code - 0x61;
  }
  return base;
}

// Decoding places code points with a Fenwick tree, so a long label takes O(n log n) time. The RFC's
// sample code inserts into an array, which is O(n²).

/**
 * RFC 3492 decoding of one label without its `xn--` prefix. Returns `undefined` for invalid input.
 */
export function decode(input: string): string | undefined {
  const delimiter = input.lastIndexOf('-');
  const positions: number[] = [];
  const codes: number[] = [];
  for (let i = 0; i < delimiter; i++) {
    const code = input.charCodeAt(i);
    if (code >= 0x80) {
      return undefined;
    }
    positions.push(i);
    codes.push(code);
  }

  let n = initialN;
  let bias = initialBias;
  let i = 0;
  for (let at = delimiter > 0 ? delimiter + 1 : 0; at < input.length;) {
    const old = i;
    for (let w = 1, k = base; ; k += base) {
      if (at >= input.length) {
        return undefined;
      }
      const digit = digitValue(input.charCodeAt(at++));
      if (digit >= base || digit > Math.floor((maxInt - i) / w)) {
        return undefined;
      }
      i += digit * w;
      const t = k <= bias ? tMin : k >= bias + tMax ? tMax : k - bias;
      if (digit < t) {
        break;
      }
      if (w > Math.floor(maxInt / (base - t))) {
        return undefined;
      }
      w *= base - t;
    }
    const length = codes.length + 1;
    bias = adapt(i - old, length, old === 0);
    if (Math.floor(i / length) > maxInt - n) {
      return undefined;
    }
    n += Math.floor(i / length);
    i %= length;
    if (n > 0x10ffff) {
      return undefined;
    }
    positions.push(i++);
    codes.push(n);
  }

  // Place the code points from the last inserted to the first: each one takes the free slot at
  // its insertion position, counting only the slots that later insertions haven't taken.
  const size = codes.length;
  const free = new Int32Array(size + 1);
  for (let j = 1; j <= size; j++) {
    free[j] = j & -j;
  }
  let top = 1;
  while (top * 2 <= size) {
    top *= 2;
  }
  const output = new Int32Array(size);
  for (let k = size - 1; k >= 0; k--) {
    let slot = 0;
    let rank = positions[k]! + 1;
    for (let step = top; step > 0; step >>= 1) {
      if (slot + step <= size && free[slot + step]! < rank) {
        slot += step;
        rank -= free[slot]!;
      }
    }
    output[slot] = codes[k]!;
    for (let j = slot + 1; j <= size; j += j & -j) {
      free[j]!--;
    }
  }
  let text = '';
  for (const code of output) {
    text += String.fromCodePoint(code);
  }
  return text;
}
