import * as Rpc from '@portable/rpc'
import { codecOf, createMethods, type Config, type ParentApi } from './methods.js'

/** Runs a child page: serves the general methods to its parent or opener as `config` describes. */
export function start(config: Config): void {
  const target: Window = window.opener ?? window.parent
  if (config.redirect) return location.replace(config.redirect)
  if (config.page === 'silent') return
  if (config.page === 'version') {
    const hello = { '@portable/rpc': 'hello', version: 2, channel: '' }
    setInterval(() => target.postMessage(hello, '*'), 50)
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
