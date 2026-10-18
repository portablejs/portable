# Decisions

Calls made without the owner's input, with the options considered and the reason for the choice. Newest first. Change any of them by replying in the project thread or editing this file.

## Workers tests are not set up yet

- **Options:** `@cloudflare/vitest-pool-workers` in its own workspace package pinned to Vitest 4; a custom script that bundles the conformance tests and runs them in Miniflare; wait.
- **Trade-offs:** the pool-workers package supports only Vitest 4, and Vite+ ships Vitest 5, so the first option means two Vitest versions in one repo. A custom runner is more code to maintain.
- **Chosen:** wait, and rely on the lint rules that reject Node APIs. Revisit when pool-workers supports Vitest 5 or when a package depends on a Workers-specific behavior.

## `maxLength` in `@portable/lines` applies to every line

- **Options:** copy split2, which only checks the unfinished line at the end of each chunk; check every line.
- **Trade-offs:** copying split2 makes the oracle tests match in every case, but then whether a long line is caught depends on chunk boundaries, which the caller doesn't control.
- **Chosen:** check every line. The difference is documented in the README and `PARITY.md`, and the oracle test leaves out `maxLength`.

## No mapper argument in `LineStream`

- **Options:** keep split2's `split2(mapper)`; leave mapping to another `TransformStream`.
- **Trade-offs:** a mapper is shorter to write, but it is a second job inside a package meant for one, and `@portable/streams` will have `map()`.
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
- **Trade-offs:** `LineStream` is about 8% slower than split2 on Node, mostly because Web Streams cost more per chunk than Node streams. Requiring a win would block a correct package on Node-specific overhead.
- **Chosen:** a 25% margin, which still catches real regressions. Benchmarks are not in the git hooks, because timing on a laptop is noisy.

## TypeScript 6, not 7

- **Options:** TypeScript 7 (the Go port, now `latest`); TypeScript 6.
- **Trade-offs:** zile and other tools call TypeScript's JavaScript API, which TypeScript 7 doesn't have. arktype keeps TypeScript 6 around for the same reason.
- **Chosen:** 6.0.3 for `tsc` and zile. `vp check` already type-checks with the Go toolchain through tsgolint.

## Open questions from the package plan

- **Umbrella `portable` package:** not claimed yet. It needs an npm publish from the owner's account, and nothing depends on it until several packages exist.
- **content-disposition and cookie-signature:** point to `@remix-run/headers` and `@remix-run/cookie` instead of building them. Both are maintained, dependency-free and web-standard.
- **Package names:** `mime-headers` and `mime-stream`. MIME is the format they handle, and the same code applies to non-mail MIME such as `multipart/related`.
- **`@portable/dns`:** yes, as a separate package from `dns-packet`, because SPF and DMARC need a resolver and `dns-packet` users don't.
- **License:** MIT, the same as almost every library we replace.

## Agent skills live in `.agents/pstack/`

- **Options:** `.claude/pstack/` (the first instruction); `.agents/pstack/` (the follow-up).
- **Chosen:** `.agents/pstack/` holds the copies. `.claude/skills/<name>` and `.agents/skills/<name>` are symlinks, so Claude Code and agents that read `.agents/skills` both find them. AGENTS.md is the guide, and CLAUDE.md imports it with `@AGENTS.md`.
