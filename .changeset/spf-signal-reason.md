---
'@portable/spf': minor
---

Aborting `signal` rejects `check` with `signal.reason` instead of returning a `temperror` result, as every other package in this repo does, and passes the signal to the resolver so its pending lookups are cancelled. To keep the RFC 7208 time limit, catch the `TimeoutError` from `AbortSignal.timeout` and report `temperror`.
