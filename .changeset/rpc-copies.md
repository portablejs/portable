---
'@portable/rpc': patch
---

`withContext`, `Rpc.call` and `Rpc.port` work when the code that creates the method, remote or transport uses another copy of the package. Before, a `withContext` method served by another copy got a signal that never aborted.
