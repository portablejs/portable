# @portable/smtp API

`pnpm api` generates this file from the source. It lists the declarations that each public entry point exports. Don't edit it by hand.

## @portable/smtp

```ts
export { Connect, Socket } from '@portable/sockets';

type Auth = {
  user: string;
  pass: string;
  method?: 'PLAIN' | 'LOGIN' | undefined;
} | {
  user: string;
  accessToken: string;
};

type Client = AsyncDisposeMethod & {
  readonly secure: boolean;
  readonly extensions: readonly string[];
  send(mail: Mail, options?: Client.SendOptions): Promise<Result>;
  close(options?: Client.CloseOptions): Promise<void>;
};
namespace Client {
  type SendOptions = {
    signal?: AbortSignal | undefined;
  };
  type CloseOptions = {
    signal?: AbortSignal | undefined;
  };
}

class CommandError extends Errors.BaseError {
  static readonly kind: string;
  readonly code: CommandError.Code;
  readonly command: string | undefined;
  readonly responseCode: number | undefined;
  readonly enhancedCode: string | undefined;
  readonly response: string | undefined;
  readonly rejected: readonly Rejection[] | undefined;
  constructor(options: CommandError.Options);
}
namespace CommandError {
  type Code = 'ECONNECTION' | 'EPROTOCOL' | 'ETLS' | 'EAUTH' | 'EENVELOPE' | 'EMESSAGE';
  type Options = {
    code: Code;
    message: string;
    command?: string | undefined;
    reply?: Reply | undefined;
    rejected?: readonly Rejection[] | undefined;
    cause?: unknown;
  };
}

type Dsn = {
  ret?: 'FULL' | 'HDRS' | undefined;
  envid?: string | undefined;
  notify?: 'NEVER' | readonly ('SUCCESS' | 'FAILURE' | 'DELAY')[] | undefined;
};

type Mail = {
  from: string;
  to: string | readonly string[];
  message: ReadableStream<Uint8Array> | Uint8Array | string;
  size?: number | undefined;
  dsn?: Dsn | undefined;
  requireTls?: boolean | undefined;
};

type Rejection = {
  recipient: string;
  responseCode: number;
  enhancedCode: string | undefined;
  response: string;
};

type Result = {
  accepted: readonly string[];
  rejected: readonly Rejection[];
  response: string;
};

function connect(options: connect.Options): Promise<Client>;
namespace connect {
  type Options = {
    connect: Sockets.Connect;
    host: string;
    port?: number | undefined;
    secure?: 'on' | 'starttls' | 'off' | undefined;
    auth?: Auth | undefined;
    allowInsecureAuth?: boolean | undefined;
    name?: string | undefined;
    lmtp?: boolean | undefined;
    signal?: AbortSignal | undefined;
  };
}

function send(mail: Mail, options: send.Options): Promise<Result>;
namespace send {
  type Options = connect.Options;
}

// Not exported, but used by the exports above.

type Reply = {
  code: number;
  enhancedCode: string | undefined;
  lines: string[];
  response: string;
};
```
