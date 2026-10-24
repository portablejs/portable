const tagName = /^[A-Za-z][A-Za-z0-9_]*$/
const tagValue =
  /^(?:[\x21-\x3a\x3c-\x7e\x80-\xff]+(?:(?:[ \t]|\r\n[ \t])+[\x21-\x3a\x3c-\x7e\x80-\xff]+)*)?$/

/**
 * Reads a tag-list (RFC 6376 section 3.2) from binary text. Names are case-sensitive and values
 * keep their inner whitespace. `valid` is false for anything outside the grammar, including a
 * repeated tag, and `tags` then holds what could be read. Bytes above 0x7F are allowed in values
 * for UTF-8 domain names (RFC 8616).
 */
export function parseTags(text: string): { tags: Map<string, string>; valid: boolean } {
  const tags = new Map<string, string>()
  const specs = text.split(';')
  if (specs.length > 1 && trimFws(specs.at(-1)!) === '') {
    specs.pop()
  }
  let valid = true
  for (const spec of specs) {
    const equals = spec.indexOf('=')
    const name = trimFws(equals < 0 ? spec : spec.slice(0, equals))
    const value = equals < 0 ? '' : trimFws(spec.slice(equals + 1))
    if (equals < 0 || !tagName.test(name) || !tagValue.test(value) || tags.has(name)) {
      valid = false
    }
    if (equals >= 0) {
      tags.set(name, value)
    }
  }
  return { tags, valid }
}

const isFws = (code: number) => code === 0x20 || code === 0x09 || code === 0x0d || code === 0x0a

export function trimFws(text: string): string {
  let start = 0
  let end = text.length
  while (start < end && isFws(text.charCodeAt(start))) {
    start++
  }
  while (end > start && isFws(text.charCodeAt(end - 1))) {
    end--
  }
  return text.slice(start, end)
}
