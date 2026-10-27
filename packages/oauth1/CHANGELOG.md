# @portable/oauth1

## 0.1.0

### Minor Changes

- [`4c3d8d8`](https://github.com/portablejs/portable/commit/4c3d8d84de1373fb4a667cb95f445b9accc3fbc8) - Initial release. `OAuth1.sign` and `OAuth1.authorization` sign OAuth 1.0a requests (RFC 5849) with HMAC-SHA1, HMAC-SHA256, RSA-SHA1, and PLAINTEXT. HMAC and hashing use WebCrypto, and the `hmac` and `digest` options take other implementations. Replaces oauth-1.0a and node-oauth.

### Patch Changes

- Updated dependencies [[`6b36d08`](https://github.com/portablejs/portable/commit/6b36d08e2331b7e55d90165a4bf6f43961291c8e), [`ef22071`](https://github.com/portablejs/portable/commit/ef22071656ac46dc37c780989da9b1caed3d7375), [`f637257`](https://github.com/portablejs/portable/commit/f637257a41ca66306438256279150ee9e214671a), [`c04a3b9`](https://github.com/portablejs/portable/commit/c04a3b916eacf40859ed1cd8a4de9544de8208a1), [`0a1b9a3`](https://github.com/portablejs/portable/commit/0a1b9a33d8d94abb1e241bbee8f7b90a809c954c)]:
  - @portable/base64@0.1.0
  - @portable/bytes@0.1.0
  - @portable/errors@0.1.0
  - @portable/timers@0.1.0
  - @portable/web-crypto@0.1.0
