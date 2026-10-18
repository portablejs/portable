---
'@portable/webhooks': minor
---

Added `verify` and `sign` for Standard Webhooks, Svix, Stripe, GitHub and Slack signatures, as a replacement for `standardwebhooks`, `svix`'s verifier, Stripe's `constructEvent`, `@octokit/webhooks-methods` and Slack's request verification. HMAC-SHA256 uses WebCrypto by default, and `@portable/webhooks/core` takes it as an argument.
