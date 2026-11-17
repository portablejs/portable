# @portable/random API

`pnpm api` generates this file from the source. It lists the declarations that each public entry point exports. Don't edit it by hand.

## @portable/random

```ts
type Seeded = {
  readonly int: (min: number, max: number) => number;
  readonly float: () => number;
  readonly string: (
    length: number,
    options?: {
      alphabet?: string | undefined;
    },
  ) => string;
  readonly shuffle: <value>(array: readonly value[]) => value[];
  readonly pick: <value>(array: readonly value[]) => value;
  readonly bytes: (length: number) => Uint8Array<ArrayBuffer>;
};

function bytes(length: number): Uint8Array<ArrayBuffer>;

function float(): number;

function int(min: number, max: number): number;

function pick<value>(array: readonly value[]): value;

function seeded(seed: number): Seeded;

function shuffle<value>(array: readonly value[]): value[];

function string(length: number, options?: string.Options): string;
namespace string {
  type Options = {
    alphabet?: string | undefined;
  };
}
```
