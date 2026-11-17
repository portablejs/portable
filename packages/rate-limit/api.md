# @portable/rate-limit API

`pnpm api` generates this file from the source. It lists the declarations that each public entry point exports. Don't edit it by hand.

## @portable/rate-limit

```ts
type Limiter = {
  take(key: string, options?: Limiter.TakeOptions): Promise<Result>;
};
namespace Limiter {
  type TakeOptions = {
    cost?: number | undefined;
    now?: Instant | undefined;
    signal?: AbortSignal | undefined;
  };
}

type Result = {
  allowed: boolean;
  limit: number;
  period: number;
  remaining: number;
  resetAt: Date;
  retryAfter: number;
};

type Store = {
  get(key: string, options: Store.GetOptions): Store.MaybePromise<number | undefined>;
  set(key: string, value: number, options: Store.SetOptions): Store.MaybePromise<boolean>;
};
namespace Store {
  type MaybePromise<value> = value | Promise<value>;
  type GetOptions = {
    now?: Date | undefined;
    signal?: AbortSignal | undefined;
  };
  type SetOptions = {
    expected: number | undefined;
    ttl: number;
    now?: Date | undefined;
    signal?: AbortSignal | undefined;
  };
}

function create(options: create.Options): Limiter;
namespace create {
  type Options = {
    limit: number;
    period: number;
    burst?: number | undefined;
    store?: Store | undefined;
  };
}

function headers(result: Result, options?: headers.Options): Record<string, string>;
namespace headers {
  type Options = {
    name?: string | undefined;
    now?: Instant | undefined;
  };
}

function memoryStore(): {
  get(key: string, options?: Store.GetOptions): number | undefined;
  set(key: string, value: number, options: Store.SetOptions): boolean;
};
```
