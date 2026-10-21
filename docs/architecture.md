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
├─ docs/                   this file, packages.md, decisions.md
├─ .agents/pstack/         agent skills copied from cursor/plugins
├─ .changeset/
├─ .vite-hooks/            git hooks
├─ AGENTS.md               rules for agents and contributors (CLAUDE.md imports it)
├─ vite.config.ts          format, lint, staged-file and test config
├─ tsconfig.base.json
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
- `no-restricted-globals` rejects `Buffer`, `process`, `global`, `require`, `__dirname`, `window`, `document`, `navigator` and `localStorage`.

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
| `AbortSignal.timeout` | dkim, dmarc, dns, mail-auth, rpc, smtp, spf, sse, timers | 96.1% | 103 | 100 | 16 |
| `CompressionStream('deflate-raw')` | compress | 96.0% | 103 | 113 | 16.4 |
| `AbortSignal.any` | dns, queue, rpc, sse | 93.3% | 116 | 124 | 17.4 |
| WebCrypto X25519 | crypto | 90.5% | 133 | 130 | 17 |
| WebCrypto Ed25519 | arc, crypto, dkim | 89.8% | 137 | 129 | 17 |

Chrome 103 to 123 abort an `AbortSignal.timeout` signal with an `AbortError` instead of a `TimeoutError`, so MDN lists full support only from Chrome 124, which lowers the usage share to 92.2%. Node 22 and later, Cloudflare Workers, Deno and Bun have every API in both tables.

A package can use an API newer than this baseline if it checks whether the runtime has the API and runs its own code when it doesn't. It must not patch a global to add the API. base64 and bytes use `Uint8Array.prototype.toBase64` and `toHex` this way, streams uses `ReadableStream.from`, and timers uses `scheduler.wait`. Package code doesn't use `for await` over a `ReadableStream`, because the browsers that support it account for only 75.5% of global usage.

## Building

[zile](https://github.com/wevm/zile) builds each package with `tsc` into `dist/`, one ESM file and one declaration file per source file, with no bundling. A package's `package.json` lists its entry points as source files:

```json
"exports": {
  ".": "./src/index.ts"
}
```

zile reads `exports`, builds those files, and rewrites each entry to `{ "src", "types", "default" }` paths in the published `package.json`. Only the fields after the `"[!start-pkg]"` key are published, so scripts and dev dependencies stay in the repo. Inside the workspace, `customConditions: ["src"]` points TypeScript at source, so nothing needs a build before tests or type checks.

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

The `browser` project uses Vitest browser mode with Playwright and runs Chromium, Firefox and WebKit. We plan a Workers project but haven't set it up, because `@cloudflare/vitest-pool-workers` supports Vitest 4 and Vite+ ships Vitest 5. Until then, the lint rules above are the only check against Node APIs in Workers.

Test helpers build and read streams by hand instead of using `ReadableStream.from` or `for await` over a stream. Chromium 141 has neither, which made the first browser run of `@portable/lines` fail.

### Parity with the replaced library

A package that replaces a library solves the same problem, but neither its API nor its implementation has to match. We design it fresh and use the upstream test suite as the list of cases a caller cares about. `test/PARITY.md` maps each upstream test to our test for the same case, or gives the reason it doesn't apply, such as a test of Node stream internals. A test with no row in `PARITY.md` counts as missing. The package also avoids the known bugs and traps we find in the upstream issue tracker, and `PARITY.md` lists each one with the test that shows we handle it. Where two libraries solve the same problem, such as split2 and byline, the package's tests cover both suites.

The oracle tests then feed the same input, split into random chunks, to our package and to the original, and compare the results. A difference is either a bug or a deliberate change that `PARITY.md` explains.

### Fuzzing

Each package has a `test/<name>.fuzz.conformance.ts` with [fast-check](https://fast-check.dev) properties, so the fuzz tests run in Node and browsers with the other conformance tests. Parsers and decoders get random input and mutated copies of real fixtures, and must return or throw only their documented errors. Encoders must round-trip through their decoder, and streams must give the same output however the input is chunked. `fuzz()` from the private workspace package `@portable/fuzz` (`tools/fuzz`) runs every property, reading the run count from `FUZZ_RUNS`, which `vite.config.ts` passes to `import.meta.env` through `envPrefix`. The default of 100 runs keeps `pnpm test` fast. `pnpm fuzz` loads `.env.fuzz` with `--mode fuzz`, which sets 10,000. When a property fails, fast-check prints its seed and path. To replay the failure, set `FUZZ_SEED` and `FUZZ_PATH` and run that test with `-t`.

### Benchmarks

Each package has a benchmark that runs it against the library it replaces, and against the platform API where one exists. Vitest 5's `bench.compare` runs the candidates in one test, and the test fails if the original library is more than 25% faster:

```ts
const result = await bench.compare(bench('@portable/lines', ...), bench('split2', ...))
expect(result.get('split2')).not.toBeFasterThan(result.get('@portable/lines'), { delta: 0.25 })
```

Run them with `pnpm bench`, which builds every package first and sets `BENCH_DIST=1`. With it set, `vite.config.ts` drops the `src` condition and lets Node load each package's `dist/` directly, because Vitest wraps every call between source modules in a getter, which slowed source benchmarks by up to 2×. The git hooks don't run benchmarks, because timing on a laptop varies too much to block a push.

`scripts/bench.ts` runs one package's benchmarks at a time and waits while the load average is above 4 (`BENCH_MAX_LOAD`), so packages don't compete for the CPU. It saves each package's Vitest JSON report in `.bench/`. `pnpm readme` then measures bundle sizes and writes a benchmark table and a stats table between `<!-- bench:start -->` and `<!-- bench:end -->` in each package README. `scripts/readme-tables.ts` lists the columns (our package, the replaced libraries and a platform API) and maps each row to a benchmark test. `pnpm readme` writes no tables for a package without an entry there, so add one for each new package. The root README's package list, grouped by category, is edited by hand.

## Git hooks

The repo has no CI yet, so git hooks run the checks. `pnpm install` installs them through `vp config`, and the scripts are in `.vite-hooks/`:

| Hook | Runs |
| --- | --- |
| pre-commit | `vp staged`, which runs `vp check --fix` on staged files |
| pre-push | `tsc -b`, then the Node tests affected by changes since `origin/main` (`vitest --changed`) |

Browser tests are slower, so you run them on demand (`pnpm test:browser`), and `pnpm changeset:publish` runs them before every release. `git push --no-verify` skips the hooks.

When we add CI, it will follow ox: a reusable `verify.yml` with the same checks, called by a pull-request workflow and by the release workflow.

## Releases

[Changesets](https://github.com/changesets/changesets) versions each package on its own, starting at `0.0.0`, and writes changelogs with `@changesets/changelog-github`. The config is copied from ox.

1. `pnpm changeset` records which packages changed and how.
2. `pnpm changeset:version` bumps versions and writes changelogs.
3. `pnpm changeset:publish` builds, runs every test project including the browsers, has zile write each published `package.json`, publishes to npm, and restores the source `package.json` files.

A maintainer publishes releases from their own machine after `npm login`, so packages have no provenance yet. With CI, publishing moves to GitHub Actions with npm trusted publishing (OIDC), which adds provenance and removes the npm token.

We don't publish to JSR. Deno, Bun and Workers all install from npm, and because of `isolatedDeclarations`, adding JSR later needs no code changes.

## Crypto

A package that hashes or signs uses the platform's WebCrypto (`crypto.subtle`) by default, and takes the function as an option so the caller can replace it. Both `@noble/hashes` and WebCrypto fit the option's type, sync or async:

```ts
type Hmac = (key: Uint8Array<ArrayBuffer>, data: Uint8Array<ArrayBuffer>) => Uint8Array | Promise<Uint8Array>
type Digest = (algorithm: 'SHA-1' | 'SHA-256', data: Uint8Array<ArrayBuffer>) => Uint8Array | Promise<Uint8Array>
```

`@portable/webhooks` takes `hmac` and `@portable/oauth1` takes `digest`. Neither imports a crypto library or lists one as a dependency, and neither has a `/core` entry: a WebCrypto default imports nothing, so the option alone lets a caller choose.

WebCrypto is the default because every supported runtime has it and it adds nothing to a bundle. noble's HMAC-SHA256 is about 3.0 kB gzipped in a browser bundle. The cost is speed on Node, where WebCrypto's HMAC is about 7× slower than noble's. We expect Node's WebCrypto to get faster. Until then, a README shows the noble version of the option for a caller who verifies or signs many messages on Node, or who needs a sync result.

A package needs noble only where WebCrypto can't do the job, such as an incremental or streaming hash, because `crypto.subtle.digest` takes the whole input at once. A DKIM body hash over a stream is one case. Such a package takes noble as an optional peer dependency or requires the caller to pass the function.

Other libraries made this choice in different ways. `@octokit/webhooks-methods` ships a `node:crypto` build and a WebCrypto build, and its `exports` gives browsers the second. Stripe's `stripe` package has separate builds for the `worker`, `workerd`, `browser`, `deno` and `bun` conditions. jose shipped a Node build and a WebCrypto build behind export conditions, then dropped the Node build and now uses WebCrypto in every runtime. We considered export conditions too, and [decisions.md](decisions.md) says why we use WebCrypto everywhere instead.

## Planned

- `environments/`, from viem: small apps that install the packed packages and run them in Node, Bun, Deno, Workers, a Vite build, and `tsc` under each `module` setting. They catch packaging mistakes such as a wrong `exports` map, which source-level tests miss.
- A Workers test project, once a Vitest 5 pool for workerd exists or we run one ourselves.
- `size-limit` budgets per entry point, as ox has.
- `publint` and `@arethetypeswrong/cli` on each packed package before publishing.
