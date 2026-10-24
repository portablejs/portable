declare module 'smtp-server' {
  import type { Server } from 'node:net'
  import type { Readable } from 'node:stream'

  export type Address = { address: string; args: Record<string, string | true>; dsn?: unknown }
  export type Session = {
    envelope: {
      mailFrom: Address | false
      rcptTo: Address[]
      dsn?: unknown
      requireTLS?: boolean | undefined
    }
    secure: boolean
    [key: string]: unknown
  }
  export type Auth = {
    method: string
    username: string
    password?: string | undefined
    accessToken?: string | undefined
  }
  type Done = (error?: Error | null, value?: unknown) => void

  export type Options = {
    secure?: boolean | undefined
    lmtp?: boolean | undefined
    size?: number | undefined
    authMethods?: string[] | undefined
    authOptional?: boolean | undefined
    disabledCommands?: string[] | undefined
    hidePIPELINING?: boolean | undefined
    hideSTARTTLS?: boolean | undefined
    hideDSN?: boolean | undefined
    hideREQUIRETLS?: boolean | undefined
    hide8BITMIME?: boolean | undefined
    hideSMTPUTF8?: boolean | undefined
    hideENHANCEDSTATUSCODES?: boolean | undefined
    allowInsecureAuth?: boolean | undefined
    logger?: boolean | undefined
    onConnect?: ((session: Session, done: Done) => void) | undefined
    onAuth?: ((auth: Auth, session: Session, done: Done) => void) | undefined
    onMailFrom?: ((address: Address, session: Session, done: Done) => void) | undefined
    onRcptTo?: ((address: Address, session: Session, done: Done) => void) | undefined
    onData?: ((stream: Readable, session: Session, done: Done) => void) | undefined
  }

  export class SMTPServer {
    constructor(options: Options)
    server: Server
    connections: Set<{ close(): void; _socket: import('node:net').Socket }>
    listen(port: number, host: string, callback: () => void): void
    close(callback: () => void): void
  }
}
