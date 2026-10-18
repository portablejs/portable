# Papercuts

Friction hit while working in this repo, so it can be fixed or at least not rediscovered. Newest first. Add an entry when something costs you time, and delete it once it's fixed.

| Papercut | Workaround | Possible fix |
| --- | --- | --- |
| Benchmarks fail when several agents run at once: png's decode and lines' split2 comparison each failed under load and passed when re-run. | Re-run the benchmark when the machine is quiet. | Benchmark the built `dist` (planned), and keep benchmarks out of agents' required checks while many run at once. |
| `@types/jsonstream` declares the module `jsonstream`, which doesn't resolve to the `JSONStream` package. | A local `declare module` in `json-stream`'s `src/_test/env.d.ts`. | None. |
| A typed `import.meta.glob` with `eager: true` fails `pnpm check` with TS2353. | Use the lazy loader with top-level `await`. | None. |
| Node's ICU `TextDecoder` decodes Big5, EUC-KR, ISO-2022-JP and Shift_JIS differently from the WHATWG standard. | `charset`'s round-trip tests for those run only in Chromium. Workers and Bun are unverified. | Run them in Workers once that project exists. |
| The Write tool turns `\uXXXX` escapes into literal characters. | Fix the file with a script afterwards. | None. |
| Agents running at the same time share one scratchpad directory. | Use a subdirectory per package. | Put that in the brief. |
| `vp check --fix` (oxfmt) rewrites escapes such as `'\uFEFF'` and `'\u2028'` into the literal characters, and `no-irregular-whitespace` then rejects them. | `String.fromCharCode(0xfeff)`. | Report to oxfmt. |
| Vitest rewrites calls between modules into getter lookups, so a hot function imported from another file isn't inlined. dns-packet decode measures 1.8× slower than on the build, png's filters ran 2× slower, and exif and image-size print warnings. | dns-packet's decode benchmark allows 50%; png keeps hot loops and their helpers in one module. | Benchmark the built `dist`: with tests in `test/` packages, the bench project can drop the `src` condition. Planned with that move. |
| The Write tool's copy of a file goes stale after the formatter rewrites it. | Read the file again before writing. | None. |
| `minimumReleaseAge` refuses a package published less than a day ago, tarball URLs included, so `quoted-printable` couldn't install libqp 3.0.1 for its oracle. | The 3.0.1 source is copied into `packages/quoted-printable/test/fixtures/`. | Swap the copy for `libqp@^3.0.1` once it is a day old (after 2026-10-19). |
| `@types/libqp` describes 1.x, so libqp 2.x's `Uint8Array` inputs fail type checks. | A cast in the oracle test. | None. |
| Two agents pushing to `main` at once: the pre-push hook takes about 30 s, and main often moves during it, so the push is rejected. One agent pushed with `--no-verify`. | Pull with rebase and push again. The brief now forbids `--no-verify`. | Make the pre-push hook faster, or have agents work on branches. |
| The GitHub issue pages of upstream repos render empty through WebFetch, so agents can't always read issue trackers. | Find upstream traps by reading the source and running the library on crafted input. | Allow read access to public repos' issues. |
| Vitest warns about getter overhead when a benchmark reads a module-level table. | None; it only slows our side of the benchmark. | None needed. |
| Chromium 141's streaming `TextDecoder` turns an ASCII byte into U+FFFD when it follows an invalid sequence split across chunks (`f0` \| `d4 be 25`). A random-bytes test in `streams` failed about 1 run in 5. | That test uses random valid UTF-8; `streams` PARITY.md explains why. | None in our code; it's a browser bug. |
| A source that always has a chunk ready keeps the microtask queue busy, so `setTimeout` never fires and Vitest hangs with no timeout. | Add a short delay in such test sources. | None. |
| The GitHub tools in cloud sessions can only read `portablejs/portable`, so agents can't read upstream issue trackers through them. | WebFetch the issue pages. | Add the upstream repos to the session, or accept WebFetch. |
| The worktree guard refuses commands containing `cd … && git`, heredocs, or the word "source". | `git -C <path>`, and the Write tool for files. | None. |
| `vp test bench --run --project node` fails with "No projects matched the filter", although `vp test run --project node` works. | Run `pnpm bench` without `--project`; the browser project sets `benchmark.include: []`. | Report to Vite+. |
| Vitest 5 replaced the `bench()` API: a top-level `bench(name, fn)` throws "bench is not a function". | Write `test(name, async ({ bench }) => bench.compare(...))`, as in `packages/lines/test/LineStream.bench.ts`. | None needed; the template is in `lines`. |
| `@cloudflare/vitest-pool-workers` 0.23 needs Vitest 4, and Vite+ 1.3 ships Vitest 5. | No Workers test project yet (see decisions.md). | Wait for a Vitest 5 release, or run conformance tests in Miniflare with a small script. |
| Chromium 141 has no `ReadableStream.from` and can't `for await` over a `ReadableStream`. All 29 browser tests failed on the first run. | Use `@portable/streams`' `fromIterable` and `toArray` in tests; `lines` still has its own `fromChunks` and `collect` helpers. | Switch `lines` to `@portable/streams`. |
| Playwright 1.64 wants a newer Chromium than the one installed in the cloud dev container (`/opt/pw-browsers`, Chromium 141), and Firefox and WebKit aren't installed there. | Run `PW_CHROMIUM_PATH=/opt/pw-browsers/chromium pnpm test:browser`, which tests only that Chromium. | Install matching browsers with `pnpm exec playwright install` on a machine that allows it. |
| `text.split(separator)` doesn't type-check when `separator` is `string \| { [Symbol.split] }`, because `String.prototype.split` has a separate overload for each. | Branch on `typeof separator === 'string'` and call `split` in each branch. | None. |
| `tsc -b` fails on `vite.config.ts` with TS9037 (default export can't be inferred under `isolatedDeclarations`). | The root `tsconfig.json` includes only `packages/*/src`; `vp check` still type-checks the config. | None needed. |
| byline's `test/CRLF.txt` contains no CR, so its "CRLF spanning two chunks" test can't fail. | `lines` builds the CRLF at the chunk boundary itself. | Could be reported upstream, though byline is unmaintained. |
| Writing a regex containing `\u2028` through a shell heredoc produced the literal character, which ends a line in JavaScript source. The parser reports it as "Unterminated regular expression". | Write such files with an editor or a script that keeps the escape. `no-irregular-whitespace` now also flags the character in strings and templates. | None. |
| The first `git commit` in an empty repo prints "Skipping backup because there's no initial commit yet" from `vp staged`. | Harmless; it only happens once. | None. |

## Fixed

- Heavy tests (png's PngSuite, base64's big data) passed the 5 s default timeout when several agents loaded the machine, which failed pre-push hooks. The timeout is now 30 s.
- Build scripts under `packages/*/scripts/` needed an `oxlint-disable` comment to import `node:*`. `vite.config.ts` now has an override for them.
- Tests couldn't import another workspace package ("Failed to resolve entry for package"), because Vite didn't use the `src` export condition and fell back to an unbuilt `dist/`. `vite.config.ts` now adds `src` to `resolve.conditions` for browsers and Node.
- `pnpm bench` printed no numbers. It now runs with `--reporter=verbose`.
- Binary fixtures with extensions Vite doesn't know (`.tif`, `.heic`, `.pfm`) failed to import with `?inline`, and Node's `fetch` rejects `file:` URLs. Both packages now use `import.meta.glob` with `?url&inline`, and AGENTS.md documents it.
- The pre-push hook ran Node 22 in cloud sessions, because `git push` doesn't put `~/bin` on `PATH`. The hook now puts `~/bin` first when Node is installed there.
- Cloud sessions started with Node 22 and pnpm 10. `.claude/hooks/session-start.sh` now installs Node 24 and pnpm 11 when they're missing, and `.nvmrc` pins Node 24 for local machines.
- Running browser tests in the cloud container needed a temporary edit to `vite.config.ts`. `PW_CHROMIUM_PATH` replaces it.
