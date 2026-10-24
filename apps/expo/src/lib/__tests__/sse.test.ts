import { describe, expect, it } from 'vitest';
import { createSSEParser, readSSEResponse, type SSEMessage } from '../sse';

function collect(): { out: SSEMessage[]; feed: (chunk: string) => void } {
  const out: SSEMessage[] = [];
  return { out, feed: createSSEParser((m) => out.push(m)) };
}

describe('createSSEParser', () => {
  it('parses event/data frames', () => {
    const { out, feed } = collect();
    feed('event: delta\ndata: {"text":"hi"}\n\n');
    feed('event: done\ndata: {"session_id":"s1"}\n\n');
    expect(out).toEqual([
      { event: 'delta', data: '{"text":"hi"}' },
      { event: 'done', data: '{"session_id":"s1"}' },
    ]);
  });

  it('handles events split across chunks (mid-line breaks)', () => {
    const { out, feed } = collect();
    feed('event: del');
    feed('ta\nda');
    feed('ta: {"text":"a}');
    feed('"b"}\n');
    feed('\n');
    // chunks concatenate to: event: delta\ndata: {"text":"a}"b"}\n\n
    expect(out).toEqual([{ event: 'delta', data: '{"text":"a}"b"}' }]);
  });

  it('ignores comments, ids and retry lines', () => {
    const { out, feed } = collect();
    feed(': keep-alive\nid: 42\nretry: 1000\nevent: delta\ndata: 1\n\n');
    expect(out).toEqual([{ event: 'delta', data: '1' }]);
  });

  it('defaults to message event name and joins multi-line data', () => {
    const { out, feed } = collect();
    feed('data: line1\ndata: line2\n\n');
    expect(out).toEqual([{ event: 'message', data: 'line1\nline2' }]);
  });

  it('accepts CRLF framing', () => {
    const { out, feed } = collect();
    feed('event: proposal\r\ndata: {"kind":"create_event"}\r\n\r\n');
    expect(out).toEqual([{ event: 'proposal', data: '{"kind":"create_event"}' }]);
  });

  it('does not dispatch an incomplete trailing frame until it ends', () => {
    const { out, feed } = collect();
    feed('event: delta\ndata: {"text":"x"}\n'); // no blank line yet
    expect(out).toEqual([]);
    feed('\n');
    expect(out).toHaveLength(1);
  });
});

describe('readSSEResponse', () => {
  function bodyOf(chunks: string[]) {
    const encoder = new TextEncoder();
    let i = 0;
    return {
      getReader() {
        return {
          async read() {
            if (i < chunks.length) return { done: false, value: encoder.encode(chunks[i++]!) };
            return { done: true };
          },
        };
      },
    };
  }

  it('streams a chat-shaped conversation (worker contract)', async () => {
    const out: SSEMessage[] = [];
    await readSSEResponse(
      bodyOf([
        'event: delta\ndata: {"text":"Let\'s"}\n\nevent: delta\ndata: {"text":" plan"}\n\n',
        'event: proposal\ndata: {"id":"p1","kind":"create_event","payload":{"name":"Long run"},"rationale":"build"}\n\n',
        'event: done\ndata: {"session_id":"s9","proposal_errors":[]}\n\n',
      ]),
      (m) => out.push(m),
    );
    expect(out.map((m) => m.event)).toEqual(['delta', 'delta', 'proposal', 'done']);
    expect(JSON.parse(out[2]!.data)).toMatchObject({ id: 'p1', kind: 'create_event' });
    expect(JSON.parse(out[3]!.data)).toMatchObject({ session_id: 's9' });
  });

  it('flushes a final event that arrives without trailing blank line', async () => {
    const out: SSEMessage[] = [];
    await readSSEResponse(bodyOf(['event: error\ndata: {"message":"boom"}\n\n']), (m) =>
      out.push(m),
    );
    expect(out).toEqual([{ event: 'error', data: '{"message":"boom"}' }]);
  });

  it('handles multi-byte UTF-8 split across chunk boundaries', async () => {
    const full = 'event: delta\ndata: {"text":"→ 👟"}\n\n';
    const bytes = new TextEncoder().encode(full);
    // 'event: delta\n' (14) + 'data: {"text":"' (16) → the arrow (E2 86 92) starts
    // at byte 30; splitting at 31 breaks it mid-sequence.
    const mid = 31;
    const out: SSEMessage[] = [];
    const chunks = [bytes.slice(0, mid), bytes.slice(mid)];
    let i = 0;
    await readSSEResponse(
      {
        getReader() {
          return {
            async read() {
              return i < chunks.length ? { done: false, value: chunks[i++]! } : { done: true };
            },
          };
        },
      },
      (m) => out.push(m),
    );
    expect(out).toEqual([{ event: 'delta', data: '{"text":"→ 👟"}' }]);
  });
});
