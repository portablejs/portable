# @portable/log

Logs by namespace and level. Namespaces are turned on with debug's `DEBUG` patterns from an environment variable or `localStorage`. A change to `localStorage.debug` applies to a running page without a reload. Runs in browsers, Cloudflare Workers, Deno, Bun and Node 24+.

Replaces [debug](https://www.npmjs.com/package/debug).

```sh
npm install @portable/log
```

```ts
import * as Log from '@portable/log';

const log = Log.create('app:db');

log.debug('connected to %s', url);
log.info('migrated %d tables', count);
log.warn('slow query', { ms: 812 });
log.error(error);

const query = log.extend('query');
const scoped = log.with({ requestId });
```

Turn namespaces on in the browser console with `localStorage.debug = 'app:*'`, in Node with `DEBUG=app:* node server.js`, or in code with `Log.enable('app:*')`.

## API

### `Log.create(namespace)`

Returns a logger. `debug` and `info` calls print only when a pattern enables the namespace. `warn` and `error` calls print unless a pattern turns the namespace off.

| Member | Description |
| --- | --- |
| `debug(...args)`, `info(...args)`, `warn(...args)`, `error(...args)` | Logs at that level. The arguments are the same as `console.log`'s, and a string first argument can hold `%s`, `%d`, `%o` and the other format specifiers. The methods don't use `this`, so `const { debug } = log` works. |
| `extend(suffix)` | Returns a logger for `namespace:suffix` with the same properties. |
| `with(properties)` | Returns a logger with the same namespace whose records also carry `properties`. |
| `isEnabled(level?)` | Whether a call at `level` would log with the current patterns. `level` defaults to `'debug'`. Use it to skip expensive work: `if (log.isEnabled()) { log.debug(dump(state)); }`. |
| `namespace` | The namespace string. |

### Patterns

Patterns use debug's syntax: names separated by commas or spaces, `*` matches any text, and `-name` turns a namespace off at every level, warnings and errors included. Add `=level` to set a minimum level for the namespaces a pattern matches:

```
app:*,-app:noisy,lib:*=warn
```

When several patterns match a namespace, it logs at the lowest level any of them allows, unless an exclusion matches. If no pattern matches a namespace, it logs at `warn` and above.

Patterns are read the first time `create`, `enable` or `disable` is called, from the first of these that is set:

1. `localStorage.debug`, in browsers.
2. `process.env.DEBUG`, in Node, Bun and Deno with `--allow-env`.
3. `import.meta.env.DEBUG` or `import.meta.env.VITE_DEBUG`, when a bundler such as Vite defines them.

In a browser, a change to `localStorage.debug` in another tab applies at once through the `storage` event, and a change in the same tab, such as typing `localStorage.debug = 'app:*'` in the console, applies within a second. An invalid value is ignored and the previous patterns stay until it is fixed.

### `Log.enable(patterns, options?)`

Replaces the patterns. Pass `undefined` to keep the current patterns and change only options. Throws a `RangeError` when a pattern has an unknown level, and keeps the previous patterns.

| Option | Default | Description |
| --- | --- | --- |
| `persist` | `false` | Also writes the patterns to `localStorage.debug`, so they apply after a reload. |
| `console` | `true` | Writes enabled calls to `console`. Set to `false` to log only through `subscribe`. |
| `time` | `false` | Prefixes console output with an ISO 8601 timestamp, which Node's console doesn't show. |
| `context` | | Storage for `withContext`, such as `new AsyncLocalStorage()` from `node:async_hooks`. |

### `Log.disable()`

Turns off every namespace at every level and returns the patterns that were in effect, so `Log.enable(Log.disable())` restores them.

### `Log.subscribe(subscriber, options?)`

Calls `subscriber(record)` with every enabled call, after the console output. Use it to send logs somewhere else, or to replace the console output with `Log.enable(undefined, { console: false })`. Pass `signal` to remove the subscriber.

```ts
Log.enable(undefined, { console: false });
Log.subscribe((record) => {
  if (record.level === 'error') {
    report(record);
  }
  Log.console({ ...record, properties: redact(record.properties) });
});
```

### `Log.withContext(properties, fn)`

Runs `fn` and adds `properties` to every record logged during the call, including records from loggers created elsewhere. It needs a `context` storage passed to `enable`, because only the platform can follow a call through `await`. Without one it just calls `fn`.

```ts
import { AsyncLocalStorage } from 'node:async_hooks';

Log.enable(undefined, { context: new AsyncLocalStorage() });

export default {
  fetch: (request: Request) =>
    Log.withContext({ requestId: crypto.randomUUID() }, () => handle(request)),
};
```

`AsyncLocalStorage` exists in Node, Bun, Deno and Cloudflare Workers with `nodejs_compat`. For one request handler that passes its logger down, `log.with({ requestId })` does the same without a storage.

### `Log.format(record)`

Returns a record's arguments as one line of text, replacing format specifiers as Node's `util.format` does, except that objects are written with `JSON.stringify` instead of `util.inspect`. Errors are written as their stack. It doesn't include the namespace, level, time or properties, so a subscriber adds the ones it wants.

### `Log.console(record)`

Writes a record as the default output does: the namespace in a color picked from its name, then the arguments, then the properties. `debug` records go to `console.log`, because Chrome hides `console.debug` unless its Verbose level is on, and the other levels go to `console.info`, `console.warn` and `console.error`. In Node that puts `debug` and `info` on stdout and `warn` and `error` on stderr.

## Types

| Type | Description |
| --- | --- |
| `Log.Logger` | What `create` returns. |
| `Log.Level` | `'debug' \| 'info' \| 'warn' \| 'error'`. |
| `Log.Record` | `{ time, level, namespace, args, properties }`, one enabled call. `time` is a `Date`, and `args` are the arguments as passed. |
| `Log.Properties` | An object of properties from `with` and `withContext`. |
| `Log.ContextStorage` | `{ run, getStore }`, the part of `AsyncLocalStorage` that `withContext` uses. |

## Why use this over debug

- **No reload after changing `localStorage.debug`.** debug reads it once, when the module loads.
- **Levels.** debug has one level per namespace, so warnings and errors need a second logger or a `console.warn` beside it. Here `warn` and `error` print by default, and `app:*=info` hides the debug calls of a busy namespace.
- **Debug output is visible in Chrome.** debug writes with `console.debug`, which Chrome hides unless the Verbose level is on.
- **One build for every runtime.** debug's Node build imports `tty`, `util` and `supports-color`, so a Cloudflare Worker or a bundler that ignores the `browser` field gets Node code.
- **Timestamps instead of `+Nms`.** debug prints the time since a namespace's previous call, which doesn't help when several namespaces or processes log at once. `time: true` prints an ISO 8601 timestamp.
- **Smaller and faster.** The bundle is 1.2 kB gzipped against debug's 2.7 kB. In Node, an enabled debug call written as text runs 7 to 10 times as fast as debug's, and a disabled call is as fast as loglevel's and faster than debug's.
- **Other outputs without replacing debug's `log` function.** `subscribe` receives each call as a record with its level, namespace, arguments and properties, so a subscriber can send errors to a reporting service while the console output stays.

When switching from debug, note these differences:

- A logger is an object, not a function: `createDebug('app')('x %s', y)` becomes `Log.create('app').debug('x %s', y)`.
- `warn` and `error` calls print with no patterns set, and `disable()` silences them too.
- `extend` always joins with `:`. For debug's `extend('db', '-')`, call `Log.create('app-db')`.
- debug's `enabled` property becomes `log.isEnabled()`, and `createDebug.enabled('app')` becomes `Log.create('app').isEnabled()`.
- Setting `debug.log` becomes `Log.enable(undefined, { console: false })` with a subscriber that writes `Log.format(record)`.
- There are no custom formatters such as `createDebug.formatters.h`. Format the value before passing it, or format records in a subscriber.
- `DEBUG_HIDE_DATE`, `DEBUG_COLORS`, `DEBUG_DEPTH` and the other `DEBUG_*` variables are not read. Node's console picks colors and depth itself, and `time: true` adds timestamps.
- In Node, debug writes everything to stderr. Here `warn` and `error` go to stderr, and `debug` and `info` to stdout. To send everything to stderr, subscribe with `console: false` and call `console.error(Log.format(record))`.

<!-- bench:start -->
| | @portable/log | debug | loglevel | consola | @logtape/logtape | pino |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| A debug call while debug output is off | 23,000,000 | 19,800,000 | 22,600,000 | 18,900,000 | 10,300,000 | 17,700,000 |
| A debug call with a format string, written as text | 3,040,000 | 408,000 | 1,970,000 | 671,000 | 194,000 | 658,000 |
| A debug call with an object, written as text | 2,370,000 | 249,000 | 668,000 | 691,000 | 257,000 | 629,000 |
| Create a logger and extend it | 3,970,000 | 242,000 | – | – | – | – |

Operations per second from `pnpm bench`, higher is better, in Node 24.22.0, on Intel(R) Xeon(R) Processor @ 2.80GHz (4 cores). A dash means the library has no equivalent.

| | @portable/log | debug | loglevel | consola | @logtape/logtape | pino |
| --- | --- | --- | --- | --- | --- | --- |
| Minified and gzipped | 1.3 kB | 2.7 kB | 1.6 kB | 2.4 kB | 13 kB | 5.2 kB |
| Runtime dependencies | 0 | 1 | 0 | 0 | 0 | 12 |
| Node built-ins used | none | none | none | none | none | none |
| TypeScript types | included | `@types/debug` | included | included | included | included |
| Version compared | – | 4.4.3 | 1.9.2 | 3.4.2 | 2.4.2 | 10.4.0 |

Sizes cover the imports in the usage example, or the equivalent imports of each library, bundled for the browser by `scripts/bundle-size.ts`. Runtime dependencies count every package installed with the published package. A library that uses Node built-ins needs polyfills in a browser and the `nodejs_compat` flag in Cloudflare Workers.
<!-- bench:end -->
