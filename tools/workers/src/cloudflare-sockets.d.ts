// The types of `cloudflare:sockets`, copied from @cloudflare/workers-types 5.20261025.1. That
// package declares every Workers global, which conflict with the DOM types the other checks use.
declare module 'cloudflare:sockets' {
  type Socket = {
    get readable(): ReadableStream;
    get writable(): WritableStream;
    get closed(): Promise<void>;
    get opened(): Promise<SocketInfo>;
    get upgraded(): boolean;
    get secureTransport(): 'on' | 'off' | 'starttls';
    close(): Promise<void>;
    startTls(options?: TlsOptions): Socket;
  };
  type SocketOptions = {
    secureTransport?: string | undefined;
    allowHalfOpen: boolean;
    highWaterMark?: number | bigint | undefined;
  };
  type SocketAddress = {
    hostname: string;
    port: number;
  };
  type TlsOptions = {
    expectedServerHostname?: string | undefined;
  };
  type SocketInfo = {
    remoteAddress?: string | undefined;
    localAddress?: string | undefined;
  };
  function _connect(address: string | SocketAddress, options?: SocketOptions): Socket;
  export { _connect as connect };
}
