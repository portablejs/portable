import type { Charset } from './Charset.js'
import { define } from './define.js'

/**
 * UTF-8, encoded with the platform's `TextEncoder`. Use it when the charset comes from a label
 * at runtime and may be UTF-8. Otherwise `TextEncoder` does the same job.
 *
 * @example
 * ```ts
 * import * as Charset from '@portable/charset'
 *
 * Charset.encode('é', Charset.utf8, { bom: true }) // Uint8Array [0xef, 0xbb, 0xbf, 0xc3, 0xa9]
 * ```
 */
export const utf8: Charset = /* @__PURE__ */ define({
  name: 'UTF-8',
  maxBytes: 3,
  bom: [0xef, 0xbb, 0xbf],
  encoder: () => {
    const encoder = new TextEncoder()
    return { string: (text) => encoder.encode(text), write: () => -1 }
  },
})
