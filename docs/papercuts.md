# Papercuts

Friction hit while working in this repo, so it can be fixed or at least not rediscovered. Newest first. Add an entry when something costs you time, and delete it once it's fixed.

| Papercut | Workaround | Possible fix |
| --- | --- | --- |
| `vp test bench --run --project node` fails with "No projects matched the filter", although `vp test run --project node` works. | Run `pnpm bench` without `--project`; the browser project sets `benchmark.include: []`. | Report to Vite+. |
| Vitest 5 replaced the `bench()` API: a top-level `bench(name, fn)` throws "bench is not a function". | Write `test(name, async ({ bench }) => bench.compare(...))`, as in `packages/lines/src/_test/LineStream.bench.ts`. | None needed; the template is in `lines`. |
| `@cloudflare/vitest-pool-workers` 0.23 needs Vitest 4, and Vite+ 1.3 ships Vitest 5. | No Workers test project yet (see decisions.md). | Wait for a Vitest 5 release, or run conformance tests in Miniflare with a small script. |
| Chromium 141 has no `ReadableStream.from` and can't `for await` over a `ReadableStream`. All 29 browser tests failed on the first run. | Build and drain streams with the `fromChunks` and `collect` helpers in `packages/lines/src/_test/utils.ts`. | `@portable/streams` will export these, and tests can switch to it. |
| Playwright 1.64 wants a newer Chromium than the one installed in the cloud dev container (`/opt/pw-browsers`, Chromium 141), and Firefox and WebKit aren't installed there. | Temporarily set `executablePath: '/opt/pw-browsers/chromium'` and only the Chromium instance in `vite.config.ts`. Don't commit it. | Install matching browsers with `pnpm exec playwright install` on a machine that allows it. |
| The cloud dev container has Node 22, and the repo needs Node 24. | `npm i node@24` in a scratch folder and put its binary first on `PATH`. | Set the container's Node version in its setup script. |
| `text.split(separator)` doesn't type-check when `separator` is `string \| { [Symbol.split] }`, because `String.prototype.split` has a separate overload for each. | Branch on `typeof separator === 'string'` and call `split` in each branch. | None. |
| `tsc -b` fails on `vite.config.ts` with TS9037 (default export can't be inferred under `isolatedDeclarations`). | The root `tsconfig.json` includes only `packages/*/src`; `vp check` still type-checks the config. | None needed. |
| byline's `test/CRLF.txt` contains no CR, so its "CRLF spanning two chunks" test can't fail. | `lines` builds the CRLF at the chunk boundary itself. | Could be reported upstream, though byline is unmaintained. |
| Writing a regex containing ` ` through a shell heredoc produced the literal character, which ends a line in JavaScript source and broke parsing. | Write such files with an editor or a script that keeps the escape. | An oxlint rule against literal U+2028/U+2029 in source. |
| The first `git commit` in an empty repo prints "Skipping backup because there's no initial commit yet" from `vp staged`. | Harmless; it only happens once. | None. |
