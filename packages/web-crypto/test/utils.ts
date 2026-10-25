export function fromHex(hex: string): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

export function toHex(bytes: Uint8Array | ArrayBuffer): string {
  return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export const encode = (text: string): Uint8Array<ArrayBuffer> => new TextEncoder().encode(text);

/**
 * The same bytes at an offset inside a larger buffer, as a `subarray` of a network read would be.
 */
export function offsetView(bytes: Uint8Array): Uint8Array {
  const buffer = new Uint8Array(bytes.length + 7);
  buffer.fill(0xee);
  buffer.set(bytes, 3);
  return buffer.subarray(3, 3 + bytes.length);
}

export type WycheproofEcdsa = {
  curve: 'P-256' | 'P-384' | 'P-521';
  hash: 'SHA-256' | 'SHA-384' | 'SHA-512';
  groups: {
    publicKeyDer: string;
    tests: { tcId: number; flags: string[]; msg: string; sig: string; result: string }[];
  }[];
};

/** Decodes base64 or base64url, as ecdsa-sig-formatter's tests write signatures. */
export function fromBase64(text: string): Uint8Array<ArrayBuffer> {
  const binary = atob(text.replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}
