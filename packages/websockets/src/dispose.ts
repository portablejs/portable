type SymbolKey<name extends string> = SymbolConstructor extends {
  readonly [key in name]: infer value extends symbol;
}
  ? value
  : never;

const symbols = Symbol as { asyncDispose?: symbol | undefined };

/**
 * A `[Symbol.asyncDispose]` method, so the object works with `await using`. The type has the key
 * only when the TypeScript lib declares `Symbol.asyncDispose`, and the object has the method only
 * when the runtime has the symbol.
 */
export type AsyncDisposeMethod = {
  readonly [key in SymbolKey<'asyncDispose'>]: () => Promise<void>;
};

export function withAsyncDispose<value extends object>(
  object: value,
  dispose: () => Promise<void>,
): value & AsyncDisposeMethod {
  if (symbols.asyncDispose !== undefined) {
    Object.defineProperty(object, symbols.asyncDispose, { value: dispose, configurable: true });
  }
  // oxlint-disable-next-line typescript/no-unnecessary-type-assertion -- needed when the lib declares the symbol
  return object as unknown as value & AsyncDisposeMethod;
}
