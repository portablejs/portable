# @portable/mail-auth

## 0.1.0

### Minor Changes

- [#3](https://github.com/portablejs/portable/pull/3) [`f637257`](https://github.com/portablejs/portable/commit/f637257a41ca66306438256279150ee9e214671a) - Initial release. `MailAuth.authenticate` checks a received message's SPF, DKIM, DMARC, and ARC in one call, writes the Authentication-Results header field (RFC 8601), and can ARC-seal the message with the results. Replaces `authenticate` from mailauth.

### Patch Changes

- Updated dependencies [[`11d95a9`](https://github.com/portablejs/portable/commit/11d95a990938c514fef7c7e0af585f0e491c98b7), [`b0efe24`](https://github.com/portablejs/portable/commit/b0efe246af8c814f22abf562370aef5f3db512ec), [`3bec687`](https://github.com/portablejs/portable/commit/3bec6876c6556c840e1509ecac335287dd8065dd), [`1e2ecf0`](https://github.com/portablejs/portable/commit/1e2ecf092ce5de40507b2c85c65da7aa4bcbd309), [`529fd0b`](https://github.com/portablejs/portable/commit/529fd0b90f9ef2640986d2621e3c41c63fdde48f), [`c04a3b9`](https://github.com/portablejs/portable/commit/c04a3b916eacf40859ed1cd8a4de9544de8208a1)]:
  - @portable/arc@0.1.0
  - @portable/dkim@0.1.0
  - @portable/dmarc@0.1.0
  - @portable/mime-headers@0.1.0
  - @portable/spf@0.1.0
  - @portable/timers@0.1.0
