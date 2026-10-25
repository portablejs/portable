import { assertUint8Array } from '@portable/bytes/internal';
import { InvalidInputError, MaxLengthError, TruncatedError } from './errors.js';
import { compile, type States } from './path.js';
import * as Streams from '@portable/streams';

export declare namespace DecoderStream {
  type Options = {
    /**
     * Aborting errors the stream with `signal.reason` and cancels the source piped into it.
     */
    signal?: AbortSignal | undefined;
    /**
     * JSONPath expressions for the values to emit. Supported: `$` (the root), `.name`, `['name']`,
     * `[0]`, `.*`, `[*]` and `..` (any depth). Every value that matches any path is emitted, and
     * a nested match is emitted before the value that contains it.
     * @default ['$']
     */
    paths?: readonly string[] | undefined;
    /**
     * Longest matched value, in UTF-16 code units of its JSON text. The stream holds a matched value's
     * text until the value ends, so a longer one fails the stream with `MaxLengthError` as soon as
     * it grows past the limit. Values outside `paths` are never held and don't count.
     * @default Infinity
     */
    maxLength?: number | undefined;
  };

  /** A value found at one of the `paths`. */
  type Match = {
    /** Keys and array indexes from the root to the value. */
    path: (string | number)[];
    value: unknown;
  };
}

const OBJECT = 0;
const ARRAY = 1;

const ROOT = 0;
const VALUE = 1;
const VALUE_OR_END = 2;
const KEY = 3;
const KEY_OR_END = 4;
const COLON = 5;
const COMMA_OR_END = 6;
const STRING = 7;
const ESCAPE = 8;
const UNICODE = 9;
const LITERAL = 10;
const MINUS = 11;
const ZERO = 12;
const INTEGER = 13;
const DOT = 14;
const FRACTION = 15;
const EXPONENT_MARK = 16;
const EXPONENT_SIGN = 17;
const EXPONENT = 18;
const SKIP = 19;

const QUOTE = 0x22;
const BACKSLASH = 0x5c;

const literals = ['true', 'false', 'null'];

const jsonCharacters = /* @__PURE__ */ (() => {
  const table = new Uint8Array(0x80);
  for (const character of ' \t\n\r,:0123456789+-.eEtruefalsn') {
    table[character.charCodeAt(0)] = 1;
  }
  return table;
})();

/**
 * A `TransformStream` that parses JSON text as it arrives and emits the values found at the given
 * JSONPath expressions, without holding the whole document in memory. Only matched values are
 * built, with `JSON.parse`, and everything else is checked for syntax and dropped. Input may hold
 * several top-level values separated by whitespace, as in NDJSON or concatenated JSON.
 *
 * The stream fails with `InvalidInputError` on malformed JSON, with `TruncatedError` when the
 * input ends inside a value, and with `MaxLengthError` on a matched value longer than `maxLength`.
 * A structural error inside a matched value, such as a missing comma, is reported when that value
 * ends.
 *
 * @example
 * ```ts
 * import * as JsonStream from '@portable/json-stream';
 *
 * // {"total_rows":129,"rows":[{"id":"a"},{"id":"b"}]}
 * const response = await fetch('https://example.com/_all_docs');
 * const matches = response.body!.pipeThrough(
 *   new JsonStream.DecoderStream({ paths: ['$.total_rows', '$.rows[*]'] }),
 * );
 * // { path: ['total_rows'], value: 129 }, { path: ['rows', 0], value: { id: 'a' } }, ...
 * ```
 */
export class DecoderStream extends TransformStream<Uint8Array | string, DecoderStream.Match> {
  constructor(options: DecoderStream.Options = {}) {
    const { paths = ['$'], maxLength = Infinity } = options;
    if (!(maxLength >= 0)) {
      throw new RangeError('`maxLength` must be a number >= 0.');
    }
    const matcher = compile(paths);
    const decoder = new TextDecoder();

    const kinds: number[] = [];
    const frameStates: (States | null)[] = [];
    const keys: (string | number)[] = [];
    const indexes: number[] = [];
    const captures: number[] = [];
    let depth = 0;

    let state = ROOT;
    let offset = 0;
    let held: string[] = [];
    let heldStart = 0;
    let outer = -1;
    let primitiveStart = -1;
    let keyStart = -1;
    let inKey = false;
    let escaped = false;
    let unicodeLeft = 0;
    let literal = '';
    let literalIndex = 0;
    let skipStart = -1;
    let skipDepth = 0;
    let skipString = false;
    let skipEscape = false;

    let controller!: TransformStreamDefaultController<DecoderStream.Match>;
    let text = '';

    const invalid = (i: number): never => {
      const at = offset + i;
      throw new InvalidInputError(
        i < text.length
          ? `Unexpected ${JSON.stringify(text[i])} at offset ${at} in JSON input.`
          : `Unexpected end of JSON input at offset ${at}.`,
      );
    };

    const slice = (start: number, end: number): string => {
      if (start >= offset) {
        return text.slice(start - offset, end);
      }
      return held.join('').slice(start - heldStart) + text.slice(0, end);
    };

    const emit = (start: number, end: number, valueDepth: number) => {
      if (end + offset - start > maxLength) {
        throw new MaxLengthError({ maxLength });
      }
      let value: unknown;
      try {
        value = JSON.parse(slice(start, end));
      } catch (error) {
        throw new InvalidInputError(`Invalid JSON in the value at offset ${start}.`, {
          cause: error,
        });
      }
      controller.enqueue({ path: keys.slice(0, valueDepth), value });
      if (start === outer) {
        outer = -1;
      }
    };

    const begin = (code: number, i: number): number => {
      let states: States | null;
      if (depth === 0) {
        states = matcher.root;
      } else {
        const parent = frameStates[depth - 1]!;
        if (parent === null) {
          states = null;
        } else {
          const top = depth - 1;
          const key = kinds[top] === ARRAY ? indexes[top]! - 1 : keys[top]!;
          if (kinds[top] === ARRAY) {
            keys[top] = key;
          }
          states = matcher.next(parent, key);
        }
      }
      const matched = states !== null && states.matched;
      const start = offset + i;
      if (matched && outer < 0) {
        outer = start;
      }

      if ((code === 0x7b || code === 0x5b) && states !== null && matched && !states.live) {
        skipStart = start;
        skipDepth = 1;
        skipString = false;
        return SKIP;
      }
      if (code === 0x7b || code === 0x5b) {
        kinds[depth] = code === 0x7b ? OBJECT : ARRAY;
        frameStates[depth] = states !== null && states.live ? states : null;
        indexes[depth] = 0;
        captures[depth] = matched ? start : -1;
        depth++;
        return code === 0x7b ? KEY_OR_END : VALUE_OR_END;
      }
      primitiveStart = matched ? start : -1;
      if (code === QUOTE) {
        inKey = false;
        return STRING;
      }
      if (code === 0x2d) {
        return MINUS;
      }
      if (code === 0x30) {
        return ZERO;
      }
      if (code > 0x30 && code <= 0x39) {
        return INTEGER;
      }
      const index = code === 0x74 ? 0 : code === 0x66 ? 1 : code === 0x6e ? 2 : -1;
      if (index < 0) {
        invalid(i);
      }
      literal = literals[index]!;
      literalIndex = 1;
      return LITERAL;
    };

    const endPrimitive = (end: number): number => {
      if (primitiveStart >= 0) {
        emit(primitiveStart, end, depth);
        primitiveStart = -1;
      }
      return depth === 0 ? ROOT : COMMA_OR_END;
    };

    const scan = () => {
      const n = text.length;
      let i = 0;
      while (i < n) {
        let c = text.charCodeAt(i);
        switch (state) {
          case ROOT:
          case VALUE:
          case VALUE_OR_END: {
            if (c === 0x20 || c === 0x0a || c === 0x0d || c === 0x09) {
              i++;
              continue;
            }
            if (state === VALUE_OR_END && c === 0x5d) {
              break;
            }
            if (depth > 0 && kinds[depth - 1] === ARRAY) {
              indexes[depth - 1]!++;
            }
            state = begin(c, i);
            i++;
            continue;
          }
          case KEY:
          case KEY_OR_END: {
            if (c === 0x20 || c === 0x0a || c === 0x0d || c === 0x09) {
              i++;
              continue;
            }
            if (c === QUOTE) {
              inKey = true;
              escaped = false;
              keyStart = frameStates[depth - 1] === null ? -1 : offset + i + 1;
              state = STRING;
              i++;
              continue;
            }
            if (state === KEY_OR_END && c === 0x7d) {
              break;
            }
            return invalid(i);
          }
          case COLON: {
            if (c === 0x3a) {
              state = VALUE;
            } else if (!(c === 0x20 || c === 0x0a || c === 0x0d || c === 0x09)) {
              return invalid(i);
            }
            i++;
            continue;
          }
          case COMMA_OR_END: {
            if (c === 0x2c) {
              state = kinds[depth - 1] === OBJECT ? KEY : VALUE;
              i++;
              continue;
            }
            if (c === 0x20 || c === 0x0a || c === 0x0d || c === 0x09) {
              i++;
              continue;
            }
            break;
          }
          case SKIP: {
            let d = skipDepth;
            let inString = skipString;
            if (skipEscape) {
              skipEscape = false;
              i++;
            }
            while (i < n) {
              c = text.charCodeAt(i++);
              if (inString) {
                if (c === QUOTE) {
                  inString = false;
                } else if (c === BACKSLASH && i++ === n) {
                  skipEscape = true;
                }
              } else if (c === QUOTE) {
                inString = true;
              } else if (c === 0x7b || c === 0x5b) {
                d++;
              } else if (c === 0x7d || c === 0x5d) {
                if (--d === 0) {
                  break;
                }
              } else if (c >= 0x80 || jsonCharacters[c] === 0) {
                return invalid(i - 1);
              }
            }
            skipDepth = d;
            skipString = inString;
            if (d === 0) {
              emit(skipStart, i, depth);
              state = depth === 0 ? ROOT : COMMA_OR_END;
            }
            continue;
          }
          case STRING: {
            while (i < n) {
              c = text.charCodeAt(i);
              if (c === QUOTE || c === BACKSLASH || c < 0x20) {
                break;
              }
              i++;
            }
            if (i === n) {
              continue;
            }
            if (c === BACKSLASH) {
              escaped = true;
              state = ESCAPE;
              i++;
              continue;
            }
            if (c < 0x20) {
              return invalid(i);
            }
            i++;
            if (inKey) {
              if (keyStart >= 0) {
                const raw = slice(keyStart, i - 1);
                keys[depth - 1] = escaped ? (JSON.parse(`"${raw}"`) as string) : raw;
                keyStart = -1;
              }
              state = COLON;
            } else {
              state = endPrimitive(i);
            }
            continue;
          }
          case ESCAPE: {
            if (c === 0x75) {
              unicodeLeft = 4;
              state = UNICODE;
            } else if (
              c === QUOTE ||
              c === BACKSLASH ||
              c === 0x2f ||
              c === 0x62 ||
              c === 0x66 ||
              c === 0x6e ||
              c === 0x72 ||
              c === 0x74
            ) {
              state = STRING;
            } else {
              return invalid(i);
            }
            i++;
            continue;
          }
          case UNICODE: {
            if (!((c >= 0x30 && c <= 0x39) || ((c | 0x20) >= 0x61 && (c | 0x20) <= 0x66))) {
              return invalid(i);
            }
            if (--unicodeLeft === 0) {
              state = STRING;
            }
            i++;
            continue;
          }
          case LITERAL: {
            if (c !== literal.charCodeAt(literalIndex)) {
              return invalid(i);
            }
            i++;
            if (++literalIndex === literal.length) {
              state = endPrimitive(i);
            }
            continue;
          }
          case MINUS: {
            if (c === 0x30) {
              state = ZERO;
            } else if (c > 0x30 && c <= 0x39) {
              state = INTEGER;
            } else {
              return invalid(i);
            }
            i++;
            continue;
          }
          case INTEGER:
          case FRACTION:
          case EXPONENT: {
            while (i < n && (c = text.charCodeAt(i)) >= 0x30 && c <= 0x39) {
              i++;
            }
            if (i === n) {
              continue;
            }
            if (state === INTEGER && c === 0x2e) {
              state = DOT;
              i++;
              continue;
            }
            if (state !== EXPONENT && (c | 0x20) === 0x65) {
              state = EXPONENT_MARK;
              i++;
              continue;
            }
            state = endPrimitive(i);
            continue;
          }
          case ZERO: {
            if (c === 0x2e) {
              state = DOT;
            } else if ((c | 0x20) === 0x65) {
              state = EXPONENT_MARK;
            } else if (c >= 0x30 && c <= 0x39) {
              return invalid(i);
            } else {
              state = endPrimitive(i);
              continue;
            }
            i++;
            continue;
          }
          case DOT: {
            if (!(c >= 0x30 && c <= 0x39)) {
              return invalid(i);
            }
            state = FRACTION;
            i++;
            continue;
          }
          case EXPONENT_MARK: {
            if (c === 0x2b || c === 0x2d) {
              state = EXPONENT_SIGN;
            } else if (c >= 0x30 && c <= 0x39) {
              state = EXPONENT;
            } else {
              return invalid(i);
            }
            i++;
            continue;
          }
          case EXPONENT_SIGN: {
            if (!(c >= 0x30 && c <= 0x39)) {
              return invalid(i);
            }
            state = EXPONENT;
            i++;
            continue;
          }
        }

        if (c !== (kinds[depth - 1] === OBJECT ? 0x7d : 0x5d)) {
          return invalid(i);
        }
        i++;
        depth--;
        const start = captures[depth]!;
        if (start >= 0) {
          emit(start, i, depth);
        }
        state = depth === 0 ? ROOT : COMMA_OR_END;
      }
    };

    const hold = () => {
      let start = outer;
      if (inKey && keyStart >= 0 && (start < 0 || keyStart < start)) {
        start = keyStart;
      }
      if (start < 0) {
        held = [];
        return;
      }
      if (offset + text.length - start > maxLength) {
        throw new MaxLengthError({ maxLength });
      }
      if (start >= offset) {
        held = [text.slice(start - offset)];
        heldStart = start;
      } else {
        held.push(text);
      }
    };

    super(
      Streams.abortable(
        {
          start(c) {
            controller = c;
          },
          transform(chunk) {
            text =
              typeof chunk === 'string'
                ? chunk
                : decoder.decode(assertUint8Array(chunk), { stream: true });
            scan();
            hold();
            offset += text.length;
          },
          flush() {
            text = decoder.decode();
            if (text) {
              scan();
              hold();
              offset += text.length;
            }
            text = '';
            if (state === ZERO || state === INTEGER || state === FRACTION || state === EXPONENT) {
              if (depth === 0) {
                state = endPrimitive(0);
              }
            }
            if (state !== ROOT) {
              throw new TruncatedError();
            }
          },
        },
        options,
      ),
    );
  }
}
