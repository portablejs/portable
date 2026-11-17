# @portable/arc API

`pnpm api` generates this file from the source. It lists the declarations that each public entry point exports. Don't edit it by hand.

## @portable/arc

```ts
export { Hash, Hasher } from '@portable/web-crypto';

class InvalidInputError extends Errors.InvalidInputError {
  static readonly kind: string;
}

type Resolver = Dkim.Resolver;

type Result = {
  result: Result.Code;
  instance: number;
  reason?: string | undefined;
  cause?: unknown;
  sets: readonly Result.Set[];
};
namespace Result {
  type Code = 'pass' | 'fail' | 'none';
  type Set = {
    instance: number;
    domain: string;
    selector: string;
    authResults: string;
  };
}

function seal(message: Message, options: seal.Options): Promise<string>;
namespace seal {
  type Options = {
    domain: string;
    selector: string;
    privateKey: CryptoKey | string | JsonWebKey;
    authResults: string;
    chainValidation?: Result.Code | undefined;
    headers?: readonly string[] | undefined;
    now?: Instant | undefined;
    hasher?: ((hash: Dkim.Hash) => Dkim.Hasher) | undefined;
    signal?: AbortSignal | undefined;
  };
}

function verify(message: Message, options: verify.Options): Promise<Result>;
namespace verify {
  type Options = {
    resolver: Resolver;
    now?: Instant | undefined;
    minKeyBits?: number | undefined;
    hasher?: ((hash: Dkim.Hash) => Dkim.Hasher) | undefined;
    signal?: AbortSignal | undefined;
  };
}
```
