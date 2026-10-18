// libmime 5.4.x ships no types. These cover the functions the oracle and benchmark call.
declare module 'libmime' {
  type Libmime = {
    encodeWord: (
      data: string | Uint8Array,
      mimeWordEncoding?: 'Q' | 'B',
      maxLength?: number,
    ) => string
    encodeWords: (
      data: string | Uint8Array,
      mimeWordEncoding?: 'Q' | 'B',
      maxLength?: number,
    ) => string
    decodeWords: (str: string) => string
    foldLines: (str: string, lineLength?: number, afterSpace?: boolean) => string
    decodeHeaders: (headers: string) => Record<string, string[]>
    parseHeaderValue: (str: string) => { value: string; params: Record<string, string> }
    buildHeaderValue: (structured: { value: string; params?: Record<string, string> }) => string
  }
  const libmime: Libmime
  export default libmime
}
