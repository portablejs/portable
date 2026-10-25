import * as Bytes from '@portable/bytes';
import { CommandError } from './errors.js';

export type Reply = {
  code: number;
  enhancedCode: string | undefined;
  /** The text of each line, without the code. */
  lines: string[];
  /** The reply as received, lines joined with `\n`. */
  response: string;
};

export type Reader = {
  read(command: string): Promise<Reply>;
  /** Drops buffered bytes, such as plaintext that followed a STARTTLS reply. */
  discard(): void;
  release(): void;
  cancel(): void;
};

export const maxReplyLength: number = 1024 * 1024;

const CR = 13;
const LF = 10;
const empty = new Uint8Array(0);
const utf8 = new TextDecoder('utf-8', { fatal: true });
const replyLine = /^(\d{3})(?:([ -])(.*))?$/s;
const enhanced = /^([245]\.\d{1,3}\.\d{1,3})(?:\s|$)/;

function decode(bytes: Uint8Array): string {
  try {
    return utf8.decode(bytes);
  } catch {
    let text = '';
    for (const byte of bytes) {
      text += String.fromCharCode(byte);
    }
    return text;
  }
}

function toReply(code: number, lines: string[], raw: string[]): Reply {
  return {
    code,
    enhancedCode: enhanced.exec(lines[0] ?? '')?.[1],
    lines,
    response: raw.join('\n'),
  };
}

export function createReader(readable: ReadableStream<Uint8Array>): Reader {
  const reader = readable.getReader();
  let chunk: Uint8Array = empty;
  let offset = 0;
  let parts: Uint8Array[] = [];
  let partsLength = 0;

  const closed = (command: string, cause?: unknown) => {
    const line = decode(Bytes.concat(parts));
    const match = replyLine.exec(line);
    const code = match ? Number(match[1]) : 0;
    const reply = code >= 400 ? toReply(code, [match?.[3] ?? ''], [line]) : undefined;
    return new CommandError({
      code: 'ECONNECTION',
      message: 'Connection closed unexpectedly',
      command,
      reply,
      cause,
    });
  };

  const readLine = async (command: string, budget: number): Promise<Uint8Array> => {
    for (;;) {
      const lf = chunk.indexOf(LF, offset);
      if (lf !== -1) {
        const piece = chunk.subarray(offset, lf);
        offset = lf + 1;
        let line = piece;
        if (parts.length > 0) {
          parts.push(piece);
          line = Bytes.concat(parts);
          parts = [];
          partsLength = 0;
        }
        if (line.length > budget) {
          throw tooLong(command);
        }
        return line[line.length - 1] === CR ? line.subarray(0, -1) : line;
      }
      if (offset < chunk.length) {
        parts.push(chunk.subarray(offset));
        partsLength += chunk.length - offset;
        if (partsLength > budget) {
          throw tooLong(command);
        }
      }
      chunk = empty;
      offset = 0;
      let result: ReadableStreamReadResult<Uint8Array>;
      try {
        result = await reader.read();
      } catch (cause) {
        throw closed(command, cause);
      }
      if (result.done) {
        throw closed(command);
      }
      chunk = result.value;
    }
  };

  return {
    async read(command) {
      const lines: string[] = [];
      const raw: string[] = [];
      let budget = maxReplyLength;
      for (;;) {
        const bytes = await readLine(command, budget);
        if (bytes.length === 0) {
          continue;
        }
        budget -= bytes.length;
        const line = decode(bytes);
        const match = replyLine.exec(line);
        if (!match) {
          throw new CommandError({
            code: 'EPROTOCOL',
            message: `Invalid reply line ${JSON.stringify(line)}`,
            command,
          });
        }
        lines.push(match[3] ?? '');
        raw.push(line);
        if (match[2] !== '-') {
          return toReply(Number(match[1]), lines, raw);
        }
      }
    },
    discard() {
      chunk = empty;
      offset = 0;
      parts = [];
      partsLength = 0;
    },
    release() {
      reader.releaseLock();
    },
    cancel() {
      reader.cancel().catch(() => {});
    },
  };
}

function tooLong(command: string) {
  return new CommandError({
    code: 'EPROTOCOL',
    message: `Reply exceeds ${maxReplyLength} bytes`,
    command,
  });
}
