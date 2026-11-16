# @portable/web-crypto API

`pnpm api` generates this file from the source. It lists the declarations that each public entry point exports. Don't edit it by hand.

## @portable/web-crypto

```ts
type Digest = (hash: Hash, data: Uint8Array<ArrayBuffer>) => Uint8Array | Promise<Uint8Array>;

type Hash = 'SHA-1' | 'SHA-256' | 'SHA-384' | 'SHA-512';

type Hasher = {
  update(data: Uint8Array): unknown;
  digest(): Uint8Array | Promise<Uint8Array>;
};

type Hmac = (
  hash: Hash,
  key: Uint8Array<ArrayBuffer>,
  data: Uint8Array<ArrayBuffer>,
) => Uint8Array | Promise<Uint8Array>;

class InvalidInputError extends Errors.InvalidInputError {
  static readonly kind: string;
}

type NamedCurve = 'P-256' | 'P-384' | 'P-521';

type SeedAlgorithm = 'Ed25519' | 'X25519';

class UnsupportedError extends Errors.UnsupportedError {
  static readonly kind: string;
}

function derToRawEcdsa(
  signature: Uint8Array,
  options?: derToRawEcdsa.Options,
): Uint8Array<ArrayBuffer>;
namespace derToRawEcdsa {
  type Options = {
    namedCurve?: NamedCurve | undefined;
  };
}

function digest(
  hash: Hash,
  data: string | Uint8Array,
  options?: digest.Options,
): Promise<Uint8Array<ArrayBuffer>>;
namespace digest {
  type Options = {
    signal?: AbortSignal | undefined;
  };
}

function hkdf(
  hash: Hash,
  key: string | Uint8Array,
  options?: hkdf.Options,
): Promise<Uint8Array<ArrayBuffer>>;
namespace hkdf {
  type Options = {
    info?: string | Uint8Array | undefined;
    length?: number | undefined;
    salt?: string | Uint8Array | undefined;
    signal?: AbortSignal | undefined;
  };
}

function hmac(
  hash: Hash,
  key: string | Uint8Array,
  data: string | Uint8Array,
  options?: hmac.Options,
): Promise<Uint8Array<ArrayBuffer>>;
namespace hmac {
  type Options = {
    signal?: AbortSignal | undefined;
  };
}

function importPem(
  algorithm: importPem.Algorithm,
  pem: string | Uint8Array,
  options?: importPem.Options,
): Promise<CryptoKey>;
namespace importPem {
  type Algorithm = AlgorithmIdentifier | RsaHashedImportParams | EcKeyImportParams;
  type Options = {
    extractable?: boolean | undefined;
    usages?: readonly KeyUsage[] | undefined;
    signal?: AbortSignal | undefined;
  };
}

function importSeed(
  algorithm: SeedAlgorithm,
  seed: Uint8Array,
  options?: importSeed.Options,
): Promise<CryptoKeyPair>;
namespace importSeed {
  type Options = {
    extractable?: boolean | undefined;
    signal?: AbortSignal | undefined;
  };
}

function publicKeyOf(privateKey: CryptoKey, options?: publicKeyOf.Options): Promise<CryptoKey>;
namespace publicKeyOf {
  type Options = {
    signal?: AbortSignal | undefined;
  };
}

function rawToDerEcdsa(signature: Uint8Array): Uint8Array<ArrayBuffer>;
```
