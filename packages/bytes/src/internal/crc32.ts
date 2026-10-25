function makeCrc32(): (bytes: Uint8Array, crc: number) => number {
  const table = new Int32Array(16 * 256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c;
  }
  for (let n = 0; n < 256; n++) {
    let c = table[n]!;
    for (let k = 1; k < 16; k++) {
      c = table[c & 0xff]! ^ (c >>> 8);
      table[k * 256 + n] = c;
    }
  }
  const at = (k: number) => table.subarray(k * 256, k * 256 + 256);
  const [t0, t1, t2, t3, t4, t5, t6, t7] = [at(0), at(1), at(2), at(3), at(4), at(5), at(6), at(7)];
  const [t8, t9, ta, tb, tc, td, te, tf] = [
    at(8),
    at(9),
    at(10),
    at(11),
    at(12),
    at(13),
    at(14),
    at(15),
  ];
  return (b, crc) => {
    let i = 0;
    for (const end = b.length - 15; i < end;) {
      crc =
        tf[b[i++]! ^ (crc & 0xff)]! ^
        te[b[i++]! ^ ((crc >>> 8) & 0xff)]! ^
        td[b[i++]! ^ ((crc >>> 16) & 0xff)]! ^
        tc[b[i++]! ^ (crc >>> 24)]! ^
        tb[b[i++]!]! ^
        ta[b[i++]!]! ^
        t9[b[i++]!]! ^
        t8[b[i++]!]! ^
        t7[b[i++]!]! ^
        t6[b[i++]!]! ^
        t5[b[i++]!]! ^
        t4[b[i++]!]! ^
        t3[b[i++]!]! ^
        t2[b[i++]!]! ^
        t1[b[i++]!]! ^
        t0[b[i++]!]!;
    }
    for (; i < b.length; i++) {
      crc = t0[(crc ^ b[i]!) & 0xff]! ^ (crc >>> 8);
    }
    return crc;
  };
}

let hash: ((bytes: Uint8Array, crc: number) => number) | undefined;

/**
 * Computes the CRC-32 checksum of gzip, zip and PNG, starting from `previous`. The lookup table is
 * built on the first call, not when the module is imported.
 */
export function crc32(bytes: Uint8Array, previous: number = 0): number {
  return ~(hash ??= makeCrc32())(bytes, ~previous) >>> 0;
}
