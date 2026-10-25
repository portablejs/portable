type SymbolKey<name extends string> = SymbolConstructor extends {
  readonly [key in name]: infer value extends symbol;
}
  ? value
  : never;

const symbols = Symbol as { dispose?: symbol | undefined; asyncDispose?: symbol | undefined };

/** `Symbol.asyncDispose`, or `undefined` in a runtime without it. */
export const asyncDisposeSymbol: symbol | undefined = symbols.asyncDispose;

/**
 * A `[Symbol.dispose]` method, so the object works with `using`. The type has the key only when
 * the TypeScript lib declares `Symbol.dispose`, and the object has the method only when the
 * runtime has the symbol.
 */
export type DisposeMethod = { readonly [key in SymbolKey<'dispose'>]: () => void };

/**
 * A `[Symbol.asyncDispose]` method, so the object works with `await using`. The type has the key
 * only when the TypeScript lib declares `Symbol.asyncDispose`, and the object has the method only
 * when the runtime has the symbol.
 */
export type AsyncDisposeMethod = {
  readonly [key in SymbolKey<'asyncDispose'>]: () => Promise<void>;
};

/** Sets `object[Symbol.dispose]` to `dispose` where the runtime has the symbol, and returns `object`. */
export function withDispose<value extends object>(
  object: value,
  dispose: () => void,
): value & DisposeMethod {
  if (symbols.dispose !== undefined) {
    Object.defineProperty(object, symbols.dispose, { value: dispose, configurable: true });
  }
  // oxlint-disable-next-line typescript/no-unnecessary-type-assertion -- needed when the lib declares the symbol
  return object as unknown as value & DisposeMethod;
}

/**
 * Sets `object[Symbol.asyncDispose]` to `dispose` where the runtime has the symbol, and returns
 * `object`.
 */
export function withAsyncDispose<value extends object>(
  object: value,
  dispose: () => Promise<void>,
): value & AsyncDisposeMethod {
  if (asyncDisposeSymbol !== undefined) {
    Object.defineProperty(object, asyncDisposeSymbol, { value: dispose, configurable: true });
  }
  // oxlint-disable-next-line typescript/no-unnecessary-type-assertion -- needed when the lib declares the symbol
  return object as unknown as value & AsyncDisposeMethod;
}
