# Decisions

Decisions made while building the packages, with the options considered and the reason for each choice. Newest first. Change any of them by editing this file.

## `Log.configure` sets the output options, and `Log.enable` takes only patterns

- **Options:** keep `Log.enable(patterns, options)`, which leaves the patterns unchanged when you pass `undefined`, so `Log.enable(undefined, { console: false })` changes only the output; require `patterns` and move `console`, `time` and `context` to a `Log.configure(options)`.
- **Trade-offs:** AGENTS.md rules out a positional that accepts `undefined`, and `enable(undefined, …)` hides what the call does. `configure` adds one export, and switching from debug still needs only `enable`. `persist` stays on `enable`, because it writes the patterns. `log.isEnabled(level)` now requires its level instead of defaulting to `'debug'`, because an optional positional breaks the same rule.
- **Chosen:** `Log.enable(patterns, { persist })` and `Log.configure({ console, time, context })`. `tools/lint/src/publicApi.test.ts` now also rejects an optional positional or one that accepts `undefined` in a public function, except `Compress.crc32`, which copies `zlib.crc32`, and `Exif.parseDate`, which takes a tag value that is `undefined` when the tag is missing.

## `@portable/sockets` has types and a Node adapter, with no default per runtime

- **Options:** a main entry whose `connect` picks `cloudflare:sockets`, `node:net` or Deno's API by export condition; a main entry with only the `Sockets.Connect` and `Sockets.Socket` types, with drivers taking a `connect` option, and the Node adapter in a `/node` subpath.
- **Trade-offs:** an export condition per runtime keeps drivers free of a `connect` option, but each runtime's build of every driver then needs its own tests, and `cloudflare:sockets` doesn't resolve outside workerd, so a bundler for another target would fail on it. A `connect` option costs the caller one import, and smtp already had one. `connect` from `cloudflare:sockets` already has the `Sockets.Connect` type, and Deno and Bun run `node:net` and `node:tls`, so the Node adapter also works on them. The `cloudflare:sockets` types require `allowHalfOpen`, so `Sockets.Options` requires both fields, and a driver always passes them. The WinterTC draft's `sni` and `alpn` options are left out, because the `cloudflare:sockets` types have neither.
- **Chosen:** types in the main entry, and `connect` and `create` in `@portable/sockets/node`. smtp takes `Sockets.Connect` and re-exports it as `Smtp.Connect`. The Node adapter verifies certificates for `startTls()` and sends SNI, which @arrowood.dev/socket doesn't, and `create({ ca, rejectUnauthorized })` builds a `connect` for a private CA or a test server. Runs in workerd under Miniflare showed behavior the draft leaves open, such as `closed` staying pending after both sides end, and the README lists these differences. The adapter keeps Node's behavior instead of copying workerd's, because Miniflare connects through a local proxy and Cloudflare's network may behave differently.

## The sockets Node adapter's tests are named `*.conformance.test.ts`

- **Options:** `*.conformance.ts`, which also runs in browsers and in the worker harness; `*.test.ts`, which runs only in Node; `*.conformance.test.ts`.
- **Trade-offs:** the tests need `node:net` and `node:tls` servers, so they can't run in a browser. They should still run on Bun and Deno, because the adapter is the `connect` for those runtimes. The browser project and the worker harness only run `*.conformance.ts`, and `pnpm test:bun` and `pnpm test:deno` select files by the word `conformance`.
- **Chosen:** `*.conformance.test.ts`. As with `@portable/streams/node`, `./node` is a plain export that `tools/workers/src/run.ts` leaves out of the Worker bundle, and a workerd check tests the main entry, which has only types, by using `connect` from `cloudflare:sockets` as a `Sockets.Connect`.

## `@portable/binary` readers and writers are objects on a shared prototype

- **Options:** a class, as smart-buffer has; an object of closures made by `createReader`; an object whose methods live on one shared prototype and read their state from a `Symbol.for('portable.binary.reader')` property.
- **Trade-offs:** AGENTS.md allows classes only for errors and platform subclasses. Protocol parsing usually needs a new reader for every packet, and the closure version allocates about 25 functions for each reader. Methods on a prototype need `this`, so `const { uint8 } = reader` doesn't work, as it doesn't for `DataView`.
- **Chosen:** the shared prototype. `createReader` and `createWriter` allocate one object and one state object.

## `@portable/binary` throws a `RangeError` for an out-of-range value

- **Options:** wrap the value, as `DataView.setUint8(0, 256)` does; throw a `RangeError`, as `Buffer.writeUInt8(256)` does.
- **Trade-offs:** Wrapping writes a different number than the one passed and gives no sign of it. The check costs one comparison per write, and the benchmarks show no difference.
- **Chosen:** a `RangeError` for a value outside the type's range or not an integer, and a `TypeError` for a value of the wrong type. `FrameEncoderStream` errors the stream with `Binary.InvalidInputError` for a chunk too long for its prefix, because that chunk is malformed input.

## `@portable/binary` varints have three encodings and two result types

- **Options:** one varint type per protocol (protobuf `int32`, `sint32`, Minecraft `VarInt`); an `encoding` option of `'unsigned'`, `'zigzag'` or `'signed'` (SLEB128), with `varint` returning a number and `bigVarint` a bigint.
- **Trade-offs:** Protocols disagree on negative numbers. Minecraft writes a negative `VarInt` as its 32-bit two's complement in 5 bytes, and protobuf writes a negative `int32` sign-extended to 64 bits in 10 bytes. Both write the value as an unsigned varint after converting it. If `varint` returned `number | bigint`, you would have to check the type of every result.
- **Chosen:** the `encoding` option and two methods. `varint` reads and writes safe integers and throws `Binary.InvalidInputError` for a larger value, so it never returns a rounded number. A Minecraft `VarInt` is `reader.varint() | 0` and `writer.varint(value >>> 0)`, and a negative protobuf `int32` is `writer.bigVarint(BigInt.asUintN(64, BigInt(value)))`.

## `@portable/binary` frame lengths count only the frame's bytes

- **Options:** a length that counts only the bytes after the prefix, as it-length-prefixed and Minecraft use; an option for a length that includes the prefix, as the PostgreSQL wire protocol uses; an option for a header before the length.
- **Trade-offs:** Each option adds a case to the decoder and its tests. PostgreSQL also puts a type byte before the length, so it would need both the inclusive length and the header option.
- **Chosen:** only the first. For other layouts, read the header with a `Reader` from your own buffered bytes.

## `@portable/log` reads `process.env.DEBUG` and polls `localStorage`

- **Options:** read patterns only from `enable()`; also read `localStorage.debug`, `process.env.DEBUG` and `import.meta.env`, as debug does. For a change to `localStorage.debug` made in the same tab: no detection, a check of the time on every log call, or a 1 second interval.
- **Trade-offs:** The package rules forbid `process`, but `DEBUG=app:* node server.js` is how most debug users turn logging on. Reading `globalThis.process?.env` uses no Node API and does nothing where `process` doesn't exist. Browsers fire `storage` only in other tabs. Checking the time on every call cost about 40 ns per call in a prototype, and a disabled call costs less than that. AGENTS.md asks for a `signal` on anything that holds a timer, but the interval runs for the life of the page and takes no `signal`.
- **Chosen:** read all three sources, and in a browser, listen for `storage` and check `localStorage.debug` once a second. `localStorage` is read only when `document` exists, so no timer runs in Workers, Deno, Bun or Node. Deno has a `localStorage` too, but it persists across runs and would override `DEBUG`.

## `@portable/log` loggers are objects with one method per level

- **Options:** a callable logger like debug's, `log('x')`, plus `log.warn` and `log.error`; an object with `debug`, `info`, `warn` and `error` methods. For debug-level output: `console.debug` or `console.log`.
- **Trade-offs:** A callable logger is shorter to migrate to, but a bare `log()` call hides its level. Chrome hides `console.debug` output unless its Verbose level is on, and debug's users complain about this. `console.log` prints at the Info level in browsers.
- **Chosen:** an object with a method for each level, so every call states its level. `debug` calls go to `console.log`, and `warn` and `error` print when no pattern matches, so a library's warnings are visible without setup.

## `@portable/log` keeps its state on `globalThis`

- **Options:** module-level variables; one object stored under `Symbol.for('portable.log/1')` on `globalThis`.
- **Trade-offs:** Two copies of the package can be installed in one app, as AGENTS.md describes for `workspace:*` dependencies. With module-level state, `Log.enable` and `Log.subscribe` from one copy would not reach loggers created by the other. A shared object means a later release that changes the state's shape must use a new key.
- **Chosen:** the shared object. The key ends in `/1` so a release with a different shape can use `/2`.

## What a review pass fixes

- **Options:** fix every finding a review reports; fix only findings above a threshold, and stop when a pass reports none; limit passes to polish, or also review the design of each package and of the family.
- **Trade-offs:** a reviewer always finds something. Without a threshold, repeated passes fix inputs no caller sends, and one pass can undo the choice an earlier pass made, so the passes never end. A review limited to polish would leave a weak design in place for as long as the packages are used. They are meant to be used for many years, and an API costs least to change before the first release.
- **Chosen:** a pass fixes, in this order of priority: wrong behavior a caller can hit; an API or package design that makes common use harder, slower or larger than it needs to be, compared with the best library for the job and with the platform API; an API that a coming platform or TypeScript feature, such as `Symbol.asyncDispose` or Temporal, would force to change in a breaking way; a break from a rule in AGENTS.md or a decision in this file; docs, READMEs or JSDoc that disagree with the code; code or prose that can be shorter or simpler without losing a fact, a reason or a test; and two packages that do the same thing in different ways. A redesign or a rewrite is in scope when it fixes one of these. It skips inputs that don't come up in real use, renames and rewrites that only swap one acceptable form for another, and new packages, which are listed for a person to choose from instead. A pass may change an entry in this file when it has a reason the entry didn't weigh, and it rewrites the entry with that reason. It doesn't undo a change an earlier pass made unless the change broke something. Passes stop when one finds nothing to fix.

## PEM import is public in `@portable/web-crypto`

- **Options:** keep the copies in dkim and oauth1; move one to `@portable/web-crypto/internal`; make it a public `WebCrypto.importPem`.
- **Trade-offs:** WebCrypto imports only DER, and RSA only as PKCS #8 or SubjectPublicKeyInfo, while `openssl genrsa` writes PKCS #1. Signing a JWT or a request with a key file needs this code, so it belongs next to `importSeed` and `publicKeyOf`. Both copies matched only `PRIVATE KEY` and `RSA PRIVATE KEY`, and read neither a public key nor a block with text before it. A public function has to set usages and errors for every algorithm, not only for the one a package uses.
- **Chosen:** `WebCrypto.importPem(algorithm, pem, { extractable, usages, signal })`. It takes the algorithm first like `importSeed`, reads the first of the four key blocks, and gives default usages for the signing, RSA-OAEP and key-agreement algorithms. Any other algorithm needs `usages`. A malformed block rejects with `InvalidInputError`, and an SEC 1 EC key, an encrypted key or a certificate rejects with `UnsupportedError`. dkim tries RSA, then Ed25519, instead of reading the PKCS #8 OID. `pkcs1ToSpki` is exported from `./internal` for dkim's DNS keys.

## `Sse.connect` takes `attempts`

- **Options:** keep `reconnectIf` only; add `attempts` with the meaning `WebSockets.connect` gives it.
- **Trade-offs:** without a cap, the only way to stop after a few tries is a counter inside `reconnectIf`. Timers and websockets already take `attempts`, and `attempts: 3` should mean the same thing in all three packages.
- **Chosen:** `attempts`, default `Infinity`, at least 1, counting the first try. An accepted response resets the count, and the end of its body counts as a failure, so `attempts: 1` never reconnects. When the attempts are used up, `reconnectIf` isn't called, and the stream errors with the last error, or closes after a normal end.

## One dispose helper in `@portable/errors/internal`

- **Options:** keep a copy in each of queue, rpc, smtp, timers and websockets; move one to a shared package's `./internal` entry.
- **Trade-offs:** the copies had drifted. smtp's type had another name, and disposing a queue left running tasks' promises pending, while aborting its `signal` rejected them. errors is the only package that queue, rpc, smtp, timers and websockets all depend on already or can depend on without a cycle.
- **Chosen:** `withDispose`, `withAsyncDispose`, `asyncDisposeSymbol`, `DisposeMethod` and `AsyncDisposeMethod` in `@portable/errors/internal`. Disposing a queue, a WebSockets pair or an rpc remote does what aborting the `signal` it was created with does, with an `AbortError`, and settles when the teardown is done, so a queue rejects running tasks at once on disposal. Disposing an `Smtp.Client` calls `close()`, and disposing a debounced function calls `cancel()`. Safari has no `Symbol.asyncDispose`, so there these objects are torn down by aborting the `signal`, or with `close()` for `Smtp.Client` and `cancel()` for a debounced function.

## Instants are converted by `@portable/timers`

- **Options:** a converter copied into each package; one in `@portable/errors/internal`; `Timers.Instant` and a converter in `@portable/timers/internal`.
- **Trade-offs:** ten packages take an instant, and mail had its own `Mail.Instant`. A copy per package lets each one check for `epochMilliseconds` differently, as mail did with `instanceof Date`, which fails for a `Date` from another realm. errors holds error classes, while timers already holds the time types `Delay` and `Backoff`, and its only dependency is errors, so no package gets a dependency cycle.
- **Chosen:** `Timers.Instant` is the public type. `toEpochMilliseconds` and `toDate` in `@portable/timers/internal` read `epochMilliseconds` when it is a number and otherwise call `Date.prototype.getTime`, which works across realms. They throw a `TypeError` for any other value, and a `RangeError` for a time outside the range of `Date`, such as an invalid `Date` or a NaN `epochMilliseconds`. Before that check was shared, webhooks accepted any timestamp when `now` was invalid, because a NaN skew is never larger than the tolerance, and each of the other packages checked or skipped it in its own way. Only mail re-exports the type, because its `date` is a field of `Mail.Message`. A value a package passes to caller code, such as rate-limit's `Store` `now` or a webhooks `Scheme`'s `timestamp`, stays `Date`.

## Package manifests are checked by a test

- **Options:** review each `package.json` by hand; a lint rule over JSON files; a test that reads every package's manifest, test package, changeset and README.
- **Trade-offs:** pnpm links every workspace package into every other, so a source import of a `@portable/*` package missing from `dependencies` passes the type checks and every test, and fails only when someone installs the published package. Pass 1 found exif importing `@portable/streams` without listing it. The field order, the `exports` shape and the README's first lines were also checked only by reading them. oxlint has no rule for `package.json`, and a test can resolve imports with `ts.preProcessFile` and compare them with the manifest.
- **Chosen:** `tools/lint/src/packages.test.ts`. For each package it checks the field order of `packages/mail/package.json`, the published fields, that `exports` has one entry per file in `src/exports/` with the `src`, `types` and `default` paths, that `dependencies` is exactly the `@portable/*` packages the source imports (types included, because the declaration files import them too), each as `workspace:*`, that `test/package.json` is a private `@portable/<name>-test` package, that `.changeset/<name>-initial.md` exists, and that the README starts with the package name and the runtimes sentence, has a "Why use this over" section, and is linked from the root README. smtp's description and README list the runtimes with a TCP socket API instead, because browsers have none.

## Long-lived objects have `Symbol.asyncDispose` where the runtime has it

- **Options:** a `close()` method only; `close()` plus `[Symbol.asyncDispose]` set behind a check for the symbol; wait until every supported runtime has the symbol; a polyfill of the symbol.
- **Trade-offs:** Chrome 134, Firefox 141, Node 24, Deno and Bun have `Symbol.asyncDispose` and `await using`, and Safari 26 doesn't. With the key, `await using client = await Smtp.connect(options)` closes the client when the block exits, even when it throws, which today takes a `try`/`finally` around every use. Adding the key later wouldn't break callers, but until then, you would still need the `finally` in runtimes that have the symbol. A polyfill patches a global, which the runtime baseline forbids. A type that always declares `[Symbol.asyncDispose]` fails to compile in a project whose TypeScript lib doesn't declare the symbol, unless the project sets `skipLibCheck`. A type that reads the key from `SymbolConstructor` resolves to no key in that project, and to the method in a project whose lib declares the symbol. Package code can't use `using` itself, because with `target` ES2022 `tsc` turns it into calls to tslib helpers. `importHelpers` with no tslib installed fails the build, and that failure is the check we want.
- **Chosen:** an object that holds a socket, timer, listener or running task is torn down by `close()` or by aborting the `signal` it was created with. smtp's `signal` only limits connecting, so `Smtp.Client` has `close()`. Where `Symbol.asyncDispose` exists, the object has `[Symbol.asyncDispose]()` with the same teardown, and a sync teardown such as a debounced function's `cancel` uses `Symbol.dispose`. The key's type is read from `SymbolConstructor`, so it appears only when the caller's lib declares the symbol. `DisposableStack`, `AsyncDisposableStack` and `SuppressedError` are restricted globals in package code until Safari has them. The helper that sets the key is in `@portable/errors/internal` (see "One dispose helper in `@portable/errors/internal`").

## Instants accept Temporal, and results stay `Date`

- **Options:** `Date` only; `Date | Temporal.Instant`; `Date | { readonly epochMilliseconds: number }`; results as `Temporal.Instant`.
- **Trade-offs:** Chrome 144, Firefox 139, Node 26 and Deno have Temporal, and Safari doesn't. With `Date` only, if you use Temporal, you have to wrap every `now` or `expiresAt` in `new Date(instant.epochMilliseconds)`. Naming `Temporal.Instant` in a type needs TypeScript's `esnext.temporal` lib, and a project without that lib gets a type error in our declaration files. An object type with `epochMilliseconds` needs no lib, and both `Temporal.Instant` and `Temporal.ZonedDateTime` match it, while a `Date` doesn't have the property, so a package can tell the two apart without `instanceof`, which fails for a `Date` from another realm. Widening an option's type later doesn't break callers, but changing a result from `Date` to `Temporal.Instant` does, and a result has to work in Safari, so results stay `Date`. If a package later returns Temporal values, it will add a field or a function next to the `Date` one.
- **Chosen:** instants in options have the type `Date | { readonly epochMilliseconds: number }`, converted to milliseconds by one shared helper (see "Instants are converted by `@portable/timers`"). Instants in results stay `Date`. `Exif.parseDate` returns a `Date` for a value with no time zone and reads it as UTC. A `Temporal.PlainDateTime` would describe that value exactly, so a Temporal variant would be a new function, not a change to `parseDate`.

## `WebCrypto.Hash` stays the four SHA-1 and SHA-2 names

- **Options:** add SHA-3 and other new hashes to `Hash`; give them a separate type.
- **Trade-offs:** `Hash` is the parameter type of `Digest` and `Hmac`, which callers implement, often with a `Record<Hash, …>` of noble functions. Widening it would break those implementations, while widening the parameter of `WebCrypto.digest`, `hmac` and `hkdf` breaks no one.
- **Chosen:** a separate type for new hashes, accepted by `digest`, `hmac` and `hkdf` once engines ship them. The `Hash` JSDoc says so.

## `Png.decode` takes `maxPixels`

- **Options:** no limit; `maxPixels` with no limit by default; a finite default such as sharp's 268,402,689 pixels.
- **Trade-offs:** `rawSize` already rejects a header that claims more pixels than deflate's 1032:1 ratio allows, but a valid 1.2 MB file of a 1-bit 100000×100000 image still decodes to 40 GB of RGBA. A finite default would protect you without any setup, but it would reject some valid large images, the same trade-off as "Decoders that buffer input take a size limit, with no limit by default".
- **Chosen:** `maxPixels`, defaulting to `Infinity`, checked against `width * height` when `IHDR` is read, before anything is decompressed or allocated. A larger image throws `Png.MaxPixelsError`, which is named after the option and stores `maxPixels`.

## `Csv.decode` types rows by the header names

- **Options:** keep `Record<string, string>` for every header; type rows by an array `header` with `Record<name, string>`; also make the keys optional when `relaxColumnCount` is set; split `decode` into one function for arrays and one for objects, as AGENTS.md asks when an option changes the result type.
- **Trade-offs:** with `Record<string, string>`, a misspelled column such as `row.emial` type-checks and reads `undefined`. Narrowing the type after the first release would break code that indexes a row with a plain `string`, so the choice has to be made now. With `relaxColumnCount`, a short row leaves the missing keys out, so `Record<name, string>` would claim keys that aren't there. `header` already changed the row type before this, through a `const` generic, and `Csv.decode(text, { header: true })` is the form papaparse and csv-parse users know. The AGENTS.md rule is there to prevent overloads keyed on an option's value. A generic inferred from the option has one signature, and its result type follows from the value the caller wrote.
- **Chosen:** keep one `decode` and one `DecoderStream`, as an exception to the two-functions rule. When the call passes `header` as an array literal, the row type is `Record<name, string>`, and `relaxColumnCount: true` makes it `Partial`. The row type stays `Record<string, string>`, or its `Partial`, when `header` is `true` or a `string[]` variable, or when `relaxColumnCount` is typed as a plain `boolean`.

## Byte inputs stay `Uint8Array` only

- **Options:** keep `Uint8Array` as the only byte input, and throw a `TypeError` for anything else; accept any `ArrayBuffer`, `SharedArrayBuffer` or view, as `TextDecoder` does.
- **Trade-offs:** if packages accepted any buffer or view, a caller could pass the `ArrayBuffer` from `crypto.subtle` without wrapping it in a `Uint8Array`. Most byte input comes from `response.bytes()` or `blob.bytes()`, which already return a `Uint8Array`. Given a buffer or a view, a package can't tell which of its bytes the caller meant. If a caller passes `view.buffer`, the package reads the whole buffer and not only the bytes in the view, and if a caller passes an `Int16Array` of audio samples, the package reads two bytes per sample in the platform's byte order. Neither mistake throws an error, so the caller gets a wrong result without any sign of it. When the caller writes the conversion, such as `new Uint8Array(view.buffer, view.byteOffset, view.byteLength)`, anyone reading the caller's code can see which bytes the package reads. Every package would also have to convert its input. `@noble/hashes` and ox also take only `Uint8Array`.
- **Shared memory:** `assertUint8Array` rejects a bare `SharedArrayBuffer` as it rejects an `ArrayBuffer`, but accepts a `Uint8Array` over one. TypeScript types a plain `Uint8Array` as `Uint8Array<ArrayBufferLike>`, so a parameter that excluded shared memory would have to be typed `Uint8Array<ArrayBuffer>`, and a caller's variable typed `Uint8Array` would then fail to type-check. Another thread can change shared bytes while an async function or a stream reads them, so if you pass shared memory, you must not write to it until the function returns, its promise settles, or the stream has read the chunk. `crypto.subtle`, `Blob`, `fetch`, `CompressionStream` and `WebSocket.send` throw for shared memory, so packages pass bytes to them through `toBufferSource`, which copies a view of a `SharedArrayBuffer`.
- **Chosen:** `Uint8Array` only. `assertUint8Array` in `@portable/bytes/internal` throws a `TypeError` for any other value, so a JavaScript caller gets an error instead of a wrong result. Packages test for bytes with `isUint8Array` instead of `instanceof Uint8Array`, because `instanceof` returns false for a `Uint8Array` from another realm. A package can start accepting more types later without breaking callers, but if it stops accepting a type after a release, callers that pass that type break. A `Uint8Array` can still start partway into a larger buffer, so each package's `test/inputs.conformance.ts` passes one and checks that every function reads only the bytes in its range.

## Multi-member gzip decoding searches for each member's end

- **Options:** try each `1f 8b 08` position in turn as the end of the current member; parse the deflate blocks to find where a member ends; binary search the positions, using whether `DecompressionStream` throws `TruncatedError` or `InvalidInputError` for a prefix of the input.
- **Trade-offs:** trying each position decodes the member once per position. A member whose stored blocks repeat `1f 8b 08` made a 240 KB input take 53 s in Node. Finding the end by parsing deflate means writing a Huffman decoder beside the platform one. In Node, Bun, Deno and all three browsers, decoding a prefix that ends inside the member fails with `TruncatedError`, and decoding one that runs past the member's end fails with `InvalidInputError`. Every position before the end gives the first error and every position after it gives the second, so `decode` can binary search the positions.
- **Chosen:** `Compress.decode` tries the 1st, 2nd, 4th and 8th position, doubling the index each time until a prefix runs past the member's end, then binary searches between the last two positions it tried. A valid file still needs one decode per member, and the crafted input above takes less than half a second. If a runtime reported the two errors the other way round, the search would miss the end and `decode` would throw, never return wrong output.

## Transitive dev dependencies with advisories are overridden

- **Options:** wait for miniflare, zile, mailauth and smtp-server to release with newer dependencies; add `overrides` in `pnpm-workspace.yaml`.
- **Trade-offs:** those packages pin exact versions of undici, sharp, tinypool and nodemailer that have advisories, and they release on their own schedule. Only tests and tooling use them, but `pnpm audit` reported 30 advisories, and a new advisory would be easy to miss among them. An override can break the package that pinned the version, so the tests, the workerd checks and the build have to pass after each one.
- **Chosen:** override each to its next patched release in the same major. Remove an override once the package that pinned the version depends on a patched one. The `ip` and `private-ip` advisories remain, because neither package has a fixed release. Neither can be dropped: ip's oracle tests compare against `ip` on purpose, and `private-ip` is a dependency of tangerine, which dns's tests use.

## Public API conventions are checked by a test, not a lint rule

- **Options:** lint rules for `@example` JSDoc, `is`/`has`/`can` names and positional booleans on every exported function; the same rules with a disable comment on each internal helper; a test that reads each package's entry points with the TypeScript checker.
- **Trade-offs:** a lint rule sees one file, so it can't tell a public export from a helper that one module exports to another. The lint version reported 45 positional booleans, almost all in internal helpers such as image-size's `u16(input, offset, bigEndian)`, where an options object would add an allocation to every read. The test resolves `export *` and aliases and skips `./internal`, but it runs a TypeScript program over every package, which takes a few seconds.
- **Chosen:** `tools/lint/src/publicApi.test.ts`. It allows the standard boolean names `contains`, `equal`, `is`, `needsRehash`, `timingSafeEqual` and `verify`. Internal helpers such as `canFitDns`, `isInNetwork` and `hasMacro` were renamed anyway. The other conventions that hold in every file (`?: T | undefined`, `.js` imports, error `kind`, no enums, no `Symbol()`) are lint rules in `tools/lint/src/plugin.ts`.

## `prefer-satisfies` allows annotations that widen on purpose

- **Options:** report every `const name: Type = value` and use `let` or a function with a return type where the inferred type is wrong; report every one and add a disable comment where the annotation is needed; skip the cases where the annotation widens the type on purpose.
- **Trade-offs:** rewriting all 834 annotations left 79 type errors. Most came from a lookup table indexed with a string, an object whose properties are written later, a `JSON.parse` result typed `unknown`, an object whose methods refer to the object itself, and exported constants, whose annotation is the public type. A `let` for a constant that never changes, or a disable comment at each site, is noisier than the annotation. The rule sees only syntax, so it can't tell that an alias such as `Script` has an index signature. In that case the annotation spells out `Record<string, Handler>`.
- **Chosen:** the rule skips `unknown`, `unique symbol`, `Record` and index-signature types (also inside `Partial` or `Readonly`), objects that the code writes a property of or that refer to themselves, exported constants, an initializer that is a plain identifier or member access, and an empty collection such as `[]` or `new Map()`. `[] satisfies Uint8Array[]` infers `never[]`, and `new Array<Uint8Array>()`, which the rule first required, read worse than the annotation.

## Workers runs a smoke check in CI, not the conformance tests

- **Options:** `@cloudflare/vitest-pool-workers` pinned to Vitest 4 in its own package; bundle each conformance file with Vitest's runner and run it in workerd; bundle every package into one Worker and run one hand-written check per package.
- **Trade-offs:** the Vitest 4 pool means two Vitest versions in one repo. Bundling Vitest's runner and `expect` for workerd needs a new harness, because `tools/worker` imports test files from the Vite server and can't run in workerd. One Worker with a check per package is about 400 lines, runs in seconds and catches failures that happen only in workerd. Its first run found that queue and timers created an `AbortController` at the top level of a module, which workerd refuses, so neither of them could load on Workers, and neither could sse or websockets, which depend on timers. It also found that websockets passed `highWaterMark: Infinity`, which workerd rejects although the Streams spec allows it. The checks cover one call per package, so a behavior difference outside those calls still goes untested.
- **Chosen:** `pnpm test:workers` and a blocking `test-workers` CI job. Replace it with a Workers test project once the Vitest pool supports Vitest 5.

## Streams gets `toBlob` but no `toResponse`

- **Options:** add both; add `toBlob` only; add neither.
- **Trade-offs:** `new Response(stream).blob()` reads only a `ReadableStream`, takes no limit or signal, and ran 1.7× slower than collecting the chunks into `new Blob(chunks)`. A `toResponse(source, init)` would only wrap `new Response(Streams.fromIterable(source), init)`, which adds an export without adding a behavior.
- **Chosen:** `Streams.toBlob(source, { maxBytes, type, signal })`, with the same chunk rules as `toBytes`. To get a `Response`, pass `fromIterable(source)` to `new Response`.

## Bun and Deno run the conformance tests in CI without blocking

- **Options:** a Workers job through Miniflare; run Vitest itself on Bun and Deno; wait for `@cloudflare/vitest-pool-workers` to support Vitest 5.
- **Trade-offs:** Running Vitest itself on Bun or Deno runs every test file there with no new harness, and `pnpm test:bun` and `pnpm test:deno` run the same command locally. A Workers job needs a bundle of each test file and a runner inside workerd, which the Web Worker harness doesn't provide, because it imports test files from the Vite server. The first runs failed 2 tests on Bun and 19 on Deno, all caused by the runtimes' `DecompressionStream` and Deno's `BroadcastChannel` (see docs/papercuts.md). Blocking on them would keep CI red until Bun and Deno fix them, and changing the tests to expect each runtime's behavior would hide the differences.
- **Chosen:** a `test-runtime` job for Bun and Deno with `continue-on-error`, so its failures show in the run without failing it. Make it blocking once the papercuts are fixed or worked around. Workers got its own job, described in the entry above.
- **Update:** compress and png now work around the `DecompressionStream` bugs, and the rpc test keeps a `BroadcastChannel` open, so every conformance test passes on Bun and Deno. The `test-runtime` job no longer has `continue-on-error`, so a failure there fails the run. The workarounds are in compress and png and not in the tests, so the packages return the same output and throw the same errors on Bun and Deno as on Node. compress runs each check only where a probe shows the runtime needs it, and png decodes again only after a write fails, so Node and browsers don't do the extra decoding.

## AGENTS.md states the parameter, naming and `fetch` rules

- **Options:** fix each signature that broke the conventions and leave the rules as they were; write each fix down as a rule in AGENTS.md.
- **Trade-offs:** AGENTS.md said "one optional options object last", but not how many required positionals may come first or in what order, so `WebPush.send(subscription, payload | undefined, options)` and `Random.string(length, alphabet?)` met the rule as written. Without a written rule, the next package would have the same exceptions. A rule can forbid a signature that suits one package better, but every package is still at 0.0.0, so the breaking fixes cost nothing now.
- **Chosen:** the rules are in AGENTS.md, under API conventions. Parameters follow ox: copy a platform signature where one exists, make the converted value positional with options after it, and put inputs with distinct roles in one object. A namespace is the package name capitalized and never shadows a global. A package's main factory is `create`. A boolean function starts with `is`, `has` or `can` unless a standard name exists, so `Ip.validate` became `Ip.canParse`, named after `URL.canParse`. dns and rdap called `fetch` with `(url, init)` and rpc took `typeof fetch`, so no single wrapper worked with all three. A `fetch` option now takes one `Request`, as sse and web-push already did. The rules for the clock, units, crypto, encoder streams and result types each have their own entry above.

## Decoders that buffer input take a size limit, with no limit by default

- **Options:** no limit; a limit that is off by default; a finite default such as 1 MiB.
- **Trade-offs:** `Jsonl.DecoderStream`, `JsonStream.DecoderStream` and `MimeHeaders.parseHeaders` buffered input until a line, value or header block ended, so untrusted input without a line break made the buffer grow without limit. `Lines`, `Csv` and `Compress` already took `maxLength` or `maxBytes` with `Infinity` as the default. A finite default gives protection without any setup, but any number we choose rejects some valid large record, and the three older packages would have needed the same breaking change.
- **Chosen:** `maxLength` on all three, defaulting to `Infinity` like the older decoders, each with its own `MaxLengthError`. `ImageSize.parseStream` and `Exif.parseStream` keep their finite `maxBytes` defaults, because `ImageSize.parseStream` reads only the start of a file and stops, and `Exif.parseStream` skips the image data instead of holding it. `MimeStream.DecoderStream` and `MimeStream.splitHeaders` dropped mailsplit's finite defaults (1 MiB of headers, 1,000 parts) for `Infinity`, so if you read untrusted mail, you need to set `maxHeaderBytes`, `maxBoundaryLineBytes` and `maxParts`.

## Every function that reads the clock takes `now`

- **Options:** keep the per-package names (`signedAt` in dkim and arc, `timestamp` in oauth1 and webhooks, no option in rate-limit, spf and web-push); name the option after what it sets; call it `now` everywhere.
- **Trade-offs:** `signedAt` says what the time is used for, but a test that fixes the clock had to know a different name in each package, and rate-limit, spf and web-push read `Date.now()` with no way to pass a time. The verifiers already called the option `now`.
- **Chosen:** `now` on every function that reads the clock (it later also accepted a Temporal instant, as "Instants accept Temporal, and results stay `Date`" above describes): `Dkim.sign`, `Arc.seal`, `OAuth1.sign`, `Webhooks.sign`, `Spf.check`, `WebPush.send` and `toRequest`, `RateLimit` `take` and `headers`. Instants are `Date` in options and results, so `RateLimit.Result.resetAt` is a `Date`. Durations are milliseconds unless the wire format sets the unit, so `Webhooks.verify`'s `tolerance` is now `300_000`, while `WebPush`'s `ttl` stays in seconds. The rdap lookups also take `now`, which they compare with the time the bootstrap files were cached.
- **`Timers.poll` lost its `timeout`.** `AbortSignal.timeout` already limits the whole call, and AGENTS.md allows a `timeout` option only when it limits one step of many, such as one retry attempt. `retry`, dns and websockets keep their per-attempt `timeout`.

## `attempts` counts the first try everywhere

- **Options:** `retries` everywhere; `attempts` everywhere; keep both.
- **Trade-offs:** `Timers.retry` took `attempts`, which includes the first try, and `WebSockets.connect` took `retries`, which doesn't, so `retries: 3` allowed four connections where `attempts: 3` allowed three. `retries` matches reconnecting-websocket's `maxRetries`, but most callers read "3" as three tries. `attempts: 3` gives three tries, while `retries: 3` gives four.
- **Chosen:** `attempts`, at least 1. The websocket package is also renamed to `@portable/websockets`, because its namespace is `WebSockets` (so the global `WebSocket` isn't shadowed) and it was the only namespace that differed from its package name.

## `@portable/web-crypto` defines the pluggable crypto types

- **Options:** keep a crypto function type in each package; define them in `@portable/web-crypto` and re-export them; define them in `@portable/errors` or another package every package already depends on.
- **Trade-offs:** webhooks took `hmac(key, data)`, oauth1 took `digest(algorithm, data)`, and dkim, arc and mail-auth took `hash: () => { update, digest }`. `Crypto.Hash` was an algorithm name and `Dkim.Hash` a hasher object. Defining the types in web-crypto adds a dependency to three packages, but `WebCrypto.digest` and `WebCrypto.hmac` already have those types.
- **Chosen:** `WebCrypto.Digest`, `WebCrypto.Hmac` and `WebCrypto.Hasher`, with the algorithm first in both functions. Each package re-exports the one it takes, under an option with the same name. The package is renamed from `crypto` to `web-crypto` because `import * as Crypto` shadows the global `Crypto` class in browsers, Node, Deno and Bun.

## Verdict types keep their top-level names

- **Options:** rename every result type to `fn.ReturnType`; rename only results that live in a function's namespace; keep all names.
- **Trade-offs:** `Spf.Result`, `Dkim.Result`, `Dmarc.Result`, `Arc.Result` and `MailAuth.Result` are values a caller stores and passes on: `Dmarc.check` takes an SPF and DKIM result, and `MailAuth.Result` holds all four. `Smtp.Result` and `RateLimit.Result` are also returned by methods of a long-lived object, and a method has no namespace to hold a `ReturnType`. `Dkim.verify.ReturnType` would be an array, so a caller would write `Dkim.verify.ReturnType[number]` for one signature.
- **Chosen:** `WebPush.send.Result` and `Webhooks.verify.Result` became `ReturnType`, and the verdict types kept their names, as domain types like `MimeHeaders.Address` do. AGENTS.md says when each applies.

## Encoder streams emit bytes

- **Options:** every `EncoderStream` and `*Stream()` function emits `Uint8Array`; they all emit `string`; each package picks.
- **Trade-offs:** Base64, QuotedPrintable, Csv and Jsonl emitted strings, and Charset, MimeStream, Sse and Mail emitted bytes. A `Response` body or a socket's writable needs bytes, so code that used the string encoders had to add a `TextEncoderStream`, and `@portable/mail` and `@portable/rpc` had code to handle both kinds of chunk. The platform's `TextEncoderStream` and `CompressionStream` emit bytes.
- **Chosen:** bytes everywhere. The one-shot `encode` functions still return a string. Callers write the output to a body more often than they read it as text, so if you want base64 text, you pipe the output through `TextDecoderStream`.

## One `@portable/errors` package, branded with `Symbol.for`

- **Options:** keep an `errors.ts` in each package; share the classes through an internal package; publish `@portable/errors`. For checks: `instanceof`; comparing `name` strings; a brand under a `Symbol.for` key.
- **Trade-offs:** 26 packages defined about 55 classes, and classes with the same name had different constructors: `TruncatedError` took `(message?, options?)` in base64, `(options?)` in compress and nothing in exif, and `ResponseError` had three unrelated shapes. Piping `Streams.limitBytes` into `Compress.DecoderStream` and then `Exif.parseStream` meant three checks for one condition. zile doesn't bundle, so an internal package would still be published and installed, and a public one lets callers check a kind from any package. `instanceof` fails when two copies of a package are installed. Duplicates are more likely with our packages because `workspace:*` publishes exact versions, which npm can't dedupe. Comparing `name` matches any library that happens to use the same string.
- **Chosen:** a public `@portable/errors`. Each error stores the kinds of its class chain under `Symbol.for('portable.error')`, `Errors.is(error, 'MaxBytes')` reads it, and the classes' `Symbol.hasInstance` reads it too, so `instanceof Errors.MaxBytesError` matches every package's error and `instanceof Compress.MaxBytesError` matches only compress's, from any copy. The symbol key and the kind strings are a protocol that later versions must keep. An error with only a message takes `(message?, options?)`, as `Error` does, and one with other fields takes one object.

## The worker harness runs a stalled file again in WebKit

- **Options:** drop WebKit from the worker suite; stop calling `releaseLock()` in `@portable/streams`; run a file again in a new worker when its WebKit worker stops responding; leave the suite as it is.
- **Trade-offs:** The hang is a deadlock inside WebKit's `releaseLock()` (see papercuts.md), so no change to our packages fixes it. The stream collectors in `@portable/streams` release the lock because callers and tests expect `stream.locked` to be `false` after a collector finishes, so removing the call would change behavior in every runtime to avoid a WebKit bug. Dropping WebKit would lose the only check that the packages work in a WebKit worker. Without a change, about one WebKit run in three hung. A second attempt costs 60 s and passes unless the deadlock happens twice in the same file. A package bug that loops forever still fails, because the second attempt stalls too, and the retry applies only in WebKit, so Chromium and Firefox fail at the first stall.
- **Chosen:** run the file once more in WebKit, print the stall with `console.warn`, and fail the file if the second attempt stalls too. WebKit runs with `JSC_useConcurrentJIT=false` and `JSC_numberOfGCMarkers=1`, so a deadlocked worker doesn't block threads that the page and the next workers need. Remove the retry and the options when WebKit fixes `releaseLock()`.

## CI tests Node 24 and 26, not 22

- **Options:** keep `engines` at `>=24` and test 24; lower it to `>=22` and test 22, 24 and 26; keep `>=24` and test 24 and 26.
- **Trade-offs:** On Node 22.23, 15 Node tests fail. Five compress tests fail because callers would see different behavior: Node 22's `DecompressionStream` ignores bytes after the end of the stream, so `Compress.decode` accepts trailing data and a second gzip member. The other ten fail because Node 22 differs from the specs or from Node 24. Its `TextDecoder` and `domainToASCII` disagree with the WHATWG specs, it calls a WebCrypto error `InvalidAccessException`, and its streams pass a cancellation to the source one tick later than Node 24 does. Node 22 reaches end of life in April 2027. Node 26.12 passes every test. It is the only Node version with native `Uint8Array.toBase64` and `fromHex`, so it runs the tests that compare the base64 and hex fallbacks with the native API, which Node 24 skips.
- **Chosen:** keep `>=24` and test 24 and 26, because supporting Node 22 would need our own check for trailing data in compress, and Node 26 runs the native base64 and hex comparisons. CI runs only on pushes to `main` and on `workflow_dispatch`.

## The prose review is a repo skill, not an edit to `interrogate`

- **Options:** add a prose pass to the vendored `interrogate` skill; add a repo-owned `prose-review` skill and have AGENTS.md call for it.
- **Trade-offs:** `.agents/pstack/README.md` says not to edit the vendored copies, so the next upstream update would overwrite a change to `interrogate`. `interrogate` also sends reviewers the whole diff, and the prose reviewer should read only the prose.
- **Chosen:** `.agents/skills/prose-review/SKILL.md`, linked from `.claude/skills/prose-review`. It is the only skill in `.agents/skills/` that isn't a symlink into `.agents/pstack/`. AGENTS.md says to run it before finishing a change that adds or edits prose, and to run it as well as `interrogate` when that skill runs.

## `@example` on values, not types

- **Options:** an `@example` on every export; on functions, classes and constants only.
- **Trade-offs:** AGENTS.md required an `@example` on every public export, but about 100 exported types had JSDoc without one, and an example for `Mailbox` would repeat the `parseAddresses` example. Error classes are values a caller uses in `instanceof`, so their example shows the call that throws them.
- **Chosen:** functions, classes (error classes included) and constants have an `@example`; types have JSDoc without one.

## Bad arguments throw `TypeError` or `RangeError`, bad data throws `InvalidInputError`

- **Options:** `InvalidInputError` for everything, including options; built-in errors for everything the caller passes; built-in errors for arguments and options, and `InvalidInputError` for the data being processed.
- **Trade-offs:** Most packages already threw `TypeError` and `RangeError` for options, and the platform does the same. A single `InvalidInputError` for both would mean that catching malformed messages also catches your own configuration mistakes. The packages disagreed at the edges: dkim threw `TypeError` for a PEM key that doesn't parse and oauth1 threw `InvalidInputError`; base64, csv, smtp, web-push and webhooks threw `TypeError` for an unknown or malformed option value while dkim, arc and mime-headers threw `RangeError`.
- **Chosen:** the third. `TypeError` for a wrong type or a missing value, `RangeError` for a right type with a value the function doesn't accept (including keys and secrets that don't parse), and `InvalidInputError` for malformed data. AGENTS.md states the rule. oauth1 no longer exports `InvalidInputError`, since its only use was a key that doesn't parse. jsonl and json-stream keep `JSON.stringify`'s `TypeError` for values it can't serialize.

## `maxBytes` counts bytes and `maxLength` counts string length

- **Options:** keep each package's name; name every limit `maxLength`; name it by unit.
- **Trade-offs:** `Compress.decode` took `maxLength` for a limit in bytes, while lines, csv and sse use `maxLength` for UTF-16 code units and streams, exif, image-size and password use `maxBytes` for bytes. If you know `Streams.toBytes(stream, { maxBytes })`, you would guess wrong in compress.
- **Chosen:** name it by unit. compress's option is now `maxBytes` and its error `Compress.MaxBytesError`, and AGENTS.md states the rule.

## Stream transforms use `Streams.abortable`, and promise helpers stay private

- **Options:** keep a private copy of the 30-line transformer helper in each package; move it to a new shared or internal package; export it from streams.
- **Trade-offs:** Nine packages had identical copies, and sse wrote the same logic out by hand. A separate shared package would add a package whose only job is one helper. Exporting it from streams makes it public API, and base64, charset, csv, json-stream, jsonl, lines, mime-stream, quoted-printable and sse now depend on streams, but streams is `sideEffects: false`, so their bundles take only `abortable`. If you write your own transforms, you can use it too. The promise helpers that race work against a signal (in dkim, dmarc, spf, timers, password, oauth1 and webhooks) only stop the caller from waiting, while the DNS query or the PBKDF2 keeps running, so a public "abortable promise" would claim more than it does.
- **Chosen:** export `Streams.abortable(transformer, { signal })`, and keep the promise helper out of the public API. The seven private copies were replaced by one `abortable(work, signal)` in `@portable/timers/internal`, because timers already holds the helpers that wait, such as `sleep` and `poll`. bytes was the other candidate, but it has no code that handles a signal. dmarc and password depend on timers for it.

## arc reuses dkim through `@portable/dkim/internal`

- **Options:** copy dkim's tag parser, canonicalization, key lookup and signing into arc; export them from dkim's main entry; add an `./internal` subpath export to dkim.
- **Trade-offs:** A copy would drift from dkim, and the AMS is a DKIM signature with a different tag set, so we would have to make every fix twice. Exporting the helpers from the main entry would make them public API. Anyone can import a subpath, but its doc comment says it is not public and can change in any release.
- **Chosen:** `@portable/dkim/internal`. arc depends on `@portable/dkim` with `workspace:*`, which pnpm publishes as the exact version, so a change to the internal modules is released together with arc. arc also has an `./internal` subpath, so that `MailAuth.authenticate` can split the message once and compute the body hashes for DKIM, the ARC-Message-Signature and the new seal in one pass. `Dkim.verify` and `Arc.verify` each split into a `planVerify` that returns the body hashes it needs and a `finish` step, and `Arc.seal` into `createSealer`. Before this, `authenticate` buffered the message and canonicalized and hashed the body three times. With one pass it takes less than half the time on a 250 KB message, reads a stream without buffering it, and rejects invalid seal options before it reads the message.
- **Reviewed:** the consistency pass kept the subpath, because the alternatives are a copy that drifts or a public API nobody else needs. AGENTS.md now says when a package may add an `./internal` subpath and that only `@portable/*` packages import it.

## arc has only RFC 8617 behavior

- **Options:** mailauth's lenient default with a `strict` option; strict only.
- **Trade-offs:** The lenient mode accepts what the ARC drafts allowed (an AMS without `c=` signed relaxed, ARC-Seal syntax errors, `i=0x1`), and RFC 8617 validators fail those chains anyway, so if you forward mail and trust a lenient pass, you seal a chain that the next hop fails. A strict-only validator may fail chains from old draft-era sealers.
- **Chosen:** strict only, with no option. Two cases of ValiMail's draft suite (`ams_fields_h_empty`, `ams_fields_c_na`) expect `fail`, which mailauth's strict mode also returns.

## `Arc.seal` options

- **Options:** mailauth's `cv` (any case), `i`, `algorithm` and `bodyHash`; fewer options derived from the message and the key.
- **Trade-offs:** An explicit instance or algorithm can only produce a set that is wrong or that fails, such as a gap in the chain or `a=rsa-sha256` with an Ed25519 key. Sealing from a precomputed body hash saves reading the body twice, but `MailAuth.authenticate` already reads the message once for both.
- **Chosen:** `chainValidation` takes the lower-case values `verify` returns and is required once the message has ARC fields; `seal` takes the instance from the message and `a=` from the key. The AMS always uses relaxed/relaxed, the only canonicalization RFC 8617 sealers use in practice. Options that would produce a broken set throw instead of returning warnings.

## dkim keeps its own header splitter

- **Options:** switch dkim's `splitMessage` to `MimeStream.splitHeaders`; keep dkim's.
- **Trade-offs:** `splitHeaders` doesn't turn bare LF into CRLF, and dkim and arc read bare-LF messages as CRLF, as mailauth does. Switching would need a normalizing pass in front of it.
- **Chosen:** keep dkim's splitter.

## mailauth leaves out BIMI, Received-SPF and trustReceived

- **Options:** port all of mailauth's `authenticate`; port the SPF, DKIM, DMARC and ARC checks with Authentication-Results and sealing only.
- **Trade-offs:** BIMI needs SVG Tiny PS validation and VMC certificate chains, each bigger than the rest of the package. Received-SPF repeats the `spf=` result that Authentication-Results already contains (RFC 8601 replaces it for new code). `trustReceived` takes the client address from a Received field, which any earlier hop can write, and an SMTP server always knows the real address.
- **Chosen:** leave all three out. If you need BIMI, you can call a BIMI library with `result.dmarc`.

## `authenticate` reports a refused seal in `sealSkipReason`

- **Options:** let `Arc.InvalidInputError` reject `authenticate`; return the results without a seal and the reason in a field.
- **Trade-offs:** AGENTS.md says errors are thrown, never returned. But RFC 8617 section 5.1 says to deliver a message unsealed if its newest ARC-Seal says `cv=fail` or if the message has 50 sets or no From field, and a rejection would throw away the SPF, DKIM, DMARC and ARC results that are still needed to deliver it.
- **Chosen:** `sealSkipReason`, next to `dmarcSkipReason`, which reports a DMARC check that `authenticate` skipped in the same way. Invalid seal options still throw.

## `authservId` must be a token

- **Options:** quote a value that isn't a token, as mailauth's default mode does; throw, as its strict mode does.
- **Trade-offs:** RFC 8601 allows a quoted authserv-id, but readers that split the field on `;` read `"mx.example; dkim=pass"` as a result. An authserv-id is configuration, so a bad one is a bug to fix once.
- **Chosen:** throw a `RangeError`. The option is required, because runtimes other than Node have no `os.hostname()`.

## Fuzzing with fast-check, not a coverage-guided fuzzer

- **Options:** fast-check property tests; a coverage-guided fuzzer such as Jazzer.js; keep each package's hand-rolled seeded loops.
- **Trade-offs:** Jazzer.js instruments code and finds deep paths through a parser faster, but it runs only in Node, needs a native module and its own runner, and its targets would run outside Vitest. fast-check runs in Vitest in Node and in browsers, shrinks a failure to a small input, and prints a seed that replays it. The seeded loops had neither shrinking nor replay, and each package wrote its own.
- **Chosen:** fast-check, through `fuzz()` in a private workspace package, `@portable/fuzz` in `tools/fuzz`, so `tools/fuzz` holds the run count and replay settings in one place. Mutated real fixtures make up for the missing coverage feedback, because they reach the code past the header checks that random bytes rarely pass. fast-check is a dev dependency of each test package, so no published package depends on it.
- **Run counts:** 100 runs per property in `pnpm test` and the git hooks, and 10,000 in `pnpm fuzz`, which loads `.env.fuzz`. `FUZZ_RUNS` overrides both.

## A time limit on each fuzz run

- **Options:** no limit, as before; fast-check's `timeout` parameter alone; a limit in `fuzz()` that also times sync runs.
- **Trade-offs:** Without a limit, a parser with a quadratic slowdown passes slowly and a stream that never closes waits for Vitest's test timeout, which `pnpm fuzz` raises to an hour. fast-check's `timeout` covers only async properties, and most properties are sync. Timing a sync run can't stop an infinite loop, but it catches a run that finishes slowly. Any timing check can fail on a loaded machine, so the 2-second limit is more than 20 times the slowest run in the Node suite, which takes under 100 ms.
- **Chosen:** `fuzz()` passes `timeout` to fast-check for async properties and times every run itself, failing one that takes longer than 2 seconds. A property can pass its own `timeout`.

## `Spf.check` rejects with `signal.reason`

- **Options:** keep returning a `temperror` result when `signal` aborts; reject with `signal.reason`, as the `signal` rule in AGENTS.md says; return `temperror` only when the reason is a `TimeoutError` and reject otherwise.
- **Trade-offs:** Returning `temperror` on abort matches RFC 7208's time limit (section 4.6.4), but if you abort because your client went away, you get a result you have to throw away, and spf would stay the only package that doesn't reject. Branching on the reason's type makes `AbortSignal.timeout` and `AbortSignal.any([timeout, request.signal])` behave differently in ways a caller can't see from the types.
- **Chosen:** reject with `signal.reason`. To get the RFC behavior, catch the `TimeoutError` and report `temperror`, as the README says. `check` also passes the signal to each resolver call as `{ signal }`, and `Dns.Resolver`'s methods now declare that optional argument, so `Dns.create()` cancels its in-flight `fetch` calls. `node:dns/promises` ignores the argument.

## `Streams.fromIterable` and `toAsyncIterable` take no signal

- **Options:** give every function in `@portable/streams` a `signal`; give it only to the collectors, the combinators and the transforms used with `pipeThrough`.
- **Trade-offs:** `fromIterable` and `toAsyncIterable` return a stream or iterator that does nothing until it is read, and cancelling it (or leaving the `for await` loop) already cancels the source. `concat` and `merge` took their sources as rest parameters, which left no place for an options object. They now take an array, so an options object with `signal` can follow it, as in every other function that holds readers. The change breaks no one, because nothing is released yet.
- **Chosen:** `toBytes`, `toBlob`, `toText`, `toJson`, `toArray`, `concat`, `merge`, `map`, `filter`, `tap`, `batch`, `limitBytes`, `transform` and `tee` take `signal`. `fromIterable` and `toAsyncIterable` don't, and the README says how to cancel them.

## `@portable/charset`'s root exports

- **Options:** keep `encode`, `EncoderStream`, `utf8`, `load`, `normalizeLabel`, `isSupported`, `UnsupportedError` and the types `Charset` and `CharsetName`; drop `isSupported`; also rename the `Charset` type.
- **Trade-offs:** `isSupported` matched iconv-lite's `encodingExists`, but it was `normalizeLabel` plus one comparison, and `normalizeLabel` returned `'replacement'`, which has no encoder in this package, so callers needed both. `CharsetName` repeats the package name as `Charset.CharsetName`. `Charset.Charset` repeats it too, but it is the type of the package's main value, as `Hex.Hex` is in ox, and every other name for it (`Table`, `Codec`) says less.
- **Chosen:** `isSupported` is gone and `normalizeLabel` returns `undefined` for replacement labels, so it returns a name exactly for the labels the package can encode. `CharsetName` is `Name` and no longer includes `'replacement'`. `Charset.Charset` stays.

## Webhooks schemes are objects of functions

The redesign was needed because a branch per vendor inside `verify` and `sign` couldn't be maintained as vendors were added.

- **Options:** keep `scheme: 'stripe'` strings with a branch per vendor; a scheme object with declarative fields (`encoding: 'hex'`, a header name, a prefix string) that the package interprets; a scheme object of plain functions.
- **Trade-offs:** declarative fields are shorter to write, but every new vendor quirk becomes another field for us to interpret and maintain. Plain functions push hex or base64 decoding and the header format into each scheme, so a preset is about 20 lines instead of 5, but the package code doesn't change when a vendor does.
- **Chosen:** plain functions. `parse(headers)` returns `{ signatures, timestamp?, id? }` with signatures as bytes and the timestamp as a `Date`, `payload({ id, timestamp, body })` returns the signed bytes or text, `headers({ signature, id, timestamp })` writes the headers for `sign`, and the optional `key(secret)` decodes a string secret. `verify` and `sign` keep the HMAC, the length check and constant-time compare, several secrets and the tolerance. We won't add vendors beyond the four presets, and the README shows how to write one.
- **Presets are root exports,** `Webhooks.standard`, `Webhooks.stripe`, `Webhooks.github` and `Webhooks.slack`, not a `schemes` subpath. They are plain objects, so when code imports only `verify`, a bundler keeps `standard` (the default) and drops the other three, as a Rolldown build confirmed.
- **Standard Webhooks is the default `scheme`,** because it is the only published spec and Svix, Resend and Clerk use it. The `svix` scheme is gone: `standard` reads the `svix-` headers when the `webhook-` headers are missing.
- **`sign` gives every scheme a `crypto.randomUUID()` id by default,** so the Standard Webhooks id changed from `msg_…` to a UUID, and GitHub signatures now come with an `x-github-delivery` header, as GitHub's own deliveries do.

## `@portable/rpc` API

- **Per-call options go through `Rpc.call(remote.method, params, { signal })`.** Also considered: options as a last argument (clashes with a method whose last parameter is an object, and with optional parameters), a marker object built by `Rpc.options()` (the remote's types then need an extra optional parameter after every parameter list, which TypeScript can't add after a rest parameter), and a `remote.with({ signal })` view (a method named `with` on the API would clash with it). `Rpc.call` takes the proxy's method itself, so the params are typed from the API, the proxy reserves no names, and the same function sends params by name for MCP and LSP. To close everything, pass a connection-wide `signal` to `connect`.
- **Bidirectional use is `connect(transport, { methods })`, not `provide` and `connect` called separately on one transport.** A `ReadableStream` has one reader, so two calls would need a hidden registry keyed by transport, and their options could disagree. birpc also takes the local functions and the channel in one call. `Rpc.provide(transport, methods)` is `connect` with `methods`, for a side that serves methods and calls none.
- **`Rpc.provide(transport, methods)`, not `Rpc.serve(api, transport)`.** Most transports are workers, ports and windows, and "serve" suggests network I/O. The transport comes first, as in `connect`, and `methods` matches penpal's option name. We kept `connect` because comlink, penpal and post-me all use it.
- **Server methods get cancellation through `Rpc.withContext(fn)`, which passes `{ signal, request }` as the first argument.** Also considered: `this` as the context (breaks class instances and methods that call `this.other()`, which comlink users rely on), a context argument appended after the params (the method receives it in place of an optional parameter when the caller passes fewer arguments), and a `Rpc.context()` getter (works only before the first `await`). The wrapper is opt-in per method, and the method's type on the remote leaves out the context argument.
- **A stream ends with the normal JSON-RPC response to its request,** not a separate `$/stream/end` notification, so every request still gets exactly one response and a JSON-RPC peer that doesn't know streams sees a request that completed with `null`. The server announces the stream with `$/stream { id }`, so `await remote.watch()` can resolve to a `ReadableStream` before the first value. Credit starts at zero and the client grants 256 as soon as it sees `$/stream`, which costs one round trip at the start of each stream and bounds what the server sends ahead. HTTP responses use the response body's backpressure instead of credit.
- **`Rpc.http(url)` returns a remote, not a transport.** HTTP is one request and one response, so a transport would POST every credit and cancel message. As a client it batches calls made in the same tick, aborts a request when every call in it is cancelled, and never sends credit. It and `Rpc.handler` always use JSON, because NDJSON framing needs text lines.
- **The server sends a thrown error as `-32603` with the error's `message`.** json-rpc-2.0 sends code `0`, which the specification doesn't define. Sending the message keeps comlink, birpc and penpal users' error handling working. To hide a message, throw a `RemoteError` yourself.
- **Methods are own properties of the API object or class methods.** The server never calls names in `Object.prototype` or names starting with `rpc.`, and when no key matches the whole name, it splits the name at the dots and calls the nested method (so `'tools/list'` and `'a.b'` keys work).
- **No Standard Schema validation.** It would add a wrapper per method and a dependency on the schema's types for something a method does in one line. The README says to validate inside the method.
- **`Rpc.window` takes one `origin` string, required,** and `'*'` only when passed. penpal accepts lists and regular expressions, but `postMessage` itself takes one string as `targetOrigin`. Each side posts a hello every 100 ms until the other side answers or `signal` aborts. `Rpc.window` has no handshake timeout option, because the conventions leave timeouts to `AbortSignal.timeout` on each call.
- **No transfer lists.** comlink's `transfer()` and penpal's `Reply` with transferables need the codec to return a transfer list next to the message, and the identity codec still structured-clones.
- **`connect` posts to and listens on ports and windows directly instead of through the transport's streams.** `Rpc.port` and `Rpc.window` register a private fast path that `connect` uses, and the `{ readable, writable }` pair stays for other uses. Going through the streams made a stream of 1,000 values about 50% slower than birpc, and a `DataCloneError` in a `WritableStream`'s `write` errors the stream permanently, so one unclonable argument broke every later call. Now that call rejects and the connection keeps working.
- **The credit window is 256 values, granted again when 64 have been read.** With 32, the credit round trip every 16 values cost about 15% of a 1,000-value stream.

## `WebCrypto.derToRawEcdsa` accepts only strict DER

- **Options:** accept what ecdsa-sig-formatter's `derToJose` accepts (BER lengths, extra leading zeros, negative and empty INTEGERs); accept only DER.
- **Trade-offs:** a lenient parser converts a few more signatures from broken signers. It also gives one signature several encodings, and `derToJose` drops a non-zero top byte of an oversized INTEGER and returns a different signature. Wycheproof flags all of these as invalid.
- **Chosen:** strict DER. Every Wycheproof case flagged `BerEncodedSignature`, `InvalidEncoding` or `MissingZero` throws `InvalidInputError`. The README lists what `derToJose` accepts and we reject.

## `WebCrypto.importSeed` returns a non-extractable private key by default

- **Options:** extractable by default, which needs one `importKey`; non-extractable by default, which imports the key a second time after reading its public key.
- **Trade-offs:** the second import makes `importSeed` about 40% slower (8,100 instead of 12,900 calls a second on Node). An extractable key can be exported by any code that holds it.
- **Chosen:** non-extractable, so a key can't be exported unless you pass `extractable: true`, which also skips the second import.

## `WebCrypto` keeps the function names from the package plan

- **Options:** `derToRawEcdsa`, `rawToDerEcdsa` and `publicKeyOf` as docs/packages.md names them; names built from the `encode`, `decode`, `parse` and `format` verbs in AGENTS.md.
- **Trade-offs:** both sides of the ECDSA conversion are bytes, so neither direction is an `encode` or a `decode` of a value, and `decodeDer` would hide which form comes out. Names such as `derToRawEcdsa` give both the input form and the output form.
- **Chosen:** the names from docs/packages.md. Each async function still takes `signal`, which it checks before and after the `crypto.subtle` call, because WebCrypto has no way to cancel a call.

## `WebCrypto.hmac` and `WebCrypto.hkdf` take key bytes, not a `CryptoKey`

- **Options:** also accept an imported `CryptoKey` so a caller can reuse it; take bytes or a string only.
- **Trade-offs:** a reused key saves one `importKey` per call, but a `CryptoKey` stores its own hash, which could disagree with the `hash` argument. If you reuse a key, you can call `crypto.subtle.sign` directly.
- **Chosen:** bytes or a string only. `hmac` caches the keys it imports, so signing again with the same secret skips `importKey`, and there's no need to pass a `CryptoKey`.

## `@portable/rdap` API

- **`domain(name)`, `ip(address)` and `asn(number)`, each returning a plain normalized object with `raw`.** We left out node-rdap's `nameserver()` and `entity()`: a domain result already lists its nameservers and entities, and a client can route an entity handle to a server only for the eight RFC 8521 tags.
- **Four error classes.** `InvalidInputError` and `UnsupportedError` (no server in the bootstrap file) are the shared names. `NotFoundError` is separate from `ResponseError` because "is this name registered?" is the most common question a caller asks. A rejected `fetch` passes through unchanged. `@portable/dns` wraps it in `QueryError` to copy Node's error codes, and RDAP has no such codes to copy.
- **Lookups follow registrar referrals by default and report a failed referral in `referral.error` instead of rejecting.** Registrar servers fail more often than registries, and the registry's answer is still correct. The other option was to reject, which would make a `.com` lookup fail whenever the registrar's server is down.
- **The merged result takes entities from the registrar and everything else from the registry.** The merge also keeps registry entities in roles the registrar has no entity for. Taking the whole registrar response was simpler, but registrars report their own expiration dates (MarkMonitor's `google.com` expiration is a day earlier than Verisign's), and the registry is the authority for them.
- **Bootstrap files are cached for 24 hours in a `WeakMap` keyed by the `fetch` function, with no TTL option.** A module-level cache leaked bootstrap files between tests that pass different fetches, and node-rdap needs `flushCaches()` for that. 24 hours is IANA's `max-age`. Concurrent lookups share one request, and it is aborted only when every lookup waiting for it has aborted.
- **The result flattens entities depth first and takes the first value of each jCard property.** A registrar's abuse contact is nested inside the registrar entity, and callers look for it with `roles.includes('abuse')`. An entity's other emails and phone numbers are only in `raw`.
- **A date without a time zone is read as UTC.** `new Date('2020-01-02T03:04:05')` uses the machine's zone, so the same response gave different `Date`s on different machines.
- **IP addresses and prefixes use `@portable/ip`, and domains use the URL-based `hostToAscii` from `@portable/idna/internal`.** Full `Idna.toAscii` would add about 15 kB gzipped of mapping tables, and the URL host parser applies the same UTS #46 mapping with the runtime's tables. A prefix's host bits are cleared before the query, as `Ip.parseCidr` does.

## `@portable/web-push` sends aes128gcm only, with no GCM keys

- **Options:** support aesgcm and GCM API keys as web-push does; aes128gcm and VAPID only.
- **Trade-offs:** aesgcm is the draft encoding from before RFC 8291, and every current browser accepts aes128gcm. GCM shut down in 2019 and FCM's legacy server keys in 2024, so web-push's GCM branches can't send anything today.
- **Chosen:** aes128gcm and VAPID only. `vapid` is a required option of each call instead of module state.

## `WebPush.send` returns `{ kind: 'gone' }` for 404 and 410, and throws for other errors

- **Options:** throw for every non-2xx, as web-push does; return every status as a result; return 404 and 410 as a result and throw for the rest.
- **Trade-offs:** a gone subscription is routine and every caller must handle it by deleting the subscription, so it belongs in the result type, where TypeScript shows it. Other statuses (400, 403, 413, 429, 5xx) mean the send failed, and AGENTS.md says errors are thrown.
- **Chosen:** `{ kind: 'sent', status } | { kind: 'gone', status }`, and `ResponseError` with `status`, `headers` and `body` for the rest. A malformed subscription throws `InvalidInputError`, which callers can also treat as a reason to delete it.

## `WebPush.toRequest` returns a `Request`

- **Options:** only `encrypt`, as docs/packages.md listed; a `generateRequestDetails`-style plain object; a `Request`.
- **Trade-offs:** if you send through your own transport, you need the VAPID header and the other headers as well as the body, so `encrypt` alone isn't enough. A `Request` can be passed to any `fetch`, put on a queue after `arrayBuffer()`, or given more headers.
- **Chosen:** export both `encrypt` and `toRequest`. `send` calls `toRequest`, then `fetch`.

## `WebPush` reuses a VAPID token for an hour

- **Options:** sign a new JWT for every message, as web-push does; reuse it per push service origin.
- **Trade-offs:** Apple's documentation asks senders not to refresh tokens more often than once an hour. Reuse also skips an ECDSA signature per message. A reused token has at least 11 hours left, and RFC 8292 allows up to 24.
- **Chosen:** reuse for an hour, keyed by audience, subject and keys, and keep up to 64 tokens.

## `WebPush` rejects payloads over 3993 bytes and `http:` endpoints

- **Options:** follow web-push and send whatever the caller gives; check against the RFC limits.
- **Trade-offs:** push services must accept a 4096-byte body (RFC 8291 §4), which leaves 3993 bytes of payload, and FCM and Apple reject larger ones. An endpoint comes from a browser, so an `http:` endpoint either is a mistake or points the server at an internal address. Rejecting `http:` means a local test push service needs `https:` or a `fetch` that rewrites the URL.
- **Chosen:** throw `InvalidInputError` for a non-`https:` endpoint, and `WebPush.MaxBytesError` (with `maxBytes` 3993) for a larger payload. Callers delete a subscription on `InvalidInputError`, so a payload error has to be a different class, or a long notification would delete valid subscriptions.

## `@portable/web-push` benchmarks against direct WebCrypto calls

- **Options:** require being within 25% of web-push; compare with the same WebCrypto calls made directly and show web-push for reference.
- **Trade-offs:** web-push uses synchronous `node:crypto`. On Node every WebCrypto call goes through the thread pool, and an encryption needs 9 of them, so the same work is about 2.5 times slower one at a time and 1.2 times slower in a batch of 64. No change to the package can close that gap without a JavaScript AES-GCM and ECDH, which AGENTS.md doesn't allow without a dependency. The `webhooks` benchmarks made the same call for `node:crypto` HMAC.
- **Chosen:** the 25% assertions compare with direct WebCrypto calls, and the README shows web-push's numbers.

## `@portable/rate-limit`: GCRA and a compare-and-set store

- **Algorithm options:** GCRA; a token bucket; fixed or sliding windows, as rate-limiter-flexible does.
- **Trade-offs:** a token bucket stores two numbers per key (tokens and the last refill time), so a store must update both atomically. Windows are one counter but let a client make twice the limit across a boundary. GCRA allows exactly what a token bucket of size `burst` refilling at `limit / period` allows, and stores one number, the time at which the key's allowance is full again.
- **Chosen:** GCRA. With one number, a store needs only `get` and a compare-and-set by value, which memory, a Durable Object and a Redis Lua script all support. Comparing values instead of versions is safe because `take` computes its result from the value alone, so an unchanged value means an unchanged decision.
- **Store shape:** `get(key)` and `set(key, value, { expected, ttl })`, rather than an atomic `increment` with a TTL. An increment fits a counter, not GCRA, and Workers KV supports neither, so its recipe ignores `expected`. Both methods may return a plain value, so the memory store skips two `await`s per `take`. That change took `take` from 1.9× slower than rate-limiter-flexible's memory limiter to 8% slower.
- **Units:** `period` and `retryAfter` are milliseconds, as `AbortSignal.timeout` takes, and `headers` rounds them up to the seconds the draft asks for. `resetAt` is a `Date`, like every instant in the repo, so it doesn't go stale the way a count of seconds from now would.
- **A cost larger than `burst`** resolves with `allowed: false` and `retryAfter: Infinity` instead of throwing, because costs often come from request sizes, and the response is a 429 either way. `headers` leaves out `Retry-After` then.
- **Float rounding:** a TAT near `Date.now()` has a resolution of about 0.0002 ms, so summing an inexact `period / limit` could deny the last request of a burst. `take` allows each request up to `min(0.01 ms, interval / 2)` early.
- **Left out:** `blockDuration`, key prefixes, queues that wait for allowance, and a `delete`. The README shows each with `take`.

## `JsonStream.DecoderStream` and `JsonStream.encodeStream`

- **Options for the writer:** keep `encode`; `encodeStream`; an `EncoderStream` class.
- **Trade-offs:** every other `encode` returns a string or bytes, so `JsonStream.encode` returning a `ReadableStream` isn't what you'd expect after using `Base64.encode`. `EncoderStream` is a `TransformStream` everywhere else, used with `pipeThrough`, but this function takes one value, not a stream of them. `Jsonl.EncoderStream` is the transform for many values. For the name `encodeStream`, the `Stream` suffix rule now applies to a function that returns a stream as well as one that reads one.
- **Chosen:** `encodeStream(value)`. AGENTS.md now says the suffix marks a variant whose bytes or text are a stream, in either direction, so `parseStream` and `encodeStream` mirror each other.
- **The reader is `DecoderStream`, not `ParserStream`,** because AGENTS.md keeps `parse` for packages that only read, and json-stream also writes. With the default `paths: ['$']` it emits every top-level value, as `Jsonl.DecoderStream` does for each line.
- **`InvalidInputError` and `TruncatedError` extend the `@portable/errors` classes,** as in every other package, and so does `Jsonl.InvalidInputError`. They extended `TypeError`, so catching `TypeError` to find bugs in your own code also caught bad input.

## Build `@portable/bytes` instead of pointing to uint8array-extras

Added on 2026-10-18 after an audit of three apps that use Portable. All three hand-write hex encoding, concatenation and a constant-time compare, and Portable had six private `concat` copies plus hex and compare code in webhooks. uint8array-extras has no constant-time compare and no strict hex parsing, and our packages can't depend on it under the no-outside-dependencies rule. The package stays small: base64 remains in `@portable/base64`, and random bytes come from `crypto.getRandomValues`.

## `LineStream` is `Lines.DecoderStream`

- **Options:** keep `LineStream`; `Lines.DecoderStream`; `Lines.SplitterStream`.
- **Trade-offs:** `LineStream` describes itself when read alone and echoes Deno's `TextLineStream`, but callers write `Lines.LineStream`, which repeats the package name. `SplitterStream` avoids that and still says what the transform does. `DecoderStream` gives every transform that turns bytes into values the same name, as `Base64`, `QuotedPrintable` and `Jsonl` already do, but it has no `EncoderStream` to pair with, and "decode" says less about a string input, which is only split.
- **Chosen:** `Lines.DecoderStream`. If you've used `Jsonl.DecoderStream`, you can guess it, and the transform does decode: byte chunks go through `TextDecoder` with the `encoding` option. AGENTS.md now says a transform from bytes or text to values is a `DecoderStream`.

## README package stats

- **Each README has a benchmark table and a stats table instead of one speed column.** The columns are our package, then the replaced libraries, then a platform API. `scripts/readme-tables.ts` maps each row to a benchmark test by name, and a column to a different task name where one row compares other variants, such as base64's 76-column rows.
- **Both tables have one row per library.** The first layout had a column per library and a row per benchmark, so a package compared with nine libraries got a table ten columns wide that scrolled sideways on the docs site, and most cells were dashes, because each library runs only some of the benchmarks. The benchmark table now lists, under each benchmark, only the libraries that ran it, fastest first, with operations per second, the speed relative to our package and a bar of Unicode block characters scaled to the fastest library. An empty row separates one benchmark from the next. We also considered SVG charts, which GitHub shows as images, but they need a file per package and their text can't be searched or copied. The stats table puts each library's version in its own column instead of a "Version compared" row. `scripts/readme-render.ts` renders both tables.
- **Benchmarks run one package at a time.** `scripts/bench.ts` starts one `vp test bench` per package and writes `.bench/<package>.json`, so one failed assertion or slow package doesn't lose the other reports, and a single package can be rerun. Vitest 5 ignores `benchmark.outputJson`, so the reports come from the JSON reporter.
- **A failing speed assertion doesn't stop the tables.** `scripts/bench.ts` still writes the report, and `pnpm bench` exits with 1. In the run that produced the current tables, mail's "1 MB attachment in memory" and web-push's "signs a VAPID JWT" failed their 25% assertions. We kept them in the tables, because they measure a real gap.
- **Assertions compare the same kind of work.** Node web streams cost about 1 µs per chunk, against 0.2 µs for Node object streams, so streams' merge and map assert against the same work written with `TransformStream`, and the README shows merge2, merge-stream and through2 as faster. raw-body uses a 50% delta, because it joins Node Buffers with `Buffer.concat` in C++.
- **Slow libraries run fewer iterations.** stream-json takes 0.5 to 1.2 s per run, so its benchmark passes `{ iterations: 8 }`. The async-retry benchmark sets `minTimeout: 0` and `maxTimeout: 0`, because it always waits on `setTimeout`.
- **Libraries the README names but the benchmarks leave out:** @microsoft/fetch-event-source uses `window` and `document`; better-sse and hono's SSE helper need a Node response or a Hono context; whoiser and whois-json speak WHOIS over TCP port 43; bottleneck schedules jobs and has no allow-or-deny call to compare with a rate limiter; dohjs takes no `fetch` to inject.
- **Runtime dependencies count every package installed with the published package,** `@portable/*` included, by walking `dependencies` through `node_modules`.
- **Coverage is no longer part of `pnpm readme`,** since the root README's package table has no coverage column.
- **Bundle size is measured with Vite's `build` from `vite-plus`,** which bundles with rolldown, so no new dependency is needed. `scripts/bundle-size.ts` builds one entry per column from the column's `imports` in `scripts/readme-tables.ts`, which are the imports in the README's usage example or the library's equivalents. It runs from the package's `test/` directory, so it bundles the same upstream versions the tests install, and resolves `@portable/*` to the built `dist/`. The build uses Vite's browser conditions and `browser` fields and minifies the output, and the size is the gzip (level 6) of all output chunks. Node built-ins are left external and listed in the stats table, with `Buffer` when the output uses it. The size then leaves out whatever a browser polyfill would add. An optional peer such as `@noble/hashes` is counted only in the column that imports it.

## Crypto defaults to WebCrypto, with no `/core` entry

This was decided for `@portable/webhooks` and `@portable/oauth1`, and docs/architecture.md now states it as the rule.

- **Options:** `@noble/hashes` in every runtime, the earlier default; export conditions that give browsers, Workers and Deno a WebCrypto build and Node and Bun a noble build, as octokit and Stripe do; WebCrypto in every runtime, with the `hmac` or `digest` option for passing noble instead.
- **Trade-offs:** noble HMAC-SHA256 adds about 3.0 kB gzipped to a browser bundle and needs an optional peer. Node's WebCrypto HMAC is about 7× slower than noble's. Export conditions avoid both costs but give each runtime different code, which tests in one runtime don't cover.
- **Chosen:** WebCrypto everywhere, because it is the platform API and we expect Node's implementation to get faster. Neither package has a noble dependency or peer any more. `/core` existed to keep the noble default out of bundles, so it is gone, and the option is the only way to pass another function. A browser bundle of `verify` from webhooks is 4.7 kB gzipped, and of `sign` from oauth1 5.1 kB, neither with noble code.
- **On Node:** a webhooks verification with the default is 1.6× faster than Stripe's `constructEventAsync` and about 1.8× slower than standardwebhooks. An oauth1 GET header is about 5× slower than oauth-1.0a with `node:crypto`. With noble passed in, both are faster than the library they replace. The benchmarks assert against the noble path where the upstream library hashes in JavaScript or `node:crypto`, and against the default where it uses WebCrypto.
- **`WebCrypto.hmac` caches imported keys.** It holds up to 16 keys of at most 256 bytes, keyed by the hash and the key bytes, and clears the cache when it is full. The cache started in webhooks, where verifying without it was 2.9× slower on Node and an HMAC in Chromium took 12 µs instead of 6 µs. It moved into `WebCrypto.hmac` so that oauth1 and any other caller get it too, and webhooks now uses `WebCrypto.hmac` as its default.

## `@portable/mime-headers` API

- **Two verb pairs.** Encoded words use `encodeWord`, `encodeWords` and `decodeWords`, because RFC 2047 is an encoding of text. Structured values use `parseValue`/`formatValue` and `parseAddresses`/`formatAddresses`, because the text is a syntax people read and write. AGENTS.md now has a rule for the `parse`/`format` pair. Also offered: one `encode`/`decode` pair for everything, which would hide that `parseAddresses` discards comments and whitespace.
- **Charsets come from a caller-supplied `CharsetEncoder`,** not an optional dependency on `@portable/charset`. Decoding uses `TextDecoder`, which covers every charset a mail client meets, and only encoding into a legacy charset needs a table. Every `Charset.Charset` has an `encode(text)` method, so you can pass a charset from `@portable/charset` as it is, and the package stays free of dependencies.
- **No dependency on `@portable/quoted-printable`.** RFC 2047 Q encoding writes `_` for a space and has a smaller set of safe characters than quoted-printable, so sharing the encoder would need options that only this package uses.
- **Strict address parsing is an option on `parseAddresses`,** not a separate validator. email-addresses' strict RFC 5322 mode and addressparser's lenient mode share one grammar here, and the option only rejects what the lenient parser repairs.
- **Different from upstream:** `parseAddresses` removes quotes around a local part, keeps only the first address of `<x@evil.com @good.com>` and accepts UTF-8 addresses (RFC 6532), and `formatValue` writes RFC 2231 continuations for long parameters.

## `@portable/spf` API

- **`Spf.check({ ip, sender, helo }, { resolver, receiver, signal })`, named after RFC 7208's `check_host()`.** We passed over `verify` because in webhooks it throws on failure, and an SPF `fail` is a result, not an error. `check` rejects only for an invalid `ip`.
- **The resolver is required, with no default.** A default of `Dns.create()` would save one line, but the resolver determines which server sees the client's IP through `%{i}` in `exists` lookups, mail servers usually have their own resolver, and it would put DNS-over-HTTPS code into Node bundles. `Spf.Resolver` is a `Pick` of five `Dns.Resolver` methods, so `node:dns/promises` and small test fakes both match it.
- **RFC 7208 behavior only.** There is no lenient mode like mailauth's default and no options for the lookup limits. A syntax error anywhere gives `permerror`, and empty answers and `EBADNAME` count as void lookups.
- **No Received-SPF or Authentication-Results headers.** The result's `identity` and `domain` are enough for `@portable/mail-auth` to build them.

## `@portable/dns` API

- **`Dns.create({ endpoints, fetch, timeout })` (first named `createResolver`) returns Node's method names** (`resolve4`, `resolveTxt`, `resolveMx`, ... `reverse`) plus `query(name, type)` for the whole decoded packet. The `Resolver` type has the one-argument methods, which `node:dns/promises` also has, so SPF, DMARC and DKIM accept either. If you move from Node, you change only the line that builds the resolver.
- **`QueryError` copies Node's `code`, `syscall`, `hostname` and message,** so existing `ENOTFOUND`/`ENODATA` handling keeps working. An abort rejects with `signal.reason`, as `fetch` does.
- **GET requests with ID 0,** so responses can be cached and browsers send no CORS preflight. A truncated response is an error, and the next endpoint is tried.
- **No cache, `ttl` option, `resolveAny` or `resolveTlsa`,** because `query()` covers them.
- **Different from Node:** the resolver decodes TXT as UTF-8, returns only records on the question's CNAME chain, and gives `ENODATA` for a CNAME-only answer.

## `@portable/oauth1` API

- **`sign(request, options)` returns a new signed `Request`; `authorization(request, options)` returns only the header value.** oauth-1.0a's `authorize` and `toHeader` were the alternatives. Inputs are `Request` objects, so `sign` signs exactly the URL and body that `fetch` sends, at about 10 µs per POST for reading the body.
- **The option is `signatureMethod`, defaulting to HMAC-SHA1,** because `method` reads as the HTTP method. oauth-1.0a defaults to PLAINTEXT.
- **The pluggable functions are `hmac` (a `WebCrypto.Hmac`) for the signature and `digest` for the body hash,** as in every package that takes pluggable crypto.
- **The defaults are `WebCrypto.hmac` and `WebCrypto.digest`,** as for every package (see the decision above).
- **The signed form POST benchmark allows 50%.** Reading the body and building a second `Request` in undici costs more than oauth-1.0a's string handling, and hashing is not the gap.
- **No HTTP client.** `fetch` follows redirects with the old signature, and the README shows how to re-sign.
- **`timestamp` is a `Date`,** as in `Webhooks.sign` and every result in this repo. It was a number of seconds, so the same option name took different types in two packages that are often used together.

## `@portable/webhooks` API

- **One `verify(input, { scheme, secret })`,** not a function per provider, so there is one result type, one error class and one set of options. `sign` mirrors it and returns the provider's headers. The `scheme` string became a scheme object (see "Webhooks schemes are objects of functions").
- **The default is `WebCrypto.hmac`, which caches imported keys** (see the decision above). Commit 6950f78 briefly made `@noble/hashes` the default, which is 1.6× faster than standardwebhooks on Node. A caller can still pass it as `hmac`.
- **`verify` returns `{ body, id, timestamp }` as text, not parsed JSON,** because Slack commands and GitHub form deliveries aren't JSON, and the `id` lets callers drop replays.
- **One `VerificationError` with a `code`** (`missing-header`, `malformed-header`, `signature`, `timestamp`) instead of the shared error names, because every failure maps to the same 4xx. Mistakes in the call throw `TypeError` or `RangeError`. The signature is checked first, so `timestamp` always means a genuine but stale message.
- **The tolerance applies in both directions,** while Stripe and Slack accept any future timestamp. No SHA-1 for GitHub, which always sends SHA-256.
- **Benchmarks assert only against WebCrypto or pure-JS implementations.** Libraries on `node:crypto` are 3 to 8× faster on Node than any web-standard HMAC, so they are listed for reference.

## Tests are a separate workspace package in `packages/<name>/test/`

- **Options:** `src/_test/` inside each package (the first layout); a sibling `test/` directory with its own `package.json`.
- **Trade-offs:** a separate package keeps upstream libraries, their `@types` and Node types out of the published `package.json`, and makes tests import the package by name through its `exports` map. It adds one workspace package per package. Tests can still import unexported code by path.
- **Chosen:** `test/`, named `@portable/<name>-test`. Shared tools (Vitest, TypeScript, Playwright, `@types/node`) stay in the root. `tsconfig.test.json` type-checks every test directory, which `tsc -b` didn't do before.

## `@portable/json-stream` API

- **`DecoderStream({ paths })` emits `{ path, value }` for values at JSONPath expressions, and `encodeStream(value)` returns a `ReadableStream<Uint8Array>`.** Line-delimited JSON moved to its own package, `@portable/jsonl`, with `Jsonl.DecoderStream` and `Jsonl.EncoderStream`: developers look for line-delimited JSON as its own problem, and its own package can use `DecoderStream` and `EncoderStream`, as the other codecs do. The package is named for JSON Lines (`.jsonl`), because OpenAI, Hugging Face and agent transcripts use that name. NDJSON is the older name, still used by the `ndjson` npm package and Elasticsearch. JSON Lines and NDJSON describe the same format.
- **No runtime dependency on `lines`, and only `Streams.abortable` from `streams`.** Splitting on `\n` inline is faster, and `encodeStream` needs its own pull source so cancelling can interrupt a pending read.
- **Functions in the value are thunks,** called when the writer reaches them, so work such as a query starts only when needed. `JSON.stringify` drops functions instead.
- **The decoder builds each matched value with `JSON.parse` on the matched slice,** which is faster and parses exactly like `JSON.parse`. The decoder reports a syntax error inside a match when that value ends, not at the bad character.
- **`encodeStream` always writes streams and async iterables as arrays.** No `cycle` option: a circular structure or a BigInt fails as in `JSON.stringify`.

## `@portable/png` API

- **Async `decode`/`encode` use `DecompressionStream`/`CompressionStream`; `decodeSync`/`encodeSync` require a zlib function** (fflate's or `node:zlib`'s). One function with mixed return types or overloads was the alternative.
- **Output is always 8-bit RGBA,** and `encode` takes `{ width, height, data }`, so a caller can pass a canvas `ImageData` or a decode result as is. 16-bit precision is lost, and there is no 16-bit or palette writing.
- **No compression level option,** because `CompressionStream` has none. Callers set a level inside their own `deflate`.
- **Rows are filtered by the smallest signed-byte sum,** as libpng does.
- **The `DecompressionStream` decode benchmark allows 50%.** Node's `DecompressionStream` hands zlib one 16 KiB chunk at a time to the thread pool, which adds 10 to 25 ms on a 1024×1024 image. With `node:zlib` our decoder is faster than pngjs (28 ms vs 37 ms in the README table).
- **Different from pngjs on purpose:** a `tRNS` pixel keeps its color with alpha 0, gray output uses BT.709 luma, bytes after `IEND` are ignored, and a header claiming more pixels than the data holds throws before allocating (pngjs tried to allocate 40 GB).

## `@portable/charset` API

- **Charset objects imported from subpaths, plus `load(label)` for labels known only at runtime.** A registry keyed by string would pull every table into every bundle. `encode` from the root is 1.0 kB gzipped, one single-byte charset adds 0.6 kB, and the largest family (gbk or big5) is 18 kB.
- **Where iconv-lite disagrees with WHATWG, the WHATWG label mapping is used.** `latin1`, `ascii` and `iso-8859-1` encode as windows-1252, and `gb2312` as GBK, because that is how browsers and `TextDecoder` read them back.
- **`encode` writes `'?'` for an unmappable character by default,** as iconv-lite does. A `'?'` can't inject markup into CSV or email. `'html'`, `'error'` and a function are the other options.
- **No `decode`,** because `TextDecoder` covers it. No base64, hex or binary codecs either, because other packages cover them.
- **Tables are packed varints,** so gb18030 is 17 kB gzipped against iconv-lite's 32 kB. Each charset costs 128 kB of memory after first use.
- **Phase 2, not built yet:** DOS code pages (cp437, cp850), UTF-7, UTF-32 and CESU-8.

## `@portable/base64` API

- **Three decode modes.** `'loose'` (the default) and `'strict'` match the platform's `fromBase64` `lastChunkHandling`. `'mime'` follows RFC 2045 and libbase64: it skips unknown characters, reads both alphabets and never throws. We didn't make libbase64's lenient behavior the default, because silently dropped characters hide corrupt data (base64-js #81).
- **Native `toBase64`/`fromBase64` are used when the runtime has them.** Node 24 doesn't, so Node runs the JavaScript fallback, and Chromium's tests check the fallback against the native methods on over 1,000 inputs. The stream decoder always uses the JavaScript code, to avoid a second path to test.
- **Plain encode and decode have no 25% benchmark assertion against libbase64 and `Buffer`.** Both call C++ `Buffer`, about 6× faster than our JavaScript on Node. The comparisons with base64-js, js-base64 and libbase64's wrapping and streams are asserted, and we win them.
- **`omitPadding` defaults to false even for base64url,** as on the platform, unlike `Buffer` and js-base64. **Wrapping is off by default.**
- **The oracle is libbase64 1.3.3,** because 1.4.x is less than a day old. The cases come from 1.4.1's tests.

## `@portable/dns-packet` API

- **`encode(packet, { compress, framing })` and `decode(bytes, { framing })` are the whole API.** `framing: 'tcp'` replaces `streamEncode`/`streamDecode`. We dropped `encodingLength`, writing at an offset and `encode.bytes`, because `encode` returns an exactly sized array.
- **Compression is off by default.** Queries rarely gain anything from it, and dns-packet's default made output depend on name order.
- **Code tables and flag bits are internal.** Packets carry a `flags` object of booleans, and unnamed codes use RFC 3597 names (`TYPE65534`). An unknown name throws.
- **TXT decodes to `Uint8Array[]`,** which keeps binary and DNS-SD data intact. `@portable/dns` can turn it into text.
- **CAA `flags` is the whole byte** and SVCB/HTTPS stay raw bytes, so DNSSEC-signed data re-encodes exactly.
- **No subpath for decode-only use:** encode and decode together are 7.4 kB minified and gzipped.
- **Addresses are parsed and formatted by `@portable/ip`.** `encode` passes each A, AAAA and CLIENT_SUBNET address to `Ip.parse` and wraps its error in `InvalidInputError` with the original as `cause`, so `010.0.0.1`, which `inet_aton` reads as octal 8, throws as it does everywhere else in the family. A zone throws too, because DNS can't carry one. `decode` formats addresses with `Ip.format`, so an IPv4-mapped address is `::ffff:192.0.2.1`, as RFC 5952 section 5 recommends and as Node's `resolve6` writes it. With a parser of its own, the package was 7.0 kB, but the two parsers had already drifted apart: the package read `010.0.0.1` as 10.0.0.1 and wrote mapped addresses in hex. `@portable/dns`, which already bundles ip, gets smaller.

## `@portable/quoted-printable` API

- **The oracle is libqp 3.0.1, copied into `test/fixtures/`.** 3.0.1 fixes chunk-dependent output, split UTF-8 sequences and a boundary injection, but it was published hours ago and `minimumReleaseAge` refuses it, tarball URLs included. The tests install libqp 2.1.3 from npm for the cases 3.0.1 didn't change. Replace the copy with `libqp@^3.0.1` once it is a day old.
- **A bad `lineLength` throws a `RangeError`.** libqp quietly treats bad values as 76 or 4. A bad option is a programming mistake, so it doesn't need its own error class.
- **No `newline` option,** unlike base64 and csv. RFC 2045 requires CRLF for soft breaks, and `encode` keeps hard breaks as they are in the input.
- **Strings are UTF-8 in both directions.** libqp's `decode` reads each character's low byte.
- **Linear-time tests run only in Node and retry up to 3 times,** because other processes on the machine made linear runs measure up to 24× slower. A quadratic regression (about 64×) still fails every attempt.

## `@portable/image-size` API

- **`parse(bytes)` and `parseStream(stream, { maxBytes })`.** `parseStream` cancels the stream once it knows the size: it reads 5 KB of a 730 KB JPEG. It takes only a `ReadableStream`, and callers pass `blob.stream()` or `response.body`. We dropped `imageSizeFromFile`, `disableTypes` (global state) and `types`.
- **HEIF size comes from the primary item, with clean aperture and rotation applied.** image-size takes the first or largest `ispe`, which reports a 16×64 image as 63×64 and lists every tile of a tiled photo. HEIF results have no `images` list.
- **A cut-off box-based file throws `TruncatedError`.** When the input ends during the search for a box, a cut file and one missing the box look the same. Throwing `TruncatedError` for both means a prefix of a valid file is never reported as malformed.
- **Reaching `maxBytes` throws `MaxBytesError`,** named after the option as AGENTS.md asks, not `TruncatedError`, so a caller can tell a cut-off file from a limit it can raise.
- **The oracle runs against npm's image-size 2.0.4,** which is newer than the last public GitHub commit (2.0.2).

## `@portable/exif` API

- **`parse(bytes)` returns one tag object per IFD** (`ifd0`, `exif`, `gps`, `interop`, `ifd1`) plus `latitude`, `longitude`, `imageSize` and `thumbnail`. A merged object lets the thumbnail's `Orientation` replace the image's (exif-parser #30), and GPS and interop tag ids collide.
- **Dates stay strings,** and `parseDate(value, { offset })` turns one into a `Date`. EXIF dates have no time zone, so building a `Date` while parsing would hide a guess.
- **Rationals are numbers** (n/d), as in exif-parser and exif-reader. **Binary values are `Uint8Array` views** into the input, not copies.
- **Only a bad TIFF header or an unknown format throws.** `parse` skips a bad IFD or value, so it still returns what it can read from a damaged file.
- **Tag names are ExifTool's**, as exif-parser and exifr use, plus the EXIF 2.31 and 2.32 tags. Unknown tags are keyed by hex id.

## `@portable/streams` API

- **Chunk types:** only `Uint8Array` and `string`, and anything else throws a `TypeError`. get-stream also accepts `ArrayBuffer`, `DataView` and other typed arrays, but the API conventions say bytes are `Uint8Array`, and raw-body's `NaN` length bug came from mixed chunk types. Some callers have to wrap chunks.
- **`transform()` returns `{ readable, writable }`, not a `TransformStream`.** Support for `Transformer.cancel` varies between runtimes, and the generator needs to see cancellation so its `finally` blocks run. The pair still works with `pipeThrough`. Cancelling the output ends `source` instead of throwing into it, as through2 does, so code after the `for await` loop still runs.
- **Operators are factories, not classes.** `map`, `filter`, `tap`, `batch` and `limitBytes` take a function or a number, like the array and iterator helpers. AGENTS.md now allows this for generic operators.
- **`MaxBytesError` is its own class,** because hitting a limit is not truncated, invalid or unsupported input.
- **`concat` and `merge` replace merge2's nested arrays:** `merge2(a, [b, c])` is `concat(a, merge(b, c))`.
- **No limit on `toArray` and no `bufferedData` on errors.** The memory risk is in bytes, and keeping partial data on the error would hold up to `maxBytes` after the caller has given up.
- **`toText` decodes chunk by chunk.** Joining the bytes and decoding once was 37% slower than get-stream.

## `maxLength` in `@portable/lines` applies to every line

- **Options:** copy split2, which only checks the unfinished line at the end of each chunk; check every line.
- **Trade-offs:** copying split2 makes the oracle tests match in every case, but then whether a long line is caught depends on chunk boundaries, which the caller doesn't control.
- **Chosen:** check every line. The difference is documented in the README and `PARITY.md`, and the oracle test leaves out `maxLength`.

## No mapper argument in `Lines.DecoderStream`

- **Options:** keep split2's `split2(mapper)`; leave mapping to another `TransformStream`.
- **Trade-offs:** a mapper is shorter to write, but it is a second job inside a package meant for one, and `Streams.map()` does the same job.
- **Chosen:** no mapper. The README shows the `TransformStream` equivalent.

## Empty lines are kept by default

- **Options:** split2 keeps them; byline drops them.
- **Chosen:** keep them, as split2 does, because split2 has far more users and dropping data by default is surprising. `skipEmpty: true` gives byline's behavior.

## Git hooks through Vite+ instead of simple-git-hooks

- **Options:** simple-git-hooks with nano-staged (what ox uses); Vite+'s built-in `vp config` hooks and `vp staged`.
- **Trade-offs:** Vite+ already bundles lint-staged and installs a hook dispatcher, so it needs no extra dependencies. simple-git-hooks is better known.
- **Chosen:** Vite+. Hook scripts are plain files in `.vite-hooks/`.

## Benchmarks fail only when the original is more than 25% faster

- **Options:** require us to be faster; allow any slowdown; allow a fixed margin.
- **Trade-offs:** `Lines.DecoderStream` is about 8% slower than split2 on Node, mostly because Web Streams cost more per chunk than Node streams. Requiring a win would block a correct package on Node-specific overhead.
- **Chosen:** a 25% margin, which still catches real regressions. The git hooks don't run benchmarks, because timing on a laptop is noisy.

## TypeScript 6, not 7

- **Options:** TypeScript 7 (the Go port, now `latest`); TypeScript 6.
- **Trade-offs:** zile and other tools call TypeScript's JavaScript API, which TypeScript 7 doesn't have. arktype keeps TypeScript 6 around for the same reason.
- **Chosen:** 6.0.3 for `tsc` and zile. `vp check` already type-checks with the Go toolchain through tsgolint.

## Open questions from the package plan

- **Umbrella `portable` package:** not claimed yet. It needs an npm publish from the account that owns the npm scope, and nothing depends on it until several packages exist.
- **content-disposition and cookie-signature:** point to `@remix-run/headers` and `@remix-run/cookie` instead of building them. Both are maintained, dependency-free and web-standard.
- **Package names:** `mime-headers` and `mime-stream`. MIME is the format they handle, and the same code applies to non-mail MIME such as `multipart/related`.
- **`@portable/dns`:** yes, as a separate package from `dns-packet`, because SPF and DMARC need a resolver and `dns-packet` users don't.
- **License:** MIT, the same as almost every library we replace.

## Agent skills live in `.agents/pstack/`

- **Options:** `.claude/pstack/`; `.agents/pstack/`.
- **Chosen:** `.agents/pstack/` holds the copies. `.claude/skills/<name>` and `.agents/skills/<name>` are symlinks, so Claude Code and agents that read `.agents/skills` both find them. AGENTS.md is the guide, and CLAUDE.md imports it with `@AGENTS.md`.

## `Exif.parseStream` limits memory, not bytes read

- **Options:** `maxBytes` as the most bytes read from the stream, as in `ImageSize.parseStream`; `maxBytes` as the most bytes held in memory at once.
- **Trade-offs:** WebP files usually store the `EXIF` chunk after the image data, and PNG files may store `eXIf` after `IDAT`. A limit on bytes read would fail on those files at any default small enough to matter, even though `parseStream` skips the image data without keeping it. To limit the download, pipe the body through `Streams.limitBytes`.
- **Chosen:** bytes held in memory, with a 16 MiB default. TIFF files and HEIF files with `mdat` before `meta` are held whole, so the limit applies to them.

## `Exif.parseStream` reads the thumbnail only from the EXIF data

- **Options:** keep every byte up to the thumbnail; take `thumbnail.bytes` from the EXIF segment or chunk only.
- **Trade-offs:** `parse` slices the thumbnail from the whole input, so in a malformed JPEG whose IFD1 points past the APP1 segment it still returns bytes. Keeping everything up to that point would undo the skipping.
- **Chosen:** the EXIF segment or chunk only. In valid files the thumbnail is inside it, and `parseStream` returns the same result as `parse` on every fixture.

## `Streams.tee` defaults to 16 chunks or 64 KiB

- **Options:** no default, so every caller picks a limit; the platform default of 1 chunk; `Infinity`, as the platform's `tee()` behaves; Node's stream defaults of 16 objects or 64 KiB.
- **Trade-offs:** 1 chunk makes the fastest branch wait for the slowest on every chunk, which loses most of the point of reading branches at the same time. `Infinity` brings back the unbounded buffering that `tee` exists to prevent. A required option adds a decision to every call, when most callers only need some bound.
- **Chosen:** Node's defaults, 16 chunks with `unit: 'chunks'` and 65536 bytes with `unit: 'bytes'`. Node users already know these numbers, and they bound memory to 16 chunks or 64 KiB for each slow branch.

## Don't rerun every test when a package.json changes

Vitest's default `forceRerunTriggers` includes `**/package.json`, so `vp test run --changed` ran the whole repo whenever a commit added a package or a test dependency, which was almost every push. `vite.config.ts` now keeps only the config files as triggers. A dependency version bump no longer reruns the tests of the packages that use it before a push, but `pnpm test` still runs them.

## `Exif.StripStream` is a class

- **Options:** a `StripStream` class; a `stripStream(options)` factory.
- **Trade-offs:** AGENTS.md keeps lowercase factories for generic operators that take a function or a number, such as `Streams.map(fn)`. Stripping is a fixed transform named for what it does, like `TextDecoderStream` and `CompressionStream`.
- **Chosen:** `Exif.StripStream`, a `TransformStream` subclass.

## `Exif.strip` doesn't handle HEIC, AVIF or TIFF

- **Options:** rewrite HEIF `iinf`, `iloc` and `iref` to remove the `Exif` and XMP items; overwrite those items in place; throw `UnsupportedError`.
- **Trade-offs:** Removing an item shifts the byte offsets that `iloc` stores for every later item, and `mdat` may come before or after `meta`, so a stream would have to hold the file. Overwriting in place keeps the offsets but leaves an `Exif` item that readers try to parse. A TIFF file stores its EXIF IFD beside the image IFDs, so it needs a TIFF writer.
- **Chosen:** `UnsupportedError`, documented in the README. JPEG, PNG and WebP cover most uploads.

## `Exif.StripStream` holds a whole WebP file

- **Options:** hold the file; write the RIFF header before knowing the output size.
- **Trade-offs:** The RIFF header stores the file size and the `VP8X` chunk stores the EXIF flag, both before the `EXIF` chunk, which usually follows the image data. Writing them early would mean guessing.
- **Chosen:** hold the WebP file and strip it at the end. JPEG and PNG are written as they arrive.

## Decisions from the second batch of packages

These were recorded as each package was built. Each package's README and PARITY.md have the details.

- **dkim** buffers the canonicalized body and calls `crypto.subtle.digest` once. The `hasher` option takes an incremental hasher such as noble's `sha256.create()` for large messages.
- **dkim and dmarc** reject with `signal.reason` on abort. `Spf.check` now does too (see "`Spf.check` rejects with `signal.reason`").
- **dmarc** finds the organizational domain with the RFC 9989 DNS tree walk by default, and takes a public-suffix function as an option, so no suffix list ships with it. Its verb is `check`, as in spf, because a DMARC fail is a result and not an error. `from` is a domain, and the caller extracts it from the header.
- **ip** `contains` treats an IPv4-mapped IPv6 address and the IPv4 address as the same, as Node's `BlockList` does, which is the safer choice for SSRF allowlists. `range` classifies addresses outside `2000::/3` as `reserved`. `parseCidr` clears host bits.
- **random** throws `RangeError` for bad arguments, as dns and base64 do, and throws on reversed bounds instead of swapping them. `seeded` is xoshiro128** seeded with SplitMix64, and its output changes only in a major version.
- **bytes** `concat` always copies, so the result never shares memory with an input. base64, streams and png now depend on bytes, which is why L0 is no longer dependency-free.
- **password** writes the PHC format and also reads passlib's. Hashes from other algorithms throw `UnsupportedError`, so migration code can fall back to the old verifier. Deployed Workers cap PBKDF2 at 100,000 iterations while `wrangler dev` doesn't, and the README says so.
- **timers** clears its own timeout timer instead of using `AbortSignal.timeout`, whose timer can't be cleared. `retry` timeouts are per attempt. `poll` has no `timeout`, because `AbortSignal.timeout` limits the whole call.
- **queue** combines the queue's signal and each task's signal with `AbortSignal.any`. An aborted task keeps its slot until it settles, so `concurrency` is never exceeded. `clear()` rejects waiting tasks.
- **websockets** treats server close codes 1000, 1002, 1003 and 1007 to 1010 as final, because a retry would get the same rejection. Its namespace is `WebSockets`, so the global `WebSocket` isn't shadowed.
- **csv** throws on ragged rows unless `relaxColumnCount` is set, and on repeated header names, because the alternatives rename or drop a column without telling the caller. It has no `cast` option.
- **compress** has no `EncoderStream`, because `CompressionStream` already does that job. Its `DecoderStream` joins small input chunks to avoid the platform's 4 KB output chunks.
- **mime-stream** is not built on lines, so binary and non-UTF-8 bodies come back byte for byte. `splitHeaders` is a separate function that gives dkim an untouched body stream.
- **mail** has no file or URL access, so you pass a stream, a `Blob` or bytes, and the package can't be used to make a request to an internal address (SSRF). It throws for an invalid address instead of quoting and sending it.
- **smtp** requires STARTTLS unless `secure: 'off'`, and AUTH over plain text needs `allowInsecureAuth`. Timeouts come only from `signal`.
- **sse** splits lines inline instead of using lines, to keep one `TransformStream`. `connect` reconnects after a clean end, and a `retry` field from the server replaces `delay`.
- **websockets and sse** take `Timers.Delay` and compute waits with `Timers.backoff`.
- **idna** ships its own Unicode 18 tables instead of calling `URL`, because Node and Chromium both differ from UTS #46.

## Retry callbacks take an `{ attempt }` object

`retryIf`, `onRetry`, the reconnecting clients' `reconnectIf` and a `delay` function all receive the attempt number in an object: `retryIf(error, { attempt })`, `onRetry(error, { attempt, delay })`, `reconnectIf(close, { attempt })` and `delay({ attempt, error })`. Before, `retryIf` and the sse `reconnectIf` took the number as a positional, `onRetry` took an object, websockets' `reconnectIf` took no number, and a `delay` function took `error` as an optional positional because `poll` has no error to pass. An object lets a callback get a new field later without breaking callers. Every `reconnectIf` can now return a promise, as `retryIf` could.

## `@portable/streams/node` is a plain subpath export

- **Options:** export `./node` only under the `node` condition, as packages.md planned; a plain `./node` export with `src`, `types` and `default`, like every other entry.
- **Trade-offs:** With only a `node` condition, a browser or Workers bundle that imports the entry fails to resolve it, which gives a clearer error than a missing `node:stream`. But zile adds a `default` condition to every export when it publishes, so the published package would have one anyway, and `tools/lint/src/packages.test.ts` requires the same three conditions for every entry. Bun and Deno resolve `node:stream` either way.
- **Chosen:** a plain export. The module JSDoc and the README say it runs in Deno, Bun and Node, and `tools/workers/src/run.ts` leaves `./node` entries out of the Worker bundle.

## `@portable/streams/node` has only `toWeb`'s two functions

- **Options:** the full plan in packages.md, with `fromWeb`, `toWebWritable`, `fromWebWritable`, `toWebTransform`, `fromWebTransform` and `pipeToNodeResponse`; only the conversions that Node's built-ins get wrong.
- **Trade-offs:** We built and benchmarked the full set first. On Node 24, `Readable.fromWeb`, `Writable.toWeb`, `Writable.fromWeb`, `Duplex.toWeb` and `Duplex.fromWeb` already follow backpressure and propagate errors, and the `fromWeb` functions take a `signal`. Our versions of the four besides `Duplex.toWeb` took up to 1.3× as long as Node's. Wrapping them would add API to keep stable without fixing anything that most uses need. `Readable.toWeb` has real gaps: it passes `setEncoding` strings through, reads 128 KB ahead of its reader, takes no `signal`, and returns `ReadableStream<any>`.
- **Chosen:** use the platform where it works, as philosophy rule 7 says for existing packages. The entry has `toWeb` and `toWebObjects`, and the README points to `node:stream` for the rest. `pipeToNodeResponse` would be `stream.pipeTo(Writable.toWeb(res))`.

## `NodeStreams.toWeb` and `toWebObjects` are two functions

- **Options:** one `toWeb` that returns `ReadableStream<unknown>`; one `toWeb` with a type parameter for the chunk type; `toWeb` for bytes and `toWebObjects` for object mode.
- **Trade-offs:** A `Readable` doesn't declare its chunk type or whether it is in object mode, so one function can't type its result from its argument. `unknown` makes every byte stream need a cast before `pipeThrough(new TextDecoderStream())`, and a type parameter that appears only in the result lets the caller pick any chunk type without a check, so it is no safer than a cast. AGENTS.md says to write two functions when the result type would change.
- **Chosen:** two functions. `toWeb` returns `ReadableStream<Uint8Array<ArrayBuffer>>` and errors with a `TypeError` for a chunk that isn't bytes or a string. `toWebObjects` returns `ReadableStream<unknown>`.

## `NodeStreams.toWeb` wraps a `Buffer` without copying it

- **Options:** copy every `Buffer` chunk, as `Readable.toWeb` does; copy only a `Buffer` that shares its `ArrayBuffer` with others; wrap the `Buffer`'s memory in a plain `Uint8Array`.
- **Trade-offs:** A small `Buffer` shares Node's pool, which is 64 KiB in Node 24, so transferring a chunk's `ArrayBuffer` detaches the other buffers in the pool. Copying the pooled ones avoids that, but in Node 24 a 4 KB `Buffer` is pooled, so most chunks of a typical stream would be copied. The `Buffer` that the Node stream passes to `NodeStreams` already shares the pool, so a `Uint8Array` over its memory shares nothing that the `Buffer` didn't.
- **Chosen:** a `Uint8Array` over the same memory, and a copy only for a `SharedArrayBuffer`. The README says not to transfer a chunk's `ArrayBuffer`.

## The site's examples are static pages built outside Vocs

- **Options:** a Vocs page that renders the example as a React component; a Vocs page that loads the example in an `iframe`; a static page that Vite builds into `site/public/examples/`.
- **Trade-offs:** The Bluesky stream example fills the window with a canvas and a code panel, so the docs layout around it would only take up space, and a React page would need its canvas loop rewritten as a component. A static page runs the same `index.html` and `app.ts` that a reader can copy. Vocs doesn't know about the page, so its dead-link check rejects a Markdown link to it, and its router would load a sidebar link to it as a missing route.
- **Chosen:** static pages. `site/scripts/examples.mjs` builds each folder in `site/examples/` with Vite and highlights its code blocks with `@pierre/highlights`. The sidebar entry is marked `external` and adds the base path itself, and the Realtime guide links to the page with an `<a>` element that reads `import.meta.env.BASE_URL`.
