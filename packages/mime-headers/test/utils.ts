/** Each character code as one byte. */
export const latin1 = (text: string): Uint8Array => Uint8Array.from(text, (c) => c.charCodeAt(0));

export const utf8 = (text: string): Uint8Array => new TextEncoder().encode(text);

/** `String.prototype.toWellFormed`, which the ES2022 lib this repo compiles against lacks. */
export const wellFormed = (text: string): string =>
  text.replace(/[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/g, '�');

/** A seeded generator, so a failing case can be reproduced from its seed. */
export function random(seed: number): () => number {
  let state = seed >>> 0 || 1;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 2 ** 32;
  };
}

const alphabets = {
  ascii: 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789',
  specials: ' !"#$%&\'()*+,-./:;<=>?@[\\]^_`{|}~',
  latin: 'õäöüšžÕÄÖÜŠŽéèàçñ',
  cyrillic: 'абвгдежзийклмноп',
  cjk: '日本語漢字中文字符测试한국어',
  astral: '😀😊🤖\u{20000}\u{1F600}',
  controls: '\t\r\n\x00\x01\x7f',
};

export type Alphabet = keyof typeof alphabets;

/** Random text of up to `max` characters drawn from the given alphabets. */
export function randomText(
  next: () => number,
  max: number,
  kinds: readonly Alphabet[] = ['ascii', 'specials', 'latin', 'cjk', 'astral'],
): string {
  const length = Math.floor(next() * (max + 1));
  let text = '';
  for (let i = 0; i < length; i++) {
    const characters = Array.from(alphabets[kinds[Math.floor(next() * kinds.length)]!]);
    text += characters[Math.floor(next() * characters.length)]!;
  }
  return text;
}

export const pick = <value>(next: () => number, items: readonly value[]): value =>
  items[Math.floor(next() * items.length)]!;
