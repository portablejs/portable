import { servePort, type Config } from './methods.js'

type WorkerConfig = Config & { mode?: 'self' | 'broadcast' | 'ports'; broadcast?: string }

const config: WorkerConfig = JSON.parse(new URL(self.location.href).searchParams.get('config') ?? '{}')

if (config.page === 'silent') {
} else if (config.mode === 'broadcast') {
  servePort(new BroadcastChannel(config.broadcast!), config)
  self.postMessage('ready')
} else if (config.mode === 'ports') {
  self.addEventListener('message', (event: MessageEvent<{ channel: string }>) => {
    servePort(event.ports[0]!, config, event.data.channel)
  })
} else {
  servePort(self as unknown as MessagePort, config)
}
