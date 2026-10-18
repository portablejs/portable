---
'@portable/webhooks': minor
---

`scheme` takes a scheme object instead of a string: `Webhooks.standard` (the default when `scheme` is left out), `Webhooks.stripe`, `Webhooks.github` or `Webhooks.slack`, or one you write for another sender with `parse`, `payload`, `headers` and an optional `key`. The `'svix'` scheme is removed, because `Webhooks.standard` reads the `svix-` headers when the `webhook-` headers are missing. `sign` now defaults `id` to `crypto.randomUUID()` and writes `x-github-delivery` for GitHub.
