# @portable/timers API

`pnpm api` generates this file from the source. It lists the declarations that each public entry point exports. Don't edit it by hand.

## @portable/timers

```ts
type Attempt = {
  attempt: number;
  error?: unknown;
};

type Backoff = {
  initial: number;
  max: number;
  factor?: number | undefined;
  jitter?: boolean | undefined;
};

type Context = {
  attempt: number;
  signal: AbortSignal;
};

type Debounced<args extends unknown[], result, self = unknown> = DisposeMethod & {
  (this: self, ...args: args): Promise<Awaited<result>>;
  cancel(): void;
  flush(): Promise<Awaited<result> | undefined>;
  readonly pending: boolean;
};

type Delay = number | Backoff | ((attempt: Attempt) => number);

type Instant = Date | {
  readonly epochMilliseconds: number;
};

function backoff(delay: Delay): (attempt: Attempt) => number;

function debounce<args extends unknown[], result, self = unknown>(fn: (this: self, ...args: args) => result, ms: number, options?: debounce.Options): Debounced<args, result, self>;
namespace debounce {
  type Options = {
    leading?: boolean | undefined;
    trailing?: boolean | undefined;
    maxWait?: number | undefined;
    signal?: AbortSignal | undefined;
  };
}

function poll<value>(fn: (context: Context) => value | undefined | PromiseLike<value | undefined>, options?: poll.Options): Promise<value>;
namespace poll {
  type Options = {
    delay?: Delay | undefined;
    signal?: AbortSignal | undefined;
  };
}

function retry<value>(fn: (context: Context) => value | PromiseLike<value>, options?: retry.Options): Promise<value>;
namespace retry {
  type Options = {
    attempts?: number | undefined;
    delay?: Delay | undefined;
    retryIf?: ((error: unknown, retry: {
      attempt: number;
    }) => boolean | PromiseLike<boolean>) | undefined;
    onRetry?: ((error: unknown, retry: retry.Retry) => void | PromiseLike<void>) | undefined;
    timeout?: number | undefined;
    signal?: AbortSignal | undefined;
  };
  type Retry = {
    attempt: number;
    delay: number;
  };
}

function sleep(ms: number, options?: sleep.Options): Promise<void>;
namespace sleep {
  type Options = {
    signal?: AbortSignal | undefined;
  };
}

function throttle<args extends unknown[], result, self = unknown>(fn: (this: self, ...args: args) => result, ms: number, options?: throttle.Options): Debounced<args, result, self>;
namespace throttle {
  type Options = {
    leading?: boolean | undefined;
    trailing?: boolean | undefined;
    signal?: AbortSignal | undefined;
  };
}
```
