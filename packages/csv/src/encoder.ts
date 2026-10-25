import type { encode } from './encode.js';
import { InvalidInputError } from './errors.js';

export type Encoder = {
  row(row: encode.Row): string;
  end(): string;
};

const formula = /^[=+\-@\t\r]/;
const byteOrderMark = String.fromCharCode(0xfeff);

export function createEncoder(options: encode.Options): Encoder {
  const {
    bom = false,
    delimiter = ',',
    escapeFormulas = false,
    header = false,
    newline = '\r\n',
    quote = '"',
  } = options;
  if (delimiter.length !== 1 || delimiter === '\r' || delimiter === '\n') {
    throw new RangeError('delimiter must be one character other than CR or LF.');
  }
  if (quote !== false && (quote.length !== 1 || quote === '\r' || quote === '\n')) {
    throw new RangeError('quote must be one character other than CR or LF.');
  }
  if (delimiter === quote) {
    throw new RangeError('delimiter and quote must differ.');
  }
  if (newline !== '\r\n' && newline !== '\n') {
    throw new RangeError("newline must be '\\r\\n' or '\\n'.");
  }

  const special = new RegExp(`[${escape(delimiter)}${quote ? escape(quote) : ''}\\r\\n]`);
  const doubled = quote ? quote + quote : '';
  let columns = typeof header === 'boolean' ? undefined : header;
  let started = false;

  const encodeField = (value: encode.Value): string => {
    let text: string;
    if (typeof value === 'string') {
      text = value;
    } else if (value === null || value === undefined) {
      text = '';
    } else if (
      typeof value === 'number' ||
      typeof value === 'boolean' ||
      typeof value === 'bigint'
    ) {
      text = String(value);
    } else if (value instanceof Date) {
      text = value.toISOString();
    } else {
      throw new InvalidInputError(`Can't encode a value of type ${typeof value} as a CSV field.`);
    }
    let quoted = false;
    if (escapeFormulas && formula.test(text)) {
      text = `'${text}`;
      quoted = quote !== false;
    }
    if (!quoted && !special.test(text)) {
      return text;
    }
    if (quote === false) {
      throw new InvalidInputError(`Can't write ${JSON.stringify(text)} with quote: false.`);
    }
    return quote + text.replaceAll(quote, doubled) + quote;
  };

  const line = (fields: readonly encode.Value[]): string => {
    if (fields.length === 1) {
      const text = encodeField(fields[0]);
      return (text === '' ? doubled : text) + newline;
    }
    let text = '';
    for (let i = 0; i < fields.length; i++) {
      if (i > 0) {
        text += delimiter;
      }
      text += encodeField(fields[i]);
    }
    return text + newline;
  };

  const start = (row: encode.Row | undefined): string => {
    started = true;
    let text = bom ? byteOrderMark : '';
    if (row !== undefined && !isArray(row)) {
      columns ??= Object.keys(row);
    }
    if (header === true && columns === undefined) {
      throw new TypeError('header: true needs object rows or an array of names.');
    }
    if (header !== false && columns) {
      text += line(columns);
    }
    return text;
  };

  return {
    row(row) {
      const prefix = started ? '' : start(row);
      if (isArray(row)) {
        return prefix + line(row);
      }
      if (!columns) {
        throw new InvalidInputError('Rows must all be arrays or all be objects.');
      }
      const fields: encode.Value[] = [];
      for (const name of columns) {
        fields.push(Object.hasOwn(row, name) ? row[name] : undefined);
      }
      return prefix + line(fields);
    },
    end() {
      return started || !Array.isArray(header) ? '' : start(undefined);
    },
  };
}

function isArray(row: encode.Row): row is readonly encode.Value[] {
  return Array.isArray(row);
}

function escape(character: string): string {
  return character.replace(/[\\\]^-]/g, '\\$&');
}
