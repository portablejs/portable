# @portable/web-push

## 0.1.0

### Minor Changes

- [`692c201`](https://github.com/portablejs/portable/commit/692c201c30471b774ba9b74c881182d9f4aa75df) - Initial release. `WebPush.send`, `toRequest`, `encrypt`, and `generateVapidKeys` send Web Push messages with aes128gcm encryption (RFC 8291) and VAPID (RFC 8292) on WebCrypto and `fetch`, and `maxPayloadBytes` is the largest payload that fits. Replaces web-push.

### Patch Changes

- Updated dependencies [[`6b36d08`](https://github.com/portablejs/portable/commit/6b36d08e2331b7e55d90165a4bf6f43961291c8e), [`ef22071`](https://github.com/portablejs/portable/commit/ef22071656ac46dc37c780989da9b1caed3d7375), [`f637257`](https://github.com/portablejs/portable/commit/f637257a41ca66306438256279150ee9e214671a), [`c04a3b9`](https://github.com/portablejs/portable/commit/c04a3b916eacf40859ed1cd8a4de9544de8208a1)]:
  - @portable/base64@0.1.0
  - @portable/bytes@0.1.0
  - @portable/errors@0.1.0
  - @portable/timers@0.1.0
