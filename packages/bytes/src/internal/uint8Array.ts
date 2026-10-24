/**
 * Returns `true` if `value` is a `Uint8Array`, a subclass such as a Node `Buffer`, or a
 * `Uint8Array` from another realm (an iframe or a `node:vm` context). `instanceof Uint8Array`
 * returns `false` for a `Uint8Array` from another realm.
 */
export function isUint8Array(value: unknown): value is Uint8Array {
  return (
    value instanceof Uint8Array ||
    (ArrayBuffer.isView(value) && Object.prototype.toString.call(value) === '[object Uint8Array]')
  )
}

/**
 * Returns `value` if it is a `Uint8Array`, and throws a `TypeError` otherwise. Packages call it on
 * byte input that TypeScript types as `Uint8Array`, so a JavaScript caller who passes an
 * `ArrayBuffer` or another view gets an error instead of a wrong result.
 */
export function assertUint8Array(value: unknown): Uint8Array {
  if (isUint8Array(value)) {
    return value
  }
  throw new TypeError(`Expected a Uint8Array, got ${describe(value)}.`)
}

function describe(value: unknown): string {
  if (value === null) {
    return 'null'
  }
  if (typeof value !== 'object') {
    return typeof value
  }
  return Object.prototype.toString.call(value).slice(8, -1)
}
