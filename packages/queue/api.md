# @portable/queue API

`pnpm api` generates this file from the source. It lists the declarations that each public entry point exports. Don't edit it by hand.

## @portable/queue

```ts
type Context = {
  signal: AbortSignal;
};

type Queue = AsyncDisposeMethod & {
  add: <value>(task: Task<value>, options?: Queue.AddOptions) => Promise<value>;
  idle: () => Promise<void>;
  pause: () => void;
  resume: () => void;
  clear: () => void;
  readonly size: number;
  readonly pending: number;
  readonly paused: boolean;
  concurrency: number;
};
namespace Queue {
  type AddOptions = {
    priority?: number | undefined;
    signal?: AbortSignal | undefined;
  };
}

type Task<value> = (context: Context) => value | PromiseLike<value>;

function create(options?: create.Options): Queue;
namespace create {
  type Options = {
    concurrency?: number | undefined;
    intervalCap?: number | undefined;
    interval?: number | undefined;
    signal?: AbortSignal | undefined;
  };
}

function limit(concurrency: number): Queue['add'];

function map<chunk, result>(
  input: Iterable<chunk> | AsyncIterable<chunk>,
  fn: (item: chunk, context: map.Context) => result | PromiseLike<result>,
  options?: map.Options,
): Promise<result[]>;
namespace map {
  type Options = {
    concurrency?: number | undefined;
    signal?: AbortSignal | undefined;
    stopOnError?: boolean | undefined;
  };
  type Context = {
    index: number;
    signal: AbortSignal;
  };
}

function once<value>(
  fn: () => value | PromiseLike<value>,
  options?: once.Options,
): () => Promise<value>;
namespace once {
  type Options = {
    cache?: boolean | undefined;
  };
}
```
