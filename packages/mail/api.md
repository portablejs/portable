# @portable/mail API

`pnpm api` generates this file from the source. It lists the declarations that each public entry point exports. Don't edit it by hand.

## @portable/mail

```ts
export { Instant } from '@portable/timers';

type Addresses = string | Mailbox | readonly (string | Mailbox)[];

type Attachment = {
  readonly content: Content;
  readonly filename?: string | undefined;
  readonly contentType?: string | undefined;
  readonly cid?: string | undefined;
  readonly disposition?: 'attachment' | 'inline' | undefined;
  readonly headers?: HeaderFields | undefined;
  readonly transferEncoding?: TransferEncoding | undefined;
};

type Content = string | Uint8Array | Blob | ReadableStream<Uint8Array>;

type Envelope = {
  from: string;
  to: readonly string[];
};

type HeaderFields = Readonly<Record<string, string | readonly string[]>>;

class InvalidInputError extends Errors.InvalidInputError {
  static readonly kind: string;
}

type Mailbox = {
  readonly name?: string | undefined;
  readonly address: string;
};

type Message = {
  readonly from?: Addresses | undefined;
  readonly sender?: Addresses | undefined;
  readonly to?: Addresses | undefined;
  readonly cc?: Addresses | undefined;
  readonly bcc?: Addresses | undefined;
  readonly replyTo?: Addresses | undefined;
  readonly inReplyTo?: string | undefined;
  readonly references?: string | readonly string[] | undefined;
  readonly subject?: string | undefined;
  readonly messageId?: string | undefined;
  readonly date?: Instant | string | undefined;
  readonly text?: Content | undefined;
  readonly amp?: Content | undefined;
  readonly html?: Content | undefined;
  readonly alternatives?: readonly Part[] | undefined;
  readonly attachments?: readonly Attachment[] | undefined;
  readonly headers?: HeaderFields | undefined;
};

type Part = {
  readonly content: Content;
  readonly contentType: string;
  readonly headers?: HeaderFields | undefined;
  readonly transferEncoding?: TransferEncoding | undefined;
};

type TransferEncoding = 'base64' | 'quoted-printable' | '7bit' | '8bit';

function encodeStream(message: Message, options?: encodeStream.Options): ReadableStream<Uint8Array>;
namespace encodeStream {
  type Options = {
    boundary?: string | undefined;
    charset?: MimeHeaders.CharsetEncoder | undefined;
    keepBcc?: boolean | undefined;
    signal?: AbortSignal | undefined;
  };
}

function envelope(message: {
  readonly from?: Addresses | undefined;
  readonly sender?: Addresses | undefined;
  readonly to?: Addresses | undefined;
  readonly cc?: Addresses | undefined;
  readonly bcc?: Addresses | undefined;
}): Envelope;
```
