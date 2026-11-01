function digit(code: number): number {
  if (code >= 97) {
    return code - 71;
  }
  if (code >= 65) {
    return code === 95 ? 63 : code - 65;
  }
  return code === 45 ? 62 : code + 4;
}

/** Decodes the base64url varints written by `packInts` in scripts/generate.ts. */
export function unpackInts(text: string): number[] {
  const values: number[] = [];
  for (let i = 0; i < text.length;) {
    let value = 0;
    let scale = 1;
    let next: number;
    do {
      next = digit(text.charCodeAt(i++));
      value += (next & 31) * scale;
      scale *= 32;
    } while (next & 32);
    values.push(value);
  }
  return values;
}
