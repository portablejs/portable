import * as Rpc from '@portable/rpc'
import { codecOf, createMethods, servePort, type Config, type ParentApi } from './methods.js'

/** Runs a child page: serves the general methods to its parent or opener as `config` describes. */
export function start(config: Config): void {
  const target: Window = window.opener ?? window.parent
  if (config.redirect) return location.replace(config.redirect)
  if (config.page === 'silent') return
  if (config.page === 'version') {
    const hello = { '@portable/rpc': 'hello', version: 2, channel: '' }
    // A block body keeps this frame on the stack, as in `Rpc.window`'s `post`, so WebKit sets
    // `event.source` to this window.
    setInterval(() => {
      target.postMessage(hello, '*')
    }, 50)
    return
  }
  if (config.page === 'port') {
    globalThis.addEventListener('message', (event: MessageEvent) => {
      if (event.source !== target || !event.ports[0]) return
      if (config.origin && config.origin !== '*' && event.origin !== config.origin) return
      servePort(event.ports[0], config)
    })
    return
  }
  const parents = new Map<string, Rpc.Remote<ParentApi>>()
  const connect = () => {
    for (const channel of config.channels ?? ['']) {
      const transport = Rpc.window(target, { origin: config.origin ?? '*', channel })
      const methods =
        config.page === 'other'
          ? { methodNotInGeneralPage: () => 'success' }
          : createMethods({
              parent: () => parents.get(channel)!,
              parentOn: (other) => parents.get(other)!,
              channel,
              reload: () => location.reload(),
              navigate: (to) => void (location.href = to),
            })
      parents.set(
        channel,
        Rpc.connect<ParentApi>(transport, { codec: codecOf(config), serve: methods }),
      )
    }
  }
  if (config.delay) setTimeout(connect, config.delay)
  else connect()
}
