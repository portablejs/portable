---
'@portable/dkim': minor
'@portable/arc': minor
'@portable/mail-auth': minor
'@portable/oauth1': minor
'@portable/webhooks': minor
'@portable/spf': minor
'@portable/web-push': minor
'@portable/rate-limit': minor
'@portable/timers': minor
---

Every function that reads the clock takes `now?: Date`:

- `Dkim.sign` and `Arc.seal` take `now` instead of `signedAt`, and `OAuth1.sign` and `Webhooks.sign` take it instead of `timestamp`.
- `Spf.check`, `WebPush.send`, `WebPush.toRequest`, the rate limiter's `take` and `RateLimit.headers` take a new `now` option.
- `RateLimit.Result.resetAt` is a `Date` instead of Unix milliseconds.
- `Webhooks.verify`'s `tolerance` is in milliseconds, with a default of `300_000`.
- `Timers.poll` has no `timeout`. Pass `signal: AbortSignal.timeout(ms)` instead.
