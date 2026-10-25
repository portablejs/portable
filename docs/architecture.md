# Portable architecture

Portable is a pnpm monorepo of small packages, published to npm under `@portable/*`. Every package runs unchanged in browsers, Cloudflare Workers, Deno, Bun and Node 24 or later, because it uses only the WinterTC common API. [packages.md](packages.md) lists the packages and the rules for what becomes one. This document covers how the repository is built, tested and released.

Most of the setup is copied from [wevm/ox](https://github.com/wevm/ox), which is also a web-standard TypeScript library with multi-runtime tests. A few pieces come from [wevm/viem](https://github.com/wevm/viem) and [arktypeio/arktype](https://github.com/arktypeio/arktype). Each section says where its setup came from.

## Layout

```
portable/
├─ packages/<name>/
│  ├─ src/                 source, published as is
│  ├─ test/                tests, benchmarks, fixtures and PARITY.md: a private package
│  ├─ package.json
│  └─ README.md
├─ tools/
│  ├─ fuzz/                fuzz(), which runs fast-check properties for the fuzz tests
│  ├─ lint/                the portable oxlint plugin and the public API and package.json tests
│  ├─ worker/              runs the conformance tests in a browser Web Worker
│  └─ workers/             bundles every package into one Worker for workerd
├─ scripts/                bench, bundle size and README table scripts
├─ site/                   the docs site, built with Vocs from the READMEs and JSDoc
├─ docs/                   this file, packages.md, decisions.md, papercuts.md
├─ .agents/pstack/         agent skills copied from cursor/plugins
├─ .changeset/
├─ .github/workflows/      CI (verify.yml) and the docs site (docs.yml, docs-preview.yml)
├─ .vite-hooks/            git hooks
├─ AGENTS.md               rules for agents and contributors (CLAUDE.md imports it)
├─ vite.config.ts          format, lint, staged-file and test config
├─ tsconfig.base.json
├─ tsconfig.test.json      type-checks every package's test/ directory and tools/
└─ pnpm-workspace.yaml
```

## Toolchain

[Vite+](https://viteplus.dev) (`vp`) runs formatting, linting, type checks, tests and git hooks from one config, `vite.config.ts`, as in ox.

- `vp check` formats with oxfmt and lints with oxlint. With `typeAware` and `typeCheck` on, oxlint also type-checks through tsgolint.
- `vp test` is Vitest 5. Test code imports from `vite-plus/test`.
- `vp staged` runs checks on staged files for the pre-commit hook.

pnpm 11 manages the workspace. Every shared dev dependency has one version in the `catalog:` in `pnpm-workspace.yaml`. Two supply-chain settings come from ox: `minimumReleaseAge: 1440` refuses any dependency version published less than a day ago, and `trustPolicy: no-downgrade` refuses a version that lost the provenance its predecessor had.

## TypeScript

`tsconfig.base.json` is ox's strict config (`strict`, `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`, `verbatimModuleSyntax`) plus `isolatedDeclarations`. The last one requires explicit types on every export, so a change to a function body can't change the public API by accident. JSR requires the same, so publishing to JSR later needs no code changes. `importHelpers` is on with no `tslib` installed, so the build fails if TypeScript ever needs a helper.

`target` is `es2022` and `lib` is `ES2022`, `DOM` and `DOM.Iterable`. [Runtime baseline](#runtime-baseline) explains why packages target ES2022. `lib` includes `DOM` because TypeScript has no WinterTC library and declares `fetch`, Web Streams and `crypto.subtle` only in its DOM library. `types` is empty, so `@types/node` never applies to package code. `tsconfig.test.json` raises `lib` to `ES2023`, because tests run only in current runtimes.

oxlint rejects what the types allow but the runtimes don't share:

- `no-restricted-imports` rejects `node:*` and the bare Node built-in names.
- `no-restricted-globals` rejects `Buffer`, `process`, `global`, `require`, `__dirname`, `window`, `document`, `navigator` and `localStorage`, and also `DisposableStack`, `AsyncDisposableStack` and `SuppressedError`, which Safari 26 doesn't have.

Both rules are off for `*.oracle.test.ts` and `*.bench.ts`, which run in Node to compare against Node libraries.

## Runtime baseline

Packages run on ES2022 and on the web APIs listed below. We don't ship polyfills, and a package never patches a global. An app that has to support older browsers adds polyfills itself, for example with core-js. Vite, esbuild and `tsc` rewrite newer syntax for older targets but never add a missing API, so the app's build doesn't add polyfills either. ox, viem, hono and jose don't ship polyfills either: each documents the oldest runtimes it supports and leaves polyfills to the app. A polyfill patches a global when its module loads, so a package that contained one couldn't declare `"sideEffects": false`, and a bundler that trusts the flag would drop the polyfill.

For each ES version, the table gives the share of global browser usage that comes from browsers supporting all of its features, and the first Chrome, Firefox and Safari versions that support them. The data is from caniuse-lite 1.0.30001817 and @mdn/browser-compat-data 8.1.6 as of October 2026. No ES version can reach more than 96.7%, because caniuse counts the remaining usage, from Opera Mini, UC Browser, QQ Browser, Internet Explorer and browsers it doesn't track, as supporting none of them. The rows don't count top-level await, because no package uses it and MDN lists Safari support before 27 as partial.

| ES version | Usage share | Chrome | Firefox | Safari and iOS |
| --- | --- | --- | --- | --- |
| ES2021 | 96.1% | 85 | 79 | 16.4 |
| ES2022 | 96.0% | 94 | 93 | 16.4 |
| ES2023 | 94.8% | 110 | 115 | 16.4 |
| ES2024 | 92.8% | 119 | 128 | 17.4 |
| ES2025 | 86.6% | 136 | 138 | 26 |
| ES2026 | 69.5% | 147 | 138 | none |

Safari added regex lookbehind, the last ES2018 feature it lacked, in 16.4, so every version from ES2018 to ES2023 needs Safari 16.4. We chose ES2022 because packages already use its built-ins, such as `Array.prototype.at`, `Object.hasOwn` and the `cause` option of `Error`, and moving up from ES2021 costs 0.1%. No package uses an ES2023 API. With `lib` set to ES2022, `tsc` rejects `findLast`, `toSorted`, `Promise.withResolvers` and other newer built-ins in package code. Raise `target` and `lib` when a package needs one of them.

`tsc` can't reject a web API that is too new, because TypeScript's DOM library declares every web API, however new. These are the newest ones packages use:

| API | Packages | Usage share | Chrome | Firefox | Safari |
| --- | --- | --- | --- | --- | --- |
| `crypto.randomUUID` | webhooks | 96.4% | 92 | 95 | 15.4 |
| `AbortSignal.timeout` | none (the examples pass it as `signal`) | 96.1% | 103 | 100 | 16 |
| `CompressionStream('deflate-raw')` | compress | 96.0% | 103 | 113 | 16.4 |
| `Response.json` | rpc | 95.3% | 105 | 115 | 17 |
| `AbortSignal.any` | dns, queue, rpc, sse | 93.3% | 116 | 124 | 17.4 |
| WebCrypto X25519 | web-crypto | 90.5% | 133 | 130 | 17 |
| WebCrypto Ed25519 | arc, dkim, web-crypto | 89.8% | 137 | 129 | 17 |

Browsers define `crypto.randomUUID` only in a secure context (HTTPS or `localhost`), so on a plain HTTP page `Webhooks.sign` needs an `id`. Chrome 103 to 123 abort an `AbortSignal.timeout` signal with an `AbortError` instead of a `TimeoutError`, so MDN lists full support only from Chrome 124, which lowers the usage share to 92.2%. Node 22 and later, Cloudflare Workers, Deno and Bun have every API in both tables.

A package can use an API newer than this baseline if it checks whether the runtime has the API and runs its own code when it doesn't. It must not patch a global to add the API. base64 and bytes use `Uint8Array.prototype.toBase64` and `toHex` this way, streams uses `ReadableStream.from`, timers uses `scheduler.wait`, and queue, rpc, smtp, timers and websockets set `[Symbol.asyncDispose]` or `[Symbol.dispose]` only where the symbol exists (Chrome 134, Firefox 141 and Node 24, but not Safari 26). No package calls Temporal: an option that takes an instant reads `epochMilliseconds`, so it accepts a `Temporal.Instant` in runtimes that have one and a `Date` in Safari, which has no Temporal. Package code doesn't use `for await` over a `ReadableStream`, because the browsers that support it account for only 75.5% of global usage.

## Building

[zile](https://github.com/wevm/zile) builds each package with `tsc` into `dist/`, one ESM file and one declaration file per source file, with no bundling. A package's `package.json` lists each entry point with its source file and its built files:

```json
"exports": {
  ".": {
    "src": "./src/exports/index.ts",
    "types": "./dist/exports/index.d.ts",
    "default": "./dist/exports/index.js"
  }
}
```

zile reads `exports` and builds the `src` files into the `types` and `default` paths. Only the fields after the `"[!start-pkg]"` key are published, so scripts and dev dependencies stay in the repo. Inside the workspace, `customConditions: ["src"]` points TypeScript at source, so nothing needs a build before tests or type checks.

If zile causes problems, removing it takes two steps: commit the `package.json` that `zile publish:prepare` writes, and change the build script to `tsc`.

## Tests

### Projects

`vite.config.ts` defines the Vitest projects and assigns each test file in a package's `test/` directory to projects by its suffix. `test/` is its own private workspace package, so the libraries a package's tests compare against are dev dependencies there and never appear in the published `package.json`. Tests import the package by name, which resolves through its `exports` map to source because `vite.config.ts` and `tsconfig.base.json` add the `src` condition. `pnpm check:types` type-checks them with Node and Vite types through `tsconfig.test.json`.

| Suffix | Runs in | Purpose |
| --- | --- | --- |
| `*.conformance.ts` | Node and browsers | Behavior every runtime must share. Most tests go here. |
| `*.test.ts` | Node | Tests that need only one runtime. |
| `*.browser.test.ts` | Browsers | Browser-only behavior. |
| `*.oracle.test.ts` | Node | Byte-for-byte comparison with the library a package replaces. |
| `*.bench.ts` | Node | Benchmarks against that library. |

The `browser` project uses Vitest browser mode with Playwright and runs Chromium, Firefox and WebKit. Browser mode runs every test file on the page's main thread, so the project also runs `tools/worker/src/conformance.browser.test.ts`, which runs every `*.conformance.ts` file again inside a dedicated module worker. Vitest has no option for this, so `tools/worker/src/worker.ts` sets up the worker state that Vitest's browser tester sets up on the page and runs each file with Vitest's own runner, `expect` and `vi`. One worker collects the test names of every file, and the page declares one test for each, so a failure in the worker is reported as a failed page test with the worker's error. Each file then runs in a fresh worker. An error outside a test, such as an unhandled rejection or a failed hook, fails the file's suite. `-t` filters these tests by their page names, which start with the file path, such as `-t "packages/lines/"`. A worker that sends nothing for 60 s, or for twice the timeout of the test it started if that is longer, fails its file. In WebKit the file first runs once more in a new worker, because WebKit's `ReadableStreamDefaultReader.releaseLock()` can deadlock the thread it runs on (see [papercuts.md](papercuts.md)).

The conformance tests don't run in Workers yet, because `@cloudflare/vitest-pool-workers` supports Vitest 4 and Vite+ ships Vitest 5. Instead, `pnpm test:workers` runs `tools/workers/src/run.ts`, which bundles every entry point of every package into one Worker and runs it in workerd through Miniflare. Loading the bundle fails if a module creates an `AbortController`, sets a timer or generates random values at the top level, because workerd refuses those outside a handler. The Worker's `fetch` handler then runs the checks in `tools/workers/src/checks.ts`. Each check calls one package with input that makes it use its platform APIs, such as `CompressionStream`, `crypto.subtle`, `MessageChannel` and `WebSocketPair`. Miniflare runs workerd without the limits of a deployed Worker, such as the 100,000-iteration cap on PBKDF2.

Test helpers build and read streams by hand instead of using `ReadableStream.from` or `for await` over a stream, because Chromium has no `ReadableStream.from` and Safari before 27 has neither. The missing `ReadableStream.from` made the first browser run of `@portable/lines` fail in Chromium 141.

### Parity with the replaced library

A package that replaces a library solves the same problem, but neither its API nor its implementation has to match. We design it fresh and use the upstream test suite as the list of cases a caller cares about. `test/PARITY.md` maps each upstream test to our test for the same case, or gives the reason it doesn't apply, such as a test of Node stream internals. A test with no row in `PARITY.md` counts as missing. The package also avoids the known bugs and traps we find in the upstream issue tracker, and `PARITY.md` lists each one with the test that shows we handle it. Where two libraries solve the same problem, such as split2 and byline, the package's tests cover both suites.

The oracle tests then feed the same input, split into random chunks, to our package and to the original, and compare the results. A difference is either a bug or a deliberate change that `PARITY.md` explains.

### Fuzzing

Each package has a `test/<name>.fuzz.conformance.ts` with [fast-check](https://fast-check.dev) properties, so the fuzz tests run in Node and browsers with the other conformance tests. Parsers and decoders get random input and mutated copies of real fixtures, and must return or throw only their documented errors. Encoders must round-trip through their decoder, and streams must give the same output however the input is chunked. Packages that keep state, such as queue and rate-limit, have model-based tests: `fc.commands` runs random sequences of calls on the package and on a small model of it, and compares the two after each call. Some packages also have a `test/<name>.fuzz.oracle.test.ts`, which runs only in Node and compares our results with the replaced library's on random and mutated input that both accept. `fuzz()` from the private workspace package `@portable/fuzz` (`tools/fuzz`) runs every property, reading the run count from `FUZZ_RUNS`, which `vite.config.ts` passes to `import.meta.env` through `envPrefix`. The default of 100 runs keeps `pnpm test` fast. `pnpm fuzz` loads `.env.fuzz` with `--mode fuzz`, which sets 10,000, and runs both kinds of fuzz file. `fuzz()` fails a run that takes longer than the `timeout` a property passes, or 2 seconds, the default `timeout` exported by `@portable/fuzz`. fast-check stops waiting for an async run at the limit. A sync run can't be interrupted, so it fails after it returns, and an infinite loop in sync code still hangs the test. When a property fails, fast-check prints its seed and path. To replay the failure, set `FUZZ_SEED` and `FUZZ_PATH` and run that test with `-t`.

### Benchmarks

Each package has a benchmark that runs it against the library it replaces, and against the platform API where one exists. Vitest 5's `bench.compare` runs the candidates in one test, and the test fails if the original library is more than 25% faster:

```ts
const result = await bench.compare(bench('@portable/lines', ...), bench('split2', ...));
expect(result.get('split2')).not.toBeFasterThan(result.get('@portable/lines'), { delta: 0.25 });
```

Run them with `pnpm bench`, which builds every package first and sets `BENCH_DIST=1`. With it set, `vite.config.ts` drops the `src` condition and lets Node load each package's `dist/` directly, because Vitest wraps every call between source modules in a getter, which slowed source benchmarks by up to 2×. The git hooks don't run benchmarks, because timing on a laptop varies too much to block a push.

`scripts/bench.ts` runs one package's benchmarks at a time and waits while the load average is above 4 (`BENCH_MAX_LOAD`), so packages don't compete for the CPU. It saves each package's Vitest JSON report in `.bench/`. `pnpm readme` then measures bundle sizes and writes a benchmark table and a stats table between `<!-- bench:start -->` and `<!-- bench:end -->` in each package README. `scripts/readme-tables.ts` lists the columns (our package, the replaced libraries and a platform API) and maps each row to a benchmark test. `pnpm readme` writes no tables for a package without an entry there, so add one for each new package. The root README's package list, grouped by category, is edited by hand, and `site/scripts/gen.mjs` reads it to build the docs site's home page and sidebar.

## Git hooks

Git hooks run the checks before each commit and push. `pnpm install` installs the hooks through `vp config`. Their scripts are in `.vite-hooks/`, and each one runs the following:

| Hook | Runs |
| --- | --- |
| pre-commit | `vp staged`, which runs `vp check --fix` on staged files |
| pre-push | `pnpm check:types`, then the Node tests affected by changes since `origin/main` (`pnpm test:changed`) |

Browser tests are slower, so you run them on demand (`pnpm test:browser`), and `pnpm changeset:publish` runs them before every release. `git push --no-verify` skips the hooks.

## CI

`.github/workflows/verify.yml` runs on every push to `main` and when someone starts it by hand (`workflow_dispatch`). It runs nine jobs in parallel. `vp check` and `pnpm check:types` run in one job. The Node tests run in two, on Node 24 and Node 26, and the browser tests run in three, in Chromium, Firefox and WebKit. The conformance tests run in two more with Vitest on Bun and on Deno (`pnpm test:bun`, `pnpm test:deno`), and the last job runs `pnpm test:workers` in workerd. The Bun and Deno jobs don't fail the run yet, because of the runtime bugs listed in docs/papercuts.md. A run started by hand with the `fuzz` input also runs `pnpm fuzz` in a tenth job. That job doesn't fail the run either, because each run uses a new seed and can find a bug that no change in the pushed commit caused. Each job has a time limit, so a stalled test run fails within 15 minutes (30 for the fuzz job) instead of running for hours. A page that stops running JavaScript can't fail its own tests, so a watchdog in `vite.config.ts` stops the run when the browser tests report nothing for 4 minutes and lists the test files that were running. `verify.yml` doesn't run on pull requests. When we publish from GitHub Actions instead of from a maintainer's machine, we'll make `verify.yml` a reusable workflow, as ox does, so the release workflow can run the same checks before it publishes.

Two more workflows build the docs site with `pnpm --filter @portable/site build`. `docs.yml` publishes it to GitHub Pages on every push to `main`. `docs-preview.yml` publishes a preview to here.now for a pull request with the `preview` label, and updates it on each later push to that pull request.

The tests that compare the base64 and hex fallbacks with the native API run only where the runtime has `Uint8Array.toBase64` and `fromHex`. Node 26 has them and Node 24 doesn't, so CI tests both versions. CI doesn't test Node 22, because `engines` requires Node 24 and because Node 22's `DecompressionStream` ignores bytes after the end of a compressed stream, which makes `Compress.decode` accept trailing data.

## Releases

[Changesets](https://github.com/changesets/changesets) versions each package on its own, starting at `0.0.0`, and writes changelogs with `@changesets/changelog-github`. The config is copied from ox.

Nothing is published yet, so each package has one changeset, `.changeset/<package>-initial.md`, which describes the package for the first release. A change before then edits that file instead of adding a changeset. A new package adds its own `-initial.md`.

1. `pnpm changeset` records which packages changed and how.
2. `pnpm changeset:version` bumps versions and writes changelogs.
3. `pnpm changeset:publish` builds, runs every test project including the browsers, has zile write each published `package.json`, publishes to npm, and restores the source `package.json` files.

A maintainer publishes releases from their own machine after `npm login`, so packages have no provenance yet. With CI, publishing moves to GitHub Actions with npm trusted publishing (OIDC), which adds provenance and removes the npm token.

We don't publish to JSR. Deno, Bun and Workers all install from npm, and because of `isolatedDeclarations`, adding JSR later needs no code changes.

## Crypto

A package that hashes or signs uses the platform's WebCrypto (`crypto.subtle`) by default, and takes the function as an option so the caller can replace it. `@portable/web-crypto` defines the three option types once, and both `@noble/hashes` and WebCrypto fit them, because each type allows a sync or an async result:

```ts
type Digest = (hash: Hash, data: Uint8Array<ArrayBuffer>) => Uint8Array | Promise<Uint8Array>;
type Hmac = (hash: Hash, key: Uint8Array<ArrayBuffer>, data: Uint8Array<ArrayBuffer>) => Uint8Array | Promise<Uint8Array>;
type Hasher = { update(data: Uint8Array): unknown; digest(): Uint8Array | Promise<Uint8Array> };
```

Each package takes only the one it needs, under an option with the type's name: `@portable/oauth1` takes `hmac` and `digest`, `@portable/webhooks` takes `hmac`, and `@portable/dkim`, `@portable/arc` and `@portable/mail-auth` take `hasher`, a function that takes the hash name and returns a `Hasher`. They re-export the type, so a caller doesn't need to install `@portable/web-crypto`. None of them imports a crypto library or lists one as a dependency, and none has a `/core` entry, because the WebCrypto default imports no library, and a caller who wants another implementation passes it in the option.

WebCrypto is the default because every supported runtime has it and it adds nothing to a bundle. noble's HMAC-SHA256 is about 3.0 kB gzipped in a browser bundle. The cost is speed on Node, where WebCrypto's HMAC-SHA256 of 1 KB is about 4.6× slower than noble's, as the `@portable/web-crypto` benchmark table shows. We expect Node's WebCrypto to get faster. Until then, a README shows the noble version of the option for a caller who verifies or signs many messages on Node, or who needs a sync result.

A package needs noble only where WebCrypto can't do the job, such as an incremental or streaming hash, because `crypto.subtle.digest` takes the whole input at once. A DKIM body hash over a stream is one case. Such a package takes noble as an optional peer dependency or requires the caller to pass the function.

Other libraries made this choice in different ways. `@octokit/webhooks-methods` ships a `node:crypto` build and a WebCrypto build, and its `exports` gives browsers the second. Stripe's `stripe` package has separate builds for the `worker`, `workerd`, `browser`, `deno` and `bun` conditions. jose shipped a Node build and a WebCrypto build behind export conditions, then dropped the Node build and now uses WebCrypto in every runtime. We considered export conditions too, and [decisions.md](decisions.md) says why we use WebCrypto everywhere instead.

## Planned

- `environments/`, from viem: small apps that install the packed packages and run them in Node, Bun, Deno, Workers, a Vite build, and `tsc` under each `module` setting. They catch packaging mistakes such as a wrong `exports` map, which source-level tests miss.
- A Workers test project that runs the conformance tests, once a Vitest 5 pool for workerd exists.
- `size-limit` budgets per entry point, as ox has.
- `publint` and `@arethetypeswrong/cli` on each packed package before publishing.
