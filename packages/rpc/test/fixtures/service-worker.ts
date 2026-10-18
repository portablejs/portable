import { servePort } from './methods.js'

self.addEventListener('message', (event) => servePort((event as MessageEvent).ports[0]!))
