// What each package README's benchmark and stats tables show. `scripts/bundle-size.ts` bundles each
// column's `imports`, and `scripts/readme-stats.ts` reads the `pnpm bench` reports and writes the
// tables. A column is a package (ours first, then ours with @noble/hashes, the replaced libraries,
// and a platform API), and a row is one benchmark test.

/** A module and the exports a caller uses from it. Without `use`, the whole module is bundled. */
export type Import = { from: string; use?: readonly string[] | undefined };

export type Column = {
  /** The benchmark task name, used in each row unless the row maps the column to another task. */
  name: string;
  /** The table header, when it differs from `name`. */
  header?: string | undefined;
  /** What a caller imports. A column without imports is a platform API. */
  imports?: readonly Import[] | undefined;
  /** For a platform API: `node` when only Node has it, `web` when every runtime does. */
  platform?: 'node' | 'web' | undefined;
};

export type Row = {
  /** What a caller does, such as "split 1.7 MB into lines". */
  label: string;
  /** A substring of the test's full name, or a pattern for it. */
  test: string | RegExp;
  /** Maps a column name to a task name for this row. `null` leaves the column empty. */
  tasks?: Readonly<Record<string, string | null>> | undefined;
};

export type Table = { columns: readonly Column[]; rows: readonly Row[] };

const ours = (name: string, use: readonly string[], extra: readonly Import[] = []): Column => ({
  name: `@portable/${name}`,
  imports: [{ from: `@portable/${name}`, use }, ...extra],
});

const lib = (name: string, imports: readonly Import[] = [{ from: name }]): Column => ({
  name,
  imports,
});

const node = (name: string, header: string = name): Column => ({ name, header, platform: 'node' });
const web = (name: string, header: string = name): Column => ({ name, header, platform: 'web' });

const noble = (base: Column, use: readonly Import[]): Column => ({
  name: `${base.name} with @noble/hashes`,
  imports: [...base.imports!, ...use],
});

const base64 = ours('base64', ['encode', 'decode', 'EncoderStream']);
const oauth1 = ours('oauth1', ['sign']);
const webhooks = ours('webhooks', ['verify', 'stripe', 'VerificationError']);

export const tables: Record<string, Table> = {
  arc: {
    columns: [
      ours('arc', ['seal', 'verify'], [{ from: '@portable/dns', use: ['create'] }]),
      lib('mailauth', [
        { from: 'mailauth/lib/arc/index.js', use: ['arc', 'sealMessage'] },
        { from: 'mailauth/lib/dkim/verify.js', use: ['dkimVerify'] },
      ]),
      node('node:crypto, hash and two signatures only', '`node:crypto`, hashing and signing only'),
    ],
    rows: [
      {
        label: 'Verify a 250 KB message with two ARC sets',
        test: 'verifies a 250 KB message with two ARC sets',
      },
      { label: 'Seal a 250 KB message', test: 'seals a 250 KB message' },
      { label: 'Seal and verify a short message', test: 'seals and verifies a short message' },
    ],
  },
  base64: {
    columns: [
      base64,
      lib('base64-js'),
      lib('js-base64', [{ from: 'js-base64', use: ['Base64'] }]),
      lib('libbase64'),
      node('Buffer', '`Buffer` (Node)'),
    ],
    rows: [
      { label: 'Encode 1 MB', test: 'encodes 1 MB within' },
      {
        label: 'Encode 1 MB in 76-column lines',
        test: 'encodes 1 MB within',
        tasks: {
          '@portable/base64': '@portable/base64, 76 columns',
          'base64-js': null,
          'js-base64': null,
          libbase64: 'libbase64, 76 columns',
          Buffer: null,
        },
      },
      { label: 'Decode 1 MB', test: 'decodes 1 MB within' },
      {
        label: 'Decode 1 MB of MIME base64',
        test: 'decodes 1 MB within',
        tasks: {
          '@portable/base64': "@portable/base64, 76 columns, 'mime' mode",
          'base64-js': null,
          'js-base64': null,
          libbase64: 'libbase64, 76 columns',
          Buffer: null,
        },
      },
      { label: 'Encode 32 bytes', test: 'encodes 32 bytes' },
      { label: 'Decode 32 bytes', test: 'decodes 32 bytes' },
      { label: 'Encode a 1 MB stream in 76-column lines', test: 'stream encodes 1 MB' },
      { label: 'Decode a 1 MB stream of MIME base64', test: 'stream decodes 1 MB' },
    ],
  },
  bytes: {
    columns: [
      ours('bytes', ['toHex', 'fromHex', 'concat', 'equal', 'timingSafeEqual']),
      lib('uint8array-extras', [
        {
          from: 'uint8array-extras',
          use: ['uint8ArrayToHex', 'hexToUint8Array', 'concatUint8Arrays', 'areUint8ArraysEqual'],
        },
      ]),
      node('Node', 'Node `Buffer` or `node:crypto`'),
    ],
    rows: [
      { label: 'Hex-encode 32 bytes', test: '32 B toHex', tasks: { Node: 'Buffer#toString' } },
      { label: 'Hex-encode 1 MiB', test: '1 MiB toHex', tasks: { Node: 'Buffer#toString' } },
      { label: 'Hex-decode 32 bytes', test: '32 B fromHex', tasks: { Node: 'Buffer.from' } },
      { label: 'Hex-decode 1 MiB', test: '1 MiB fromHex', tasks: { Node: 'Buffer.from' } },
      { label: 'Compare 32 bytes', test: '32 B equal', tasks: { Node: 'Buffer.compare' } },
      { label: 'Compare 1 MiB', test: '1 MiB equal', tasks: { Node: 'Buffer.compare' } },
      {
        label: 'Compare 32 bytes in constant time',
        test: '32 B timingSafeEqual',
        tasks: { Node: 'node:crypto' },
      },
      {
        label: 'Compare 1 MiB in constant time',
        test: '1 MiB timingSafeEqual',
        tasks: { Node: 'node:crypto' },
      },
      { label: 'Join 4 × 64 KiB', test: 'concat 4 ×', tasks: { Node: 'Buffer.concat' } },
      { label: 'Join 100 × 32 bytes', test: 'concat 100 ×', tasks: { Node: 'Buffer.concat' } },
    ],
  },
  charset: {
    columns: [
      ours(
        'charset',
        ['encode', 'EncoderStream'],
        [{ from: '@portable/charset/shift_jis', use: ['shiftJis'] }],
      ),
      lib('iconv-lite'),
      web('TextEncoder', '`TextEncoder`'),
    ],
    rows: [
      { label: 'Encode 380 kB of Cyrillic text to windows-1251', test: 'windows-1251' },
      { label: 'Encode 230 kB of Japanese text to Shift_JIS', test: 'Shift_JIS' },
      { label: 'Encode 610 kB of text to UTF-8', test: 'encodes UTF-8' },
    ],
  },
  compress: {
    columns: [
      ours('compress', ['encode', 'decode', 'DecoderStream']),
      lib('pako'),
      lib('fflate'),
      lib('crc-32'),
      node('node:zlib', '`node:zlib`'),
      web('DecompressionStream', '`DecompressionStream`'),
    ],
    rows: [
      {
        label: 'Gzip 1 MB of text',
        test: 'gzip 1 MB',
        tasks: { 'node:zlib': 'node:zlib gzipSync' },
      },
      {
        label: 'Gunzip 1 MB of text',
        test: 'gunzip 1 MB',
        tasks: { 'node:zlib': 'node:zlib gunzipSync' },
      },
      {
        label: 'Gunzip a stream of 1 KiB chunks',
        test: 'gunzip a stream',
        tasks: {
          '@portable/compress': '@portable/compress DecoderStream',
          fflate: 'fflate Gunzip',
          'node:zlib': 'node:zlib createGunzip',
        },
      },
      { label: 'CRC-32 of 1 MB', test: 'crc32 of 1 MB', tasks: { 'node:zlib': 'node:zlib crc32' } },
    ],
  },
  'web-crypto': {
    columns: [
      ours('web-crypto', ['digest', 'hmac', 'hkdf', 'importSeed', 'importPem', 'derToRawEcdsa']),
      lib('ecdsa-sig-formatter'),
      lib('@noble/hashes', [
        { from: '@noble/hashes/sha2.js', use: ['sha256'] },
        { from: '@noble/hashes/hmac.js', use: ['hmac'] },
        { from: '@noble/hashes/hkdf.js', use: ['hkdf'] },
      ]),
      lib('@noble/curves', [
        { from: '@noble/curves/ed25519.js', use: ['ed25519'] },
        { from: '@noble/curves/nist.js', use: ['p256'] },
      ]),
      web('crypto.subtle', '`crypto.subtle` by hand'),
      node('node:crypto', '`node:crypto`'),
    ],
    rows: [
      { label: 'SHA-256 of 1 KB', test: 'digest hashes 1 KB' },
      { label: 'SHA-256 of 1 MB', test: 'digest hashes 1 MB' },
      { label: 'HMAC-SHA256 of 1 KB', test: 'hmac signs 1 KB' },
      { label: 'Derive 32 bytes with HKDF', test: 'hkdf derives' },
      { label: 'Import an Ed25519 seed', test: 'importSeed imports' },
      { label: 'Read the public key of a P-256 key', test: 'publicKeyOf reads' },
      { label: 'Convert a DER ECDSA signature to raw', test: 'derToRawEcdsa converts' },
      { label: 'Convert a raw ECDSA signature to DER', test: 'rawToDerEcdsa converts' },
    ],
  },
  csv: {
    columns: [
      ours('csv', ['decode', 'encode']),
      {
        name: 'csv-parse',
        header: 'csv-parse or csv-stringify',
        imports: [
          { from: 'csv-parse/sync', use: ['parse'] },
          { from: 'csv-stringify/sync', use: ['stringify'] },
        ],
      },
      lib('papaparse'),
      lib('fast-csv', [
        { from: '@fast-csv/parse', use: ['parseString'] },
        { from: '@fast-csv/format', use: ['writeToString'] },
      ]),
    ],
    rows: [
      { label: 'Decode 5,000 rows from a string', test: 'decodes 5,000 rows' },
      { label: 'Decode a 500 kB stream', test: 'decodes a 500 kB stream' },
      {
        label: 'Encode 5,000 rows to a string',
        test: 'encodes 5,000 rows',
        tasks: { 'csv-parse': 'csv-stringify' },
      },
      {
        label: 'Encode a stream of 5,000 rows',
        test: 'encodes a stream',
        tasks: { 'csv-parse': 'csv-stringify' },
      },
    ],
  },
  dkim: {
    columns: [
      ours('dkim', ['sign', 'verify'], [{ from: '@portable/dns', use: ['create'] }]),
      lib('mailauth', [
        { from: 'mailauth/lib/dkim/sign.js', use: ['dkimSign'] },
        { from: 'mailauth/lib/dkim/verify.js', use: ['dkimVerify'] },
      ]),
      lib('nodemailer', [{ from: 'nodemailer/lib/dkim' }]),
      node('node:crypto, hash and sign only', '`node:crypto`, hash and sign only'),
    ],
    rows: [
      { label: 'Sign a 250 KB message', test: 'signs a 250 KB' },
      { label: 'Verify a 250 KB message', test: 'verifies a 250 KB' },
      { label: 'Sign and verify a short message', test: 'signs and verifies a short' },
    ],
  },
  dmarc: {
    columns: [
      ours(
        'dmarc',
        ['check'],
        [
          { from: '@portable/dns', use: ['create'] },
          { from: '@portable/spf', use: ['check'] },
        ],
      ),
      {
        name: 'mailauth strict',
        header: 'mailauth, strict mode',
        imports: [
          { from: 'mailauth/lib/dmarc/index.js', use: ['dmarc'] },
          { from: 'mailauth/lib/spf/index.js', use: ['spf'] },
        ],
      },
    ],
    rows: [{ label: 'Check a subdomain with relaxed alignment', test: 'checks a subdomain' }],
  },
  dns: {
    columns: [
      ours('dns', ['create']),
      lib('tangerine'),
      node('node:dns/promises over local UDP', '`node:dns/promises` over local UDP'),
    ],
    rows: [
      { label: 'Resolve the TXT records of gmail.com', test: "resolveTxt('gmail.com')" },
      { label: 'Resolve the MX records of gmail.com', test: "resolveMx('gmail.com')" },
      {
        label: 'Resolve the A records of www.microsoft.com',
        test: "resolve4('www.microsoft.com')",
      },
    ],
  },
  'dns-packet': {
    columns: [ours('dns-packet', ['encode', 'decode']), lib('dns-packet')],
    rows: [
      { label: 'Decode 48 captured responses', test: /^decodes \d+ real responses/ },
      { label: 'Encode 48 captured responses', test: /^encodes \d+ real responses/ },
      { label: 'Encode a DNS-over-HTTPS query', test: 'DNS-over-HTTPS query' },
    ],
  },
  exif: {
    columns: [
      ours('exif', ['parse']),
      lib('exif-parser'),
      lib('exif-reader'),
      lib('exifr', [{ from: 'exifr', use: ['parse'] }]),
    ],
    rows: [
      { label: 'Parse a 329 KB phone JPEG', test: 'parses a phone JPEG' },
      {
        label: 'Parse a phone JPEG from a stream',
        test: 'parseStream reads less',
        tasks: { '@portable/exif': '@portable/exif parseStream' },
      },
    ],
  },
  idna: {
    columns: [
      ours('idna', ['toUnicode', 'toAscii']),
      lib('tr46', [{ from: 'tr46', use: ['toUnicode', 'toASCII'] }]),
      lib('punycode', [{ from: 'punycode/punycode.js' }]),
      node('node:url', '`node:url`'),
      web('new URL().hostname', '`new URL()`'),
    ],
    rows: [
      {
        label: 'Convert 10 hostnames to Unicode',
        test: 'toUnicode on 10',
        tasks: { 'node:url': 'node:url domainToUnicode' },
      },
      {
        label: 'Convert 10 domains to ASCII',
        test: 'toAscii on 10',
        tasks: { 'node:url': 'node:url domainToASCII' },
      },
    ],
  },
  'image-size': {
    columns: [
      ours('image-size', ['parseStream']),
      lib('image-size', [{ from: 'image-size', use: ['imageSize'] }]),
    ],
    rows: [
      {
        label: 'Read the size of a 730 KB JPEG from a stream',
        test: 'parseStream on large.jpg',
        tasks: {
          '@portable/image-size': '@portable/image-size parseStream',
          'image-size': 'image-size after collecting the stream',
        },
      },
      { label: 'Read the size of a 730 KB JPEG', test: 'parses jpg/large.jpg' },
      { label: 'Read the size of a PNG', test: 'parses png/sample.png' },
      { label: 'Read the size of a HEIC image', test: 'parses heif/sample.heic' },
      { label: 'Read the size of a WebP image', test: 'parses webp/lossy.webp' },
      { label: 'Read the size of an SVG', test: 'parses svg/viewbox.svg' },
      { label: 'Read the size of a TIFF', test: 'parses tiff/big-endian.tiff' },
    ],
  },
  ip: {
    columns: [
      ours('ip', ['unmap', 'range', 'format', 'contains', 'reverseName']),
      lib('ipaddr.js'),
      lib('ip'),
      node('node:net', '`node:net`'),
    ],
    rows: [
      {
        label: 'Parse 8 addresses',
        test: 'parses addresses',
        tasks: { 'node:net': 'node:net isIP' },
      },
      {
        label: 'Check 8 addresses against a CIDR block',
        test: 'against a CIDR block',
        tasks: { 'node:net': 'node:net BlockList' },
      },
      { label: 'Tell public from internal addresses, 8 of them', test: 'classifies addresses' },
    ],
  },
  'json-stream': {
    columns: [
      ours('json-stream', ['DecoderStream']),
      lib('JSONStream'),
      lib('stream-json', [
        { from: 'stream-json/filters/pick.js' },
        { from: 'stream-json/streamers/stream-array.js' },
      ]),
      {
        name: 'stream-json, web streams',
        header: 'stream-json, web streams',
        imports: [
          { from: 'stream-json/web/filters/pick.js' },
          { from: 'stream-json/web/streamers/stream-array.js' },
        ],
      },
      lib('json-stream-stringify', [
        { from: 'json-stream-stringify', use: ['JsonStreamStringify'] },
      ]),
      web('JSON', '`JSON.parse` or `JSON.stringify`'),
    ],
    rows: [
      {
        label: 'Select the rows of a 3 MB document',
        test: 'parses the rows of a 3 MB',
        tasks: { JSON: 'JSON.parse after reading everything' },
      },
      {
        label: 'Encode a 3 MB object',
        test: 'encodes a 3 MB object',
        tasks: { JSON: 'JSON.stringify' },
      },
      { label: 'Encode rows from an async iterable', test: 'encodes rows from an async iterable' },
    ],
  },
  jsonl: {
    columns: [
      ours('jsonl', ['DecoderStream']),
      lib('ndjson'),
      lib('stream-json', [{ from: 'stream-json/jsonl/parser.js' }]),
      web('JSON', '`JSON.parse` or `JSON.stringify`'),
    ],
    rows: [
      {
        label: 'Decode 20,000 rows',
        test: 'decodes 20,000 rows',
        tasks: { JSON: 'split and JSON.parse after reading everything' },
      },
      {
        label: 'Encode 20,000 rows',
        test: 'encodes 20,000 rows',
        tasks: { JSON: 'JSON.stringify each value' },
      },
    ],
  },
  lines: {
    columns: [
      ours('lines', ['DecoderStream']),
      lib('split2'),
      lib('byline'),
      node('node:readline', '`node:readline`'),
    ],
    rows: [{ label: 'Split 1.7 MB into lines', test: 'splits 1.7 MB' }],
  },
  mail: {
    columns: [
      ours('mail', ['encodeStream', 'envelope']),
      {
        name: 'nodemailer 10.2.1',
        header: 'nodemailer',
        imports: [{ from: 'nodemailer/lib/mail-composer' }],
      },
    ],
    rows: [
      { label: 'Encode 100 text and HTML messages', test: '100 text and HTML messages' },
      { label: 'Encode a message with a 1 MB attachment', test: '1 MB attachment in memory' },
      {
        label: 'Encode a message with a 4 MB attachment from a stream',
        test: '4 MB attachment read from a stream',
      },
    ],
  },
  'mail-auth': {
    columns: [
      ours('mail-auth', ['authenticate'], [{ from: '@portable/dns', use: ['create'] }]),
      lib('mailauth', [{ from: 'mailauth', use: ['authenticate'] }]),
    ],
    rows: [
      {
        label: 'Authenticate a 250 KB message with a DKIM signature and an ARC set',
        test: 'authenticates a 250 KB message',
      },
      {
        label: 'Authenticate and seal a short message',
        test: 'authenticates and seals a short message',
      },
    ],
  },
  'mime-headers': {
    columns: [
      ours('mime-headers', [
        'fold',
        'encodeWords',
        'decodeWords',
        'parseValue',
        'formatValue',
        'parseAddresses',
        'formatAddresses',
        'parseHeaders',
      ]),
      { name: 'libmime 5.4.9', header: 'libmime', imports: [{ from: 'libmime' }] },
      {
        name: 'addressparser (nodemailer 10.2.1)',
        header: 'addressparser',
        imports: [{ from: 'nodemailer/lib/addressparser' }],
      },
      {
        name: 'email-addresses 5.0.0',
        header: 'email-addresses',
        imports: [{ from: 'email-addresses' }],
      },
      node('Node', 'Node `Buffer` and `TextDecoder`'),
    ],
    rows: [
      { label: 'Decode 200 Q-encoded subjects', test: 'decodeWords of 200 Q-encoded' },
      {
        label: 'Decode 200 B-encoded words',
        test: 'decodeWords of 200 B',
        tasks: { Node: 'Buffer and TextDecoder' },
      },
      { label: 'Encode 200 subjects', test: 'encodeWords of 200' },
      {
        label: 'Encode 200 subjects as B words',
        test: 'encodeWord in B',
        tasks: { Node: 'TextEncoder and Buffer' },
      },
      { label: 'Fold a 2,000-word header', test: 'fold of a 2000-word' },
      { label: 'Parse 200 folded headers', test: 'parseHeaders of 200' },
      { label: 'Parse 200 header values with parameters', test: 'parseValue of 200' },
      { label: 'Format 200 header values with parameters', test: 'formatValue of 200' },
      { label: 'Parse 500 addresses', test: 'parseAddresses of 500' },
      { label: 'Parse 500 addresses in strict mode', test: 'parseAddresses in strict mode' },
    ],
  },
  'mime-stream': {
    columns: [
      ours('mime-stream', ['DecoderStream', 'EncoderStream']),
      lib('mailsplit', [{ from: '@zone-eu/mailsplit', use: ['Splitter', 'Joiner'] }]),
      web('TransformStream (copy, for reference)', '`TransformStream` copy'),
    ],
    rows: [
      { label: 'Split and join 1.5 MB of mail', test: 'splits and joins 1.5 MB' },
      {
        label: 'Read the header block of 1.5 MB of mail',
        test: 'reads the header block',
        tasks: {
          '@portable/mime-stream': '@portable/mime-stream splitHeaders',
          mailsplit: 'mailsplit with ignoreEmbedded',
        },
      },
    ],
  },
  oauth1: {
    columns: [
      oauth1,
      noble(oauth1, [
        { from: '@noble/hashes/legacy.js', use: ['sha1'] },
        { from: '@noble/hashes/sha2.js', use: ['sha256'] },
      ]),
      lib('oauth-1.0a'),
      { name: 'oauth (node-oauth)', header: 'oauth', imports: [{ from: 'oauth' }] },
    ],
    rows: [
      { label: 'Sign a GET request', test: 'Authorization header for a GET' },
      { label: 'Sign a form POST', test: 'signed form POST' },
    ],
  },
  password: {
    columns: [
      ours('password', ['hash', 'verify', 'needsRehash']),
      lib('pbkdf2'),
      lib('pbkdf2-password'),
      node('node:crypto pbkdf2', '`node:crypto`'),
      web('crypto.subtle.deriveBits', '`crypto.subtle`'),
    ],
    rows: [
      { label: 'Hash a password with 600,000 iterations', test: 'hashes a password' },
      {
        label: 'Verify a password with 600,000 iterations',
        test: 'verifies a password',
        tasks: { 'node:crypto pbkdf2': 'node:crypto pbkdf2 and timingSafeEqual' },
      },
      {
        label: 'Check whether a stored hash needs a rehash',
        test: 'needs a rehash',
        tasks: { '@portable/password': '@portable/password, PHC' },
      },
    ],
  },
  png: {
    columns: [ours('png', ['decode', 'encode']), lib('pngjs', [{ from: 'pngjs', use: ['PNG'] }])],
    rows: [
      {
        label: 'Decode a 1024×1024 PNG',
        test: 'decodes a 1024x1024',
        tasks: { '@portable/png': '@portable/png (DecompressionStream)' },
      },
      {
        label: 'Decode a 1024×1024 PNG with `decodeSync` and `node:zlib`',
        test: 'decodes a 1024x1024',
        tasks: { '@portable/png': '@portable/png (node:zlib)' },
      },
      {
        label: 'Encode a 1024×1024 PNG at zlib level 6',
        test: 'encodes a 1024x1024',
        tasks: {
          '@portable/png': '@portable/png (CompressionStream)',
          pngjs: 'pngjs (level 6, default strategy)',
        },
      },
      {
        label: 'Encode a 1024×1024 PNG at level 9 with `Z_RLE`, through `node:zlib`',
        test: 'encodes a 1024x1024',
        tasks: {
          '@portable/png': '@portable/png (node:zlib level 9, Z_RLE)',
          pngjs: 'pngjs (defaults: level 9, Z_RLE)',
        },
      },
    ],
  },
  queue: {
    columns: [
      ours('queue', ['create', 'limit', 'map', 'once']),
      lib('p-limit'),
      lib('p-queue'),
      lib('p-map'),
      web('Promise.all without a limit', '`Promise.all`, no limit'),
    ],
    rows: [
      {
        label: 'Run 1,000 tasks, 10 at a time, with `Queue.create`',
        test: 'adds and runs 1000 tasks',
        tasks: { '@portable/queue': '@portable/queue create', 'p-limit': null },
      },
      {
        label: 'Run 1,000 tasks, 10 at a time, with `Queue.limit`',
        test: 'adds and runs 1000 tasks',
        tasks: { '@portable/queue': '@portable/queue limit', 'p-queue': null },
      },
      {
        label: 'Run 1,000 tasks with priorities and a signal',
        test: 'with priorities and a signal',
      },
      {
        label: 'Map 1,000 items, 10 at a time',
        test: 'maps 1000 items',
        tasks: { 'p-limit': 'p-limit map' },
      },
    ],
  },
  'quoted-printable': {
    columns: [
      ours('quoted-printable', ['encode', 'decode', 'EncoderStream', 'DecoderStream']),
      { name: 'libqp 3.0.1', header: 'libqp', imports: [{ from: 'libqp' }] },
      lib('quoted-printable'),
    ],
    rows: [
      { label: 'Encode 512 KB of text', test: 'encode 512 KB of text' },
      { label: 'Encode 256 KB of random bytes', test: 'encode 256 KB of random bytes' },
      { label: 'Encode a 512 KB text stream in 16 KB chunks', test: 'encode stream of 512 KB' },
      { label: 'Decode the encoded 512 KB of text', test: 'decode quoted-printable text' },
      {
        label: 'Decode the encoded 256 KB of random bytes',
        test: 'decode quoted-printable random',
      },
      { label: 'Decode the encoded text as a stream', test: 'decode stream of quoted-printable' },
    ],
  },
  random: {
    columns: [
      ours('random', ['int', 'float', 'string', 'shuffle', 'pick', 'bytes', 'seeded']),
      lib('random-int'),
      lib('crypto-random-string'),
      {
        name: 'nanoid customAlphabet',
        header: 'nanoid',
        imports: [{ from: 'nanoid', use: ['customAlphabet', 'random'] }],
      },
      lib('seedrandom'),
      { name: 'lodash', header: 'lodash', imports: [{ from: 'lodash' }] },
      node('node:crypto randomInt', '`node:crypto`'),
      web('Math.random', '`Math.random` or `crypto.getRandomValues`'),
    ],
    rows: [
      {
        label: '1,000 × `int(1, 100)`',
        test: 'int(1, 100)',
        tasks: { lodash: 'lodash.random' },
      },
      { label: '1,000 × `int` over 2^53 integers', test: 'int over 2^53' },
      { label: '1,000 × `float()`', test: /^float within/, tasks: { lodash: 'lodash.random' } },
      { label: '1,000 × `string(21)`', test: 'string(21)' },
      { label: '1,000 × `string(12)` from 36 characters', test: 'string(12)' },
      {
        label: '1,000 × `shuffle` of 52 elements',
        test: 'shuffle of 52',
        tasks: { lodash: 'lodash.shuffle' },
      },
      { label: '1,000 × `pick`', test: 'pick within', tasks: { lodash: 'lodash.sample' } },
      {
        label: '1,000 × `bytes(32)`',
        test: 'bytes(32)',
        tasks: {
          'nanoid customAlphabet': 'nanoid random',
          'Math.random': 'crypto.getRandomValues',
        },
      },
      {
        label: '1,000 × `seeded(1).float()`',
        test: 'seeded float',
        tasks: { '@portable/random': '@portable/random seeded' },
      },
    ],
  },
  'rate-limit': {
    columns: [
      ours('rate-limit', ['create', 'headers']),
      lib('rate-limiter-flexible', [{ from: 'rate-limiter-flexible', use: ['RateLimiterMemory'] }]),
      lib('limiter', [{ from: 'limiter', use: ['RateLimiter'] }]),
    ],
    rows: [
      { label: '10 rounds of `take` on 1,000 keys', test: 'take on 1000 keys' },
      { label: '`take` of a denied request', test: 'take denied on one key' },
      { label: '1,000 × `take` on one key', test: 'take on one key, compared with limiter' },
      { label: 'Build the rate-limit headers', test: /^headers$/ },
    ],
  },
  rdap: {
    columns: [
      ours('rdap', ['domain', 'ip', 'asn']),
      lib('node-rdap'),
      web('fetch and response.json()', '`fetch` and `response.json()`'),
    ],
    rows: [
      { label: 'Look up google.com (Verisign response)', test: 'normalizes a Verisign domain' },
      {
        label: 'Look up google.com and follow the registrar referral',
        test: 'follows the Verisign referral',
        tasks: { 'node-rdap': 'node-rdap plus a fetch' },
      },
      { label: 'Look up a RIPE network with 16 entities', test: 'RIPE network response' },
      { label: 'Look up an ARIN AS number', test: 'ARIN autnum response' },
    ],
  },
  rpc: {
    columns: [
      ours('rpc', ['connect', 'provide', 'port']),
      lib('birpc', [{ from: 'birpc', use: ['createBirpc'] }]),
      lib('comlink', [{ from: 'comlink', use: ['expose', 'wrap'] }]),
      lib('penpal', [{ from: 'penpal', use: ['connect', 'PortMessenger'] }]),
      lib('json-rpc-2.0', [{ from: 'json-rpc-2.0', use: ['JSONRPCServer', 'JSONRPCClient'] }]),
    ],
    rows: [
      { label: 'Make one call at a time over a `MessageChannel`', test: 'sequential round trips' },
      { label: 'Make 100 concurrent calls', test: '100 concurrent calls' },
      { label: 'Send 100 notifications and a call', test: '100 notifications and a call' },
      {
        label: 'Stream 1,000 items',
        test: 'a stream of 1000 items',
        tasks: {
          birpc: 'birpc, an event per item',
          comlink: 'comlink, a proxy callback per item',
        },
      },
      { label: 'Send a 2 KB record', test: 'a 2 KB record' },
      { label: 'Make one call over HTTP', test: 'Rpc.http and Rpc.handler' },
      {
        label: 'Send a batch of 10 calls over HTTP',
        test: 'a batch of 10 calls',
        tasks: { 'json-rpc-2.0': 'json-rpc-2.0, requestAdvanced' },
      },
    ],
  },
  smtp: {
    columns: [
      ours('smtp', ['send']),
      lib('nodemailer', [{ from: 'nodemailer/lib/smtp-connection' }]),
    ],
    rows: [
      { label: 'Send 10 small messages over one connection', test: 'sends 10 small messages' },
      { label: 'Send a 1 MB message', test: 'streams a 1 MB message' },
    ],
  },
  spf: {
    columns: [
      ours('spf', ['check'], [{ from: '@portable/dns', use: ['create'] }]),
      lib('mailauth', [{ from: 'mailauth/lib/spf/index.js', use: ['spf'] }]),
      {
        name: 'mailauth strict',
        header: 'mailauth, strict mode',
        imports: [{ from: 'mailauth/lib/spf/index.js', use: ['spf'] }],
      },
    ],
    rows: [{ label: 'Check a record with nested includes', test: 'evaluates a nested record' }],
  },
  sse: {
    columns: [
      ours('sse', ['DecoderStream']),
      lib('eventsource-parser', [
        { from: 'eventsource-parser/stream', use: ['EventSourceParserStream'] },
      ]),
      lib('eventsource', [{ from: 'eventsource', use: ['EventSource'] }]),
      web('hand-written', 'Hand-written with web APIs'),
    ],
    rows: [
      {
        label: 'Decode 2,000 LLM token events, one per chunk',
        test: 'stream: LLM tokens, one event per chunk',
      },
      {
        label: 'Decode named events in 16 KB chunks',
        test: 'stream: named events in 16 KB chunks',
      },
      { label: 'Decode events in 2 to 16 byte chunks', test: 'stream: small chunks' },
      {
        label: 'Decode a 1 MB data line in 128-byte chunks',
        test: 'stream: 1 MB data line',
      },
      {
        label: 'Decode 2,000 LLM token events from one string',
        test: 'whole text: LLM tokens, one event per chunk',
      },
      { label: 'Encode LLM token events', test: 'encode: LLM tokens' },
      {
        label: 'Encode LLM token events through `EncoderStream`',
        test: 'EncoderStream: LLM tokens',
        tasks: { 'hand-written': 'hand-written with TextEncoderStream' },
      },
      {
        label: 'Connect and read 2,000 events',
        test: 'connect: one response of 2000 events',
        tasks: { 'eventsource-parser': 'fetch and eventsource-parser' },
      },
    ],
  },
  streams: {
    columns: [
      ours('streams', ['transform', 'fromIterable', 'toText']),
      lib('get-stream'),
      lib('concat-stream'),
      lib('bl', [{ from: 'bl', use: ['BufferListStream'] }]),
      lib('stream-to-array'),
      lib('raw-body'),
      lib('merge2'),
      lib('merge-stream'),
      lib('through2'),
      web('Platform', 'Web streams by hand'),
    ],
    rows: [
      {
        label: 'Collect 6.8 MB into bytes',
        test: 'collects 6.8 MB into bytes within',
        tasks: { Platform: 'Response.arrayBuffer()' },
      },
      { label: 'Collect 6.8 MB into bytes with a 10 MB limit', test: 'with a 10 MB limit' },
      {
        label: 'Collect 6.8 MB into text',
        test: 'collects 6.8 MB into text',
        tasks: { Platform: 'Response.text()' },
      },
      { label: 'Collect 100,000 objects into an array', test: 'collects 100,000 objects' },
      {
        label: 'Merge 3 streams of 10,000 objects',
        test: 'merges 3 streams',
        tasks: { Platform: 'hand-written merge' },
      },
      {
        label: 'Map 30,000 objects',
        test: 'maps 30,000 objects',
        tasks: { Platform: 'TransformStream' },
      },
      {
        label: 'Split 6.8 MB into 3 branches',
        test: 'into 3 branches',
        tasks: { Platform: 'chained tee()' },
      },
    ],
  },
  timers: {
    columns: [
      ours('timers', ['sleep', 'retry', 'poll', 'debounce']),
      lib('p-retry'),
      lib('async-retry'),
      lib('p-wait-for'),
      lib('delay'),
      lib('lodash.debounce'),
      lib('lodash.throttle'),
      lib('throttle-debounce'),
      lib('p-debounce'),
      web('Platform', '`setTimeout` or `try`/`catch` by hand'),
    ],
    rows: [
      {
        label: 'Retry 10 attempts',
        test: 'retry overhead per attempt without a signal',
        tasks: { Platform: 'try/catch loop' },
      },
      {
        label: 'Retry 10 attempts with a signal',
        test: 'retry overhead per attempt with a signal',
      },
      { label: 'Poll until the 10th check succeeds', test: 'polls until the 10th check' },
      { label: 'Sleep for 1 ms', test: 'sleeps for 1 ms', tasks: { Platform: 'setTimeout' } },
      { label: 'Debounce a burst of 1,000 calls', test: 'debounced calls' },
      { label: 'Throttle a burst of 1,000 calls', test: 'throttled calls' },
    ],
  },
  'web-push': {
    columns: [
      ours('web-push', ['generateVapidKeys', 'send']),
      { name: 'web-push (node:crypto)', header: 'web-push', imports: [{ from: 'web-push' }] },
      web('WebCrypto', 'The same WebCrypto calls by hand'),
    ],
    rows: [
      { label: 'Encrypt a 186-byte payload', test: /^encrypts a \d+-byte payload/ },
      { label: 'Encrypt 64 payloads at once', test: 'encrypts 64 payloads' },
      { label: 'Sign a VAPID JWT', test: 'signs a VAPID JWT' },
      {
        label: 'Build a push request',
        test: 'builds a push request',
        tasks: { 'web-push (node:crypto)': 'web-push generateRequestDetails (node:crypto)' },
      },
    ],
  },
  webhooks: {
    columns: [
      webhooks,
      noble(webhooks, [
        { from: '@noble/hashes/hmac.js', use: ['hmac'] },
        { from: '@noble/hashes/sha2.js', use: ['sha256'] },
      ]),
      lib('standardwebhooks', [{ from: 'standardwebhooks', use: ['Webhook'] }]),
      lib('svix', [{ from: 'svix', use: ['Webhook'] }]),
      {
        name: 'stripe constructEventAsync with WebCrypto',
        header: 'stripe, `constructEventAsync`',
        imports: [{ from: 'stripe' }],
      },
      {
        name: 'stripe constructEvent with node:crypto',
        header: 'stripe, `constructEvent`',
        imports: [{ from: 'stripe' }],
      },
      {
        name: '@octokit/webhooks-methods for the web',
        header: '@octokit/webhooks-methods, web build',
        imports: [{ from: '@octokit/webhooks-methods', use: ['verify'] }],
      },
      {
        name: '@octokit/webhooks-methods for Node',
        header: '@octokit/webhooks-methods, Node build',
        imports: [{ from: '@octokit/webhooks-methods', use: ['verify'] }],
      },
      {
        name: '@slack/bolt verifySlackRequest',
        header: '@slack/bolt',
        imports: [
          { from: '@slack/bolt/dist/receivers/verify-request.js', use: ['verifySlackRequest'] },
        ],
      },
      web('crypto.subtle', '`crypto.subtle` by hand'),
      node('node:crypto', '`node:crypto` by hand'),
    ],
    rows: [
      { label: 'Verify a Standard Webhook', test: 'Standard Webhook' },
      { label: 'Verify a Stripe webhook', test: 'verifies a Stripe webhook' },
      {
        label: 'Verify a GitHub webhook',
        test: 'verifies a GitHub webhook',
        tasks: { 'node:crypto': 'node:crypto createHmac' },
      },
      {
        label: 'Verify a Slack request',
        test: 'verifies a Slack request',
        tasks: { 'crypto.subtle': 'crypto.subtle importKey and verify' },
      },
    ],
  },
  websockets: {
    columns: [
      ours('websockets', ['connect']),
      lib('reconnecting-websocket'),
      lib('partysocket', [{ from: 'partysocket/ws' }]),
      lib('websocket-ts', [{ from: 'websocket-ts', use: ['Websocket'] }]),
      { name: 'ws listeners', header: 'ws', imports: [{ from: 'ws', use: ['WebSocketServer'] }] },
      web('WebSocket', '`WebSocket`'),
    ],
    rows: [
      { label: 'Echo 1,000 messages through a local server', test: /^echoes \d+ messages/ },
      {
        label: 'Echo 1,000 messages on the server',
        test: 'through fromSocket',
        tasks: { '@portable/websockets': 'fromSocket' },
      },
    ],
  },
};
