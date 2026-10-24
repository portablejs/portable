import type { DecoderStream } from './DecoderStream.js'
import { InvalidInputError, MaxLengthError, TruncatedError } from './errors.js'

const fieldStart = 0
const unquoted = 1
const quoted = 2
const afterQuote = 3
const afterCr = 4
const afterQuoteSpace = 5

export type Parser = {
  write(text: string): void
  end(): void
}

export function createParser(
  options: DecoderStream.Options,
  emit: (row: DecoderStream.Row<DecoderStream.Header>) => void,
): Parser {
  const {
    delimiter = ',',
    header = false,
    maxLength = Infinity,
    quote = '"',
    relaxColumnCount = false,
    skipEmpty = true,
  } = options
  assertCharacter('delimiter', delimiter)
  if (quote !== false) {
    assertCharacter('quote', quote)
  }
  if (delimiter === quote) {
    throw new RangeError('delimiter and quote must differ.')
  }
  const delimiterCode = delimiter.charCodeAt(0)
  const quoteCode = quote === false ? -1 : quote.charCodeAt(0)

  let names = typeof header === 'boolean' ? undefined : assertNames(header)
  let expected = names ? names.length : -1
  let rowCount = 0
  let state = fieldStart
  let row: string[] = []
  let field = ''
  let carried = 0
  let started = false

  const endRow = () => {
    rowCount++
    const fields = row
    row = []
    if (header === true && names === undefined) {
      names = assertNames(fields)
      expected = fields.length
      return
    }
    if (expected === -1) {
      expected = fields.length
    } else if (fields.length !== expected && !relaxColumnCount) {
      throw new InvalidInputError(
        `Row ${rowCount} has ${fields.length} fields, but ${names ? 'the header' : 'row 1'} has ${expected}.`,
      )
    }
    emit(names ? toObject(names, fields) : fields)
  }

  return {
    write(text) {
      const n = text.length
      let i = 0
      if (!started) {
        if (n === 0) {
          return
        }
        started = true
        if (text.charCodeAt(0) === 0xfeff) {
          i = 1
        }
      }
      let rowStart = i
      let nextDelimiter = -1
      let nextLf = -1
      let nextCr = -1

      const lineBreak = (code: number, at: number) => {
        const length = carried + at - rowStart
        if (length > maxLength) {
          throw new MaxLengthError({ maxLength })
        }
        carried = 0
        rowStart = at + 1
        state = code === 13 ? afterCr : fieldStart
        if (length === 0 && skipEmpty) {
          rowCount++
          row = []
        } else {
          endRow()
        }
      }

      while (i < n) {
        if (state === fieldStart) {
          if (text.charCodeAt(i) === quoteCode) {
            state = quoted
            i++
            continue
          }
          state = unquoted
        }
        if (state === unquoted) {
          if (nextDelimiter < i) {
            nextDelimiter = indexOf(text, delimiter, i)
          }
          if (nextLf < i) {
            nextLf = indexOf(text, '\n', i)
          }
          if (nextCr < i) {
            nextCr = indexOf(text, '\r', i)
          }
          let end = nextDelimiter < nextLf ? nextDelimiter : nextLf
          if (nextCr < end) {
            end = nextCr
          }
          if (end === n) {
            field += text.slice(i)
            break
          }
          row.push(field + text.slice(i, end))
          field = ''
          i = end + 1
          const code = text.charCodeAt(end)
          if (code === delimiterCode) {
            state = fieldStart
          } else {
            lineBreak(code, end)
          }
        } else if (state === quoted) {
          const end = text.indexOf(quote as string, i)
          if (end === -1) {
            field += text.slice(i)
            break
          }
          field += text.slice(i, end)
          i = end + 1
          state = afterQuote
        } else if (state === afterQuote || state === afterQuoteSpace) {
          const code = text.charCodeAt(i)
          i++
          if (code === quoteCode && state === afterQuote) {
            field += quote
            state = quoted
          } else if (code === delimiterCode || code === 10 || code === 13) {
            row.push(field)
            field = ''
            if (code === delimiterCode) {
              state = fieldStart
            } else {
              lineBreak(code, i - 1)
            }
          } else if (code === 32 || code === 9) {
            state = afterQuoteSpace
          }
          // `write` also checks the length at the end of each chunk, so the error is the same
          // however the input is split.
          else if (carried + i - rowStart > maxLength) {
            throw new MaxLengthError({ maxLength })
          } else {
            throw new InvalidInputError(`Row ${rowCount + 1} has text after a closing quote.`)
          }
        } else {
          if (text.charCodeAt(i) === 10) {
            i++
            rowStart = i
          }
          state = fieldStart
        }
      }
      carried += n - rowStart
      if (carried > maxLength) {
        throw new MaxLengthError({ maxLength })
      }
    },

    end() {
      if (state === quoted) {
        throw new TruncatedError(`Row ${rowCount + 1} ends inside a quoted field.`)
      }
      if (
        row.length > 0 ||
        state === unquoted ||
        state === afterQuote ||
        state === afterQuoteSpace
      ) {
        row.push(field)
        field = ''
        endRow()
      }
      state = fieldStart
    },
  }
}

function indexOf(text: string, search: string, from: number): number {
  const index = text.indexOf(search, from)
  return index === -1 ? text.length : index
}

function assertCharacter(option: string, value: string): void {
  if (value.length !== 1 || value === '\r' || value === '\n') {
    throw new RangeError(`${option} must be one character other than CR or LF.`)
  }
}

function assertNames(names: readonly string[]): readonly string[] {
  const seen = new Set<string>()
  for (const name of names) {
    if (seen.has(name)) {
      throw new InvalidInputError(`Header repeats the name "${name}".`)
    }
    seen.add(name)
  }
  return names
}

function toObject(names: readonly string[], fields: readonly string[]): Record<string, string> {
  const object: Record<string, string> = {}
  const count = Math.min(names.length, fields.length)
  for (let i = 0; i < count; i++) {
    const name = names[i]!
    if (name === '__proto__') {
      Object.defineProperty(object, name, {
        value: fields[i],
        enumerable: true,
        writable: true,
        configurable: true,
      })
    } else {
      object[name] = fields[i]!
    }
  }
  return object
}
