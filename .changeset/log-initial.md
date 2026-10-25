---
'@portable/log': minor
---

Initial release. `Log.create` returns a logger with `debug`, `info`, `warn`, and `error` methods. Namespaces are turned on with debug's `DEBUG` patterns from an environment variable, `localStorage`, or `Log.enable`, and a change to `localStorage.debug` applies to a running page without a reload. `Log.configure` sets the console output, timestamps, and the storage for `withContext`; `subscribe` sends records to other outputs; `disable` turns every namespace off; and `format` and `console` write a record as text or to the console. Replaces debug.
