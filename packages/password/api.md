# @portable/password API

`pnpm api` generates this file from the source. It lists the declarations that each public entry point exports. Don't edit it by hand.

## @portable/password

```ts
class InvalidInputError extends Errors.InvalidInputError {
  static readonly kind: string;
}

class MaxBytesError extends Errors.MaxBytesError {
  static readonly kind: string;
  constructor(options: Errors.MaxBytesError.Options);
}

class UnsupportedError extends Errors.UnsupportedError {
  static readonly kind: string;
}

function hash(password: string | Uint8Array, options?: hash.Options): Promise<string>;
namespace hash {
  type Options = {
    iterations?: number | undefined;
    maxBytes?: number | undefined;
    signal?: AbortSignal | undefined;
  };
}

function needsRehash(stored: string, options?: needsRehash.Options): boolean;
namespace needsRehash {
  type Options = {
    iterations?: number | undefined;
  };
}

function verify(
  password: string | Uint8Array,
  stored: string,
  options?: verify.Options,
): Promise<boolean>;
namespace verify {
  type Options = {
    maxBytes?: number | undefined;
    signal?: AbortSignal | undefined;
  };
}
```
