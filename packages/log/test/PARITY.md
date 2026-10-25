# Test parity

Upstream suites: [debug 4.4.3 `test.js`](https://github.com/debug-js/debug/blob/master/test.js) and [`test.node.js`](https://github.com/debug-js/debug/blob/master/test.node.js). Every test is listed below with the test that covers the same case, written as `describe > test` from `log.conformance.ts`. `log.oracle.test.ts` compares which namespaces are enabled with debug's `enabled()` and compares `Log.format` with Node's `util.format`.

## `test.js`

| Upstream test | Our test |
| --- | --- |
| passes a basic sanity check | `loggers > methods work when detached from the logger` |
| allows namespaces to be a non-string value | Doesn't apply. `enable` takes a string, and TypeScript rejects `enable(true)`. |
| honors global debug namespace enable calls | `patterns > a matching pattern enables every level`, `patterns match as in debug` (oracle) |
| uses custom log function | `subscribe` and `console > Log.console writes a changed record`. To replace the output, call `configure({ console: false })` and `subscribe` instead of setting `log.log`. |
| extend namespace > should extend namespace | `loggers > extend appends to the namespace with a colon` |
| extend namespace > should extend namespace with custom delimiter | Not built. `extend` always joins with `:`, and `create('foo--bar')` makes the same namespace. |
| extend namespace > should extend namespace with empty delimiter | Not built, as above. |
| extend namespace > should keep the log function between extensions | Doesn't apply. Loggers have no `log` property, and every logger writes through the same console and subscribers. |
| rebuild namespaces string (disable) > handle names, skips, and wildcards | `disable > returns the previous patterns, which enable restores` |
| rebuild namespaces string (disable) > handles empty | `disable > returns the previous patterns, which enable restores` checks the round trip, and `patterns > with no patterns, warn and error log` checks `''`. |
| rebuild namespaces string (disable) > handles all | `patterns > an exclusion turns off every level, even when another pattern matches` uses `*` |
| rebuild namespaces string (disable) > handles skip all | `disable > turns off warnings and errors too` |
| rebuild namespaces string (disable) > names+skips same with new string | `disable > returns the previous patterns, which enable restores` |
| rebuild namespaces string (disable) > handles re-enabling existing instances | `loggers > isEnabled follows later enable calls` |

## `test.node.js`

| Upstream test | Our test |
| --- | --- |
| formatting options > calls util.formatWithOptions | Doesn't apply. Output goes to `console`, which formats the arguments itself. `format matches util.format` (oracle) covers `Log.format`. |
| formatting options > calls util.formatWithOptions with inspectOpts | Not built. There are no `DEBUG_*` inspect options, because `console` formats the values. |

## Known upstream issues

| Issue | How we handle it | Test |
| --- | --- | --- |
| debug reads `localStorage.debug` once, when the module loads, so a change needs a reload. | A `storage` event applies a change from another tab at once, and the package checks `localStorage.debug` every second to apply a change made in the same tab. | `picks up a change made in the same tab within a second, without a reload` and `picks up a change from another tab at once, through the storage event` in `live.browser.test.ts` |
| debug writes to `console.debug` in browsers, which Chrome hides unless the Verbose level is on. | `debug` and `info` calls go to `console.log` and `console.info`. | `console > uses the method for the level and colors the namespace with %c` |
| debug's Node build imports `tty` and `util`, which breaks in Cloudflare Workers and in bundlers that ignore the `browser` field. | One build that uses only `console` and `setInterval`, plus `localStorage`, `process.env`, and `import.meta.env` when they exist. | Lint forbids `node:*` imports in `src/`. |
| debug's `+Nms` suffix shows the time since the previous call of the same namespace, which doesn't help when reading logs from several processes. | No suffix. `time: true` prefixes an ISO 8601 timestamp. | `console > time prefixes an ISO 8601 timestamp` |
| debug writes everything to stderr in Node, so you can't separate levels by stream. | Each level writes with its own `console` method, so `warn` and `error` go to stderr and `debug` and `info` go to stdout in Node. | `console > uses the method for the level and colors the namespace with %c` |
| debug's color is picked from a fixed list of 6 colors (76 with `supports-color`), so namespaces often share one. | A hue from 0 to 359 picked from a hash of the namespace. | None. The color is not checked beyond its CSS. |
| debug accepts any `DEBUG` value because it has no levels. Our patterns can contain an unknown level, such as `app=trace`. | `enable` throws a `RangeError`. At startup an invalid `DEBUG` or `localStorage.debug` value is ignored, as if no patterns were set. A later invalid change to `localStorage.debug` is ignored, and the previous patterns stay. | `patterns > an unknown level throws a RangeError and keeps the previous patterns`, `ignores an invalid value until it is fixed` in `live.browser.test.ts` |

## Deliberate differences

- Loggers are objects with `debug`, `info`, `warn`, and `error` methods. A debug logger is a function.
- `warn` and `error` calls print with no patterns set. Exclude a namespace with `-name` to silence them.
- `isEnabled(level)` is a method. debug's `enabled` is a writable property that overrides the patterns for one logger.
- `disable()` also silences warnings and errors, since it applies `-*`.
- `%o` and `%O` format as JSON in `Log.format`, not with `util.inspect`, because the package doesn't import `node:util`. `console` output is formatted by the runtime, which uses `util.inspect` in Node.
