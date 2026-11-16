# @portable/charset API

`pnpm api` generates this file from the source. It lists the declarations that each public entry point exports. Don't edit it by hand.

## @portable/charset

```ts
type Charset = {
  readonly name: Name;
  readonly encode: (text: string) => Uint8Array<ArrayBuffer>;
  readonly [definition]: true;
};

class EncoderStream extends TransformStream<string | Uint8Array, Uint8Array<ArrayBuffer>> {
  constructor(charset: Charset, options?: EncoderStream.Options);
}
namespace EncoderStream {
  type Options = encode.Options & {
    signal?: AbortSignal | undefined;
  };
}

type Name = Exclude<CharsetName, 'replacement'>;

class UnsupportedError extends Errors.UnsupportedError {
  static readonly kind: string;
}

function encode(text: string | Uint8Array, charset: Charset, options?: encode.Options): Uint8Array<ArrayBuffer>;
namespace encode {
  type Options = {
    bom?: boolean | undefined;
    unmappable?: Unmappable | undefined;
  };
}

function load(label: string, options?: load.Options): Promise<Charset>;
namespace load {
  type Options = {
    signal?: AbortSignal | undefined;
  };
}

function normalizeLabel(label: string): Name | undefined;

const utf8: Charset;

// Not exported, but used by the exports above.

type CharsetName = 'UTF-8' | 'IBM866' | 'ISO-8859-2' | 'ISO-8859-3' | 'ISO-8859-4' | 'ISO-8859-5' | 'ISO-8859-6' | 'ISO-8859-7' | 'ISO-8859-8' | 'ISO-8859-8-I' | 'ISO-8859-10' | 'ISO-8859-13' | 'ISO-8859-14' | 'ISO-8859-15' | 'ISO-8859-16' | 'KOI8-R' | 'KOI8-U' | 'macintosh' | 'windows-874' | 'windows-1250' | 'windows-1251' | 'windows-1252' | 'windows-1253' | 'windows-1254' | 'windows-1255' | 'windows-1256' | 'windows-1257' | 'windows-1258' | 'x-mac-cyrillic' | 'GBK' | 'gb18030' | 'Big5' | 'EUC-JP' | 'ISO-2022-JP' | 'Shift_JIS' | 'EUC-KR' | 'replacement' | 'UTF-16BE' | 'UTF-16LE' | 'x-user-defined';

type Unmappable = 'replace' | 'html' | 'error' | ((codePoint: number) => string);
```

## @portable/charset/single-byte

```ts
const ibm866: Charset;

const iso8859_10: Charset;

const iso8859_13: Charset;

const iso8859_14: Charset;

const iso8859_15: Charset;

const iso8859_16: Charset;

const iso8859_2: Charset;

const iso8859_3: Charset;

const iso8859_4: Charset;

const iso8859_5: Charset;

const iso8859_6: Charset;

const iso8859_7: Charset;

const iso8859_8: Charset;

const iso8859_8i: Charset;

const koi8R: Charset;

const koi8U: Charset;

const macintosh: Charset;

const windows1250: Charset;

const windows1251: Charset;

const windows1252: Charset;

const windows1253: Charset;

const windows1254: Charset;

const windows1255: Charset;

const windows1256: Charset;

const windows1257: Charset;

const windows1258: Charset;

const windows874: Charset;

const xMacCyrillic: Charset;

const xUserDefined: Charset;

// Not exported, but used by the exports above.

type Charset = {
  readonly name: Name;
  readonly encode: (text: string) => Uint8Array<ArrayBuffer>;
  readonly [definition]: true;
};

type CharsetName = 'UTF-8' | 'IBM866' | 'ISO-8859-2' | 'ISO-8859-3' | 'ISO-8859-4' | 'ISO-8859-5' | 'ISO-8859-6' | 'ISO-8859-7' | 'ISO-8859-8' | 'ISO-8859-8-I' | 'ISO-8859-10' | 'ISO-8859-13' | 'ISO-8859-14' | 'ISO-8859-15' | 'ISO-8859-16' | 'KOI8-R' | 'KOI8-U' | 'macintosh' | 'windows-874' | 'windows-1250' | 'windows-1251' | 'windows-1252' | 'windows-1253' | 'windows-1254' | 'windows-1255' | 'windows-1256' | 'windows-1257' | 'windows-1258' | 'x-mac-cyrillic' | 'GBK' | 'gb18030' | 'Big5' | 'EUC-JP' | 'ISO-2022-JP' | 'Shift_JIS' | 'EUC-KR' | 'replacement' | 'UTF-16BE' | 'UTF-16LE' | 'x-user-defined';

type Name = Exclude<CharsetName, 'replacement'>;
```

## @portable/charset/shift_jis

```ts
const shiftJis: Charset;

// Not exported, but used by the exports above.

type Charset = {
  readonly name: Name;
  readonly encode: (text: string) => Uint8Array<ArrayBuffer>;
  readonly [definition]: true;
};

type CharsetName = 'UTF-8' | 'IBM866' | 'ISO-8859-2' | 'ISO-8859-3' | 'ISO-8859-4' | 'ISO-8859-5' | 'ISO-8859-6' | 'ISO-8859-7' | 'ISO-8859-8' | 'ISO-8859-8-I' | 'ISO-8859-10' | 'ISO-8859-13' | 'ISO-8859-14' | 'ISO-8859-15' | 'ISO-8859-16' | 'KOI8-R' | 'KOI8-U' | 'macintosh' | 'windows-874' | 'windows-1250' | 'windows-1251' | 'windows-1252' | 'windows-1253' | 'windows-1254' | 'windows-1255' | 'windows-1256' | 'windows-1257' | 'windows-1258' | 'x-mac-cyrillic' | 'GBK' | 'gb18030' | 'Big5' | 'EUC-JP' | 'ISO-2022-JP' | 'Shift_JIS' | 'EUC-KR' | 'replacement' | 'UTF-16BE' | 'UTF-16LE' | 'x-user-defined';

type Name = Exclude<CharsetName, 'replacement'>;
```

## @portable/charset/euc-jp

```ts
const eucJp: Charset;

// Not exported, but used by the exports above.

type Charset = {
  readonly name: Name;
  readonly encode: (text: string) => Uint8Array<ArrayBuffer>;
  readonly [definition]: true;
};

type CharsetName = 'UTF-8' | 'IBM866' | 'ISO-8859-2' | 'ISO-8859-3' | 'ISO-8859-4' | 'ISO-8859-5' | 'ISO-8859-6' | 'ISO-8859-7' | 'ISO-8859-8' | 'ISO-8859-8-I' | 'ISO-8859-10' | 'ISO-8859-13' | 'ISO-8859-14' | 'ISO-8859-15' | 'ISO-8859-16' | 'KOI8-R' | 'KOI8-U' | 'macintosh' | 'windows-874' | 'windows-1250' | 'windows-1251' | 'windows-1252' | 'windows-1253' | 'windows-1254' | 'windows-1255' | 'windows-1256' | 'windows-1257' | 'windows-1258' | 'x-mac-cyrillic' | 'GBK' | 'gb18030' | 'Big5' | 'EUC-JP' | 'ISO-2022-JP' | 'Shift_JIS' | 'EUC-KR' | 'replacement' | 'UTF-16BE' | 'UTF-16LE' | 'x-user-defined';

type Name = Exclude<CharsetName, 'replacement'>;
```

## @portable/charset/iso-2022-jp

```ts
const iso2022Jp: Charset;

// Not exported, but used by the exports above.

type Charset = {
  readonly name: Name;
  readonly encode: (text: string) => Uint8Array<ArrayBuffer>;
  readonly [definition]: true;
};

type CharsetName = 'UTF-8' | 'IBM866' | 'ISO-8859-2' | 'ISO-8859-3' | 'ISO-8859-4' | 'ISO-8859-5' | 'ISO-8859-6' | 'ISO-8859-7' | 'ISO-8859-8' | 'ISO-8859-8-I' | 'ISO-8859-10' | 'ISO-8859-13' | 'ISO-8859-14' | 'ISO-8859-15' | 'ISO-8859-16' | 'KOI8-R' | 'KOI8-U' | 'macintosh' | 'windows-874' | 'windows-1250' | 'windows-1251' | 'windows-1252' | 'windows-1253' | 'windows-1254' | 'windows-1255' | 'windows-1256' | 'windows-1257' | 'windows-1258' | 'x-mac-cyrillic' | 'GBK' | 'gb18030' | 'Big5' | 'EUC-JP' | 'ISO-2022-JP' | 'Shift_JIS' | 'EUC-KR' | 'replacement' | 'UTF-16BE' | 'UTF-16LE' | 'x-user-defined';

type Name = Exclude<CharsetName, 'replacement'>;
```

## @portable/charset/gbk

```ts
const gb18030: Charset;

const gbk: Charset;

// Not exported, but used by the exports above.

type Charset = {
  readonly name: Name;
  readonly encode: (text: string) => Uint8Array<ArrayBuffer>;
  readonly [definition]: true;
};

type CharsetName = 'UTF-8' | 'IBM866' | 'ISO-8859-2' | 'ISO-8859-3' | 'ISO-8859-4' | 'ISO-8859-5' | 'ISO-8859-6' | 'ISO-8859-7' | 'ISO-8859-8' | 'ISO-8859-8-I' | 'ISO-8859-10' | 'ISO-8859-13' | 'ISO-8859-14' | 'ISO-8859-15' | 'ISO-8859-16' | 'KOI8-R' | 'KOI8-U' | 'macintosh' | 'windows-874' | 'windows-1250' | 'windows-1251' | 'windows-1252' | 'windows-1253' | 'windows-1254' | 'windows-1255' | 'windows-1256' | 'windows-1257' | 'windows-1258' | 'x-mac-cyrillic' | 'GBK' | 'gb18030' | 'Big5' | 'EUC-JP' | 'ISO-2022-JP' | 'Shift_JIS' | 'EUC-KR' | 'replacement' | 'UTF-16BE' | 'UTF-16LE' | 'x-user-defined';

type Name = Exclude<CharsetName, 'replacement'>;
```

## @portable/charset/big5

```ts
const big5: Charset;

// Not exported, but used by the exports above.

type Charset = {
  readonly name: Name;
  readonly encode: (text: string) => Uint8Array<ArrayBuffer>;
  readonly [definition]: true;
};

type CharsetName = 'UTF-8' | 'IBM866' | 'ISO-8859-2' | 'ISO-8859-3' | 'ISO-8859-4' | 'ISO-8859-5' | 'ISO-8859-6' | 'ISO-8859-7' | 'ISO-8859-8' | 'ISO-8859-8-I' | 'ISO-8859-10' | 'ISO-8859-13' | 'ISO-8859-14' | 'ISO-8859-15' | 'ISO-8859-16' | 'KOI8-R' | 'KOI8-U' | 'macintosh' | 'windows-874' | 'windows-1250' | 'windows-1251' | 'windows-1252' | 'windows-1253' | 'windows-1254' | 'windows-1255' | 'windows-1256' | 'windows-1257' | 'windows-1258' | 'x-mac-cyrillic' | 'GBK' | 'gb18030' | 'Big5' | 'EUC-JP' | 'ISO-2022-JP' | 'Shift_JIS' | 'EUC-KR' | 'replacement' | 'UTF-16BE' | 'UTF-16LE' | 'x-user-defined';

type Name = Exclude<CharsetName, 'replacement'>;
```

## @portable/charset/euc-kr

```ts
const eucKr: Charset;

// Not exported, but used by the exports above.

type Charset = {
  readonly name: Name;
  readonly encode: (text: string) => Uint8Array<ArrayBuffer>;
  readonly [definition]: true;
};

type CharsetName = 'UTF-8' | 'IBM866' | 'ISO-8859-2' | 'ISO-8859-3' | 'ISO-8859-4' | 'ISO-8859-5' | 'ISO-8859-6' | 'ISO-8859-7' | 'ISO-8859-8' | 'ISO-8859-8-I' | 'ISO-8859-10' | 'ISO-8859-13' | 'ISO-8859-14' | 'ISO-8859-15' | 'ISO-8859-16' | 'KOI8-R' | 'KOI8-U' | 'macintosh' | 'windows-874' | 'windows-1250' | 'windows-1251' | 'windows-1252' | 'windows-1253' | 'windows-1254' | 'windows-1255' | 'windows-1256' | 'windows-1257' | 'windows-1258' | 'x-mac-cyrillic' | 'GBK' | 'gb18030' | 'Big5' | 'EUC-JP' | 'ISO-2022-JP' | 'Shift_JIS' | 'EUC-KR' | 'replacement' | 'UTF-16BE' | 'UTF-16LE' | 'x-user-defined';

type Name = Exclude<CharsetName, 'replacement'>;
```

## @portable/charset/utf-16

```ts
const utf16be: Charset;

const utf16le: Charset;

// Not exported, but used by the exports above.

type Charset = {
  readonly name: Name;
  readonly encode: (text: string) => Uint8Array<ArrayBuffer>;
  readonly [definition]: true;
};

type CharsetName = 'UTF-8' | 'IBM866' | 'ISO-8859-2' | 'ISO-8859-3' | 'ISO-8859-4' | 'ISO-8859-5' | 'ISO-8859-6' | 'ISO-8859-7' | 'ISO-8859-8' | 'ISO-8859-8-I' | 'ISO-8859-10' | 'ISO-8859-13' | 'ISO-8859-14' | 'ISO-8859-15' | 'ISO-8859-16' | 'KOI8-R' | 'KOI8-U' | 'macintosh' | 'windows-874' | 'windows-1250' | 'windows-1251' | 'windows-1252' | 'windows-1253' | 'windows-1254' | 'windows-1255' | 'windows-1256' | 'windows-1257' | 'windows-1258' | 'x-mac-cyrillic' | 'GBK' | 'gb18030' | 'Big5' | 'EUC-JP' | 'ISO-2022-JP' | 'Shift_JIS' | 'EUC-KR' | 'replacement' | 'UTF-16BE' | 'UTF-16LE' | 'x-user-defined';

type Name = Exclude<CharsetName, 'replacement'>;
```
