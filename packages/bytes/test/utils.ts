export const utf8 = (text: string): Uint8Array => new TextEncoder().encode(text);

/** Deterministic bytes, so a failing case can be rerun. */
export function randomBytes(length: number, seed: number): Uint8Array {
  let state = seed + 1;
  const bytes = new Uint8Array(length);
  for (let i = 0; i < length; i++) {
    state = (state * 1103515245 + 12345) % 2 ** 31;
    bytes[i] = state >>> 16;
  }
  return bytes;
}

/** A copy of `bytes` that starts `offset` bytes into its buffer, to test unaligned views. */
export function atOffset(bytes: Uint8Array, offset: number): Uint8Array {
  const buffer = new Uint8Array(bytes.length + offset);
  buffer.set(bytes, offset);
  return buffer.subarray(offset);
}
