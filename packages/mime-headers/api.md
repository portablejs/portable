# @portable/mime-headers API

`pnpm api` generates this file from the source. It lists the declarations that each public entry point exports. Don't edit it by hand.

## @portable/mime-headers

```ts
type Address = Mailbox | Group;

type CharsetEncoder = {
  readonly name: string;
  readonly encode: (text: string) => Uint8Array;
};

type Group = {
  readonly name: string;
  readonly group: readonly Mailbox[];
};

type Header = {
  readonly name: string;
  readonly value: string;
};

class InvalidInputError extends Errors.InvalidInputError {
  static readonly kind: string;
}

type Mailbox = {
  readonly name: string;
  readonly address: string;
};

class MaxLengthError extends Errors.MaxLengthError {
  static readonly kind: string;
  constructor(options: Errors.MaxLengthError.Options);
}

type Value = {
  readonly value: string;
  readonly params: Readonly<Record<string, string>>;
};

type WordEncoding = 'Q' | 'B';

function decodeWords(input: string | Uint8Array): string;

function encodeWord(input: string | Uint8Array, options?: encodeWord.Options): string;
namespace encodeWord {
  type Options = {
    charset?: CharsetEncoder | undefined;
    wordEncoding?: WordEncoding | undefined;
    wordLength?: number | undefined;
  };
}

function encodeWords(input: string | Uint8Array, options?: encodeWords.Options): string;
namespace encodeWords {
  type Options = encodeWord.Options;
}

function fold(input: string | Uint8Array, options?: fold.Options): string;
namespace fold {
  type Options = {
    lineLength?: number | undefined;
  };
}

function formatAddresses(addresses: readonly Address[], options?: formatAddresses.Options): string;
namespace formatAddresses {
  type Options = Pick<encodeWord.Options, 'charset' | 'wordEncoding'>;
}

function formatValue(input: Value): string;

function parseAddresses(input: string | Uint8Array, options?: parseAddresses.Options): Address[];
namespace parseAddresses {
  type Options = {
    strict?: boolean | undefined;
  };
}

function parseHeaders(input: string | Uint8Array, options?: parseHeaders.Options): Header[];
namespace parseHeaders {
  type Options = {
    maxLength?: number | undefined;
  };
}

function parseMailboxes(input: string | Uint8Array, options?: parseMailboxes.Options): Mailbox[];
namespace parseMailboxes {
  type Options = parseAddresses.Options;
}

function parseValue(input: string | Uint8Array): Value;

function unfold(input: string | Uint8Array): string;
```
