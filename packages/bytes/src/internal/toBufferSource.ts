/**
 * Returns `bytes` if an `ArrayBuffer` backs it, and a copy if a `SharedArrayBuffer` does, so the
 * result can be passed to `crypto.subtle`, `Blob`, `fetch` and `CompressionStream`.
 */
export function toBufferSource(bytes: Uint8Array): Uint8Array<ArrayBuffer> {
  return bytes.buffer instanceof ArrayBuffer ? (bytes as Uint8Array<ArrayBuffer>) : bytes.slice()
}
