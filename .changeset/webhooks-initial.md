---
'@portable/webhooks': minor
---

Initial release. `Webhooks.verify` and `Webhooks.sign` check and create webhook signatures with the `standard` (Standard Webhooks and Svix), `stripe`, `github`, and `slack` schemes, or a scheme you write for another HMAC-SHA256 sender. HMAC-SHA256 uses WebCrypto, and the `hmac` option takes another implementation. Replaces standardwebhooks, svix's `Webhook`, Stripe's `constructEvent`, @octokit/webhooks-methods and @slack/bolt's request verification.
