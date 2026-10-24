/**
 * Minimal SSE parser (pure — no fetch, no DOM). The worker's /api/chat emits
 * `event: <name>\ndata: <json>\n\n` frames; EventSource can't carry an
 * Authorization header, so we parse a fetch ReadableStream by hand.
 */

export interface SSEMessage {
  event: string;
  data: string;
}

export type SSEHandler = (msg: SSEMessage) => void;

/** CRLF-tolerant, comment-aware incremental parser. Dispatches on blank line. */
export function createSSEParser(onMessage: SSEHandler): (chunk: string) => void {
  let buf = '';
  let event = 'message';
  let dataLines: string[] = [];

  const dispatch = () => {
    if (dataLines.length > 0 || event !== 'message') {
      onMessage({ event, data: dataLines.join('\n') });
    }
    event = 'message';
    dataLines = [];
  };

  return (chunk: string) => {
    buf += chunk;
    const lines = buf.split(/\r?\n/);
    buf = lines.pop() ?? ''; // last (possibly partial) line stays buffered
    for (const line of lines) {
      if (line === '') {
        dispatch();
        continue;
      }
      if (line.startsWith(':')) continue; // SSE comment / keep-alive
      const colon = line.indexOf(':');
      const field = colon === -1 ? line : line.slice(0, colon);
      let value = colon === -1 ? '' : line.slice(colon + 1);
      if (value.startsWith(' ')) value = value.slice(1);
      if (field === 'event') event = value;
      else if (field === 'data') dataLines.push(value);
      // `id:` and `retry:` are ignored — we never reconnect client-side.
    }
  };
}

/** Minimal structural shape of a fetch ReadableStream reader. */
export interface ByteReader {
  read(): Promise<{ done: boolean; value?: Uint8Array }>;
}

export interface ReadableBody {
  getReader(): ByteReader;
}

/** Drain a streamed body, decoding UTF-8 chunks through the parser. */
export async function readSSEResponse(body: ReadableBody, onMessage: SSEHandler): Promise<void> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  const feed = createSSEParser(onMessage);
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    feed(decoder.decode(value, { stream: true }));
  }
  feed(decoder.decode()); // flush the decoder
  feed('\n\n'); // flush any buffered final event
}
