# Test parity

Upstream suites: [p-retry 8.0.1 `test.js`](https://github.com/sindresorhus/p-retry/blob/main/test.js), [async-retry 1.3.3 `test/index.js`](https://github.com/vercel/async-retry/blob/master/test/index.js), [delay 7.0.0 `test.js`](https://github.com/sindresorhus/delay/blob/main/test.js), [p-wait-for 7.0.0 `test.js`](https://github.com/sindresorhus/p-wait-for/blob/main/test.js), the `lodash.debounce`, `lodash.throttle` and `lodash.debounce and lodash.throttle` modules of [lodash 4.17.21 `test/test.js`](https://github.com/lodash/lodash/blob/4.17.21/test/test.js), [throttle-debounce 5.0.2 `test/index.js`](https://github.com/niksy/throttle-debounce/blob/master/test/index.js) and [p-debounce 6.0.0 `test.js`](https://github.com/sindresorhus/p-debounce/blob/main/test.js). All are MIT. No fixtures were copied.

Our tests run under Vitest fake timers in Node and Chromium, so they check exact waits instead of the upstream suites' real-time margins. Test names below are `file > describe > test`, with files shortened to `sleep`, `retry`, `poll`, `listeners`, `debounce`, `throttle` and `oracle`. Each test in `debounce > lodash debounce and throttle` runs once for `debounce` and once for `throttle`, and its name starts with the function's name.

## p-retry

| Upstream test | Covered by | Notes |
| --- | --- | --- |
| retries | `retry > attempts > retries until fn succeeds and resolves with its value` | |
| retries forever when specified | `retry > attempts > retries forever with attempts: Infinity` | |
| throws useful error message when non-error is thrown | `retry > attempts > rethrows a non-Error value unchanged` | Deliberate difference: p-retry wraps it in a `TypeError`. |
| no retry on TypeError | `retry > attempts > retries a TypeError` | Deliberate difference. See known issues. |
| shouldRetry is not called for non-network TypeError | `retry > attempts > retries a TypeError` | Same difference. |
| async shouldRetry respects maxRetryTime after callback | `retry > signal > stops during an async retryIf` | No `maxRetryTime`. A caller `signal` limits the whole call. |
| does not retry non-network TypeError when shouldConsumeRetry returns false | skipped | No `shouldConsumeRetry`, and TypeErrors are retried. |
| throws on invalid callback options | skipped | The option types reject a non-function. |
| retry on TypeError - failed to fetch | `retry > attempts > resolves with a Response from fetch-like code` | |
| errors are preserved when maxRetryTime exceeded | `retry > signal > limits total time with a caller signal` | Deliberate difference: a timeout signal rejects with its `TimeoutError`, as `fetch` does. |
| AbortError - string | skipped | No `AbortError` class. `retryIf` returns `false` instead. |
| AbortError - error | skipped | Same. |
| aborts | `retry > retryIf > stops retrying when it returns false and throws that error` | |
| operation stops immediately on AbortError | `retry > retryIf > stops retrying when it returns false and throws that error` | |
| shouldRetry is not called for AbortError | skipped | No `AbortError`. |
| AbortError short-circuits callbacks | skipped | No `AbortError`. |
| aborts with an AbortSignal (commented out upstream) | `retry > signal > rejects with signal.reason when aborted while an attempt is pending` | Upstream disabled it because AVA lacks `DOMException`. |
| preserves the abort reason | `retry > signal > preserves the abort reason when fn aborts on attempt 3` | |
| shouldRetry controls retry behavior | `retry > retryIf > stops retrying when it returns false and throws that error` | |
| shouldConsumeRetry then onFailedAttempt then shouldRetry order | skipped | Only `retryIf` and a `delay` function are called, so there is no callback order to keep. |
| handles async shouldRetry with maxRetryTime | `retry > retryIf > can be async, and the next attempt waits for it` | |
| onFailedAttempt provides correct error details | `retry > retryIf > receives each error and the number of the attempt that threw it` | |
| onFailedAttempt is called even when shouldRetry returns false | `onRetry > is not called when retryIf stops the retries` | Deliberate difference: `onRetry` runs only before a retry. |
| onFailedAttempt can return a promise to add a delay | `retry > retryIf > can be async, and the next attempt waits for it` | |
| onFailedAttempt can throw to abort retries | `retry > retryIf > rejects with the error it throws` | |
| retry context object is immutable | skipped | `retryIf` gets the error and a new `{ attempt }` object on each call, so there is no shared context to mutate. |
| onFailedAttempt can be undefined | `retry` tests without `onRetry` | |
| shouldRetry can be undefined | `retry > retryIf > can be undefined` | |
| factor affects exponential backoff | `retry > delay > grows by factor without jitter`, `oracle > retry matches p-retry` | |
| timeouts are incremental with factor | `retry > delay > shrinks with a factor below 1` | |
| setTimeout is never called with 0 minTimeout | `retry > delay > 0 retries without waiting for a timer` | |
| maxRetryTime uses monotonic clock | skipped | No `maxRetryTime`. |
| minTimeout is respected even with small factor | `retry > delay > starts at initial even with a small factor` | |
| maxTimeout caps retry delays | `retry > delay > is capped by max` | |
| skipped attempts do not impact backoff | skipped | No `shouldConsumeRetry`. |
| shouldConsumeRetry time counts toward maxRetryTime | skipped | No `shouldConsumeRetry` or `maxRetryTime`. |
| maxTimeout lower than minTimeout caps delay | `retry > delay > is capped by max when max is below initial` | |
| randomize affects retry delays | `retry > delay > jitter picks a random wait between 0 and the cap` | Full jitter waits 0 to 1 times the cap, and p-retry's `randomize` waits 1 to 2 times. |
| maxRetryTime limits total retry duration | `retry > signal > limits total time with a caller signal` | |
| onFailedAttempt time counts toward maxRetryTime | skipped | No `maxRetryTime`. Pass `signal: AbortSignal.timeout(ms)` for a limit on the whole call. |
| signal already aborted when entering delay phase cancels immediately | `retry > signal > rejects with signal.reason when aborted inside fn, without waiting` | |
| signal abort during delay cancels promptly | `retry > signal > rejects with signal.reason when aborted during the delay, and clears the timer` | |
| aborts immediately if signal is already aborted (commented out upstream) | `retry > signal > does not call fn when the signal is already aborted` | |
| aborts immediately if signal is already aborted with reason | `retry > signal > does not call fn when the signal is already aborted` | |
| throws on negative retry count | `retry > attempts > rejects attempts: -1 with a RangeError` | `RangeError`, not `TypeError`, as in the other packages. |
| throws on non-number retries | skipped | The option type rejects a string. |
| throws on NaN retries | `retry > attempts > rejects attempts: NaN with a RangeError` | |
| throws on fractional retries | `retry > attempts > rejects attempts: 1.5 with a RangeError` | Also checks that `fn` isn't called. |
| handles zero retries | `retry > attempts > makes one attempt with attempts: 1` | `attempts: 0` is a `RangeError`. |
| onFailedAttempt still called when retries is zero | `retry > retryIf > is not called after the last attempt` | Deliberate difference: `retryIf` decides whether to retry, so it isn't asked when no attempt is left. |
| invalid numeric options throw | `retry > delay > rejects ... with a RangeError`, `retry > timeout > rejects a negative timeout with a RangeError` | |
| factor <= 0 is treated as 1 (stable delays) | `retry > delay > rejects a factor of 0 with a RangeError` | Deliberate difference: a bad option is a programming mistake. |
| unsupported `forever` option throws | skipped | No such option. |
| handles zero maxRetryTime | `retry > signal > does not call fn when the signal is already aborted` | |
| handles invalid factor values | `retry > delay > rejects a negative factor with a RangeError` | |
| handles synchronous input function | `retry > attempts > retries a sync fn that throws` | |
| aborts retries if input function returns null | `retry > attempts > resolves with null without retrying` | |
| handles non-Error rejection values | `retry > attempts > rethrows a non-Error value unchanged` | |
| unref option prevents timeout from keeping process alive | skipped | `unref` exists only in Node. A pending `sleep` can be aborted instead. |
| unref option handles missing unref gracefully | skipped | Same. |
| preserves user stack trace through async retries | `retry > attempts > makes 3 attempts by default and rejects with the last error unchanged` | The error is the object `fn` threw, so its stack is the one `fn` created. Upstream runs a Node child process. |
| makeRetriable wraps and retries the function | skipped | No `makeRetriable`. The README shows the one-line wrapper. |
| makeRetriable passes arguments and options | skipped | Same. |
| makeRetriable preserves `this` context | skipped | Same. |
| throws error from shouldRetry | `retry > retryIf > rejects with the error it throws` | |
| retriesLeft is Infinity when retries is Infinity | skipped | No `retriesLeft`. |
| shouldConsumeRetry receives normalized error for non-error throws | skipped | No `shouldConsumeRetry`, and errors are not normalized. |
| shouldConsumeRetry returning false still respects retry budget | skipped | No `shouldConsumeRetry`. |
| shouldConsumeRetry returning false still calls shouldRetry | skipped | Same. |
| shouldConsumeRetry sees retryDelay as 0 when retriesLeft is 0 | skipped | Same. |
| retryDelay is provided in onFailedAttempt context | `retry > delay > a function receives the attempt and the error, and returns the wait` | |
| retryDelay is zero when shouldConsumeRetry skips the retry | skipped | No `shouldConsumeRetry`. |
| Only consumed retries advance backoff | skipped | Same. |

## async-retry

| Upstream test | Covered by | Notes |
| --- | --- | --- |
| return value | `retry > attempts > retries until fn succeeds and resolves with its value` | |
| return value no await | `retry > attempts > returns a value from a sync fn` | |
| chained promise | `retry > attempts > resolves with a Response from fetch-like code` | Builds a `Response` instead of fetching wikipedia.org, so the test needs no network. |
| bail | `retry > retryIf > stops retrying when it returns false and throws that error` | |
| bail + return | `retry > retryIf > stops further calls to fn once it returns false` | |
| bail error | `retry > retryIf > stops further calls to fn once it returns false` | The `err.bail` flag becomes a `retryIf` check. |
| with non-async functions | `retry > attempts > retries a sync fn that throws` | |
| return non-async | `retry > attempts > returns a value from a sync fn` | |
| with number of retries | `onRetry > receives each error, the attempt that threw it and the wait, only before a retry` | |

## delay

| Upstream test | Covered by | Notes |
| --- | --- | --- |
| returns a resolved promise | `sleep > sleep > resolves after the given time`, `oracle > sleep matches delay` | |
| able to resolve a falsy value | skipped | No `value` option. Use `.then(() => value)`. |
| delay defaults to 0 ms | `sleep > sleep > waits for the next timer turn with 0 ms` | `ms` is required. |
| can clear a delayed resolution | skipped | No `clearDelay`. Aborting rejects instead of resolving early. |
| resolution can be aborted with an AbortSignal | `sleep > sleep > rejects with signal.reason when aborted, and clears its timer` | |
| resolution can be aborted with an AbortSignal if a value is passed | skipped | No `value` option. |
| rejects with AbortError if AbortSignal is already aborted | `sleep > sleep > rejects at once when the signal is already aborted` | |
| returns a promise that is resolved in a random range of time | skipped | No `rangeDelay`. The README shows `sleep(min + Math.random() * (max - min))`. |
| can create a new instance with fixed timeout methods | `sleep > sleep with scheduler.wait > uses scheduler.wait when the runtime has it` | `createDelay` lets callers swap the timer functions. Here the runtime's `scheduler.wait` is used when present. |

## p-wait-for

| Upstream test | Covered by | Notes |
| --- | --- | --- |
| waits for condition | `poll > results > waits for an async check` | |
| rejects if condition throws | `poll > results > rejects with the error a check throws, without another check` | |
| rejects if condition returns non-boolean | `poll > results > resolves with ... which is not undefined` | Deliberate difference: any value other than `undefined` ends the poll. |
| timeout rejects with TimeoutError | `poll > timeout > rejects with a TimeoutError DOMException when the time passes` | A `DOMException`, not p-wait-for's own `TimeoutError` class. |
| timeout has a default message | skipped | The message is the `DOMException`'s. |
| timeout with custom error message | skipped | No `message` option. Catch and rethrow. |
| timeout with custom error object | skipped | Same. |
| timeout with fallback function | skipped | No `fallback`. Use `.catch()`. |
| timeout with fallback function when `before` is false | skipped | No `fallback` or `before`. |
| timeout with custom error message when `before` is false | skipped | Same. |
| stops checking after timeout | `poll > timeout > stops checking after the timeout` | |
| before option delays first check | skipped | No `before`. Call `sleep` first. |
| resolveWith returns custom value | `poll > results > resolves with the first value that is not undefined` | |
| aborts when signal is aborted | `poll > signal > rejects with signal.reason when aborted between checks` | |
| handles pre-aborted signal | `poll > signal > does not check when the signal is already aborted` | |
| stops checking after abort | `poll > signal > rejects with signal.reason when aborted between checks` | |
| signal and timeout work together | `poll > signal > an abort before the timeout wins` | |
| resolves with signal when condition becomes true | `poll > signal > resolves when a check returns a value while a signal is passed` | |
| resolveWith works with timeout | `poll > timeout > resolves with a value found before the timeout` | |
| resolveWith works with signal | `poll > signal > resolves when a check returns a value while a signal is passed` | |
| interval is respected | `poll > delay > waits the given number of ms between checks` | |
| handles async condition that resolves false multiple times | `poll > results > keeps polling an async check that resolves undefined` | |
| cleanup happens on successful resolution | `listeners > after 200 polls that succeed`, `poll > timers > leaves no timer after success with a timeout and a signal` | |
| cleanup happens on error | `listeners > after a poll check throws`, `poll > timers > leaves no timer after a check throws` | |
| throws on invalid timeout.milliseconds | skipped | `timeout` is a number. |
| throws on negative interval | `poll > delay > rejects a negative number with a RangeError` | |
| throws on NaN interval | `poll > delay > rejects a NaN number with a RangeError` | |
| throws on Infinity interval | skipped | Deliberate difference: `delay: Infinity` is allowed and waits until the timeout or an abort. |
| throws on negative timeout | `poll > timeout > rejects a negative timeout with a RangeError` | |
| throws on NaN timeout | `poll > timeout > rejects a negative timeout with a RangeError` | The same check rejects `NaN`. |
| throws on negative timeout.milliseconds | skipped | `timeout` is a number. |
| throws on NaN timeout.milliseconds | skipped | Same. |
| handles fallback errors gracefully | skipped | No `fallback`. |
| handles null condition return value | `poll > results > resolves with null, which is not undefined` | Deliberate difference: `null` is a value. |
| handles undefined condition return value | `poll > results > resolves with the first value that is not undefined` | `undefined` keeps polling. |
| handles promise rejection in condition | `poll > results > rejects with the error an async check rejects with` | |
| works with zero interval | `poll > delay > with 0, still lets timers run between checks so a timeout can fire` | |
| resolveWith with falsy values | `poll > results > resolves with 0 / "" / false / null` | |
| multiple simultaneous waits with same condition | `poll > results > runs several polls on one check function` | |
| signal abort reason is preserved | `poll > signal > rejects with signal.reason when aborted between checks` | |
| condition can return truthy non-boolean values that get rejected | `poll > results > resolves with 42 / "truthy string" / []` | Deliberate difference. |
| timeout with Infinity milliseconds never times out | `poll > timeout > with Infinity never times out` | |
| fallback returns undefined works | skipped | No `fallback`. |
| before false delays first check exactly | skipped | No `before`. |
| abort before first check | `poll > signal > does not check when the signal is already aborted` | |
| abort during sleep between checks | `poll > signal > rejects with signal.reason when aborted between checks` | |
| abort while condition is pending | `poll > signal > rejects with signal.reason while a check is pending, without calling it again` | |
| fallback not used on abort | skipped | No `fallback`. |
| sentinel short-circuit on first call | `poll > results > resolves on the first check without waiting` | |
| timeout message as Error instance | skipped | No `message` option. |
| timeout message as string | skipped | Same. |
| removes the abort listener once each poll settles | `listeners > after 200 polls that succeed` | |
| abort rejects while the condition is pending | `poll > signal > rejects with signal.reason while a check is pending, without calling it again` | |
| timeout rejects while the condition is pending | `poll > timeout > rejects while a check is pending, and aborts its signal` | |
| timeout fallback runs while the condition is pending | skipped | No `fallback`. |
| a condition that settles after abort is not called again | `poll > signal > rejects with signal.reason while a check is pending, without calling it again` | |
| a condition that rejects after abort does not cause an unhandled rejection | `poll > signal > ignores a check that rejects after the abort` | Vitest fails the run on an unhandled rejection in Node and Chromium. |
| timeout and signal together settle the wait while the condition is pending | `poll > signal > a timeout before the abort wins` | |
| abort during the initial `before: false` delay never calls the condition | skipped | No `before`. |
| a condition that throws `undefined` rejects with it when a timeout is set | `poll > results > rejects with undefined when a check throws undefined and a timeout is set` | |

## lodash debounce

| Upstream test | Covered by | Notes |
| --- | --- | --- |
| should debounce a function | `debounce > lodash debounce > debounces a function` | |
| subsequent debounced calls return the last `func` result | `debounce > lodash debounce > a call after the wait resolves with its own invocation` | Deliberate difference: each call resolves with the invocation it was folded into, not the previous one. |
| should not immediately call `func` when `wait` is `0` | `debounce > lodash debounce > does not call fn synchronously when ms is 0` | |
| should apply default options | `debounce > lodash debounce > applies the default options` | |
| should support a `leading` option | `debounce > lodash debounce > leading invokes on the first call, and trailing again after more calls` | |
| subsequent leading debounced calls return the last `func` result | `debounce > lodash debounce > calls dropped by leading without trailing resolve with the leading result` | |
| should support a `trailing` option | `debounce > lodash debounce > trailing: false invokes nothing after the wait` | |
| should support a `maxWait` option | `debounce > lodash debounce > maxWait invokes during a burst` | |
| should support `maxWait` in a tight loop | `debounce > lodash debounce > maxWait invokes in a tight loop where plain debounce does not` | Counts invocations under fake timers instead of a real-time loop. |
| should queue a trailing call for subsequent debounced calls after `maxWait` | `debounce > lodash debounce > queues a trailing call for calls after maxWait` | |
| should cancel `maxDelayed` when `delayed` is invoked | `debounce > lodash debounce > cancels the maxWait timer when the wait timer invokes` | |
| should invoke the trailing call with the correct arguments and `this` binding | `debounce > lodash debounce > invokes the maxWait call with the right arguments and this` | |
| (none) | `debounce > lodash debounce > maxWait below ms is raised to ms` | lodash does the same but doesn't test it. |

## lodash throttle

| Upstream test | Covered by | Notes |
| --- | --- | --- |
| should throttle a function | `throttle > lodash throttle > throttles a function` | |
| subsequent calls should return the result of the first call | `throttle > lodash throttle > calls in the first window resolve with the leading result, later ones with the trailing` | Deliberate difference, as for `debounce`. |
| should clear timeout when `func` is called | `debounce > lodash debounce and throttle > throttle leaves no timer after the wait, cancel or abort` | |
| should not trigger a trailing call when invoked once | `throttle > lodash throttle > does not make a trailing call when called once` | |
| should trigger a call when invoked repeatedly (with and without `leading: false`) | `throttle > lodash throttle > calls fn more than once when called repeatedly, leading: true / false` | |
| should trigger a second throttled call as soon as possible | `throttle > lodash throttle > makes a second call as soon as possible with leading: false` | |
| should apply default options | `throttle > lodash throttle > applies the default options` | |
| should support a `leading` option | `throttle > lodash throttle > leading: false waits for the trailing call` | |
| should support a `trailing` option | `throttle > lodash throttle > trailing: false drops calls inside the window and resolves them with the leading result` | |
| should not update `lastCalled`, at the end of the timeout, when `trailing` is `false` | `throttle > lodash throttle > trailing: false lets the next window lead again` | |
| should work with a system time of `0` | `throttle > lodash throttle > works when the system clock reads 0` | |

## lodash debounce and throttle

| Upstream test | Covered by | Notes |
| --- | --- | --- |
| should not error for non-object `options` values | skipped | The option types reject a non-object. |
| should use a default `wait` of `0` | `throttle > lodash throttle > uses a default of ms 0 as "once per timer turn"` | `ms` is required, so the test passes 0. |
| should invoke `func` with the correct `this` binding | `debounce > lodash debounce and throttle > calls fn with the this of the last call` | |
| supports recursive calls | `debounce > lodash debounce and throttle > supports recursive calls` | |
| should work if the system time is set backwards | `debounce > lodash debounce and throttle > works when the system clock is set backwards` | |
| (none) | `debounce > lodash debounce and throttle > is not invoked early when the system clock jumps forward` | See known issues. |
| should support cancelling delayed calls | `debounce > lodash debounce and throttle > cancel drops the waiting invocation` | Also checks that the dropped call rejects with an `AbortError`. |
| should reset `lastCalled` after cancelling | `debounce > lodash debounce and throttle > cancel resets the timing` | |
| should support flushing delayed calls | `debounce > lodash debounce and throttle > flush runs the waiting invocation now` | Also checks that no timer is left. |
| should noop `cancel` and `flush` when nothing is queued | `debounce > lodash debounce and throttle > cancel and flush do nothing when nothing waits` | |
| (none) | `debounce > lodash debounce and throttle > pending is true while waiting` | lodash has no `pending`. |
| (none) | `debounce > lodash debounce and throttle > rejects ms past the 32-bit setTimeout limit with a RangeError` | |
| (none) | `debounce > lodash debounce and throttle > rejects leading and trailing both false with a RangeError` | lodash accepts it and never invokes `fn`. |

## throttle-debounce

| Upstream test | Covered by | Notes |
| --- | --- | --- |
| throttle: no option | `throttle > throttle-debounce throttle > runs at the start, every ms during a burst, and once after it` | |
| throttle: `{ noTrailing: false }` | same | The default. |
| throttle: `{ noTrailing: true }` | `throttle > throttle-debounce throttle > trailing: false runs at the start and every ms, but not after the burst` | |
| throttle: `{ noLeading: false }` | `throttle > throttle-debounce throttle > runs at the start, every ms during a burst, and once after it` | The default. |
| throttle: `{ noLeading: true }` | `throttle > throttle-debounce throttle > leading: false skips the start and runs once after the burst` | |
| throttle: single call with `{ noLeading: true }` | `throttle > throttle-debounce throttle > a single call with leading: false runs later` | |
| throttle: `{ noLeading: true, noTrailing: true }` | `debounce > lodash debounce and throttle > throttle rejects leading and trailing both false with a RangeError` | Deliberate difference: throttle-debounce accepts it and never calls the callback. |
| throttle: cancel | `throttle > throttle-debounce throttle > an aborted signal stops all future calls` | throttle-debounce's `cancel()` disables the function permanently. Here an abort does that, and `.cancel()` drops only the waiting invocation. |
| debounce: no option | `debounce > throttle-debounce debounce > runs once after a burst ends` | |
| debounce: `{ atBegin: false }` | same | The default. |
| debounce: `{ atBegin: true }` | `debounce > throttle-debounce debounce > with leading and no trailing, runs once at the start of a burst` | |
| debounce: cancel | `debounce > signal > rejects every later call with signal.reason` | |
| debounce: cancel (running only) | `debounce > throttle-debounce debounce > a cancel in the middle of a burst drops only the waiting invocation` | |

## p-debounce

`pDebounce.promise(fn)` lets one call of `fn` run at a time and queues the rest. It limits concurrency rather than time, so its 29 tests are skipped: those whose names start with `.promise()` or mention `pDebounce.promise`, and `autosave recipe never overlaps saves and saves the latest content`.

| Upstream test | Covered by | Notes |
| --- | --- | --- |
| single call | `debounce > lodash debounce > debounces a function` | |
| multiple calls | `debounce > promises > every call in a burst resolves with the one invocation` | |
| before option | `debounce > promises > leading without trailing resolves the burst with the leading result` | `before: true` is `{ leading: true, trailing: false }`. |
| before option - does not call input function after timeout | `debounce > lodash debounce > trailing: false invokes nothing after the wait` | |
| fn takes longer than wait | `debounce > promises > a slow async fn resolves each burst with its own invocation` | |
| `this` is preserved in pDebounce() fn | `debounce > lodash debounce and throttle > calls fn with the this of the last call` | |
| AbortSignal cancels debounced calls | `debounce > signal > rejects waiting calls with signal.reason and never invokes fn` | |
| already aborted signal prevents execution | `debounce > signal > an already aborted signal disables the function` | |
| AbortSignal works with before option | `debounce > signal > an abort after the leading call keeps the results it already gave` | Deliberate difference: calls dropped by the leading edge have already resolved with its result, so an abort can't reject them. p-debounce rejects them. |
| multiple promises are cancelled together with AbortSignal | `debounce > signal > rejects waiting calls with signal.reason and never invokes fn` | |
| function still works after AbortSignal cancellation | `debounce > signal > aborting one signal leaves another debounced function working` | Deliberate difference: an abort disables the function. `.cancel()` drops the waiting call and keeps the function working. |
| abort listener is cleaned up after normal completion | `debounce > lodash debounce and throttle > leaves no timer after the wait, cancel or abort` | The abort listener is attached only while a timer runs. |
| multiple abort signals are handled correctly without leaks | same | |
| before option - all calls in window resolve to same leading value | `debounce > promises > leading without trailing resolves the burst with the leading result` | |
| abort rejects all pending callers with consistent AbortError | `debounce > signal > rejects waiting calls with signal.reason and never invokes fn` | |
| abort rejects pending and later calls with the abort reason (4 reasons) | `debounce > signal > rejects every later call with signal.reason` | |
| this context is preserved in non-before mode | `debounce > lodash debounce and throttle > calls fn with the this of the last call` | |
| handles synchronous errors correctly | `debounce > promises > a sync throw rejects every call in the burst with that error` | |
| handles synchronous errors with before option | `debounce > promises > a sync throw on the leading call rejects the calls it dropped too` | |
| handles rejected promises correctly | `debounce > promises > an async rejection rejects every call with the same error, and later calls work` | |
| multiple callers all receive the same rejection | same | |
| handles undefined and null arguments | `debounce > promises > passes the latest arguments through unchanged` | |
| rapid abort signals do not cause memory leaks | `debounce > lodash debounce and throttle > leaves no timer after the wait, cancel or abort` | |
| before option with immediate abort | `debounce > signal > an already aborted signal disables the function` | |
| mixed successful and failed calls | `debounce > promises > an async rejection rejects every call with the same error, and later calls work` | |
| error handling - documents behavior for issue #7 | same | |
| calls made during function execution resolve with correct values | `debounce > promises > calls made while an invocation runs are folded into the next one` | |
| concurrent debounced functions do not interfere | `debounce > promises > two debounced functions do not share state` | |
| extremely short wait time (0ms) | `debounce > lodash debounce > does not call fn synchronously when ms is 0` | |
| before option with synchronous function | `debounce > lodash debounce > calls dropped by leading without trailing resolve with the leading result` | |
| abort signal during different phases | `debounce > signal > an abort while an invocation runs does not reject its calls` | |
| error propagation to all waiting promises | `debounce > promises > a sync throw rejects every call in the burst with that error` | |
| wait parameter validation | `debounce > lodash debounce and throttle > rejects ms past the 32-bit setTimeout limit with a RangeError` | `RangeError` for `NaN`, `Infinity` and anything past 2³¹ − 1, where p-debounce throws a `TypeError`. A negative `ms` counts as 0 in both. |
| before option with errors in leading call | `debounce > promises > a sync throw on the leading call rejects the calls it dropped too` | |
| complex argument passing | `debounce > promises > passes the latest arguments through unchanged` | |
| maintains proper promise resolution order | `debounce > promises > every call in a burst resolves with the one invocation` | |
| debounce with negative wait time | skipped | A negative `ms` counts as 0, which `does not call fn synchronously when ms is 0` covers. |
| abort signal removed after successful execution | `debounce > lodash debounce and throttle > leaves no timer after the wait, cancel or abort` | |
| multiple debounced functions with before option | `debounce > promises > two debounced functions do not share state` | |
| debounce function returning undefined | `debounce > promises > passes the latest arguments through unchanged` | |
| edge case: call during abort signal cleanup | `debounce > signal > rejects every later call with signal.reason` | |
| callstack is preserved in debounced function | skipped | Stack traces differ between Node and Chromium. |
| zero timeout executes in next tick | `debounce > lodash debounce > does not call fn synchronously when ms is 0` | |
| debounce with AbortSignal.timeout | skipped | Fake timers can't control `AbortSignal.timeout`. An `AbortController` takes the same path. |
| before option - fn takes longer than wait | `debounce > promises > a slow async fn resolves each burst with its own invocation` | |
| before option - a new window that starts while the previous leading call is pending resolves with its own leading value | same | |
| before option with async error in leading call | `debounce > promises > an async rejection rejects every call with the same error, and later calls work` | |
| promise resolution with null and undefined | `debounce > promises > passes the latest arguments through unchanged` | |
| multiple abort controllers on same debounced function | `debounce > signal > aborting one signal leaves another debounced function working` | A debounced function takes one `signal`. |
| debounce preserves promise rejection details | `debounce > promises > an async rejection rejects every call with the same error, and later calls work` | |
| simultaneous before and non-before debounced functions | `debounce > promises > two debounced functions do not share state` | |
| nested debounced functions | `debounce > promises > nested debounced functions resolve through each other` | |
| race condition: new call right at timeout boundary | `debounce > promises > a call exactly at the end of the wait starts a new invocation` | |
| function with Symbol return value | `debounce > promises > passes the latest arguments through unchanged` | |
| concurrent calls with different this contexts | `debounce > lodash debounce and throttle > calls fn with the this of the last call` | |
| context preservation in pDebounce | same | |
| arguments preservation in complex scenarios | `debounce > promises > passes the latest arguments through unchanged` | |
| abort signal during various execution phases | `debounce > signal > an abort while an invocation runs does not reject its calls` | |
| memory cleanup after abort | `debounce > lodash debounce and throttle > leaves no timer after the wait, cancel or abort` | |
| a later batch stays abortable when an earlier invocation finishes | `debounce > signal > an abort while an invocation runs does not reject its calls` | |
| wait greater than the maximum timer delay throws instead of firing immediately | `debounce > lodash debounce and throttle > rejects ms past the 32-bit setTimeout limit with a RangeError` | |
| before option does not retain the leading value after an abort | skipped | Needs `--expose-gc`, which the browser runs lack. The leading result is released when the wait ends or the function is cancelled. |
| before option does not retain the leading value after the window ends | skipped | Same. |
| before option does not retain the leading value when the leading call aborts after a synchronous re-entrant call | skipped | Same. |

## Known upstream issues

| Issue | Our behavior | Test |
| --- | --- | --- |
| p-retry never retries a `TypeError` unless its message is on is-network-error's list. Chrome's failed dynamic `import()` isn't on it (p-retry #85), and undici's network errors weren't either until p-retry #72. | Every error is retried unless `retryIf` says no. | `retry > attempts > retries a TypeError` |
| p-retry wraps a thrown non-Error in a new `TypeError`, so the caller never sees the original value. | Rethrown unchanged. | `retry > attempts > rethrows a non-Error value unchanged` |
| p-retry checks the signal only between attempts, so an abort during a slow attempt waits for that attempt. p-retry #97 was the same problem during the delay, fixed in December 2025. | The call rejects with `signal.reason` at once, and the attempt's own `signal` aborts too. | `retry > signal > rejects with signal.reason when aborted while an attempt is pending`, `retry > signal > aborts the attempt signal when the caller aborts` |
| async-retry's `bail()` rejects the promise but doesn't stop the operation, so a later throw schedules more calls in the background (async-retry #69). | `retryIf` returning `false` ends the loop. | `retry > retryIf > stops further calls to fn once it returns false` |
| None of the four libraries limits a single attempt, so a request that hangs stops the retries. | `timeout` aborts the attempt's `signal` and retries. | `retry > timeout > fails an attempt that ignores its signal and rejects with the TimeoutError last` |
| `setTimeout` fires after 1 ms for delays of 2³¹ ms or more. p-retry with a large `factor` and no `maxTimeout`, and p-wait-for with a long `interval`, then retry or check in a tight loop. delay works around it with unlimited-timeout. | `sleep` waits in steps of at most 2³¹ − 1 ms. | `sleep > sleep > does not fire early for delays past the 32-bit setTimeout limit`, `oracle > sleep matches delay > resolves after 2147483653 ms` |
| p-wait-for's `timeout` uses `AbortSignal.timeout`, whose timer runs to the end after the poll succeeds and can't be faked in tests. | The deadline timer is cleared when the poll settles. | `poll > timers > leaves no timer after success with a timeout and a signal` |
| p-retry once left its abort listener on the signal after it finished (p-retry #71). | Listeners are removed when each call settles. | `listeners > after retry succeeds, with and without a timeout` |
| lodash `debounce` and `throttle` read `Date.now()`. When the system clock jumps forward, `throttle` invokes again on the next call. | Time is read from `performance.now()`, which doesn't jump. | `debounce > lodash debounce and throttle > throttle is not invoked early when the system clock jumps forward` |
| lodash.debounce 4.0.8, the standalone package, restarts its timer in a tight loop with `maxWait` below `ms` without clearing the old one, so it invokes at other times than lodash 4.18. | Matches lodash 4.18. | `oracle > lodash.debounce and lodash.throttle 4.x > lodash.debounce 4.0.8 invokes at other times when maxWait is below ms, and lodash 4.18 does not` |
| lodash returns the previous invocation's result and throttle-debounce returns nothing, so a caller can't wait for the invocation its call was folded into. | Each call returns a promise of that invocation's result. | `debounce > promises > every call in a burst resolves with the one invocation` |
| throttle-debounce's `cancel()` disables the function permanently, unlike lodash's `cancel()`. | `.cancel()` drops the waiting invocation, and an abort disables the function. | `debounce > throttle-debounce debounce > a cancel in the middle of a burst drops only the waiting invocation` |

## Oracle tests

`timers.oracle.test.ts` runs ours and the upstream library under fake timers and compares the gaps between attempts. Backoff without jitter matches p-retry and async-retry with `randomize: false` within 1 ms on 50 random settings (p-retry rounds each delay). Full jitter stays between 0 and p-retry's delay. `poll` checks at the same moments as p-wait-for, and `sleep` resolves at the same moment as delay, including past 2³¹ ms. The p-wait-for timeout comparison runs on real timers, because fake timers can't control `AbortSignal.timeout`.

`debounce.oracle.test.ts` runs seeded random schedules of calls, `flush` and `cancel` against ours and lodash 4.18 under fake timers, and compares the time and argument of every invocation. It covers `ms` of 0, 10, 32 and 100, seven option sets for `debounce` and three for `throttle`, and they match exactly. The same schedules match lodash.debounce and lodash.throttle 4.x where `maxWait` is at least `ms`. Against p-debounce, every call resolves with the same value, with `before` on and off.

`debounce.fuzz.oracle.test.ts` runs the same comparison with fast-check. Each run picks an `ms` up to 100 and random `leading`, `trailing` and `maxWait` settings, and `fc.commands` generates a sequence of calls, `flush`, `cancel` and clock advances. After each step the test checks that both functions have made the same invocations. Its first runs found that our `flush` started a new window, so `throttle(fn, 10)` called again 5 ms after a flush ran at 15, while lodash counts the window from the flushed invocation and runs it at 10. `flush` now keeps the window, and the conformance tests under `flush keeps the maxWait window` hold those cases.

## Benchmarks

None of the upstream packages has a benchmark. `retry.bench.ts` measures overhead per attempt: ten attempts with no delay, against p-retry with `minTimeout: 0` and a plain try/catch loop, with and without a `signal`. It fails if p-retry is more than 25% faster.

`debounce.bench.ts` measures a burst of 1000 calls followed by `flush`, against lodash.debounce, lodash.throttle, throttle-debounce and p-debounce. It fails if lodash is more than 25% faster.
