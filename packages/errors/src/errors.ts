const brand: unique symbol = Symbol.for('portable.error');

type Branded = Error & { readonly [brand]: readonly string[] };

function isBranded(value: unknown): value is Branded {
  return (
    typeof value === 'object' && value !== null && Array.isArray((value as Partial<Branded>)[brand])
  );
}

/**
 * The base class of every error that `@portable/*` packages throw. Each error stores the `kind` of
 * its own class and of each superclass under `Symbol.for('portable.error')`. Two copies of a
 * package are installed when your app depends on one version and one of its dependencies requires
 * another. `Symbol.for` returns the same symbol in both copies, so `instanceof` and `is` still
 * recognize an error from the other copy.
 *
 * @example
 * ```ts
 * import * as Errors from '@portable/errors';
 *
 * class LimitError extends Errors.BaseError {
 *   static override readonly kind: string = 'MyApp.LimitError';
 * }
 *
 * new LimitError('Too many requests.').name; // 'MyApp.LimitError'
 * ```
 */
export class BaseError extends Error {
  /** The class's name, such as `'Compress.MaxBytesError'`, which also becomes `name`. */
  static readonly kind: string = 'BaseError';

  constructor(message?: string, options?: ErrorOptions) {
    super(message, options);
    const kinds: string[] = [];
    for (let c: unknown = new.target; typeof c === 'function'; c = Object.getPrototypeOf(c)) {
      if (Object.hasOwn(c, 'kind')) {
        kinds.push((c as typeof BaseError).kind);
      }
    }
    Object.defineProperty(this, brand, { value: kinds });
    Object.defineProperty(this, 'name', { value: kinds[0], writable: true, configurable: true });
  }

  static override [Symbol.hasInstance](value: unknown): boolean {
    return isBranded(value) && value[brand].includes(this.kind);
  }
}

export declare namespace InvalidInputError {
  type Options = ErrorOptions & {
    /** Where in the input the parser found the problem, in bytes or characters as the package documents. */
    offset?: number | undefined;
  };
}

/**
 * Thrown when the data a function exists to read, parse, decode, encode, or verify is malformed.
 * Each package throws its own subclass, such as `Base64.InvalidInputError`.
 *
 * @example
 * ```ts
 * import * as Base64 from '@portable/base64';
 * import * as Errors from '@portable/errors';
 *
 * try {
 *   Base64.decode('*', { mode: 'strict' });
 * } catch (error) {
 *   if (Errors.is(error, 'InvalidInput')) {
 *     console.log(error.message);
 *   }
 * }
 * ```
 */
export class InvalidInputError extends BaseError {
  static override readonly kind: string = 'InvalidInput';
  /** Where in the input the parser found the problem, when it knows. */
  readonly offset: number | undefined;

  constructor(message?: string, options: InvalidInputError.Options = {}) {
    super(message, options);
    this.offset = options.offset;
  }
}

/**
 * A schema that follows the [Standard Schema](https://standardschema.dev) interface, such as one
 * from Zod, Valibot, or ArkType. `output` is the type of a value that passes.
 */
export type Schema<output = unknown> = {
  readonly '~standard': {
    readonly version: 1;
    readonly vendor: string;
    readonly validate: (value: unknown) => Schema.Result<output> | Promise<Schema.Result<output>>;
    readonly types?: { readonly input: unknown; readonly output: output } | undefined;
  };
};

export declare namespace Schema {
  /** What `validate` returns: the value that passed, which the schema may have changed, or the issues. */
  type Result<output> =
    | { readonly value: output; readonly issues?: undefined }
    | { readonly issues: readonly Issue[] };

  /** One problem that a schema found in a value. */
  type Issue = {
    readonly message: string;
    /** The keys from the value's root to the problem. */
    readonly path?: readonly (PropertyKey | { readonly key: PropertyKey })[] | undefined;
  };
}

export declare namespace SchemaError {
  type Options = ErrorOptions & {
    /** The issues from the schema's `validate`. */
    issues: readonly Schema.Issue[];
    /** @default A message with the first issue's path and message. */
    message?: string | undefined;
  };
}

/**
 * Thrown when a value doesn't pass the schema passed in a `schema` option. `issues` holds the
 * issues from the schema. It is an `InvalidInputError`, so `Errors.is(error, 'InvalidInput')`
 * matches it too.
 *
 * @example
 * ```ts
 * import * as Errors from '@portable/errors';
 *
 * try {
 *   await run();
 * } catch (error) {
 *   if (Errors.is(error, 'Schema')) {
 *     return Response.json(error.issues, { status: 400 });
 *   }
 *   throw error;
 * }
 * ```
 */
export class SchemaError extends InvalidInputError {
  static override readonly kind: string = 'Schema';
  readonly issues: readonly Schema.Issue[];

  constructor(options: SchemaError.Options) {
    const {
      issues,
      message = `The value doesn't match the schema: ${formatIssues(issues)}`,
      ...rest
    } = options;
    super(message, rest);
    this.issues = issues;
  }
}

/**
 * The first issue's path and message, and how many more issues there are, such as
 * `'id: Expected number (1 more)'`.
 */
export function formatIssues(issues: readonly Schema.Issue[]): string {
  const [first] = issues;
  if (!first) {
    return 'no issues given';
  }
  const path = (first.path ?? [])
    .map((segment) => String(typeof segment === 'object' ? segment.key : segment))
    .join('.');
  const more = issues.length > 1 ? ` (${issues.length - 1} more)` : '';
  return `${path ? `${path}: ` : ''}${first.message}${more}`;
}

export declare namespace TruncatedError {
  type Options = ErrorOptions & {
    /** How much input arrived, in bytes or characters. Each package that throws it says which. */
    offset?: number | undefined;
  };
}

/**
 * Thrown when input ends before a value is complete.
 *
 * @example
 * ```ts
 * import * as Base64 from '@portable/base64';
 * import * as Errors from '@portable/errors';
 *
 * try {
 *   Base64.decode('YW', { mode: 'strict' });
 * } catch (error) {
 *   if (Errors.is(error, 'Truncated')) {
 *     console.log(error.message);
 *   }
 * }
 * ```
 */
export class TruncatedError extends BaseError {
  static override readonly kind: string = 'Truncated';
  /** How much input arrived, when the package knows. */
  readonly offset: number | undefined;

  constructor(message?: string, options: TruncatedError.Options = {}) {
    super(message, options);
    this.offset = options.offset;
  }
}

/**
 * Thrown for valid input that the package doesn't handle, such as an image format it can't read.
 *
 * @example
 * ```ts
 * import * as Errors from '@portable/errors';
 * import * as ImageSize from '@portable/image-size';
 *
 * try {
 *   ImageSize.parse(new Uint8Array(16));
 * } catch (error) {
 *   if (Errors.is(error, 'Unsupported')) {
 *     console.log('not an image this package reads');
 *   }
 * }
 * ```
 */
export class UnsupportedError extends BaseError {
  static override readonly kind: string = 'Unsupported';
}

export declare namespace MaxBytesError {
  type Options = ErrorOptions & {
    /** The limit that was exceeded. */
    maxBytes: number;
    /** @default `Exceeded maxBytes of ${maxBytes}.` */
    message?: string | undefined;
  };
}

/**
 * Thrown when input or output exceeds a `maxBytes` option.
 *
 * @example
 * ```ts
 * import * as Errors from '@portable/errors';
 * import * as Streams from '@portable/streams';
 *
 * try {
 *   await Streams.toBytes(body.pipeThrough(Streams.limitBytes(1024)));
 * } catch (error) {
 *   if (Errors.is(error, 'MaxBytes')) {
 *     console.log(`over ${error.maxBytes} bytes`);
 *   }
 * }
 * ```
 */
export class MaxBytesError extends BaseError {
  static override readonly kind: string = 'MaxBytes';
  readonly maxBytes: number;

  constructor(options: MaxBytesError.Options) {
    const { maxBytes, message = `Exceeded maxBytes of ${maxBytes}.`, ...rest } = options;
    super(message, rest);
    this.maxBytes = maxBytes;
  }
}

export declare namespace MaxLengthError {
  type Options = ErrorOptions & {
    /** The limit that was exceeded. */
    maxLength: number;
    /** @default `Exceeded maxLength of ${maxLength}.` */
    message?: string | undefined;
  };
}

/**
 * Thrown when text exceeds a `maxLength` option, counted in UTF-16 code units.
 *
 * @example
 * ```ts
 * import * as Errors from '@portable/errors';
 * import * as Lines from '@portable/lines';
 * import * as Streams from '@portable/streams';
 *
 * const lines = body.pipeThrough(new Lines.DecoderStream({ maxLength: 4096 }));
 * try {
 *   console.log(await Streams.toArray(lines));
 * } catch (error) {
 *   if (Errors.is(error, 'MaxLength')) {
 *     console.log(`a line was over ${error.maxLength} characters`);
 *   }
 * }
 * ```
 */
export class MaxLengthError extends BaseError {
  static override readonly kind: string = 'MaxLength';
  readonly maxLength: number;

  constructor(options: MaxLengthError.Options) {
    const { maxLength, message = `Exceeded maxLength of ${maxLength}.`, ...rest } = options;
    super(message, rest);
    this.maxLength = maxLength;
  }
}

export declare namespace ResponseError {
  type Options = ErrorOptions & {
    /** The response that was rejected. */
    response: Response;
    /** The body, when the package read it, such as parsed JSON or text. */
    body?: unknown;
    /** @default `${response.url} answered ${response.status}.` */
    message?: string | undefined;
  };
}

/**
 * Thrown when the package can't use the status or body of a server's response. `response` is the
 * whole `Response`, so callers can read headers such as `Retry-After`.
 *
 * @example
 * ```ts
 * import * as Errors from '@portable/errors';
 * import * as Rdap from '@portable/rdap';
 *
 * try {
 *   await Rdap.domain('example.com');
 * } catch (error) {
 *   if (Errors.is(error, 'Response') && error.status === 429) {
 *     console.log(error.response.headers.get('retry-after'));
 *   }
 * }
 * ```
 */
export class ResponseError extends BaseError {
  static override readonly kind: string = 'Response';
  readonly response: Response;
  readonly body: unknown;

  constructor(options: ResponseError.Options) {
    const {
      response,
      body,
      message = `${response.url} answered ${response.status}.`,
      ...rest
    } = options;
    super(message, rest);
    this.response = response;
    this.body = body;
  }

  /** The HTTP status of `response`. */
  get status(): number {
    return this.response.status;
  }
}

/** The error class for each kind that `is` checks. */
export type Kinds = {
  InvalidInput: InvalidInputError;
  Truncated: TruncatedError;
  Unsupported: UnsupportedError;
  MaxBytes: MaxBytesError;
  MaxLength: MaxLengthError;
  Response: ResponseError;
  Schema: SchemaError;
};

/**
 * Whether `error` is a `@portable/*` error of the given kind, from any package and any copy of it.
 * It reads the kinds stored under `Symbol.for('portable.error')`, so it works where `instanceof`
 * against one package's class would not.
 *
 * @example
 * ```ts
 * import * as Errors from '@portable/errors';
 *
 * try {
 *   await run();
 * } catch (error) {
 *   if (Errors.is(error, 'MaxBytes')) {
 *     console.log(error.maxBytes);
 *   } else {
 *     throw error;
 *   }
 * }
 * ```
 */
export function is<kind extends keyof Kinds>(error: unknown, kind: kind): error is Kinds[kind] {
  return isBranded(error) && error[brand].includes(kind);
}
