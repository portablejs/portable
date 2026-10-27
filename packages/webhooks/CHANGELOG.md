# @portable/webhooks

## 0.1.0

### Minor Changes

- [`f790a12`](https://github.com/portablejs/portable/commit/f790a1230b427ae5bcff36c9f9eebe1430a88972) - Initial release. `Webhooks.verify` and `Webhooks.sign` check and create webhook signatures with the `standard` (Standard Webhooks and Svix), `stripe`, `github`, and `slack` schemes, or a scheme you write for another HMAC-SHA256 sender. HMAC-SHA256 uses WebCrypto, and the `hmac` option takes another implementation. Replaces standardwebhooks, svix's `Webhook`, Stripe's `constructEvent`, @octokit/webhooks-methods and @slack/bolt's request verification.

### Patch Changes

- Updated dependencies [[`6b36d08`](https://github.com/portablejs/portable/commit/6b36d08e2331b7e55d90165a4bf6f43961291c8e), [`ef22071`](https://github.com/portablejs/portable/commit/ef22071656ac46dc37c780989da9b1caed3d7375), [`f637257`](https://github.com/portablejs/portable/commit/f637257a41ca66306438256279150ee9e214671a), [`c04a3b9`](https://github.com/portablejs/portable/commit/c04a3b916eacf40859ed1cd8a4de9544de8208a1), [`0a1b9a3`](https://github.com/portablejs/portable/commit/0a1b9a33d8d94abb1e241bbee8f7b90a809c954c)]:
  - @portable/base64@0.1.0
  - @portable/bytes@0.1.0
  - @portable/errors@0.1.0
  - @portable/timers@0.1.0
  - @portable/web-crypto@0.1.0
