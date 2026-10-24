// oxlint-disable-next-line no-restricted-imports -- `node:vm` creates another realm.
import { runInNewContext } from 'node:vm'
import { expect, test } from 'vite-plus/test'
import * as Bytes from '@portable/bytes'

// `instanceof ArrayBuffer` is false for a buffer from another realm, such as an iframe or a
// `node:vm` context.
test('reads an ArrayBuffer and views from another realm', () => {
  const { buffer, view, data } = runInNewContext(`
    const buffer = new Uint8Array([1, 2, 3]).buffer;
    ({ buffer, view: new Uint8Array(buffer, 1), data: new DataView(buffer, 2) })
  `) as { buffer: ArrayBuffer; view: Uint8Array; data: DataView }
  expect(buffer instanceof ArrayBuffer).toBe(false)
  expect(Bytes.toHex(buffer)).toBe('010203')
  expect(Bytes.toHex(view)).toBe('0203')
  expect(Bytes.toHex(data)).toBe('03')
})

test('rejects an object that only claims to be an ArrayBuffer', () => {
  const fake = { [Symbol.toStringTag]: 'ArrayBuffer', byteLength: 2 }
  expect(() => Bytes.toHex(fake as never)).toThrow(TypeError)
})
