# portable agent guide

Portable is a monorepo of small npm packages that run unchanged in browsers, Cloudflare Workers, Deno, Bun and Node. Read [docs/architecture.md](docs/architecture.md) for how the repo is built, tested and released, and [docs/packages.md](docs/packages.md) for the package plan. Decisions made without the owner are logged in [docs/decisions.md](docs/decisions.md); add an entry when you make one.

## Commands

| Command | What it does |
| --- | --- |
| `pnpm check` | Format with oxfmt, lint with oxlint, and type-check, fixing what it can (`vp check --fix`). |
| `pnpm check:types` | `tsc -b` over every package. |
| `pnpm test` | All test projects: Node and browsers. |
| `pnpm test:changed` | Node tests affected by changes since `origin/main`. The pre-push hook runs this. |
| `pnpm bench` | Benchmarks (`*.bench.ts`), comparing each package with the library it replaces. |
| `pnpm build` | Builds every package with zile into `dist/`. |
| `pnpm changeset` | Records a version bump and changelog entry for the packages you changed. |

Git hooks live in `.vite-hooks/` and are installed by `pnpm install`. The pre-commit hook formats and lints staged files. The pre-push hook type-checks and runs the affected tests. There is no CI yet.

## Package rules

- Use only the WinterTC common API: `fetch`, `Request`/`Response`, Web Streams, `TextEncoder`/`TextDecoder`, `Uint8Array`, `crypto.subtle`. No `node:*` imports, `Buffer`, `process` or DOM globals. Lint enforces this outside `*.oracle.test.ts` and `*.bench.ts`.
- Don't rely on `ReadableStream.from` or `for await` over a `ReadableStream` in package code. Some browsers we support don't have them yet.
- No runtime dependencies outside `@portable/*`. Crypto comes from an optional peer (`@noble/hashes`) or WebCrypto, and the caller can replace it.
- Streaming transforms are `TransformStream` subclasses, used as `stream.pipeThrough(new LineStream())`.
- `package.json` `exports` point at `./src/*.ts`. zile rewrites them to `dist/` when building and publishing. Fields after `"[!start-pkg]"` are the published package.
- A package exports a small API. Keep helpers private unless a caller needs them.

## Code style

These follow [wevm/ox](https://github.com/wevm/ox/blob/main/AGENTS.md).

- `type` over `interface`. `readonly T[]` in types. No enums.
- Options objects are `options: Options = {}` and are typed in a `declare namespace` named after the function or class (`LineStream.Options`).
- With `exactOptionalPropertyTypes`, write optional properties as `foo?: T | undefined`.
- Relative imports end in `.js`.
- Classes only for errors and for subclasses of platform types. Error `name`s are namespaced, like `'LineStream.OverflowError'`.
- Public exports have JSDoc with an `@example`. Other comments are rare: write one only when the code can't say why, and run the `no-comments` skill before you finish a change.

## Tests

- Tests live in `src/_test/`. `*.conformance.ts` runs in Node and in browsers, so put tests there unless they need one runtime. `*.oracle.test.ts` runs only in Node and compares output with the library being replaced. `*.bench.ts` holds benchmarks.
- When a package replaces a library, port that library's whole test suite and record each upstream test in `src/_test/PARITY.md`, either with the test that covers it or the reason it was skipped.
- Assert what a caller can observe. Read the `principle-test-behavior-not-implementation` skill before writing tests.

## Writing

Read the `technical-writing` and `unslop` skills (in `.agents/pstack/skills/`) before you write docs, READMEs, code comments, JSDoc, commit messages, or PR titles and bodies. These rules apply to all of them.

- Write the way you'd explain it to another engineer: plain, specific, and with the reason.
- Use the name that already exists: the symbol in the code, or a standard term a reader knows without looking it up (compare-and-swap, idempotent). Don't paraphrase a known idea in a long clause, and don't swap detail for jargon either.
- Prefer the short phrase: "a missing blob", not "a blob that the bucket does not hold".
- Use literal verbs. "Is accepted" or "is stored", never "lands", "rides along" or "stands on".
- Say what the code does with a thing. "Stores" or "references", not a vague "names".
- Don't write rules as slogans ("a write lands only on the version it saw"). Name the mechanism.
- No "X. So Y. So Z." chains. Vary sentence length, and keep a cause and its effect in one sentence when they belong together.
- No AI vocabulary (delve, crucial, leverage), no "not just X but Y", no forced groups of three, no em dashes, no filler or hedging, and no clipped fragments with arrows.

| Before | After |
| --- | --- |
| A write lands only when each slot it changes still holds the version it saw. | A write is accepted only if every slot it changes is still at the version the writer read. |
| Each text that parses as a key builds back to the same text. | Every key parses back to the same string, so every stored object can be read back. ("Keys round-trip" goes too far, because it drops the detail.) |
| Stored data never names a blob that the bucket does not hold. | Data never references a missing blob. |
| Every key names its scheme. | Each key stores its signature algorithm. |
| Bare imports such as `@noble/hashes` are resolved through the package's `package.json` dependencies; this should be confirmed in a spike with the first crypto package. | We haven't checked yet how JSR resolves `@noble/hashes`. Check it when the first crypto package is published. |
| Purpose-sized, not function-sized. | A package solves one problem a developer would name, such as splitting a stream into lines. |
| The cheapest way to get byte-exact compatibility, and it doubles as the migration guide's evidence. | Comparing our output with the original library's catches any difference in bytes, and the passing tests show users the migration is safe. |

Add a row when you fix a sentence in this repo that broke one of these rules.
