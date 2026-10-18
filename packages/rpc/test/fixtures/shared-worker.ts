import { servePort } from './methods.js'

self.addEventListener('connect', (event) => servePort((event as MessageEvent).ports[0]!))
