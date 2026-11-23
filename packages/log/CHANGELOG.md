# @portable/log

## 0.1.1

### Patch Changes

- [#54](https://github.com/portablejs/portable/pull/54) [`c9a3699`](https://github.com/portablejs/portable/commit/c9a369918ada1a0eed911537d38cb2695ce612ba) - The JSDoc for `Logger.with` says that the console output prints the properties as an object after the arguments, and `Logger.namespace` has JSDoc. The README explains `with`, and separates the functions that change global settings from the ones that make loggers.

## 0.1.0

### Minor Changes

- [#17](https://github.com/portablejs/portable/pull/17) [`4e47888`](https://github.com/portablejs/portable/commit/4e478880104a6891925bb45fcd124b8a4a3a1ee2) - Initial release. `Log.create` returns a logger with `debug`, `info`, `warn`, and `error` methods. Namespaces are turned on with debug's `DEBUG` patterns from an environment variable, `localStorage`, or `Log.enable`, and a change to `localStorage.debug` applies to a running page without a reload. `Log.configure` sets the console output, timestamps, and the storage for `withContext`; `subscribe` sends records to other outputs; `disable` turns every namespace off; and `format` and `console` write a record as text or to the console. Replaces debug.
