# @portable/bytes API

`pnpm api` generates this file from the source. It lists the declarations that each public entry point exports. Don't edit it by hand.

## @portable/bytes

```ts
class InvalidInputError extends Errors.InvalidInputError {
  static readonly kind: string;
}

function concat(chunks: readonly Uint8Array[]): Uint8Array<ArrayBuffer>;

function equal(a: Uint8Array, b: Uint8Array): boolean;

function fromHex(text: string | Uint8Array): Uint8Array<ArrayBuffer>;

function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean;

function toHex(bytes: Uint8Array): string;
```
