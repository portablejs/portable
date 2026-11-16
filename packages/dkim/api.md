# @portable/dkim API

`pnpm api` generates this file from the source. It lists the declarations that each public entry point exports. Don't edit it by hand.

## @portable/dkim

```ts
export { Hash, Hasher } from '@portable/web-crypto';

class InvalidInputError extends Errors.InvalidInputError {
  static readonly kind: string;
}

type Message = ReadableStream<Uint8Array> | Uint8Array | string;

type Resolver = Pick<Dns.Resolver, 'resolveTxt'>;

type Result = {
  result: Result.Code;
  domain: string;
  selector: string;
  algorithm: string;
  identity: string;
  signature: string;
  reason?: string | undefined;
  cause?: unknown;
  testing: boolean;
  bodyLength?: number | undefined;
  unsignedBodyBytes?: number | undefined;
};
namespace Result {
  type Code = 'pass' | 'fail' | 'policy' | 'neutral' | 'temperror' | 'permerror';
}

function sign(message: Message, options: sign.Options): Promise<string>;
namespace sign {
  type Options = {
    domain: string;
    selector: string;
    privateKey: CryptoKey | string | JsonWebKey;
    headers?: readonly string[] | undefined;
    canonicalization?: `${Canonicalization}/${Canonicalization}` | undefined;
    identity?: string | undefined;
    now?: Instant | undefined;
    expiresAt?: Instant | undefined;
    hasher?: ((hash: Hash) => Hasher) | undefined;
    signal?: AbortSignal | undefined;
  };
}

function verify(message: Message, options: verify.Options): Promise<Result[]>;
namespace verify {
  type Options = {
    resolver: Resolver;
    now?: Instant | undefined;
    minKeyBits?: number | undefined;
    maxSignatures?: number | undefined;
    hasher?: ((hash: Hash) => Hasher) | undefined;
    signal?: AbortSignal | undefined;
  };
}

// Not exported, but used by the exports above.

type Canonicalization = 'simple' | 'relaxed';
```
