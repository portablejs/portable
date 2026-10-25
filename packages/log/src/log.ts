/** A log level, from most to least verbose. */
export type Level = 'debug' | 'info' | 'warn' | 'error';

/** Properties attached to a record by `with` and `withContext`. */
export type Properties = Readonly<{ [key: string]: unknown }>;

/** One enabled log call, as `subscribe` receives it. */
export type Record = {
  /** When the call happened. */
  time: Date;
  level: Level;
  namespace: string;
  /** The arguments as passed, starting with the format string when there is one. */
  args: readonly unknown[];
  /** Properties from `with` and from the current `withContext` call. */
  properties: Properties;
};

/**
 * A logger made by `create`. Its methods don't use `this`, so you can destructure them or pass one
 * as a callback.
 */
export type Logger = {
  /** Logs at debug level. Off unless a pattern enables the namespace. */
  debug: (...args: readonly unknown[]) => void;
  /** Logs at info level. Off unless a pattern enables the namespace. */
  info: (...args: readonly unknown[]) => void;
  /** Logs at warn level. On unless a pattern turns the namespace off. */
  warn: (...args: readonly unknown[]) => void;
  /** Logs at error level. On unless a pattern turns the namespace off. */
  error: (...args: readonly unknown[]) => void;
  /** Returns a logger for `namespace:suffix` with the same properties. */
  extend: (suffix: string) => Logger;
  /** Returns a logger with the same namespace whose records also include `properties`. */
  with: (properties: Properties) => Logger;
  /** Whether a call at `level` would log with the current patterns. */
  isEnabled: (level: Level) => boolean;
  readonly namespace: string;
};

/**
 * Storage for `withContext`. `AsyncLocalStorage` has this shape in Cloudflare Workers with
 * `nodejs_compat`, Deno, Bun and Node.
 */
export type ContextStorage = {
  run: <result>(store: Properties, fn: () => result) => result;
  getStore: () => Properties | undefined;
};

export declare namespace enable {
  type Options = {
    /** Also writes the patterns to `localStorage.debug`, so they apply after a reload. @default false */
    persist?: boolean | undefined;
  };
}

export declare namespace configure {
  type Options = {
    /** Writes enabled calls to `console`. Set to `false` to log only through `subscribe`. @default true */
    console?: boolean | undefined;
    /** Prefixes console output with an ISO 8601 timestamp. @default false */
    time?: boolean | undefined;
    /** Storage for `withContext`, such as `new AsyncLocalStorage()` from `node:async_hooks`. */
    context?: ContextStorage | undefined;
  };
}

export declare namespace subscribe {
  type Options = {
    /** Removes the subscriber when the signal aborts. */
    signal?: AbortSignal | undefined;
  };
}

type Rule = { regex: RegExp; exclude: boolean; level: number };
type Storage = {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
};
type Env = { [key: string]: string | undefined };
type State = {
  patterns: string;
  rules: readonly Rule[];
  version: number;
  started: boolean;
  storage: Storage | undefined;
  stored: string | null;
  console: boolean;
  time: boolean;
  context: ContextStorage | undefined;
  subscribers: Set<(record: Record) => void>;
};

const levels = ['debug', 'info', 'warn', 'error'] as const satisfies readonly Level[];
const off = levels.length;
const fallback = levels.indexOf('warn');
const empty = Object.freeze({}) satisfies Properties;

// If two copies of this package are loaded, both must follow the same patterns and
// subscribers, so the state is kept on `globalThis` under a registered symbol.
const key = Symbol.for('portable.log/1');
const state: State = ((globalThis as { [key]?: State | undefined })[key] ??= {
  patterns: '',
  rules: [],
  version: 0,
  started: false,
  storage: undefined,
  stored: null,
  console: true,
  time: false,
  context: undefined,
  subscribers: new Set(),
});

function parse(text: string): readonly Rule[] {
  return text
    .split(/[\s,]+/)
    .filter(Boolean)
    .map((pattern) => {
      const exclude = pattern.startsWith('-');
      const [name = '', level] = (exclude ? pattern.slice(1) : pattern).split('=');
      const index = level === undefined ? 0 : levels.indexOf(level as Level);
      if (index < 0) {
        throw new RangeError(`Unknown level "${level}" in pattern "${pattern}".`);
      }
      const source = name.replace(/[|\\{}()[\]^$+?.]/g, '\\$&').replaceAll('*', '.*?');
      return { regex: new RegExp(`^${source}$`), exclude, level: index };
    });
}

function apply(text: string | null | undefined): void {
  state.rules = text ? parse(text) : [];
  state.patterns = text ?? '';
  state.version++;
}

function start(): void {
  if (state.started) {
    return;
  }
  state.started = true;
  try {
    // Deno also has `localStorage`, but it persists across runs and would override `DEBUG`.
    const local =
      'document' in globalThis
        ? (globalThis as { localStorage?: Storage | undefined }).localStorage
        : undefined;
    if (local) {
      state.stored = local.getItem('debug');
      state.storage = local;
    }
  } catch {}
  const env = (globalThis as { process?: { env?: Env | undefined } | undefined }).process?.env;
  const meta = (import.meta as { env?: Env | undefined }).env;
  try {
    apply(state.stored ?? env?.DEBUG ?? meta?.DEBUG ?? meta?.VITE_DEBUG);
  } catch {
    apply('');
  }
  if (!state.storage) {
    return;
  }
  // Browsers fire `storage` only in other documents, so the interval checks for a change made in
  // this tab.
  setInterval(read, 1000);
  (
    globalThis as {
      addEventListener?:
        | ((type: string, listener: (event: { key: string | null }) => void) => void)
        | undefined;
    }
  ).addEventListener?.('storage', (event) => {
    if (event.key === 'debug' || event.key === null) {
      read();
    }
  });
}

function read(): void {
  let value: string | null = null;
  try {
    value = state.storage!.getItem('debug');
  } catch {}
  if (value === state.stored) {
    return;
  }
  state.stored = value;
  try {
    apply(value);
  } catch {}
}

function minimum(namespace: string): number {
  let min = off + 1;
  for (const rule of state.rules) {
    if (!rule.regex.test(namespace)) {
      continue;
    }
    if (rule.exclude) {
      return off;
    }
    if (rule.level < min) {
      min = rule.level;
    }
  }
  return min > off ? fallback : min;
}

function hue(namespace: string): number {
  let hash = 0;
  for (let i = 0; i < namespace.length; i++) {
    hash = (hash * 31 + namespace.charCodeAt(i)) | 0;
  }
  return Math.abs(hash) % 360;
}

/**
 * Writes a record to `console` as the default output does: the namespace in a color picked from
 * its name, then the arguments, then the properties. `debug` records go to `console.log`, because
 * Chrome hides `console.debug` unless its Verbose level is on.
 *
 * @example
 * ```ts
 * Log.configure({ console: false });
 * Log.subscribe((record) => Log.console({ ...record, properties: redact(record.properties) }));
 * ```
 */
export function write(record: Record): void {
  const { level, namespace, args, properties } = record;
  let format = `%c${namespace}%c`;
  const params: unknown[] = [];
  params.push(`color:hsl(${hue(namespace)} 60% 45%);font-weight:bold`, '');
  if (state.time) {
    format = `${record.time.toISOString()} ${format}`;
  }
  const [first, ...rest] = args;
  if (typeof first === 'string') {
    format += ` ${first}`;
    params.push(...rest);
  } else {
    params.push(...args);
  }
  if (properties !== empty) {
    params.push(properties);
  }
  // oxlint-disable-next-line no-console
  console[level === 'debug' ? 'log' : level](format, ...params);
}

function make(namespace: string, properties: Properties): Logger {
  start();
  let seen = -1;
  let min = 0;
  const isEnabled = (level: number): boolean => {
    if (seen !== state.version) {
      seen = state.version;
      min = minimum(namespace);
    }
    return level >= min;
  };
  const emit = (level: number, args: readonly unknown[]): void => {
    if (!isEnabled(level)) {
      return;
    }
    const scoped = state.context?.getStore();
    const record = {
      time: new Date(),
      level: levels[level]!,
      namespace,
      args,
      properties: scoped ? { ...scoped, ...properties } : properties,
    } satisfies Record;
    if (state.console) {
      write(record);
    }
    for (const subscriber of state.subscribers) {
      subscriber(record);
    }
  };
  return {
    debug: (...args) => emit(0, args),
    info: (...args) => emit(1, args),
    warn: (...args) => emit(2, args),
    error: (...args) => emit(3, args),
    extend: (suffix) => make(`${namespace}:${suffix}`, properties),
    with: (more) => make(namespace, { ...properties, ...more }),
    isEnabled: (level) => isEnabled(levels.indexOf(level)),
    namespace,
  };
}

/**
 * Returns a logger for `namespace`. `debug` and `info` calls are off until a pattern enables the
 * namespace, and `warn` and `error` calls are on until a pattern turns it off.
 *
 * @example
 * ```ts
 * const log = Log.create('app:db');
 * log.debug('connected to %s', url);
 * log.warn('slow query', { ms: 812 });
 * ```
 */
export function create(namespace: string): Logger {
  return make(namespace, empty);
}

/**
 * Sets which namespaces log, with debug's pattern syntax plus an optional minimum level:
 * `app:*,-app:noisy,lib:*=warn`. Throws a `RangeError` for an unknown level.
 *
 * @example
 * ```ts
 * Log.enable('app:*,-app:noisy');
 * ```
 */
export function enable(patterns: string, options: enable.Options = {}): void {
  if (typeof patterns !== 'string') {
    throw new TypeError('patterns must be a string.');
  }
  start();
  apply(patterns);
  if (!options.persist || !state.storage) {
    return;
  }
  try {
    state.storage.setItem('debug', patterns);
    state.stored = patterns;
  } catch {}
}

/**
 * Sets how enabled calls are written. It changes only the options you pass.
 *
 * @example
 * ```ts
 * Log.configure({ time: true });
 * ```
 */
export function configure(options: configure.Options): void {
  if (options.console !== undefined) {
    state.console = options.console;
  }
  if (options.time !== undefined) {
    state.time = options.time;
  }
  if (options.context !== undefined) {
    state.context = options.context;
  }
}

/**
 * Turns off every namespace at every level, warnings and errors included, and returns the
 * patterns that were in effect, so `enable` can restore them.
 *
 * @example
 * ```ts
 * const previous = Log.disable();
 * Log.enable(previous);
 * ```
 */
export function disable(): string {
  start();
  const previous = state.patterns;
  apply('-*');
  return previous;
}

/**
 * Calls `subscriber` with every enabled log call, after the console output.
 *
 * @example
 * ```ts
 * Log.subscribe((record) => lines.push(Log.format(record)), { signal });
 * ```
 */
export function subscribe(
  subscriber: (record: Record) => void,
  options: subscribe.Options = {},
): void {
  const { signal } = options;
  if (signal?.aborted) {
    return;
  }
  state.subscribers.add(subscriber);
  signal?.addEventListener('abort', () => state.subscribers.delete(subscriber), { once: true });
}

/**
 * Runs `fn` with `properties` added to every record logged during the call, including records from
 * loggers created elsewhere. Needs a `context` storage passed to `configure`. Without one it just
 * calls `fn`.
 *
 * @example
 * ```ts
 * Log.withContext({ requestId }, () => handle(request));
 * ```
 */
export function withContext<result>(properties: Properties, fn: () => result): result {
  const { context } = state;
  if (!context) {
    return fn();
  }
  return context.run({ ...context.getStore(), ...properties }, fn);
}
