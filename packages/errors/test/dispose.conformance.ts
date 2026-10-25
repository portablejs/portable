import { asyncDisposeSymbol, withAsyncDispose, withDispose } from '@portable/errors/internal';
import { describe, expect, test } from 'vite-plus/test';

const symbols = Symbol as { dispose?: symbol | undefined; asyncDispose?: symbol | undefined };

describe('withDispose', () => {
  test('sets Symbol.dispose where the runtime has it and returns the same object', () => {
    let calls = 0;
    const object = { a: 1 };
    const result = withDispose(object, () => void calls++);
    expect(result).toBe(object);
    if (symbols.dispose === undefined) {
      return;
    }
    (result as unknown as Record<symbol, () => void>)[symbols.dispose]!();
    expect(calls).toBe(1);
    expect(Object.keys(result)).toEqual(['a']);
  });
});

describe('withAsyncDispose', () => {
  test('sets Symbol.asyncDispose where the runtime has it and returns the same object', async () => {
    let calls = 0;
    const object = { a: 1 };
    const result = withAsyncDispose(object, async () => void calls++);
    expect(result).toBe(object);
    expect(asyncDisposeSymbol).toBe(symbols.asyncDispose);
    if (symbols.asyncDispose === undefined) {
      return;
    }
    await (result as unknown as Record<symbol, () => Promise<void>>)[symbols.asyncDispose]!();
    expect(calls).toBe(1);
    expect(Object.keys(result)).toEqual(['a']);
  });
});
