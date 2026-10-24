/**
 * A TCP connection with the shape of the WinterTC and Cloudflare Workers Sockets API. The socket that
 * `connect` from `cloudflare:sockets` returns fits it as is.
 */
export type Socket = {
  readonly readable: ReadableStream<Uint8Array>;
  readonly writable: WritableStream<Uint8Array>;
  /** Resolves once the connection, and the TLS handshake if there is one, is established. */
  readonly opened: Promise<unknown>;
  readonly closed: Promise<unknown>;
  close(): Promise<unknown> | void;
  /** Starts TLS on a socket opened with `secureTransport: 'starttls'` and returns the encrypted socket. */
  startTls(): Socket;
};

/** The options `Connect` receives. `cloudflare:sockets` reads them as they are. */
export type SocketOptions = {
  secureTransport: 'off' | 'on' | 'starttls';
  allowHalfOpen: boolean;
};

/**
 * Opens a TCP connection. Pass `connect` from `cloudflare:sockets`, or an adapter for Deno or Node
 * (see the README).
 */
export type Connect = (
  address: { hostname: string; port: number },
  options: SocketOptions,
) => Socket;
