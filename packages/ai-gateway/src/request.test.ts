import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ChatCompletionChunk } from 'openai/resources/chat/completions';

const { create } = vi.hoisted(() => ({ create: vi.fn() }));
vi.mock('./client', () => ({
  ai: { chat: { completions: { create } } },
}));

import { runTask } from './request';

function chunk(content?: string, model?: string): ChatCompletionChunk {
  return {
    choices: [{ delta: content === undefined ? {} : { content } }],
    ...(model ? { model } : {}),
  } as unknown as ChatCompletionChunk;
}

async function* toStream(chunks: ChatCompletionChunk[]): AsyncIterable<ChatCompletionChunk> {
  for (const c of chunks) {
    yield c;
  }
}

describe('runTask', () => {
  beforeEach(() => {
    create.mockReset();
  });

  it('streams the completion through to the callbacks', async () => {
    create.mockResolvedValue(toStream([chunk('Hel', 'groq/llama'), chunk('lo')]));
    const tokens: string[] = [];
    let routedVia = '';

    await runTask(
      'explain',
      { filePath: 'a.ts', fileContent: 'x', selection: 'x' },
      { onToken: (t) => tokens.push(t), onDone: (v) => (routedVia = v) },
    );

    expect(tokens.join('')).toBe('Hello');
    expect(routedVia).toBe('groq/llama');

    const params = create.mock.calls[0][0];
    expect(params.model).toBe('auto');
    expect(params.stream).toBe(true);
    expect(params.messages[0].role).toBe('system');
  });

  it('caps tokens for autocomplete and leaves other tasks uncapped', async () => {
    create.mockResolvedValue(toStream([chunk('x')]));

    await runTask('autocomplete', { filePath: 'a.ts', fileContent: 'x' }, {
      onToken: () => {},
      onDone: () => {},
    });
    expect(create.mock.calls[0][0].max_tokens).toBe(150);

    create.mockResolvedValue(toStream([chunk('y')]));
    await runTask('chat', { filePath: 'a.ts', fileContent: 'x' }, {
      onToken: () => {},
      onDone: () => {},
    });
    expect(create.mock.calls[1][0].max_tokens).toBeUndefined();
  });

  it('uses a model override when provided, else the task default', async () => {
    create.mockResolvedValue(toStream([chunk('x')]));
    await runTask(
      'chat',
      { filePath: 'a.ts', fileContent: 'x' },
      { onToken: () => {}, onDone: () => {} },
      { model: 'groq/llama-3.3-70b' },
    );
    expect(create.mock.calls[0][0].model).toBe('groq/llama-3.3-70b');
  });
});
