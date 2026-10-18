# Papercuts

Friction hit while working in this repo, so it can be fixed or at least not rediscovered. Newest first. Add an entry when something costs you time, and delete it once it's fixed.

| Papercut | Workaround | Possible fix |
| --- | --- | --- |
| Chromium 141's streaming `TextDecoder` turns an ASCII byte into U+FFFD when it follows an invalid sequence split across chunks (`f0` \| `d4 be 25`). A random-bytes test in `streams` failed about 1 run in 5. | That test uses random valid UTF-8; `streams` PARITY.md explains why. | None in our code; it's a browser bug. |
| A source that always has a chunk ready keeps the microtask queue busy, so `setTimeout` never fires and Vitest hangs with no timeout. | Add a short delay in such test sources. | None. |
| The GitHub tools in cloud sessions can only read `portablejs/portable`, so agents can't read upstream issue trackers through them. | WebFetch the issue pages. | Add the upstream repos to the session, or accept WebFetch. |
| The worktree guard refuses commands containing `cd … && git`, heredocs, or the word "source". | `git -C <path>`, and the Write tool for files. | None. |
| `vp test bench --run --project node` fails with "No projects matched the filter", although `vp test run --project node` works. | Run `pnpm bench` without `--project`; the browser project sets `benchmark.include: []`. | Report to Vite+. |
| Vitest 5 replaced the `bench()` API: a top-level `bench(name, fn)` throws "bench is not a function". | Write `test(name, async ({ bench }) => bench.compare(...))`, as in `packages/lines/src/_test/LineStream.bench.ts`. | None needed; the template is in `lines`. |
| `@cloudflare/vitest-pool-workers` 0.23 needs Vitest 4, and Vite+ 1.3 ships Vitest 5. | No Workers test project yet (see decisions.md). | Wait for a Vitest 5 release, or run conformance tests in Miniflare with a small script. |
| Chromium 141 has no `ReadableStream.from` and can't `for await` over a `ReadableStream`. All 29 browser tests failed on the first run. | Build and drain streams with the `fromChunks` and `collect` helpers in `packages/lines/src/_test/utils.ts`. | `@portable/streams` will export these, and tests can switch to it. |
| Playwright 1.64 wants a newer Chromium than the one installed in the cloud dev container (`/opt/pw-browsers`, Chromium 141), and Firefox and WebKit aren't installed there. | Run `PW_CHROMIUM_PATH=/opt/pw-browsers/chromium pnpm test:browser`, which tests only that Chromium. | Install matching browsers with `pnpm exec playwright install` on a machine that allows it. |
| `text.split(separator)` doesn't type-check when `separator` is `string \| { [Symbol.split] }`, because `String.prototype.split` has a separate overload for each. | Branch on `typeof separator === 'string'` and call `split` in each branch. | None. |
| `tsc -b` fails on `vite.config.ts` with TS9037 (default export can't be inferred under `isolatedDeclarations`). | The root `tsconfig.json` includes only `packages/*/src`; `vp check` still type-checks the config. | None needed. |
| byline's `test/CRLF.txt` contains no CR, so its "CRLF spanning two chunks" test can't fail. | `lines` builds the CRLF at the chunk boundary itself. | Could be reported upstream, though byline is unmaintained. |
| Writing a regex containing `\u2028` through a shell heredoc produced the literal character, which ends a line in JavaScript source. The parser reports it as "Unterminated regular expression". | Write such files with an editor or a script that keeps the escape. `no-irregular-whitespace` now also flags the character in strings and templates. | None. |
| The first `git commit` in an empty repo prints "Skipping backup because there's no initial commit yet" from `vp staged`. | Harmless; it only happens once. | None. |

## Fixed

- The pre-push hook ran Node 22 in cloud sessions, because `git push` doesn't put `~/bin` on `PATH`. The hook now puts `~/bin` first when Node is installed there.
- Cloud sessions started with Node 22 and pnpm 10. `.claude/hooks/session-start.sh` now installs Node 24 and pnpm 11 when they're missing, and `.nvmrc` pins Node 24 for local machines.
- Running browser tests in the cloud container needed a temporary edit to `vite.config.ts`. `PW_CHROMIUM_PATH` replaces it.
