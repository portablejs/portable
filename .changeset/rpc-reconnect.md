---
'@portable/rpc': minor
---

`Rpc.connect` rejects calls lost when a transport reconnects. If the transport has `addEventListener`, as the one from `WebSockets.connect` does, `connect` listens for `close` events. On each `close` event, `connect` rejects every call whose request went out on the dropped connection with `Rpc.TransportError`. It also aborts the `signal` of each method it was running for that connection. Requests written while the socket was disconnected are sent on the next connection and answered as before. Previously the lost calls stayed pending until their signal aborted.

If you passed a signal only to stop waiting for lost calls, you can remove it, because a lost call now rejects as soon as the connection closes:

```ts
// Before: a call lost in a reconnect stayed pending until the timeout.
await Rpc.call(remote.follow, [['friends']], { signal: AbortSignal.timeout(10_000) });

// After: it rejects with TransportError as soon as the connection drops.
try {
  await remote.follow(['friends']);
} catch (error) {
  if (!(error instanceof Rpc.TransportError)) {
    throw error;
  }
  // Retry only if follow is safe to run twice: the server may have run it.
}
```
