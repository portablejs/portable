---
'@portable/log': minor
---

Added `create`, which returns a logger with `debug`, `info`, `warn` and `error` methods. Namespaces are turned on with debug's `DEBUG` patterns from an environment variable or `localStorage`, and a running page applies a change to `localStorage.debug` without a reload. Also added `enable`, `disable`, `subscribe`, `withContext`, `format` and `console`. Replaces debug.
