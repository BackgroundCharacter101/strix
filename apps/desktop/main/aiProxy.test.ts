import { describe, it, expect, vi, afterEach } from 'vitest';
import { streamChat, detectLocalModels } from './aiProxy';

function sseStream(chunks: string[]): unknown {
  const enc = new TextEncoder();
  let i = 0;
  return new ReadableStream({
    pull(controller: ReadableStreamDefaultController<Uint8Array>) {
      if (i < chunks.length) {
        controller.enqueue(enc.encode(chunks[i++]));
      } else {
        controller.close();
      }
    },
  });
}

function mockFetch(res: { ok?: boolean; status?: number; body?: unknown }) {
  return vi.fn(async () => ({ ok: true, status: 200, ...res }) as unknown as Response);
}

const params = {
  baseURL: 'https://api.example.com/v1',
  apiKey: 'sk-test',
  model: 'gpt-test',
  messages: [{ role: 'user', content: 'hi' }],
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe('streamChat', () => {
  it('collects content deltas across SSE chunks and stops at [DONE]', async () => {
    vi.stubGlobal(
      'fetch',
      mockFetch({
        body: sseStream([
          'data: {"choices":[{"delta":{"content":"Hel"}}]}\n\n',
          'data: {"choices":[{"delta":{"content":"lo"}}]}\n',
          '\ndata: {"choices":[{"delta":{"content":"!"}}]}\n\n',
          'data: [DONE]\n\n',
          'data: {"choices":[{"delta":{"content":"ignored"}}]}\n\n',
        ]),
      }),
    );
    const tokens: string[] = [];
    const r = await streamChat(params, (t) => tokens.push(t), () => false);
    expect(r.ok).toBe(true);
    expect(tokens.join('')).toBe('Hello!');
  });

  it('posts to <baseURL>/chat/completions with bearer auth and stream:true', async () => {
    const fetchMock = mockFetch({ body: sseStream(['data: [DONE]\n\n']) });
    vi.stubGlobal('fetch', fetchMock);
    await streamChat({ ...params, baseURL: 'https://api.example.com/v1/' }, () => {}, () => false);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.example.com/v1/chat/completions');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer sk-test');
    const sent = JSON.parse(init.body as string);
    expect(sent.stream).toBe(true);
    expect(sent.model).toBe('gpt-test');
  });

  it('surfaces a provider HTTP error', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: false,
        status: 401,
        text: async () => 'bad key',
      }) as unknown as Response),
    );
    const r = await streamChat(params, () => {}, () => false);
    expect(r.ok).toBe(false);
    expect(r.error).toContain('401');
  });

  it('stops early when cancelled', async () => {
    vi.stubGlobal(
      'fetch',
      mockFetch({
        body: sseStream([
          'data: {"choices":[{"delta":{"content":"a"}}]}\n\n',
          'data: {"choices":[{"delta":{"content":"b"}}]}\n\n',
        ]),
      }),
    );
    const tokens: string[] = [];
    const r = await streamChat(params, (t) => tokens.push(t), () => true);
    expect(r.ok).toBe(true);
    expect(tokens).toEqual([]);
  });
});

describe('detectLocalModels', () => {
  it('lists Ollama tags + LM Studio models as direct-model entries', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url.includes('11434')) {
          return { ok: true, json: async () => ({ models: [{ name: 'qwen2.5-coder:7b' }] }) } as unknown as Response;
        }
        if (url.includes('1234')) {
          return { ok: true, json: async () => ({ data: [{ id: 'local-model' }] }) } as unknown as Response;
        }
        return { ok: false } as unknown as Response;
      }),
    );
    const found = await detectLocalModels();
    expect(found.find((m) => m.provider === 'Ollama')).toMatchObject({
      baseURL: 'http://127.0.0.1:11434/v1',
      model: 'qwen2.5-coder:7b',
    });
    expect(found.find((m) => m.provider === 'LM Studio')?.model).toBe('local-model');
  });

  it('returns empty when nothing is running (fetch rejects)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('ECONNREFUSED');
      }),
    );
    expect(await detectLocalModels()).toEqual([]);
  });
});
