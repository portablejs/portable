---
'@portable/mailauth': patch
---

`authenticate` throws a `RangeError` for an `ip` that isn't an IP address, as `Spf.check` now does.
