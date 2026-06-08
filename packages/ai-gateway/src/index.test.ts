import { describe, it, expect } from 'vitest';
import type { ChatCompletionChunk } from 'openai/resources/chat/completions';
import { TASK_MODEL_PREFERENCE } from './tasks';
import { buildPrompt } from './context';
import { streamToPanel } from './stream';
import { StatusTracker } from './status';
import type { ChatMessage } from './types';

describe('TASK_MODEL_PREFERENCE', () => {
  it('routes every task type to FreeLLMAPI auto', () => {
    const values = Object.values(TASK_MODEL_PREFERENCE);
    expect(values).toHaveLength(8);
    expect(values.every((v) => v === 'auto')).toBe(true);
  });
});

describe('buildPrompt', () => {
  it('starts with a system message and ends with the user content', () => {
    const messages = buildPrompt('explain', {
      filePath: 'src/main.ts',
      fileContent: 'const x = 1;',
      selection: 'const x = 1;',
    });
    expect(messages[0].role).toBe('system');
    const user = messages[messages.length - 1];
    expect(user.role).toBe('user');
    expect(user.content as string).toContain('File: src/main.ts');
    expect(user.content as string).toContain('Selected code:');
  });

  it('includes project context and omits the empty File header with no file open', () => {
    const messages = buildPrompt('chat', {
      filePath: '',
      fileContent: '',
      userMessage: 'explain this project',
      projectContext: 'Project: demo\nsrc/\n  index.ts',
    });
    const user = messages[messages.length - 1];
    expect(user.content as string).toContain('Project structure:');
    expect(user.content as string).toContain('Project: demo');
    expect(user.content as string).toContain('explain this project');
    expect(user.content as string).not.toContain('File:');
  });

  it('appends attached text and adds images as multimodal content parts', () => {
    const messages = buildPrompt('chat', {
      filePath: '',
      fileContent: '',
      userMessage: 'look at these',
      attachments: [
        { name: 'spec.md', text: 'SPEC BODY' },
        { name: 'shot.png', imageUrl: 'data:image/png;base64,AAAA' },
      ],
    });
    const user = messages[messages.length - 1];
    const parts = user.content as Array<{
      type: string;
      text?: string;
      image_url?: { url: string };
    }>;
    expect(Array.isArray(parts)).toBe(true);
    const textPart = parts.find((p) => p.type === 'text');
    expect(textPart?.text).toContain('spec.md');
    expect(textPart?.text).toContain('SPEC BODY');
    expect(parts.some((p) => p.type === 'image_url' && p.image_url?.url.startsWith('data:image'))).toBe(
      true,
    );
  });

  it('replays conversation history for chat tasks', () => {
    const history: ChatMessage[] = [
      { role: 'user', content: 'hi' },
      { role: 'assistant', content: 'hello' },
    ];
    const messages = buildPrompt('chat', {
      filePath: 'a.ts',
      fileContent: '',
      userMessage: 'what does this do?',
      history,
    });
    expect(messages.map((m) => m.role)).toEqual(['system', 'user', 'assistant', 'user']);
  });

  it('does not replay history for non-chat tasks', () => {
    const messages = buildPrompt('fix', {
      filePath: 'a.ts',
      fileContent: '',
      errorMessage: 'TypeError',
      history: [{ role: 'user', content: 'ignored' }],
    });
    expect(messages).toHaveLength(2);
    expect(messages[messages.length - 1].content as string).toContain('Error:');
  });

  it('uses a security-oriented system prompt for vuln_check', () => {
    const [system] = buildPrompt('vuln_check', { filePath: 'a.ts', fileContent: '' });
    expect((system.content as string).toLowerCase()).toContain('security');
  });

  it('prepends the security persona when securityMode is set (Cybersec mode)', () => {
    const [system] = buildPrompt('chat', { filePath: 'a.ts', fileContent: '', securityMode: true });
    expect(system.role).toBe('system');
    expect((system.content as string).toLowerCase()).toContain('cybersec mode');
    expect((system.content as string).toLowerCase()).toContain('offensive');
    expect((system.content as string).toLowerCase()).toContain('defensive');
    // The task's base prompt is still appended after the persona.
    expect((system.content as string)).toContain('coding assistant');
  });

  it('omits the security persona in normal mode', () => {
    const [system] = buildPrompt('chat', { filePath: 'a.ts', fileContent: '' });
    expect((system.content as string).toLowerCase()).not.toContain('cybersec mode');
  });

  it('uses a red-team emphasis for the offensive stance', () => {
    const [system] = buildPrompt('chat', {
      filePath: 'a.ts',
      fileContent: '',
      securityMode: true,
      securityStance: 'offensive',
    });
    expect((system.content as string).toLowerCase()).toContain('red-team');
  });

  it('uses a blue-team emphasis for the defensive stance', () => {
    const [system] = buildPrompt('chat', {
      filePath: 'a.ts',
      fileContent: '',
      securityMode: true,
      securityStance: 'defensive',
    });
    expect((system.content as string).toLowerCase()).toContain('blue-team');
  });

  it('honors a custom persona text, overriding the stance default', () => {
    const [system] = buildPrompt('chat', {
      filePath: 'a.ts',
      fileContent: '',
      securityMode: true,
      securityStance: 'offensive',
      securityPersonaText: 'CUSTOM PERSONA RULES',
    });
    expect((system.content as string)).toContain('CUSTOM PERSONA RULES');
    // The default offensive emphasis is replaced, not appended.
    expect((system.content as string).toLowerCase()).not.toContain('red-team');
    // The task's base prompt is still appended.
    expect((system.content as string)).toContain('coding assistant');
  });
});

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

describe('streamToPanel', () => {
  it('concatenates token deltas and reports the routed model', async () => {
    const tokens: string[] = [];
    let routedVia = '';
    await streamToPanel(
      toStream([chunk('Hel', 'groq/llama-3.3-70b'), chunk('lo'), chunk(undefined)]),
      (t) => tokens.push(t),
      (via) => {
        routedVia = via;
      },
    );
    expect(tokens.join('')).toBe('Hello');
    expect(routedVia).toBe('groq/llama-3.3-70b');
  });

  it('reports "unknown" when no model is present on any chunk', async () => {
    let routedVia = '';
    await streamToPanel(toStream([chunk('x')]), () => {}, (via) => {
      routedVia = via;
    });
    expect(routedVia).toBe('unknown');
  });
});

describe('StatusTracker', () => {
  it('parses routing headers from a plain record (case-insensitive)', () => {
    const tracker = new StatusTracker();
    const update = tracker.recordResponse(
      { 'x-routed-via': 'gemini/gemini-2.5-flash', 'x-fallback-attempts': '2' },
      120,
    );
    expect(update.routedVia).toBe('gemini/gemini-2.5-flash');
    expect(update.fallbackAttempts).toBe(2);
    expect(update.tokensToday).toBe(120);
  });

  it('parses routing headers from a Headers instance', () => {
    const tracker = new StatusTracker();
    const headers = new Headers({ 'X-Routed-Via': 'groq/llama' });
    expect(tracker.recordResponse(headers, 10).routedVia).toBe('groq/llama');
  });

  it('accumulates tokens across responses and notifies subscribers', () => {
    const tracker = new StatusTracker();
    const seen: number[] = [];
    tracker.subscribe((u) => seen.push(u.tokensToday));
    tracker.recordResponse({}, 100);
    tracker.recordResponse({}, 50);
    expect(tracker.tokensToday).toBe(150);
    expect(seen).toEqual([100, 150]);
  });

  it('resets the token count at UTC midnight', () => {
    let now = new Date('2026-05-23T23:59:00Z');
    const tracker = new StatusTracker(() => now);
    tracker.recordResponse({}, 200);
    expect(tracker.tokensToday).toBe(200);
    now = new Date('2026-05-24T00:01:00Z');
    expect(tracker.tokensToday).toBe(0);
  });
});
