import type { Input } from '../input.js'

/**
 * Returns `input` as a `Uint8Array` over the same memory, without copying. Throws a `TypeError` for
 * anything that isn't an `ArrayBuffer`, a `SharedArrayBuffer` or a view of one.
 */
export function toUint8Array(input: Input): Uint8Array {
  if (input instanceof Uint8Array) return input
  if (ArrayBuffer.isView(input))
    return new Uint8Array(input.buffer, input.byteOffset, input.byteLength)
  if (isArrayBufferLike(input)) return new Uint8Array(input)
  throw new TypeError(`Expected an ArrayBuffer or an ArrayBufferView, got ${describe(input)}.`)
}

/** Whether `value` is an `ArrayBuffer`, a `SharedArrayBuffer` or a view of one, from any realm. */
export function isInput(value: unknown): value is Input {
  return value instanceof Uint8Array || ArrayBuffer.isView(value) || isArrayBufferLike(value)
}

// `instanceof ArrayBuffer` is false for a buffer from another realm, such as an iframe or a Node
// `vm` context. The `DataView` constructor checks for the buffer's internal slot instead, and
// throws for any other object, including one whose `Symbol.toStringTag` is `'ArrayBuffer'`.
function isArrayBufferLike(value: unknown): value is ArrayBufferLike {
  if (value instanceof ArrayBuffer) return true
  if (typeof value !== 'object' || value === null) return false
  try {
    return new DataView(value as ArrayBufferLike).byteOffset === 0
  } catch {
    return false
  }
}

function describe(value: unknown): string {
  if (value === null) return 'null'
  return typeof value === 'object'
    ? Object.prototype.toString.call(value).slice(8, -1)
    : typeof value
}
