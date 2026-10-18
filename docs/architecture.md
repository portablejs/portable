# portable architecture

Portable is a pnpm monorepo of small packages, published to npm under `@portable/*`. Every package runs unchanged in browsers, Cloudflare Workers, Deno, Bun and Node 24 or later, because it uses only the WinterTC common API. [packages.md](packages.md) lists the packages and the rules for what becomes one. This document covers how the repository is built, tested and released.

Most of the setup is copied from [wevm/ox](https://github.com/wevm/ox), which is also a web-standard TypeScript library with multi-runtime tests. A few pieces come from [wevm/viem](https://github.com/wevm/viem) and [arktypeio/arktype](https://github.com/arktypeio/arktype). Each section says where its setup came from.

## Layout

```
portable/
├─ packages/<name>/
│  ├─ src/                 source, published as is
│  │  └─ _test/            tests, benchmarks, fixtures and PARITY.md (not published)
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

`tsconfig.base.json` is ox's strict config (`strict`, `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`, `verbatimModuleSyntax`) plus `isolatedDeclarations`. The last one requires explicit types on every export. That keeps the public API deliberate, and JSR requires it, so publishing to JSR later needs no code changes. `importHelpers` is on with no `tslib` installed, so the build fails if TypeScript ever needs a helper.

`lib` is `ES2023`, `DOM` and `DOM.Iterable`, because TypeScript has no WinterTC library and DOM is where `fetch`, Web Streams and `crypto.subtle` are typed. `types` is empty, so `@types/node` never applies to package code.

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

If zile gets in the way, removing it takes two steps: commit the `package.json` that `zile publish:prepare` writes, and change the build script to `tsc`.

## Tests

### Projects

`vite.config.ts` defines the Vitest projects. Test files sit in each package's `src/_test/` and their suffix decides where they run:

| Suffix | Runs in | Purpose |
| --- | --- | --- |
| `*.conformance.ts` | Node and browsers | Behavior every runtime must share. Most tests go here. |
| `*.test.ts` | Node | Tests that need only one runtime. |
| `*.browser.test.ts` | Browsers | Browser-only behavior. |
| `*.oracle.test.ts` | Node | Byte-for-byte comparison with the library a package replaces. |
| `*.bench.ts` | Node | Benchmarks against that library. |

The `browser` project uses Vitest browser mode with Playwright and runs Chromium, Firefox and WebKit. A Workers project is planned but not set up, because `@cloudflare/vitest-pool-workers` supports Vitest 4 and Vite+ ships Vitest 5. Until then, the lint rules above are the only check against Node APIs in Workers.

Test helpers build and read streams by hand instead of using `ReadableStream.from` or `for await` over a stream. Chromium 141 has neither, and `@portable/lines` found that out on its first browser run.

### Parity with the replaced library

A package that replaces a library solves the same problem, but neither its API nor its implementation has to match. It is designed fresh, and the upstream test suite is used as the list of cases a caller cares about. `src/_test/PARITY.md` maps each upstream test to our test for the same case, or gives the reason it doesn't apply, such as a test of Node stream internals. A test with no row in `PARITY.md` counts as missing. Where two libraries cover the same ground, such as split2 and byline, the package covers both suites.

The oracle tests then feed the same input, split into random chunks, to our package and to the original, and compare the results. A difference is either a bug or a deliberate change that `PARITY.md` explains.

### Benchmarks

Each package has a benchmark that runs it against the library it replaces, and against the platform API where one exists. Vitest 5's `bench.compare` runs the candidates in one test, and the test fails if the original library is more than 25% faster:

```ts
const result = await bench.compare(bench('@portable/lines', ...), bench('split2', ...))
expect(result.get('split2')).not.toBeFasterThan(result.get('@portable/lines'), { delta: 0.25 })
```

Run them with `pnpm bench`. They are not part of the git hooks, because timing on a laptop varies too much to block a push.

## Git hooks

There is no CI yet, so checks run in git hooks. `pnpm install` installs them through `vp config`, and the scripts are in `.vite-hooks/`:

| Hook | Runs |
| --- | --- |
| pre-commit | `vp staged`, which runs `vp check --fix` on staged files |
| pre-push | `tsc -b`, then the Node tests affected by changes since `origin/main` (`vitest --changed`) |

Browser tests are slower and run on demand (`pnpm test:browser`) and before every release. `git push --no-verify` skips the hooks.

When CI is added, it will follow ox: a reusable `verify.yml` with the same checks, called by a pull-request workflow and by the release workflow.

## Releases

[Changesets](https://github.com/changesets/changesets) versions each package on its own, starting at `0.0.0`, and writes changelogs with `@changesets/changelog-github`. The config is copied from ox.

1. `pnpm changeset` records which packages changed and how.
2. `pnpm changeset:version` bumps versions and writes changelogs.
3. `pnpm changeset:publish` builds, runs every test project including the browsers, has zile write each published `package.json`, publishes to npm, and restores the source `package.json` files.

Releases run from a maintainer's machine with `npm login`, so packages have no provenance yet. With CI, publishing moves to GitHub Actions with npm trusted publishing (OIDC), which adds provenance and removes the npm token.

JSR is not used. Deno, Bun and Workers all install from npm, and `isolatedDeclarations` keeps the code ready if JSR becomes worth adding.

## Crypto

Packages that hash or sign never import a crypto library directly. Each declares the function it needs as a type that `@noble/hashes` and WebCrypto already satisfy:

```ts
type HashFn = (data: Uint8Array) => Uint8Array
type AsyncSignFn = (data: Uint8Array) => Promise<Uint8Array>
```

The root entry passes a default, noble for hashes and HMAC (sync and incremental) or WebCrypto for RSA (async), and a `/core` entry exports the same API with the function required and no default import. Each default is its own module-level binding. ox measured that grouping defaults into one object grew a keccak-only bundle from 3.8 kB to 8.8 kB gzipped, because bundlers can't remove unused properties from an object.

## Planned

- `environments/`, from viem: small apps that install the packed packages and run them in Node, Bun, Deno, Workers, a Vite build, and `tsc` under each `module` setting. They catch packaging mistakes such as a wrong `exports` map, which source-level tests miss.
- A Workers test project, once a Vitest 5 pool for workerd exists or we run one ourselves.
- `size-limit` budgets per entry point, as ox has.
- `publint` and `@arethetypeswrong/cli` on each packed package before publishing.
