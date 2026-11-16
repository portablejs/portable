# @portable/log API

`pnpm api` generates this file from the source. It lists the declarations that each public entry point exports. Don't edit it by hand.

## @portable/log

```ts
export { write as console };

type ContextStorage = {
  run: <result>(store: Properties, fn: () => result) => result;
  getStore: () => Properties | undefined;
};

type Level = 'debug' | 'info' | 'warn' | 'error';

type Logger = {
  debug: (...args: readonly unknown[]) => void;
  info: (...args: readonly unknown[]) => void;
  warn: (...args: readonly unknown[]) => void;
  error: (...args: readonly unknown[]) => void;
  extend: (suffix: string) => Logger;
  with: (properties: Properties) => Logger;
  isEnabled: (level: Level) => boolean;
  readonly namespace: string;
};

type Properties = Readonly<{
  [key: string]: unknown;
}>;

type Record = {
  time: Date;
  level: Level;
  namespace: string;
  args: readonly unknown[];
  properties: Properties;
};

function configure(options: configure.Options): void;
namespace configure {
  type Options = {
    console?: boolean | undefined;
    time?: boolean | undefined;
    context?: ContextStorage | undefined;
  };
}

function create(namespace: string): Logger;

function disable(): string;

function enable(patterns: string, options?: enable.Options): void;
namespace enable {
  type Options = {
    persist?: boolean | undefined;
  };
}

function format(record: Record): string;

function subscribe(subscriber: (record: Record) => void, options?: subscribe.Options): void;
namespace subscribe {
  type Options = {
    signal?: AbortSignal | undefined;
  };
}

function withContext<result>(properties: Properties, fn: () => result): result;

function write(record: Record): void;
```
