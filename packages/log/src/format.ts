import type { Record } from './log.js';

function show(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }
  if (value instanceof Error) {
    return value.stack ?? String(value);
  }
  try {
    return JSON.stringify(value) ?? String(value);
  } catch {
    return String(value);
  }
}

/**
 * Returns a record's arguments as one line of text, replacing format specifiers as Node's
 * `util.format` does, except that objects are written with `JSON.stringify` instead of
 * `util.inspect`. `%s`, `%d`, `%i`, `%f`, `%j`, `%o` and `%O` in the first argument are replaced
 * with the next arguments, `%c` and its argument are dropped, and the remaining arguments are
 * appended after spaces. Errors are written as their stack. A format string with no arguments
 * after it is returned unchanged.
 *
 * @example
 * ```ts
 * Log.subscribe((record) => lines.push(Log.format(record)));
 * ```
 */
export function format(record: Record): string {
  const { args } = record;
  const first = args[0];
  let text = '';
  let next = 0;
  if (typeof first === 'string' && args.length === 1) {
    return first;
  }
  if (typeof first === 'string') {
    next = 1;
    let from = 0;
    for (
      let at = first.indexOf('%');
      at !== -1 && at < first.length - 1;
      at = first.indexOf('%', from)
    ) {
      const type = first[at + 1]!;
      text += first.slice(from, at);
      from = at + 2;
      if (type === '%') {
        text += '%';
      } else if (!'sdifjoOc'.includes(type) || next >= args.length) {
        text += first.slice(at, at + 2);
      } else {
        const value = args[next++];
        if (type === 'd' || type === 'f') {
          text += Number(value);
        } else if (type === 'i') {
          text += Math.trunc(Number(value));
        } else if (type !== 'c') {
          text += show(value);
        }
      }
    }
    text += first.slice(from);
  } else if (args.length > 0) {
    text = show(first);
    next = 1;
  }
  for (; next < args.length; next++) {
    text += ` ${show(args[next])}`;
  }
  return text;
}
