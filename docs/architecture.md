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

`lib` is `ES2023`, `DOM` and `DOM.Iterable`, because TypeScript has no WinterTC library and declares `fetch`, Web Streams and `crypto.subtle` in its DOM library. `types` is empty, so `@types/node` never applies to package code.

oxlint rejects what the types allow but the runtimes don't share:

- `no-restricted-imports` rejects `node:*` and the bare Node built-in names.
- `no-restricted-globals` rejects `Buffer`, `process`, `global`, `require`, `__dirname`, `window`, `document`, `navigator` and `localStorage`.

Both rules are off for `*.oracle.test.ts` and `*.bench.ts`, which run in Node to compare against Node libraries.

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

The `browser` project uses Vitest browser mode with Playwright and runs Chromium, Firefox and WebKit. Browser mode runs every test file on the page's main thread, so the project also runs `tools/worker/src/conformance.browser.test.ts`, which runs every `*.conformance.ts` file again inside a dedicated module worker. Vitest has no option for this, so `tools/worker/src/worker.ts` sets up the worker state that Vitest's browser tester sets up on the page and runs each file with Vitest's own runner, `expect` and `vi`. One worker collects the test names of every file, and the page declares one test for each, so a failure in the worker is reported as a failed page test with the worker's error. Each file then runs in a fresh worker. An error outside a test, such as an unhandled rejection or a failed hook, fails the file's suite. `-t` filters these tests by their page names, which start with the file path, such as `-t "packages/lines/"`.

We plan a Workers project but haven't set it up, because `@cloudflare/vitest-pool-workers` supports Vitest 4 and Vite+ ships Vitest 5. Until then, the lint rules above are the only check against Node APIs in Workers.

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

Git hooks run the checks before each commit and push. `pnpm install` installs the hooks through `vp config`. Their scripts are in `.vite-hooks/`, and each one runs the following:

| Hook | Runs |
| --- | --- |
| pre-commit | `vp staged`, which runs `vp check --fix` on staged files |
| pre-push | `tsc -b`, then the Node tests affected by changes since `origin/main` (`vitest --changed`) |

Browser tests are slower, so you run them on demand (`pnpm test:browser`), and `pnpm changeset:publish` runs them before every release. `git push --no-verify` skips the hooks.

## CI

`.github/workflows/verify.yml` runs on every push to `main` and when someone starts it by hand (`workflow_dispatch`). It runs six jobs in parallel: one runs `vp check` and `tsc -b`, two run the Node tests on Node 24 and on Node 26, and three run the browser tests, one each in Chromium, Firefox and WebKit. Each job has a time limit, so a stalled test run fails within 15 minutes instead of running for hours. CI doesn't run on pull requests. When we publish from GitHub Actions instead of from a maintainer's machine, we'll make `verify.yml` a reusable workflow, as ox does, so the release workflow can run the same checks before it publishes.

The tests that compare the base64 and hex fallbacks with the native API run only where the runtime has `Uint8Array.toBase64` and `fromHex`. Node 26 has them and Node 24 doesn't, so CI tests both versions. CI doesn't test Node 22, because `engines` requires Node 24 and because Node 22's `DecompressionStream` ignores bytes after the end of a compressed stream, which makes `Compress.decode` accept trailing data.

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
