declare module 'smtp-server' {
  import type { Server } from 'node:net'
  import type { Readable } from 'node:stream'

  export type Address = { address: string; args: Record<string, string | true>; dsn?: unknown }
  export type Session = {
    envelope: {
      mailFrom: Address | false
      rcptTo: Address[]
      dsn?: unknown
      requireTLS?: boolean
    }
    secure: boolean
    [key: string]: unknown
  }
  export type Auth = { method: string; username: string; password?: string; accessToken?: string }
  type Done = (error?: Error | null, value?: unknown) => void

  export type Options = {
    secure?: boolean
    lmtp?: boolean
    size?: number
    authMethods?: string[]
    authOptional?: boolean
    disabledCommands?: string[]
    hidePIPELINING?: boolean
    hideSTARTTLS?: boolean
    hideDSN?: boolean
    hideREQUIRETLS?: boolean
    hide8BITMIME?: boolean
    hideSMTPUTF8?: boolean
    hideENHANCEDSTATUSCODES?: boolean
    allowInsecureAuth?: boolean
    logger?: boolean
    onConnect?: (session: Session, done: Done) => void
    onAuth?: (auth: Auth, session: Session, done: Done) => void
    onMailFrom?: (address: Address, session: Session, done: Done) => void
    onRcptTo?: (address: Address, session: Session, done: Done) => void
    onData?: (stream: Readable, session: Session, done: Done) => void
  }

  export class SMTPServer {
    constructor(options: Options)
    server: Server
    connections: Set<{ close(): void; _socket: import('node:net').Socket }>
    listen(port: number, host: string, callback: () => void): void
    close(callback: () => void): void
  }
}
