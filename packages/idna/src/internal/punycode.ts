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

const digits = 'abcdefghijklmnopqrstuvwxyz0123456789';

// Both directions count positions with a Fenwick tree, so a long label takes O(n log n) time. The
// RFC's sample code inserts into an array and rescans the input for each code point, both O(n²).

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

function markHandled(tree: Int32Array, position: number): void {
  for (let j = position + 1; j < tree.length; j += j & -j) {
    tree[j]!++;
  }
}

function countHandled(tree: Int32Array, end: number): number {
  let count = 0;
  for (let j = end; j > 0; j -= j & -j) {
    count += tree[j]!;
  }
  return count;
}

const positionScale = 2 ** 32;

/** RFC 3492 encoding of one label, without the `xn--` prefix. Returns `undefined` on overflow. */
export function encode(input: string): string | undefined {
  let output = '';
  let size = 0;
  let extended = 0;
  for (let i = 0; i < input.length; i++, size++) {
    const code = input.charCodeAt(i);
    if (code < 0x80) {
      output += input[i];
    } else {
      extended++;
      if (code >= 0xd800 && code <= 0xdbff && input.codePointAt(i)! > 0xffff) {
        i++;
      }
    }
  }

  // Each extended code point sorted by value, then position, packed into one number.
  const handledTree = new Int32Array(size + 1);
  const order = new Float64Array(extended);
  for (let i = 0, position = 0, k = 0; i < input.length; i++, position++) {
    const code = input.codePointAt(i)!;
    if (code > 0xffff) {
      i++;
    }
    if (code < 0x80) {
      markHandled(handledTree, position);
    } else {
      order[k++] = code * positionScale + position;
    }
  }
  order.sort();

  const basic = output.length;
  let handled = basic;
  if (basic > 0) {
    output += '-';
  }

  let n = initialN;
  let delta = 0;
  let bias = initialBias;
  for (let first = 0; first < extended;) {
    const m = Math.floor(order[first]! / positionScale);
    if (m - n > Math.floor((maxInt - delta) / (handled + 1))) {
      return undefined;
    }
    delta += (m - n) * (handled + 1);
    n = m;
    let end = first;
    let previous = 0;
    for (; end < extended && Math.floor(order[end]! / positionScale) === m; end++) {
      const position = order[end]! % positionScale;
      delta += countHandled(handledTree, position) - countHandled(handledTree, previous);
      if (delta > maxInt) {
        return undefined;
      }
      let q = delta;
      for (let k = base; ; k += base) {
        const t = k <= bias ? tMin : k >= bias + tMax ? tMax : k - bias;
        if (q < t) {
          break;
        }
        output += digits[t + ((q - t) % (base - t))];
        q = Math.floor((q - t) / (base - t));
      }
      output += digits[q];
      bias = adapt(delta, handled + 1, handled === basic);
      delta = 0;
      handled++;
      previous = position + 1;
    }
    delta += countHandled(handledTree, size) - countHandled(handledTree, previous);
    if (delta > maxInt) {
      return undefined;
    }
    for (let j = first; j < end; j++) {
      markHandled(handledTree, order[j]! % positionScale);
    }
    first = end;
    delta++;
    n++;
  }
  return output;
}
