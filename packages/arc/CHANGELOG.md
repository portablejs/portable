# @portable/arc

## 0.1.0

### Minor Changes

- [`11d95a9`](https://github.com/portablejs/portable/commit/11d95a990938c514fef7c7e0af585f0e491c98b7) - Initial release. `Arc.verify` validates a message's ARC chain and `Arc.seal` adds an ARC set (RFC 8617). Both take RSA and Ed25519 keys and sign or verify on WebCrypto, and `verify` looks up public keys through a DNS resolver you pass. Replaces the ARC parts of mailauth.

### Patch Changes

- Updated dependencies [[`6b36d08`](https://github.com/portablejs/portable/commit/6b36d08e2331b7e55d90165a4bf6f43961291c8e), [`ef22071`](https://github.com/portablejs/portable/commit/ef22071656ac46dc37c780989da9b1caed3d7375), [`b0efe24`](https://github.com/portablejs/portable/commit/b0efe246af8c814f22abf562370aef5f3db512ec), [`f637257`](https://github.com/portablejs/portable/commit/f637257a41ca66306438256279150ee9e214671a), [`c04a3b9`](https://github.com/portablejs/portable/commit/c04a3b916eacf40859ed1cd8a4de9544de8208a1)]:
  - @portable/base64@0.1.0
  - @portable/bytes@0.1.0
  - @portable/dkim@0.1.0
  - @portable/errors@0.1.0
  - @portable/timers@0.1.0
