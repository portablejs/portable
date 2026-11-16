# @portable/sse API

`pnpm api` generates this file from the source. It lists the declarations that each public entry point exports. Don't edit it by hand.

## @portable/sse

```ts
export { Backoff, Delay } from '@portable/timers';

class DecoderStream extends TransformStream<Uint8Array | string, Event> {
  constructor(options?: DecoderStream.Options);
}
namespace DecoderStream {
  type Options = {
    maxLength?: number | undefined;
    signal?: AbortSignal | undefined;
  };
}

class EncoderStream extends TransformStream<Message, Uint8Array<ArrayBuffer>> {
  constructor(options?: EncoderStream.Options);
}
namespace EncoderStream {
  type Options = {
    signal?: AbortSignal | undefined;
  };
}

type Event = {
  event: string;
  data: string;
  id?: string | undefined;
  retry?: number | undefined;
};

class InvalidInputError extends Errors.InvalidInputError {
  static readonly kind: string;
}

class MaxLengthError extends Errors.MaxLengthError {
  static readonly kind: string;
  constructor(options: Errors.MaxLengthError.Options);
}

type Message = {
  event?: string | undefined;
  data?: string | undefined;
  id?: string | undefined;
  retry?: number | undefined;
  comment?: string | undefined;
};

class ResponseError extends Errors.ResponseError {
  static readonly kind: string;
}

function connect(request: Request | string | URL, options?: connect.Options): ReadableStream<Event>;
namespace connect {
  type Options = {
    attempts?: number | undefined;
    delay?: Timers.Delay | undefined;
    fetch?: ((request: Request) => Promise<Response>) | undefined;
    idleTimeout?: number | undefined;
    maxLength?: number | undefined;
    reconnectIf?:
      | ((
          error: unknown,
          retry: {
            attempt: number;
          },
        ) => boolean | PromiseLike<boolean>)
      | undefined;
    signal?: AbortSignal | undefined;
  };
}

function decode(input: Uint8Array | string, options?: decode.Options): Event[];
namespace decode {
  type Options = {
    maxLength?: number | undefined;
  };
}

function encode(message: Message): string;
```
