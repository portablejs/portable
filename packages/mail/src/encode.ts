import * as MimeHeaders from '@portable/mime-headers'
import { type Addresses, format, parse, wordEncoding } from './addresses.js'
import {
  type Body,
  type Content,
  type TransferEncoding,
  chooseTextEncoding,
  encodeStream,
  encodeSync,
  isContent,
} from './body.js'
import { InvalidInputError } from './errors.js'

/**
 * Extra header fields, by name. A list writes one field per value, in order.
 *
 * @example
 * ```ts
 * const headers: Mail.HeaderFields = { 'List-Unsubscribe': '<https://example.com/u/1>', Keywords: ['a', 'b'] }
 * ```
 */
export type HeaderFields = Readonly<Record<string, string | readonly string[]>>

/**
 * An alternative body, such as a calendar invitation next to the text and HTML.
 *
 * @example
 * ```ts
 * const invite: Mail.Part = { contentType: 'text/calendar; charset=utf-8; method=REQUEST', content: ics }
 * ```
 */
export type Part = {
  readonly content: Content
  /** Such as `'text/calendar; charset=utf-8; method=REQUEST'`. */
  readonly contentType: string
  readonly headers?: HeaderFields | undefined
  /** @default `7bit`, `quoted-printable` or `base64` for text, chosen from the content; `8bit` for `message/*`; otherwise `base64` */
  readonly transferEncoding?: TransferEncoding | undefined
}

/**
 * A file attached to the message, or an inline image the HTML refers to as `cid:<cid>`.
 *
 * @example
 * ```ts
 * const logo: Mail.Attachment = { content: pngBytes, contentType: 'image/png', cid: 'logo' }
 * const report: Mail.Attachment = { content: file, filename: 'report.pdf' }
 * ```
 */
export type Attachment = {
  readonly content: Content
  /** @default the `File`'s name, or none */
  readonly filename?: string | undefined
  /** @default the `Blob`'s type, or `'application/octet-stream'` */
  readonly contentType?: string | undefined
  /** Content-ID that the HTML refers to as `cid:<cid>`. Puts the attachment beside the HTML in `multipart/related`. */
  readonly cid?: string | undefined
  /** @default `'inline'` for an `image/*` with a `cid`, otherwise `'attachment'` */
  readonly disposition?: 'attachment' | 'inline' | undefined
  readonly headers?: HeaderFields | undefined
  /** @default `8bit` for `message/*`, otherwise `base64` */
  readonly transferEncoding?: TransferEncoding | undefined
}

/**
 * A message to encode. Every field is optional; a message with no body gets an empty text body.
 *
 * @example
 * ```ts
 * const message: Mail.Message = { from: 'mari@example.com', to: 'jaan@example.com', subject: 'Tere', text: 'Tere!' }
 * ```
 */
export type Message = {
  readonly from?: Addresses | undefined
  readonly sender?: Addresses | undefined
  readonly to?: Addresses | undefined
  readonly cc?: Addresses | undefined
  /** Read by `envelope`. `encode` leaves the header out unless `keepBcc` is set. */
  readonly bcc?: Addresses | undefined
  readonly replyTo?: Addresses | undefined
  readonly inReplyTo?: string | undefined
  readonly references?: string | readonly string[] | undefined
  readonly subject?: string | undefined
  /** `Message-ID`, with or without angle brackets. @default a random id at the `From` domain */
  readonly messageId?: string | undefined
  /** @default the time `encode` is called */
  readonly date?: Date | string | undefined
  /** Plain text body. */
  readonly text?: Content | undefined
  /** AMP for Email body, placed between the text and the HTML. */
  readonly amp?: Content | undefined
  /** HTML body. Attachments with a `cid` are placed beside it. */
  readonly html?: Content | undefined
  /** More alternatives, after the HTML. */
  readonly alternatives?: readonly Part[] | undefined
  readonly attachments?: readonly Attachment[] | undefined
  /** Extra header fields of the message. */
  readonly headers?: HeaderFields | undefined
}

export declare namespace encode {
  type Options = {
    /**
     * Start of every multipart boundary. Each multipart part appends its number, counted from 1
     * in the order the parts are written. Up to 60 characters from RFC 2046's `bchars`.
     * @default `'=_'` and 16 random hex digits and `'_'`, which no base64 or quoted-printable line can contain
     */
    boundary?: string | undefined
    /**
     * Charset for encoded words in headers and for text bodies given as strings, for mail that
     * has to use one other than UTF-8. `@portable/charset` provides encoders. @default UTF-8
     */
    charset?: MimeHeaders.CharsetEncoder | undefined
    /** Write the `Bcc` header, for a transport such as sendmail that reads recipients from it. @default false */
    keepBcc?: boolean | undefined
  }
}

type Leaf = {
  readonly contentType: string
  readonly headers: readonly string[]
  /** Headers chosen from the content, written after the message fields when the leaf is the root. */
  readonly computed: readonly string[]
  readonly content: Content | undefined
  readonly body: Body
}

type Multipart = {
  readonly contentType: string
  readonly headers: readonly string[]
  readonly computed: readonly string[]
  readonly boundary: string
  readonly children: readonly Node[]
}

type Node = Leaf | Multipart

type Context = {
  readonly charset: MimeHeaders.CharsetEncoder | undefined
  readonly prefix: string
  /** Content streams not read yet, cancelled when the output is cancelled or fails. */
  readonly streams: Set<ReadableStream<Uint8Array>>
  id: number
  reader: ReadableStreamDefaultReader<Uint8Array | string> | undefined
  cancelled: boolean
}

/**
 * Encodes a message as a raw RFC 5322 message, ready for an SMTP `DATA` command, an `.eml`
 * file or an API that takes raw MIME. Text and HTML become `multipart/alternative`, attachments
 * with a `cid` go into `multipart/related` beside the HTML, and other attachments into
 * `multipart/mixed`. Blob and stream content is read as the result is read.
 *
 * Mistakes in the message throw before anything is read. A content stream that fails errors
 * the result, and cancelling the result cancels every content stream not yet read to the end.
 *
 * @example
 * ```ts
 * import * as Mail from '@portable/mail'
 *
 * const raw = Mail.encode({
 *   from: 'Mari <mari@example.com>',
 *   to: 'jaan@example.com',
 *   subject: 'Tere',
 *   text: 'Tere, Jaan!',
 *   html: '<p>Tere, Jaan! <img src="cid:logo"></p>',
 *   attachments: [
 *     { cid: 'logo', content: logoBytes, contentType: 'image/png' },
 *     { content: await (await fetch(reportUrl)).blob(), filename: 'report.pdf' },
 *   ],
 * })
 * await new Response(raw).text()
 * ```
 *
 * @throws {InvalidInputError} When an address, header, content type or file name can't be written.
 * @throws {TypeError} When content isn't a string, `Uint8Array`, `Blob` or `ReadableStream`, or a stream is locked or given twice.
 */
export function encode(message: Message, options: encode.Options = {}): ReadableStream<Uint8Array> {
  const context: Context = {
    charset: options.charset,
    prefix: checkBoundary(options.boundary ?? `=_${randomHex(8)}_`),
    streams: new Set(),
    id: 0,
    reader: undefined,
    cancelled: false,
  }
  let root: Node
  let fields: string[]
  try {
    fields = messageFields(message, options.keepBcc ?? false, context.charset)
    root = tree(message, context)
  } catch (error) {
    if (error instanceof MimeHeaders.InvalidInputError)
      throw new InvalidInputError(error.message, { cause: error })
    throw error
  }
  const head = [
    ...root.headers,
    ...fields,
    ...root.computed,
    'MIME-Version: 1.0',
    root.contentType,
  ].join('\r\n')
  return output(write(root, head, context), context)
}

const reserved = new Set([
  'from',
  'sender',
  'to',
  'cc',
  'bcc',
  'reply-to',
  'in-reply-to',
  'references',
  'subject',
  'message-id',
  'date',
  'mime-version',
  'content-type',
  'content-transfer-encoding',
  'content-disposition',
  'content-id',
])

function checkBoundary(prefix: string): string {
  if (!/^[0-9A-Za-z'()+_,\-./:=? ]{0,60}$/.test(prefix))
    throw new RangeError(`boundary ${JSON.stringify(prefix)} isn't up to 60 characters of bchars.`)
  return prefix
}

function randomHex(bytes: number): string {
  let hex = ''
  for (const byte of crypto.getRandomValues(new Uint8Array(bytes)))
    hex += byte.toString(16).padStart(2, '0')
  return hex
}

const fold = (name: string, value: string) =>
  MimeHeaders.fold(`${name}: ${value}`, { lineLength: 75 })

const lineBreaks = /\r\n|\r|\n/g

/** An unstructured value (RFC 5322 section 3.2.5), such as a subject. */
function text(value: string, charset: MimeHeaders.CharsetEncoder | undefined): string {
  const line = value.replace(lineBreaks, ' ')
  // oxlint-disable-next-line no-control-regex
  const control = /[\x00-\x08\x0b-\x1f\x7f]/.test(line)
  if (!control && MimeHeaders.encodeWords(line) === line) return line
  return MimeHeaders.encodeWord(line, { charset, encoding: wordEncoding(line), maxLength: 52 })
}

// oxlint-disable-next-line no-control-regex
const controls = /[\x00-\x08\x0a-\x1f\x7f]/g

function msgId(value: string): string {
  let id = value.replace(lineBreaks, ' ').replace(controls, '')
  if (!id.startsWith('<')) id = '<' + id
  if (!id.endsWith('>')) id += '>'
  return id
}

/** Removes whitespace inside each `<...>` and splits the rest at whitespace, in linear time. */
function references(value: string | readonly string[]): string {
  const ids: string[] = []
  for (const entry of typeof value === 'string' ? [value] : value) {
    // oxlint-disable-next-line no-control-regex
    const line = entry.replace(lineBreaks, ' ').replace(/[\x00-\x08\x0b-\x1f\x7f]/g, '')
    const lastClose = line.lastIndexOf('>')
    let joined = ''
    for (let i = 0; i < line.length; i++) {
      if (line[i] === '<' && i < lastClose) {
        const close = line.indexOf('>', i)
        joined += line.slice(i, close + 1).replace(/\s+/g, '')
        i = close
      } else joined += line[i]
    }
    for (const id of joined.split(/\s+/)) if (id !== '') ids.push(msgId(id))
  }
  return ids.join(' ')
}

function date(value: Date): string {
  if (Number.isNaN(value.getTime())) throw new InvalidInputError('date is an invalid Date.')
  return value.toUTCString().replace('GMT', '+0000')
}

function messageFields(
  message: Message,
  keepBcc: boolean,
  charset: MimeHeaders.CharsetEncoder | undefined,
): string[] {
  const fields = custom(message.headers, charset)
  const addresses = (name: string, input: Addresses | undefined) => {
    if (input === undefined) return
    const entries = parse(input)
    if (entries.length > 0) fields.push(fold(name, format(entries, charset)))
  }
  addresses('From', message.from)
  addresses('Sender', message.sender)
  addresses('To', message.to)
  addresses('Cc', message.cc)
  if (keepBcc) addresses('Bcc', message.bcc)
  else if (message.bcc !== undefined) parse(message.bcc)
  addresses('Reply-To', message.replyTo)
  if (message.inReplyTo) fields.push(fold('In-Reply-To', msgId(message.inReplyTo)))
  if (message.references !== undefined) {
    const value = references(message.references)
    if (value !== '') fields.push(fold('References', value))
  }
  if (message.subject) fields.push(fold('Subject', text(message.subject, charset)))
  const from = message.from === undefined ? [] : parse(message.from)
  const first = from.flatMap((entry) => ('group' in entry ? entry.group : [entry]))[0]
  const domain = first ? first.address.slice(first.address.lastIndexOf('@') + 1) : 'localhost'
  fields.push(
    fold(
      'Message-ID',
      message.messageId
        ? msgId(message.messageId)
        : `<${randomHex(4)}-${randomHex(2)}-${randomHex(2)}-${randomHex(2)}-${randomHex(6)}@${domain}>`,
    ),
  )
  const sent = message.date ?? new Date()
  fields.push(fold('Date', typeof sent === 'string' ? text(sent, charset) : date(sent)))
  return fields
}

function custom(
  headers: HeaderFields | undefined,
  charset: MimeHeaders.CharsetEncoder | undefined,
): string[] {
  const fields: string[] = []
  if (!headers) return fields
  for (const [name, value] of Object.entries(headers)) {
    if (!/^[\x21-\x39\x3b-\x7e]+$/.test(name))
      throw new InvalidInputError(`${JSON.stringify(name)} isn't a header name.`)
    if (reserved.has(name.toLowerCase()))
      throw new InvalidInputError(`Set ${name} with its own option, not in headers.`)
    for (const entry of typeof value === 'string' ? [value] : value)
      fields.push(fold(name, text(entry, charset)))
  }
  return fields
}

const textType = /^text\//i
const messageType = /^message\//i

function contentType(value: string, drop?: string): MimeHeaders.Value {
  const parsed = MimeHeaders.parseValue(value)
  if (!/^[!#$%&'*+.^_`|~0-9a-z-]+\/[!#$%&'*+.^_`|~0-9a-z-]+$/i.test(parsed.value))
    throw new InvalidInputError(`${JSON.stringify(value)} isn't a content type.`)
  if (/^multipart\//i.test(parsed.value))
    throw new InvalidInputError(`A body or attachment can't be ${parsed.value}.`)
  if (drop === undefined) return parsed
  const params: Record<string, string> = {}
  for (const [key, param] of Object.entries(parsed.params)) if (key !== drop) params[key] = param
  return { value: parsed.value, params }
}

/** The `name` parameter that clients which ignore `filename` read, as an encoded word if needed. */
function nameParam(filename: string, charset: MimeHeaders.CharsetEncoder | undefined): string {
  if (/[^\x20-\x7e]|"|=\?/.test(filename))
    return `"${MimeHeaders.encodeWord(filename, { charset, encoding: wordEncoding(filename), maxLength: 52 })}"`
  return /[\s'\\;:/=(),<>@[\]?]|^-/.test(filename)
    ? `"${filename.replace(/["\\]/g, '\\$&')}"`
    : filename
}

function leaf(
  context: Context,
  content: Content,
  type: string,
  body: Body,
  extra: {
    headers?: HeaderFields | undefined
    cid?: string | undefined
    disposition?: string
    computed?: boolean
  },
): Leaf {
  context.id++
  if (!isContent(content))
    throw new TypeError('Content must be a string, Uint8Array, Blob or ReadableStream.')
  if (content instanceof ReadableStream) {
    if (content.locked || context.streams.has(content))
      throw new TypeError('A content stream is locked or given twice; it can be read only once.')
    context.streams.add(content)
  }
  const headers = custom(extra.headers, context.charset)
  if (extra.cid !== undefined)
    // oxlint-disable-next-line no-control-regex
    headers.push(fold('Content-ID', `<${extra.cid.replace(/[<>\x00-\x1f\x7f]/g, '')}>`))
  const encoding = fold('Content-Transfer-Encoding', body.encoding)
  if (!extra.computed) headers.push(encoding)
  if (extra.disposition !== undefined) headers.push(fold('Content-Disposition', extra.disposition))
  const computed = extra.computed ? [encoding] : []
  return { contentType: fold('Content-Type', type), headers, computed, content, body }
}

function textBody(context: Context, content: Content, subtype: string): Leaf {
  const charset = context.charset
  const encoding = chooseTextEncoding(content)
  const bytes = charset && typeof content === 'string' ? charset.encode(content) : content
  const type = `text/${subtype}; charset=${charset && typeof content === 'string' ? charset.name : 'utf-8'}`
  return leaf(context, bytes, type, { encoding, text: true }, { computed: true })
}

function part(context: Context, alternative: Part): Leaf {
  const type = contentType(alternative.contentType)
  const isText = textType.test(type.value)
  const encoding =
    alternative.transferEncoding ??
    (isText
      ? chooseTextEncoding(alternative.content)
      : messageType.test(type.value)
        ? '8bit'
        : 'base64')
  return leaf(
    context,
    alternative.content,
    MimeHeaders.formatValue(type),
    { encoding, text: isText },
    { headers: alternative.headers, computed: alternative.transferEncoding === undefined },
  )
}

function attachment(context: Context, file: Attachment): Leaf {
  const content = file.content
  const filename =
    file.filename ??
    (content instanceof Blob && 'name' in content && typeof content.name === 'string'
      ? content.name
      : undefined)
  const given =
    file.contentType ??
    (content instanceof Blob && content.type ? content.type : 'application/octet-stream')
  const type = contentType(given, filename === undefined ? undefined : 'name')
  let typeValue = MimeHeaders.formatValue(type)
  if (filename !== undefined) typeValue += '; name=' + nameParam(filename, context.charset)
  const disposition = MimeHeaders.formatValue({
    value:
      file.disposition ??
      (file.cid !== undefined && /^image\//i.test(type.value) ? 'inline' : 'attachment'),
    params: filename === undefined ? {} : { filename },
  })
  const encoding = file.transferEncoding ?? (messageType.test(type.value) ? '8bit' : 'base64')
  return leaf(
    context,
    content,
    typeValue,
    { encoding, text: textType.test(type.value) },
    { headers: file.headers, cid: file.cid, disposition },
  )
}

function multipart(
  context: Context,
  type: string,
  params: Record<string, string>,
  children: () => Node[],
): Multipart {
  const boundary = context.prefix + ++context.id
  return {
    contentType: fold(
      'Content-Type',
      MimeHeaders.formatValue({ value: type, params: { ...params, boundary } }),
    ),
    headers: [],
    computed: [],
    boundary,
    children: children(),
  }
}

function tree(message: Message, context: Context): Node {
  const alternatives: (() => Node)[] = []
  let html: (() => Node) | undefined
  const nonEmpty = (content: Content | undefined): content is Content =>
    content !== undefined && content !== ''
  if (nonEmpty(message.text)) {
    const content = message.text
    alternatives.push(() => textBody(context, content, 'plain'))
  }
  if (nonEmpty(message.amp)) {
    const content = message.amp
    alternatives.push(() => textBody(context, content, 'x-amp-html'))
  }
  if (nonEmpty(message.html)) {
    const content = message.html
    html = () => textBody(context, content, 'html')
    alternatives.push(html)
  }
  for (const alternative of message.alternatives ?? []) {
    const make = () => part(context, alternative)
    if (/^\s*text\/html\s*(;|$)/i.test(alternative.contentType)) html = make
    alternatives.push(make)
  }
  const files = message.attachments ?? []
  const related = html ? files.filter((file) => file.cid !== undefined) : []
  const attached = html ? files.filter((file) => file.cid === undefined) : files

  const htmlNode = html
  const relatedNode =
    htmlNode && related.length > 0
      ? () =>
          multipart(context, 'multipart/related', { type: 'text/html' }, () => [
            htmlNode(),
            ...related.map((file) => attachment(context, file)),
          ])
      : undefined
  const body = (make: () => Node) => (relatedNode && make === htmlNode ? relatedNode : make)
  const alternativeNode =
    alternatives.length > 1
      ? () =>
          multipart(context, 'multipart/alternative', {}, () =>
            alternatives.map((make) => body(make)()),
          )
      : undefined

  if (attached.length > 1 || (alternatives.length > 0 && attached.length === 1))
    return multipart(context, 'multipart/mixed', {}, () => [
      ...(alternativeNode ? [alternativeNode()] : alternatives.map((make) => body(make)())),
      ...attached.map((file) => attachment(context, file)),
    ])
  if (alternativeNode) return alternativeNode()
  if (relatedNode) return relatedNode()
  const only = alternatives[0]
  if (only) return only()
  const single = attached[0]
  if (single) return attachment(context, single)
  context.id++
  return {
    contentType: 'Content-Type: text/plain',
    headers: [],
    computed: [],
    content: undefined,
    body: { encoding: '7bit', text: true },
  }
}

const encoder = new TextEncoder()

async function* write(root: Node, head: string, context: Context): AsyncGenerator<Uint8Array> {
  let pending = ''
  let last = 0

  async function* node(current: Node, header: string): AsyncGenerator<Uint8Array> {
    pending += header + '\r\n\r\n'
    last = 0x0a
    if ('children' in current) {
      for (let i = 0; i < current.children.length; i++) {
        const child = current.children[i]!
        pending += (i > 0 ? '\r\n--' : '--') + current.boundary + '\r\n'
        yield* node(child, [child.contentType, ...child.headers, ...child.computed].join('\r\n'))
      }
      pending += '\r\n--' + current.boundary + '--\r\n'
      return
    }
    const content = current.content
    if (content === undefined || content === '') return
    if (typeof content === 'string' || content instanceof Uint8Array) {
      const encoded = encodeSync(content, current.body)
      if (typeof encoded === 'string') {
        pending += encoded
        if (encoded.length > 0) last = encoded.charCodeAt(encoded.length - 1)
      } else if (encoded.length > 0) {
        yield encoder.encode(pending)
        pending = ''
        yield encoded
        last = encoded[encoded.length - 1]!
      }
      return
    }
    let source: ReadableStream<Uint8Array>
    if (content instanceof ReadableStream) {
      context.streams.delete(content)
      source = content
    } else source = content.stream()
    const reader = encodeStream(source, current.body).getReader()
    context.reader = reader
    try {
      if (pending !== '') yield encoder.encode(pending)
      pending = ''
      for (;;) {
        const { done, value } = await reader.read()
        if (context.cancelled) throw new Error('cancelled')
        if (done) return
        if (typeof value === 'string') {
          if (value.length === 0) continue
          pending += value
          last = value.charCodeAt(value.length - 1)
          if (pending.length < 65536) continue
          yield encoder.encode(pending)
          pending = ''
        } else if (value.length > 0) {
          if (pending !== '') yield encoder.encode(pending)
          pending = ''
          yield value
          last = value[value.length - 1]!
        }
      }
    } finally {
      context.reader = undefined
      reader.releaseLock()
    }
  }

  yield* node(root, head)
  if (!('children' in root) && last !== 0x0a) pending += '\r\n'
  if (pending !== '') yield encoder.encode(pending)
}

function output(chunks: AsyncGenerator<Uint8Array>, context: Context): ReadableStream<Uint8Array> {
  const release = (reason: unknown) =>
    Promise.all([...context.streams].map((stream) => stream.cancel(reason).catch(() => {})))
  return new ReadableStream({
    async pull(controller) {
      let result: IteratorResult<Uint8Array>
      try {
        result = await chunks.next()
      } catch (error) {
        if (context.cancelled) return
        await release(error)
        throw error
      }
      if (result.done) controller.close()
      else controller.enqueue(result.value)
    },
    async cancel(reason) {
      context.cancelled = true
      await Promise.all([
        context.reader?.cancel(reason).catch(() => {}),
        release(reason),
        chunks.return(undefined).catch(() => {}),
      ])
    },
  })
}
