import type { Schema } from '../errors.js';

/**
 * Validates `input` with `schema` and returns the value that passed, or throws the error from
 * `fail`. The result is a promise only when the schema's `validate` returns one, so a sync schema
 * adds no `await`.
 */
export function validate<value>(
  schema: Schema<value>,
  input: unknown,
  fail: (issues: readonly Schema.Issue[]) => Error,
): value | Promise<value> {
  const result = schema['~standard'].validate(input);
  if (isPromiseLike(result)) {
    return Promise.resolve(result).then((settled) => unwrap(settled, fail));
  }
  return unwrap(result, fail);
}

function unwrap<value>(
  result: Schema.Result<value>,
  fail: (issues: readonly Schema.Issue[]) => Error,
): value {
  if (result.issues) {
    throw fail(result.issues);
  }
  return result.value;
}

export function isPromiseLike<value>(
  result: value | PromiseLike<value>,
): result is PromiseLike<value> {
  return typeof (result as Partial<PromiseLike<value>>).then === 'function';
}
