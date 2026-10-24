/**
 * Bytes a function accepts as input: an `ArrayBuffer`, a `SharedArrayBuffer`, or any view of one,
 * such as a `Uint8Array`, another typed array, a `DataView` or a Node `Buffer`. This is the set
 * `TextDecoder` accepts. A view is read as the bytes in its range, in the platform's byte order,
 * so an `Int16Array` gives two bytes per element, little-endian on every common platform. Pass a
 * view and not `view.buffer`, which also holds the bytes outside the view.
 *
 * Don't write to shared memory while a function or stream reads it. An async function can still
 * read its input after it has returned a promise, and a stream may read a chunk some time after
 * the chunk was written to it. In that time a write from another thread can change the bytes that
 * are parsed, signed or verified.
 */
export type Input = ArrayBufferLike | ArrayBufferView
