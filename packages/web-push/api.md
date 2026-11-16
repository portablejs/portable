# @portable/web-push API

`pnpm api` generates this file from the source. It lists the declarations that each public entry point exports. Don't edit it by hand.

## @portable/web-push

```ts
class InvalidInputError extends Errors.InvalidInputError {
  static readonly kind: string;
}

type Keys = {
  p256dh: string | Uint8Array;
  auth: string | Uint8Array;
};

class MaxBytesError extends Errors.MaxBytesError {
  static readonly kind: string;
}

class ResponseError extends Errors.ResponseError {
  static readonly kind: string;
  readonly body: string;
  constructor(
    options: Errors.ResponseError.Options & {
      body: string;
    },
  );
}

type Subscription = {
  endpoint: string;
  expirationTime?: number | null | undefined;
  keys?: Keys | undefined;
};

type Urgency = 'very-low' | 'low' | 'normal' | 'high';

type Vapid = VapidKeys & {
  subject: string;
};

type VapidKeys = {
  publicKey: string;
  privateKey: string;
};

function encrypt(options: encrypt.Options): Promise<Uint8Array<ArrayBuffer>>;
namespace encrypt {
  type Options = {
    subscription: Pick<Subscription, 'keys'>;
    payload: string | Uint8Array;
    salt?: Uint8Array | undefined;
    keyPair?: CryptoKeyPair | undefined;
    signal?: AbortSignal | undefined;
  };
}

function generateVapidKeys(options?: generateVapidKeys.Options): Promise<VapidKeys>;
namespace generateVapidKeys {
  type Options = {
    signal?: AbortSignal | undefined;
  };
}

const maxPayloadBytes = 3993;

function send(options: send.Options): Promise<send.ReturnType>;
namespace send {
  type Options = toRequest.Options & {
    fetch?: ((request: Request) => Promise<Response>) | undefined;
  };
  type ReturnType =
    | {
        kind: 'sent';
        status: number;
      }
    | {
        kind: 'gone';
        status: 404 | 410;
      };
}

function toRequest(options: toRequest.Options): Promise<Request>;
namespace toRequest {
  type Options = {
    subscription: Subscription;
    payload?: string | Uint8Array | undefined;
    vapid: Vapid;
    ttl?: number | undefined;
    urgency?: Urgency | undefined;
    topic?: string | undefined;
    now?: Instant | undefined;
    signal?: AbortSignal | undefined;
  };
}
```
