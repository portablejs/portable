type SymbolKey<name extends string> = SymbolConstructor extends {
  readonly [key in name]: infer value extends symbol;
}
  ? value
  : never;

/**
 * A `[Symbol.asyncDispose]` method, so the object works with `await using`. The type has the key
 * only when the TypeScript lib declares `Symbol.asyncDispose`, and the object has the method only
 * when the runtime has the symbol.
 */
export type AsyncDisposeMethod = {
  readonly [key in SymbolKey<'asyncDispose'>]: () => Promise<void>;
};

/** `Symbol.asyncDispose`, or `undefined` in a runtime without it. */
export const asyncDispose: symbol | undefined = (Symbol as { asyncDispose?: symbol | undefined })
  .asyncDispose;
