import type { Charset, Definition } from './Charset.js'
import { encode } from './encode.js'

export function define(definition: Definition): Charset {
  const charset = {
    ...definition,
    encode: (text: string) => encode(text, charset),
  } as unknown as Charset
  return charset
}
