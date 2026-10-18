declare module '*?raw' {
  const text: string
  export default text
}

declare module 'libbase64' {
  import type { Transform } from 'node:stream'
  export function encode(input: Uint8Array | string): string
  export function decode(input: string): Uint8Array
  export function wrap(input: string, lineLength?: number): string
  export class Encoder extends Transform {
    constructor(options?: { lineLength?: number | false })
  }
  export class Decoder extends Transform {}
}
