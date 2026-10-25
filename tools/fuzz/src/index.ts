import fc from 'fast-check';

export { fc };

const env = import.meta.env as Record<string, string | undefined>;

/**
 * The number of runs per property. `FUZZ_RUNS` sets it, and `pnpm fuzz` loads `.env.fuzz`, which raises it.
 *
 * @example
 * FUZZ_RUNS=5000 vp test run --project node lines.fuzz
 */
export const runs: number = Number(env.FUZZ_RUNS) || 100;

/**
 * Milliseconds one run of a property may take before it fails. The slowest run in the Node suite
 * takes under 100 ms, so the margin covers slower browsers and a loaded machine.
 *
 * @example
 * fuzz(fc.asyncProperty(input, check), { timeout: 10_000 });
 */
export const timeout = 2000;

/**
 * Checks a property with fast-check for {@link runs} runs. A failure prints the seed and path, and
 * `FUZZ_SEED` and `FUZZ_PATH` replay it. Set `FUZZ_PATH` only together with `-t` for that one test,
 * because a path belongs to one property.
 *
 * A run fails when it takes longer than {@link timeout}, so a parser with a quadratic slowdown or a
 * stream that never closes fails the property instead of passing slowly. fast-check stops waiting
 * for an async run at the limit. It can't interrupt a sync run, so a sync run fails only after it
 * returns, and an infinite loop still hangs the test.
 *
 * @example
 * test('decodes what it encodes', () => {
 *   fuzz(fc.property(fc.uint8Array(), (bytes) => {
 *     expect(Base64.decode(Base64.encode(bytes))).toEqual(bytes);
 *   }));
 * });
 */
export function fuzz<types>(property: fc.IProperty<types>, options?: fuzz.Options): void;
export function fuzz<types>(
  property: fc.IAsyncProperty<types>,
  options?: fuzz.Options,
): Promise<void>;
export function fuzz<types>(
  property: fc.IProperty<types> | fc.IAsyncProperty<types>,
  options: fuzz.Options = {},
): void | Promise<void> {
  const parameters: fc.Parameters<types> = { numRuns: Math.ceil(runs * (options.scale ?? 1)) };
  if (env.FUZZ_SEED) {
    parameters.seed = Number(env.FUZZ_SEED);
  }
  if (env.FUZZ_PATH) {
    parameters.path = env.FUZZ_PATH;
  }
  const limit = options.timeout ?? timeout;
  if (property.isAsync()) {
    parameters.timeout = limit;
  }
  return fc.assert(limited(property, limit) as fc.IProperty<types>, parameters);
}

function limited<types>(
  property: fc.IProperty<types> | fc.IAsyncProperty<types>,
  limit: number,
): fc.IRawProperty<types> {
  const check = (start: number, result: fc.PreconditionFailure | fc.PropertyFailure | null) => {
    const elapsed = performance.now() - start;
    if (result === null && elapsed > limit) {
      return {
        error: new Error(`The run took ${Math.round(elapsed)} ms, over the ${limit} ms limit`),
      };
    }
    return result;
  };
  const wrapper: fc.IRawProperty<types> = Object.create(property);
  wrapper.run = (value) => {
    const start = performance.now();
    const result = property.run(value);
    return result instanceof Promise
      ? result.then((result) => check(start, result))
      : check(start, result);
  };
  return wrapper;
}

export declare namespace fuzz {
  type Options = {
    /** Multiplies {@link runs} for a property that is slow or cheap to run. */
    scale?: number | undefined;
    /** Milliseconds one run may take, instead of {@link timeout}. */
    timeout?: number | undefined;
  };
}

type ErrorClass = abstract new (...args: never[]) => Error;

/** What a call returned, or the class of the documented error it threw. */
export type Outcome<value> = { value: value } | { error: ErrorClass };

/**
 * Calls `run` and returns its value, or the class of the error it threw when that is one of
 * `errors`. Any other error is thrown again, so the property fails with it.
 *
 * @example
 * outcome([Exif.TruncatedError, Exif.InvalidInputError], () => Exif.parse(bytes));
 */
export function outcome<value>(errors: readonly ErrorClass[], run: () => value): Outcome<value> {
  try {
    return { value: run() };
  } catch (error) {
    return { error: documented(errors, error) };
  }
}

/**
 * {@link outcome} for an async function.
 *
 * @example
 * await outcomeAsync([Png.InvalidInputError], () => Png.decode(bytes));
 */
export async function outcomeAsync<value>(
  errors: readonly ErrorClass[],
  run: () => Promise<value>,
): Promise<Outcome<value>> {
  try {
    return { value: await run() };
  } catch (error) {
    return { error: documented(errors, error) };
  }
}

function documented(errors: readonly ErrorClass[], error: unknown): ErrorClass {
  const type = errors.find((type) => error instanceof type);
  if (!type) {
    throw error;
  }
  return type;
}

const byte = fc.oneof(
  fc.integer({ min: 0, max: 255 }),
  fc.constantFrom(0x00, 0x01, 0x7f, 0x80, 0xc0, 0xff),
);

type Edit = { op: 'set' | 'insert' | 'delete'; at: number; byte: number };

const edit = fc.record({
  op: fc.constantFrom('set', 'set', 'insert', 'delete'),
  at: fc.nat(),
  byte,
}) satisfies fc.Arbitrary<Edit>;

/**
 * Copies of `original` with up to 8 bytes set, inserted, or deleted, and sometimes cut short.
 * `within` limits the edits to the first `within` bytes, such as the metadata ahead of a JPEG's
 * image data.
 *
 * @example
 * fc.property(mutated(await fixture('tetons.exif')), (bytes) => ...)
 */
export function mutated(
  original: Uint8Array,
  options: mutated.Options = {},
): fc.Arbitrary<Uint8Array> {
  const within = Math.min(options.within ?? original.length, original.length);
  return fc
    .tuple(fc.array(edit, { minLength: 1, maxLength: 8 }), fc.option(fc.nat(), { freq: 4 }))
    .map(([edits, cut]) => {
      let bytes = original.slice();
      for (const { op, at, byte } of edits) {
        const index = at % (Math.min(within, bytes.length) + 1);
        if (op === 'set') {
          if (bytes.length > 0) {
            bytes[Math.min(index, bytes.length - 1)] = byte;
          }
        } else if (op === 'insert' || index < bytes.length) {
          const next = new Uint8Array(bytes.length + (op === 'insert' ? 1 : -1));
          next.set(bytes.subarray(0, index));
          if (op === 'insert') {
            next[index] = byte;
            next.set(bytes.subarray(index), index + 1);
          } else {
            next.set(bytes.subarray(index + 1), index);
          }
          bytes = next;
        }
      }
      return cut === null ? bytes : bytes.slice(0, cut % (bytes.length + 1));
    });
}

export declare namespace mutated {
  type Options = {
    /** Only change bytes before this offset. */
    within?: number | undefined;
  };
}

/**
 * Cut points for {@link split}: up to 16 offsets, which may repeat to make empty chunks.
 *
 * @example
 * fc.property(fc.uint8Array(), cuts, (bytes, at) => ... split(bytes, at) ...)
 */
export const cuts: fc.Arbitrary<number[]> = fc.array(fc.nat(), { maxLength: 16 });

/**
 * Splits `data` into chunks at `at`, each offset taken modulo the length plus one.
 *
 * @example
 * split('abcdef', [2, 4]); // ['ab', 'cd', 'ef']
 */
export function split<value extends Uint8Array | string>(
  data: value,
  at: readonly number[],
): value[] {
  const offsets = at.map((offset) => offset % (data.length + 1)).sort((a, b) => a - b);
  const chunks: value[] = [];
  let start = 0;
  for (const offset of offsets) {
    chunks.push(data.slice(start, offset) as value);
    start = offset;
  }
  chunks.push(data.slice(start) as value);
  return chunks;
}

/**
 * The forms of `Uint8Array` that the tests pass to each function that takes bytes.
 * `'Uint8Array with offset'` is a view that starts 3 bytes into a buffer padded with `0xee`, so a
 * function that reads `bytes.buffer` instead of the view's range returns a different result.
 */
export const byteForms = ['Uint8Array', 'Uint8Array with offset'] as const;

/** One of {@link byteForms}. */
export type ByteForm = (typeof byteForms)[number];

/**
 * Picks one of {@link byteForms}.
 *
 * @example
 * fc.property(fc.uint8Array(), byteForm, (bytes, form) => ... toByteForm(bytes, form) ...)
 */
export const byteForm: fc.Arbitrary<ByteForm> = fc.constantFrom(...byteForms);

/**
 * Copies `bytes` into the given form.
 *
 * @example
 * toByteForm(new Uint8Array([1, 2]), 'Uint8Array with offset'); // [1, 2] inside [0xee, 0xee, 0xee, 1, 2, 0xee, 0xee]
 */
export function toByteForm(bytes: Uint8Array, form: ByteForm): Uint8Array<ArrayBuffer> {
  switch (form) {
    case 'Uint8Array':
      return bytes.slice();
    case 'Uint8Array with offset': {
      const padded = new Uint8Array(bytes.length + 5).fill(0xee);
      padded.set(bytes, 3);
      return padded.subarray(3, 3 + bytes.length);
    }
  }
}

/**
 * Values that a test passes in place of a `Uint8Array` to check that a function that takes bytes
 * throws a `TypeError`. Each one holds the numbers 1, 2, and 3.
 */
export const rejectedByteForms: Readonly<Record<string, unknown>> = {
  'an ArrayBuffer': new Uint8Array([1, 2, 3]).buffer,
  'a DataView': new DataView(new Uint8Array([1, 2, 3]).buffer),
  'an Int8Array': new Int8Array([1, 2, 3]),
  'a Uint16Array': new Uint16Array([1, 2, 3]),
  'an array of numbers': [1, 2, 3],
};

/**
 * Calls `run` in a microtask and returns a promise that rejects if `run` throws or returns a
 * rejected promise, so a test can check sync and async functions the same way.
 *
 * @example
 * await expect(attempt(() => Bytes.toHex(new ArrayBuffer(1) as never))).rejects.toThrow(TypeError);
 */
export function attempt(run: () => unknown): Promise<unknown> {
  return Promise.resolve().then(run);
}

/**
 * A `ReadableStream` that enqueues `chunks` and closes.
 *
 * @example
 * await Streams.toBytes(streamOf([new Uint8Array(2), new Uint8Array(1)]));
 */
export function streamOf<chunk>(chunks: readonly chunk[]): ReadableStream<chunk> {
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(chunk);
      }
      controller.close();
    },
  });
}

/**
 * Reads every chunk of `stream`.
 *
 * @example
 * const lines = await readAll(streamOf([bytes]).pipeThrough(new Lines.DecoderStream()));
 */
export async function readAll<chunk>(stream: ReadableStream<chunk>): Promise<chunk[]> {
  const chunks: chunk[] = [];
  const reader = stream.getReader();
  for (let next = await reader.read(); !next.done; next = await reader.read()) {
    chunks.push(next.value);
  }
  return chunks;
}

/**
 * Reads every chunk of a byte stream and joins them.
 *
 * @example
 * const encoded = await readBytes(streamOf([bytes]).pipeThrough(new Base64.EncoderStream()));
 */
export async function readBytes(stream: ReadableStream<Uint8Array>): Promise<Uint8Array> {
  const chunks = await readAll(stream);
  const bytes = new Uint8Array(chunks.reduce((length, chunk) => length + chunk.length, 0));
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return bytes;
}
