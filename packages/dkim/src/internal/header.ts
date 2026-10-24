/** One header field as binary text: `raw` is the field without its final CRLF. */
export type Field = { readonly name: string; readonly raw: string }

export type Canonicalization = 'simple' | 'relaxed'

const fieldStart = /^[\x21-\x39\x3b-\x7e]+[ \t]*:/
const nameOnly = /^[\x21-\x39\x3b-\x7e]+[ \t]*$/
const colonFirst = /^[ \t]*:/

/**
 * Splits a header section (binary text, CRLF line ends) into fields. Any line that doesn't start a
 * field is joined to the field above. That covers RFC 5322 folding, and also lines that start
 * with other whitespace such as a vertical tab or a UTF-8 no-break space, which some mail readers
 * show as part of the field above, so the signature covers the text those readers show.
 */
export function parseFields(header: string): Field[] {
  const lines = header.split('\r\n')
  if (lines.at(-1) === '') lines.pop()
  const rows = new Array<string[]>()
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!
    const next = lines[i + 1]
    const starts =
      rows.length === 0 ||
      fieldStart.test(line) ||
      (next !== undefined && nameOnly.test(line) && colonFirst.test(next))
    if (starts) rows.push([line])
    else rows.at(-1)!.push(line)
  }
  return rows.map((row) => {
    const raw = row.join('\r\n')
    return { name: fieldName(raw), raw }
  })
}

function fieldName(raw: string): string {
  const colon = raw.indexOf(':')
  if (colon < 0) return ''
  return lowerAscii(trimWsp(raw.slice(0, colon).replaceAll('\r\n', '')))
}

export const lowerAscii = (text: string): string =>
  text.replace(/[A-Z]+/g, (letters) => letters.toLowerCase())

const isWsp = (code: number) => code === 0x20 || code === 0x09

export function trimWsp(text: string): string {
  let start = 0
  let end = text.length
  while (start < end && isWsp(text.charCodeAt(start))) start++
  while (end > start && isWsp(text.charCodeAt(end - 1))) end--
  return text.slice(start, end)
}

/**
 * RFC 6376 sections 3.4.1 and 3.4.2. Only SP and HTAB count as whitespace, and every line break
 * is removed, including those before the lines `parseFields` joined to a field.
 */
export function canonicalizeField(raw: string, canonicalization: Canonicalization): string {
  if (canonicalization === 'simple') return raw
  const line = raw.replaceAll('\r\n', '').replace(/[ \t]+/g, ' ')
  const colon = line.indexOf(':')
  const name = colon < 0 ? '' : lowerAscii(trimWsp(line.slice(0, colon)))
  return name + ':' + trimWsp(line.slice(colon + 1))
}

/**
 * The fields an `h=` list covers, in its order (RFC 6376 section 5.4.2): for each name, the last
 * field of that name not taken yet. A name with no field left adds nothing. `skip` is the
 * signature field itself, which the signature never signs.
 */
export function selectFields(
  fields: readonly Field[],
  names: readonly string[],
  skip?: Field,
): Field[] {
  const taken = new Set<Field>(skip ? [skip] : [])
  const selected = new Array<Field>()
  for (const name of names) {
    for (let i = fields.length - 1; i >= 0; i--) {
      const field = fields[i]!
      if (field.name !== name || taken.has(field)) continue
      taken.add(field)
      selected.push(field)
      break
    }
  }
  return selected
}

/**
 * The bytes the signature covers: each selected field and its CRLF, then the signature field
 * with the value of its `b=` tag removed (RFC 6376 section 3.7), without a CRLF.
 */
export function signedData(
  selected: readonly Field[],
  signature: string,
  canonicalization: Canonicalization,
): string {
  let data = ''
  for (const field of selected) data += canonicalizeField(field.raw, canonicalization) + '\r\n'
  return data + canonicalizeField(removeSignatureValue(signature), canonicalization)
}

function removeSignatureValue(raw: string): string {
  const colon = raw.indexOf(':')
  const specs = raw.slice(colon + 1).split(';')
  for (let i = specs.length - 1; i >= 0; i--) {
    const spec = specs[i]!
    const equals = spec.indexOf('=')
    if (equals < 0 || stripFws(spec.slice(0, equals)) !== 'b') continue
    specs[i] = spec.slice(0, equals + 1)
    break
  }
  return raw.slice(0, colon + 1) + specs.join(';')
}

export const stripFws = (text: string): string => text.replace(/[ \t\r\n]+/g, '')
