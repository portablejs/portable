import fc from 'fast-check'

export { fc }

const env = import.meta.env as Record<string, string | undefined>

/**
 * Runs per property. `FUZZ_RUNS` sets it, and `pnpm fuzz` loads `.env.fuzz`, which raises it.
 *
 * @example
 * FUZZ_RUNS=5000 vp test run --project node lines.fuzz
 */
export const runs: number = Number(env.FUZZ_RUNS) || 100

/**
 * Checks a property with fast-check for {@link runs} runs. A failure prints the seed and path, and
 * `FUZZ_SEED` and `FUZZ_PATH` replay it. Set `FUZZ_PATH` only together with `-t` for that one test,
 * because a path belongs to one property.
 *
 * @example
 * test('decodes what it encodes', () => {
 *   fuzz(fc.property(fc.uint8Array(), (bytes) => {
 *     expect(Base64.decode(Base64.encode(bytes))).toEqual(bytes)
 *   }))
 * })
 */
export function fuzz<types>(property: fc.IProperty<types>, options?: fuzz.Options): void
export function fuzz<types>(
  property: fc.IAsyncProperty<types>,
  options?: fuzz.Options,
): Promise<void>
export function fuzz<types>(
  property: fc.IProperty<types> | fc.IAsyncProperty<types>,
  options: fuzz.Options = {},
): void | Promise<void> {
  const parameters: fc.Parameters<types> = { numRuns: Math.ceil(runs * (options.scale ?? 1)) }
  if (env.FUZZ_SEED) parameters.seed = Number(env.FUZZ_SEED)
  if (env.FUZZ_PATH) parameters.path = env.FUZZ_PATH
  return fc.assert(property as fc.IProperty<types>, parameters)
}

export declare namespace fuzz {
  type Options = {
    /** Multiplies {@link runs} for a property that is slow or cheap to run. */
    scale?: number | undefined
  }
}

type ErrorClass = abstract new (...args: never[]) => Error

/** What a call returned, or the class of the documented error it threw. */
export type Outcome<value> = { value: value } | { error: ErrorClass }

/**
 * Calls `run` and returns its value, or the class of the error it threw when that is one of
 * `errors`. Any other error is thrown again, so the property fails with it.
 *
 * @example
 * outcome([Exif.TruncatedError, Exif.InvalidInputError], () => Exif.parse(bytes))
 */
export function outcome<value>(errors: readonly ErrorClass[], run: () => value): Outcome<value> {
  try {
    return { value: run() }
  } catch (error) {
    return { error: documented(errors, error) }
  }
}

/**
 * {@link outcome} for an async function.
 *
 * @example
 * await outcomeAsync([Png.InvalidInputError], () => Png.decode(bytes))
 */
export async function outcomeAsync<value>(
  errors: readonly ErrorClass[],
  run: () => Promise<value>,
): Promise<Outcome<value>> {
  try {
    return { value: await run() }
  } catch (error) {
    return { error: documented(errors, error) }
  }
}

function documented(errors: readonly ErrorClass[], error: unknown): ErrorClass {
  const type = errors.find((type) => error instanceof type)
  if (!type) throw error
  return type
}

const byte = fc.oneof(
  fc.integer({ min: 0, max: 255 }),
  fc.constantFrom(0x00, 0x01, 0x7f, 0x80, 0xc0, 0xff),
)

type Edit = { op: 'set' | 'insert' | 'delete'; at: number; byte: number }

const edit = fc.record({
  op: fc.constantFrom('set', 'set', 'insert', 'delete'),
  at: fc.nat(),
  byte,
}) satisfies fc.Arbitrary<Edit>

/**
 * Copies of `original` with up to 8 bytes set, inserted or deleted, and sometimes cut short.
 * `within` keeps the edits in the first `within` bytes, such as the metadata ahead of a JPEG's
 * image data.
 *
 * @example
 * fc.property(mutated(await fixture('tetons.exif')), (bytes) => ...)
 */
export function mutated(
  original: Uint8Array,
  options: mutated.Options = {},
): fc.Arbitrary<Uint8Array> {
  const within = Math.min(options.within ?? original.length, original.length)
  return fc
    .tuple(fc.array(edit, { minLength: 1, maxLength: 8 }), fc.option(fc.nat(), { freq: 4 }))
    .map(([edits, cut]) => {
      let bytes = original.slice()
      for (const { op, at, byte } of edits) {
        const index = at % (Math.min(within, bytes.length) + 1)
        if (op === 'set') {
          if (bytes.length > 0) bytes[Math.min(index, bytes.length - 1)] = byte
        } else if (op === 'insert' || index < bytes.length) {
          const next = new Uint8Array(bytes.length + (op === 'insert' ? 1 : -1))
          next.set(bytes.subarray(0, index))
          if (op === 'insert') {
            next[index] = byte
            next.set(bytes.subarray(index), index + 1)
          } else next.set(bytes.subarray(index + 1), index)
          bytes = next
        }
      }
      return cut === null ? bytes : bytes.slice(0, cut % (bytes.length + 1))
    })
}

export declare namespace mutated {
  type Options = {
    /** Only change bytes before this offset. */
    within?: number | undefined
  }
}

/**
 * Cut points for {@link split}: up to 16 offsets, which may repeat to make empty chunks.
 *
 * @example
 * fc.property(fc.uint8Array(), cuts, (bytes, at) => ... split(bytes, at) ...)
 */
export const cuts: fc.Arbitrary<number[]> = fc.array(fc.nat(), { maxLength: 16 })

/**
 * Splits `data` into chunks at `at`, each offset taken modulo the length plus one.
 *
 * @example
 * split('abcdef', [2, 4]) // ['ab', 'cd', 'ef']
 */
export function split<value extends Uint8Array | string>(
  data: value,
  at: readonly number[],
): value[] {
  const offsets = at.map((offset) => offset % (data.length + 1)).sort((a, b) => a - b)
  const chunks: value[] = []
  let start = 0
  for (const offset of offsets) {
    chunks.push(data.slice(start, offset) as value)
    start = offset
  }
  chunks.push(data.slice(start) as value)
  return chunks
}
