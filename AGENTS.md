# Portable agent guide

Portable is a monorepo of small npm packages that run unchanged in browsers, Cloudflare Workers, Deno, Bun and Node. Read [docs/architecture.md](docs/architecture.md) for how the repo is built, tested and released, and [docs/packages.md](docs/packages.md) for the package plan. Decisions made without the owner are logged in [docs/decisions.md](docs/decisions.md), and tooling friction in [docs/papercuts.md](docs/papercuts.md). Add an entry to either when you hit one.

## Commands

| Command | What it does |
| --- | --- |
| `pnpm check` | Format with oxfmt, lint with oxlint, and type-check, fixing what it can (`vp check --fix`). |
| `pnpm check:types` | `tsc -b` over every package. |
| `pnpm test` | All test projects: Node and browsers. |
| `pnpm test:changed` | Node tests affected by changes since `origin/main`. The pre-push hook runs this. |
| `pnpm fuzz` | Runs only the fuzz tests (`*.fuzz.conformance.ts`) in Node, with 10,000 runs per property instead of 100. |
| `pnpm bench` | Builds every package, then runs each package's benchmarks (`*.bench.ts`) against the built `dist/`, one package at a time, and saves the results in `.bench/`. Pass package names to `node scripts/bench.ts` to run only those. |
| `pnpm coverage` | Node tests with V8 coverage of `packages/*/src`, written to `coverage/coverage-summary.json`. |
| `pnpm readme` | Runs `pnpm bench` and `scripts/bundle-size.ts`, then `scripts/readme-stats.ts` rewrites the benchmark and stats tables in each package README. `scripts/readme-tables.ts` lists each table's columns and rows. |
| `pnpm build` | Builds every package with zile into `dist/`. |
| `pnpm changeset` | Records a version bump and changelog entry for the packages you changed. |

Git hooks live in `.vite-hooks/` and are installed by `pnpm install`. The pre-commit hook formats and lints staged files. The pre-push hook type-checks and runs the affected tests. There is no CI yet.

## Package rules

- Use only the WinterTC common API: `fetch`, `Request`/`Response`, Web Streams, `TextEncoder`/`TextDecoder`, `Uint8Array`, `crypto.subtle`. No `node:*` imports, `Buffer`, `process` or DOM globals. Lint enforces this outside `*.oracle.test.ts` and `*.bench.ts`.
- Don't rely on `ReadableStream.from` or `for await` over a `ReadableStream` in package code. Some browsers we support don't have them yet.
- Package code targets ES2022, and because `lib` is ES2022, `tsc` rejects built-ins added later, such as `Array.prototype.findLast`. Don't add polyfills or patch globals. To use a newer API, check for it and fall back to your own code. For example, `Bytes.toHex` calls `Uint8Array.prototype.toHex` when the runtime has it and converts the bytes itself when it doesn't. Before you use a web API newer than the ones in the [runtime baseline](docs/architecture.md#runtime-baseline), add it to that table with its browser versions.
- No runtime dependencies outside `@portable/*`. Crypto defaults to WebCrypto, and the caller can pass `@noble/hashes` or another function instead. A package takes `@noble/hashes` as an optional peer only for what WebCrypto can't do, such as an incremental hash.
- Streaming transforms are `TransformStream` subclasses, used as `stream.pipeThrough(new Lines.DecoderStream())`.
- `package.json` `exports` point at `./src/*.ts`. zile rewrites them to `dist/` when building and publishing. Fields after `"[!start-pkg]"` are the published package, so `dependencies` go after it. Copy the field order of `packages/mail/package.json`: `name`, `description`, `scripts`, `"[!start-pkg]"`, `version`, `type`, `sideEffects`, `license`, `repository`, `keywords`, `engines`, `files`, `dependencies`, `exports`, `main`, `module`, `types`. Workspace dependencies are `workspace:*`.
- A `description` says what the package does in one sentence, starting with a verb where one fits, and ends with ", in any JavaScript runtime."
- A package exports a small API. Keep helpers private unless a caller needs them.
- When another `@portable/*` package needs a package's private building blocks, as arc needs dkim's canonicalization and signing, export them from an `./internal` subpath whose module JSDoc says it isn't public API and can change in any release. Only `@portable/*` packages import it, through a `workspace:*` dependency, which pnpm publishes as the exact version. Its exports need no `@example` and no README entry. Code that every package could use, such as `Bytes.concat`, goes in a shared package instead.
- A package README has these parts in order: the package name, a description ending in "Runs in browsers, Cloudflare Workers, Deno, Bun and Node 24+.", a "Replaces" line, install and usage snippets, the API and options, `## Types` for exported types, `## Why use this over <the libraries it replaces>` (fixes, benchmarks), and `## Migrating`. Split migration into `## Migrating from <library>` sections only when each library needs its own table. Every export appears in the README.

## API conventions

Every package follows the same shape, so a caller who knows one knows the rest.

- Callers import a package as a namespace: `import * as Base64 from '@portable/base64'`. Exports therefore use short names without the package name: `Base64.encode`, not `encodeBase64`. Named exports only.
- Use the same verbs everywhere. `encode` and `decode` convert between a value and its bytes or text. `parse` reads a value out of bytes in one direction only, as image-size and exif do. `parse` and `format` are the pair for a text syntax with structure, such as an address list or a header value with parameters, where the text is meant to be read as well as decoded. A variant whose bytes or text are a stream adds `Stream`: `ImageSize.parseStream(stream)` reads one, and `JsonStream.encodeStream(value)` returns one. A sync variant of an async function adds `Sync`.
- Streaming transforms are `TransformStream` subclasses named after `TextDecoderStream`. A transform that reads bytes or text into values is `DecoderStream`, and one that writes values as bytes or text is `EncoderStream`, so `Lines.DecoderStream` splits bytes into lines as `Jsonl.DecoderStream` splits them into JSON values. Name a transform for what it does only when it neither decodes nor encodes. Generic operators that take a function or a number, like the array helpers, are lowercase factories instead: `Streams.map(fn)`, `Streams.limitBytes(n)`.
- Bytes are `Uint8Array` in and out, never `ArrayBuffer` or `Buffer`. Functions that take text also take its bytes (`string | Uint8Array`). Text comes out as `string`.
- Sync unless the platform API it needs is async, such as `crypto.subtle` or `CompressionStream`.
- One optional `options` object last. No positional booleans or overloads keyed on argument count.
- Everything that can be cancelled takes `signal?: AbortSignal | undefined` in its options: every async function, every stream class, and anything that holds a timer, listener, socket or reader. A cancelled caller passes one signal down and every layer under it stops: `fetch` calls, timers, event listeners, readers and nested streams. Aborting rejects with `signal.reason`, as `fetch` does, or errors the stream with it and cancels its source. Remove listeners on the signal when the work finishes. Plain sync functions have nothing to interrupt and take no signal. Timeouts are left to `AbortSignal.timeout` and `AbortSignal.any` rather than a `timeout` option, unless the timeout covers one step of many (such as one retry attempt).
- Errors are thrown, never returned. Reuse these names where they fit: `TruncatedError` (input ended early), `InvalidInputError` (malformed input), `UnsupportedError` (valid input the package doesn't handle). Add another error class only when a caller needs to tell it apart. An error for an exceeded size limit is named after the option, like `Streams.MaxBytesError` for `maxBytes`, and stores the limit.
- Pick the error by what is wrong. Throw `InvalidInputError` when the data a function exists to read, parse, decode, encode or verify is malformed: bytes that don't decode, a header that doesn't parse, a value that can't be encoded. That data often comes from outside the program, so callers catch this error. Throw the built-in `TypeError` when an argument or option has the wrong type or is missing, and `RangeError` when it has the right type but a value the function doesn't accept: a negative `maxBytes`, an unknown name in a string option, a key or secret that doesn't parse. Those are mistakes in the calling code or its configuration, and the platform throws the same errors (`'a'.normalize('x')` throws a `RangeError`). Where a package mirrors a platform function, such as `JSON.stringify` in jsonl, it throws what that function throws.
- A size limit is `maxBytes` when it counts bytes and `maxLength` when it counts string length in UTF-16 code units, as `String.prototype.length` does. A limit on something else is named for it (`maxParts`, `maxQueued`).
- Results are plain objects and arrays with documented types, not class instances.

## Code style

These follow [wevm/ox](https://github.com/wevm/ox/blob/main/AGENTS.md).

- `type` over `interface`. `readonly T[]` in types. No enums.
- Options objects are `options: Options = {}` and are typed in a `declare namespace` named after the function or class (`DecoderStream.Options`).
- With `exactOptionalPropertyTypes`, write optional properties as `foo?: T | undefined`.
- Relative imports end in `.js`.
- Classes only for errors and for subclasses of platform types. Error classes extend `Error`, not `TypeError` or another built-in error. Error `name`s are namespaced by package, like `'Lines.MaxLengthError'`.
- Public functions, classes and constants, error classes included, have JSDoc with an `@example`. Exported types have JSDoc without one, because the function that takes or returns the type already shows it in use. Other comments are rare: write one only when the code can't say why, and run the `no-comments` skill before you finish a change.

## Tests

- Tests live in `packages/<name>/test/`, a private workspace package (`@portable/<name>-test`) whose `package.json` holds the libraries we compare against, so the published package lists none of them. The package's own `devDependencies` hold only its optional peers, such as `@noble/hashes`, which its source needs to type-check. Tests import the package by name (`@portable/lines`), as a caller would, and import unexported code by path (`../src/DecoderStream.js`) only when it needs its own tests. `*.conformance.ts` runs in Node and in browsers, so put tests there unless they need one runtime. `*.oracle.test.ts` runs only in Node and compares output with the library being replaced. `*.bench.ts` holds benchmarks, and also any test that compares timings (such as a linear-time check), because timings fail when the machine is loaded.
- Every package has a `*.bench.ts` that covers each public function and stream on realistic input, so a later performance pass has a baseline. Compare with the replaced library and with a native API where one exists. When neither exists, still benchmark our own code.
- `test/<name>.fuzz.conformance.ts` holds the package's fuzz tests: fast-check properties run through `fuzz()` from `@portable/fuzz` (`tools/fuzz`), which takes the run count from `FUZZ_RUNS`. A parser or decoder gets random and mutated input and must return or throw only its documented errors, every encoder round-trips, and every stream gives the same output however its input is chunked. `pnpm fuzz` runs them with many more runs. A bug the fuzzer finds gets a regression test with the concrete input in the normal conformance file.
- When a package replaces a library, design the package fresh and use that library's test suite as the list of cases to cover. `test/PARITY.md` maps each upstream test to our test for the same case, or gives the reason it doesn't apply.
- When a package replaces several libraries, build one API around what they have in common and let callers describe the differences, as webhooks does with scheme objects. Don't add a branch or option per replaced library.
- Also look for the replaced library's known traps: open and closed bug reports, edge cases its tests miss, and behavior its users complain about. Add a test for each one we handle differently, and list them under "Known upstream issues" in `PARITY.md`. An oracle test must not lock in an upstream bug.
- Load binary fixtures with `import.meta.glob('./fixtures/*', { query: '?url&inline', import: 'default' })` and `fetch` the data URL, as `packages/image-size/test/utils.ts` does. It works in Node and browsers for any file extension.
- Assert what a caller can observe. Read the `principle-test-behavior-not-implementation` skill before writing tests.

## Writing

Read the `technical-writing` and `unslop` skills (in `.agents/pstack/skills/`) before you write docs, READMEs, code comments, JSDoc, commit messages, or PR titles and bodies. These rules apply to all of them.

- Write the way you'd explain it to another engineer: in plain, specific words that keep the detail and the reason.
- Use the name that already exists: the symbol in the code, or a standard term a reader knows without looking it up (compare-and-swap, idempotent, B-tree). Don't paraphrase a known idea in a long clause, and don't swap detail for jargon either.
- Prefer the short phrase: "a missing blob", not "a blob that the bucket does not hold".
- Use literal verbs. "Is accepted" or "is stored", never figurative verbs such as "lands", "names", "absorbs", "wins", "rides along" or "stands on", or figurative nouns such as "seam". Don't personify code: a poll "needs" a deadline, it doesn't "want" one.
- Say what a thing does with its own verb: "a reader follows the head", not "the head is what a reader follows". A passive such as "is treated as body content" is fine when the actor is obvious.
- Keep words in the order a person would say them. Write "a CR without a following LF", not "a CR that no LF follows", which makes the reader work out who follows whom. Use the name a thing already has ("continuation lines") instead of describing it with a clause, and put a condition in an "if" or "when" clause instead of packing it into a noun phrase. Rewording an awkward sentence word by word keeps its shape: say the fact again from scratch.
- Say what the code does with a value: "stores" or "references", not a vague "names".
- Don't write rules as slogans or aphorisms ("a write lands only on the version it saw"). Name the mechanism.
- No "X. So Y. So Z." chains. Vary sentence length, and keep a cause and its effect in one sentence when they belong together.
- No AI vocabulary (delve, crucial, leverage), no "not just X but Y", no forced groups of three, no em dashes, no filler or hedging, and no clipped fragments with arrows.
- A commit message says why the change is made and what else was considered.

Each row of this table is a pattern to avoid, not only the one sentence. When you or a reviewer finds a new pattern, add a row, using the real sentence from this repo where there is one. An example shows a pattern more clearly than a rule does, so add a row for each new pattern instead of only rewording a rule.

| Instead of | Write |
| --- | --- |
| The URL host parser … cuts a host at `/`, `?` or `#` and percent-decodes, so a domain holding one of those stays as written. (Both "a domain that contains one of those is kept as written" and "`toAscii` returns a domain that contains one of those characters unchanged" keep the problem.) | The URL host parser … cuts a host at `/`, `?` or `#` and percent-decodes it, so `toAscii` checks for those characters first and returns the domain unchanged if it finds one. |
| A CR that no LF follows is body content. (So does "The canonicalizer keeps a CR that no LF follows as body content.") | A CR without a following LF is treated as body content. |
| It joins a line that does not start a field to the field above it. | Continuation lines are joined to the field above. |
| `parse` skips tags with an unknown type or whose values point outside the data. | `parse` skips a tag if its type is unknown or its values point outside the data. |
| Thrown by `load` for a label that doesn't map to a charset this package can encode. | Thrown by `load` when it doesn't know the label or can't encode its charset. |
| `mime-stream` lands just before `dkim` needs it. | We build `mime-stream` just before `dkim` needs it. |
| Each text that parses as a key builds back to the same text. | Every key parses back to the same string, so every stored object can be read back. ("Keys round-trip" goes too far, because it drops the detail.) |
| Stored data never names a blob that the bucket does not hold. | Data never references a missing blob. |
| The WHATWG labels `utf-16` and `unicode` name this charset. | The WHATWG labels `utf-16` and `unicode` map to this charset. |
| Bare imports such as `@noble/hashes` are resolved through the package's `package.json` dependencies; this should be confirmed in a spike with the first crypto package. | We haven't checked yet how JSR resolves `@noble/hashes`. Check it when the first crypto package is published. |
| Purpose-sized, not function-sized. | A package solves one problem a developer would name, such as splitting a stream into lines. |
| The cheapest way to get byte-exact compatibility, and it doubles as the migration guide's evidence. | Comparing our output with the original library's catches any difference in bytes, and the passing tests show users the migration is safe. |
| The seam between the device and the host. | The interface between the device and the host. |
| A check that reads an address one way while the network stack reads it another is how CVE-2023-42282 and CVE-2024-29415 in `ip` let `127.1` and `0x7f.1` pass as public. | CVE-2023-42282 and CVE-2024-29415 let `127.1` and `0x7f.1` pass `ip`'s public-address check because the check read them one way and the network stack read them another. |
| The read misses. So the device asks the host. So the page arrives late. | When the read misses, the device asks the host, and the page arrives a round trip later. |
| The cache absorbs the burst of reads. | The cache serves the repeated reads, so the host receives only the first one. |
| WHATWG labels win where iconv-lite disagrees. | Where iconv-lite disagrees with WHATWG, `Charset.labels` uses the WHATWG mapping. |
| A comment never holds the address: `(evil@evil.com) Name <good@good.com>` is good.com. | `parseAddresses` never takes the address from a comment: `(evil@evil.com) Name <good@good.com>` parses to `good@good.com`. |
| A poll that checks a slow endpoint wants a deadline for the whole wait. | A poll of a slow endpoint needs a deadline for the whole wait. |
| A rejection with `code` `ENOTFOUND`, `ENODATA` or `EBADNAME` means there is no key, and any other rejection a temporary DNS error. | `verify` treats a rejection with `code` `ENOTFOUND`, `ENODATA` or `EBADNAME` as no key, and any other rejection as a temporary DNS error. |
| A `DataCloneError` errors the stream for good. | A `DataCloneError` errors the stream permanently. |
| `encode*`/`decode*` convert encoded-words and back; `parse*`/`format*` read structured values. | `encode*` and `decode*` convert text to encoded-words and back, and `parse*` and `format*` read structured values. |

### Prose review

Before you finish a change that adds or edits prose, run the `prose-review` skill. A second agent reads only the prose the change adds or edits, checks it against this section, and suggests rewrites. When you also run `interrogate`, run this skill as well, because `interrogate` reviews the code and not the prose.
