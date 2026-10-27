# @portable/dkim

## 0.1.0

### Minor Changes

- [`b0efe24`](https://github.com/portablejs/portable/commit/b0efe246af8c814f22abf562370aef5f3db512ec) - Initial release. `Dkim.sign` and `Dkim.verify` sign and verify DKIM signatures (RFC 6376) with RSA and Ed25519 keys (RFC 8463) on WebCrypto. `verify` looks up public keys through a DNS resolver you pass. Replaces the DKIM parts of mailauth and nodemailer's DKIM signer.

### Patch Changes

- Updated dependencies [[`6b36d08`](https://github.com/portablejs/portable/commit/6b36d08e2331b7e55d90165a4bf6f43961291c8e), [`ef22071`](https://github.com/portablejs/portable/commit/ef22071656ac46dc37c780989da9b1caed3d7375), [`1e68c9b`](https://github.com/portablejs/portable/commit/1e68c9b19aed3bc1e6ed7368b05e335d01c51ff9), [`f637257`](https://github.com/portablejs/portable/commit/f637257a41ca66306438256279150ee9e214671a), [`3a566ea`](https://github.com/portablejs/portable/commit/3a566ea00267d6c74313137345532bcc59227b35), [`c04a3b9`](https://github.com/portablejs/portable/commit/c04a3b916eacf40859ed1cd8a4de9544de8208a1), [`0a1b9a3`](https://github.com/portablejs/portable/commit/0a1b9a33d8d94abb1e241bbee8f7b90a809c954c)]:
  - @portable/base64@0.1.0
  - @portable/bytes@0.1.0
  - @portable/dns@0.1.0
  - @portable/errors@0.1.0
  - @portable/idna@0.1.0
  - @portable/timers@0.1.0
  - @portable/web-crypto@0.1.0
