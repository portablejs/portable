# @portable/oauth1 API

`pnpm api` generates this file from the source. It lists the declarations that each public entry point exports. Don't edit it by hand.

## @portable/oauth1

```ts
export { Digest, Hmac } from '@portable/web-crypto';

type Credentials = {
  signatureMethod?: 'HMAC-SHA1' | 'HMAC-SHA256' | 'PLAINTEXT' | undefined;
  consumer: {
    key: string;
    secret: string;
  };
} | {
  signatureMethod: 'RSA-SHA1';
  consumer: {
    key: string;
    privateKey: CryptoKey | string;
  };
};

type SignatureMethod = 'HMAC-SHA1' | 'HMAC-SHA256' | 'RSA-SHA1' | 'PLAINTEXT';

type Token = {
  key: string;
  secret?: string | undefined;
};

class UnsupportedError extends Errors.UnsupportedError {
  static readonly kind: string;
}

function authorization(request: Request, options: authorization.Options): Promise<string>;
namespace authorization {
  type Options = Credentials & {
    hmac?: WebCrypto.Hmac | undefined;
    digest?: WebCrypto.Digest | undefined;
    token?: Token | undefined;
    realm?: string | undefined;
    callback?: string | undefined;
    verifier?: string | undefined;
    bodyHash?: boolean | undefined;
    signal?: AbortSignal | undefined;
    nonce?: string | undefined;
    now?: Instant | undefined;
  };
}

function sign(request: Request, options: sign.Options): Promise<Request>;
namespace sign {
  type Options = authorization.Options & {
    placement?: 'header' | 'query' | undefined;
  };
}
```
