# @portable/webhooks API

`pnpm api` generates this file from the source. It lists the declarations that each public entry point exports. Don't edit it by hand.

## @portable/webhooks

```ts
export { Hmac } from '@portable/web-crypto';

class MaxBytesError extends Errors.MaxBytesError {
  static readonly kind: string;
}

type Scheme = {
  parse: (headers: Headers) => Scheme.Signed;
  payload: (signed: {
    id: string | undefined;
    timestamp: Date | undefined;
    body: Uint8Array;
  }) => Uint8Array | string;
  headers: (signed: {
    signature: Uint8Array;
    id: string;
    timestamp: Date;
  }) => Record<string, string>;
  key?: ((secret: string) => Uint8Array) | undefined;
};
namespace Scheme {
  type Signed = {
    signatures: readonly Uint8Array[];
    timestamp?: Date | undefined;
    id?: string | undefined;
  };
}

type Secret = string | Uint8Array;

class VerificationError extends Errors.BaseError {
  static readonly kind: string;
  readonly code: VerificationError.Code;
  constructor(
    options: ErrorOptions & {
      code: VerificationError.Code;
      message: string;
    },
  );
}
namespace VerificationError {
  type Code = 'missing-header' | 'malformed-header' | 'signature' | 'timestamp';
}

const github: Scheme;

function sign(body: string | Uint8Array, options: sign.Options): Promise<Record<string, string>>;
namespace sign {
  type Options = {
    scheme?: Scheme | undefined;
    secret: Secret;
    hmac?: WebCrypto.Hmac | undefined;
    now?: Instant | undefined;
    id?: string | undefined;
    signal?: AbortSignal | undefined;
  };
}

const slack: Scheme;

const standard: Scheme;

const stripe: Scheme;

function verify(input: verify.Input, options: verify.Options): Promise<verify.ReturnType>;
namespace verify {
  type Input =
    | Request
    | {
        headers: HeadersInit;
        body: string | Uint8Array;
      };
  type Options = {
    scheme?: Scheme | undefined;
    secret: Secret | readonly Secret[];
    hmac?: WebCrypto.Hmac | undefined;
    tolerance?: number | undefined;
    now?: Instant | undefined;
    maxBytes?: number | undefined;
    signal?: AbortSignal | undefined;
  };
  type ReturnType = {
    body: string;
    id: string | undefined;
    timestamp: Date | undefined;
  };
}
```
