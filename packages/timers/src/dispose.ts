type SymbolKey<name extends string> = SymbolConstructor extends {
  readonly [key in name]: infer value extends symbol;
}
  ? value
  : never;

const symbols = Symbol as { dispose?: symbol | undefined };

/**
 * A `[Symbol.dispose]` method, so the object works with `using`. The type has the key only when
 * the TypeScript lib declares `Symbol.dispose`, and the object has the method only when the
 * runtime has the symbol.
 */
export type DisposeMethod = { readonly [key in SymbolKey<'dispose'>]: () => void };

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
