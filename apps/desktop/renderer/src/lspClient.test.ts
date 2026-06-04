import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  lspToMonacoMarkers,
  languageForLsp,
  LspClient,
  normalizeCompletionItems,
  hoverToMarkdown,
  normalizeLocations,
  type LspTransport,
  type JsonRpcMessage,
} from './lspClient';

describe('normalizeCompletionItems', () => {
  it('handles an array, a CompletionList, and null', () => {
    expect(normalizeCompletionItems([{ label: 'a' }])).toEqual([{ label: 'a' }]);
    expect(normalizeCompletionItems({ items: [{ label: 'b' }] })).toEqual([{ label: 'b' }]);
    expect(normalizeCompletionItems(null)).toEqual([]);
    expect(normalizeCompletionItems({})).toEqual([]);
  });
});

describe('hoverToMarkdown', () => {
  it('flattens the LSP hover content shapes', () => {
    expect(hoverToMarkdown({ contents: 'plain' })).toBe('plain');
    expect(hoverToMarkdown({ contents: { kind: 'markdown', value: '**x**' } })).toBe('**x**');
    expect(hoverToMarkdown({ contents: { language: 'ts', value: 'const a = 1' } })).toBe(
      '```ts\nconst a = 1\n```',
    );
    expect(hoverToMarkdown({ contents: ['a', { value: 'b' }] })).toBe('a\n\nb');
    expect(hoverToMarkdown(null)).toBeNull();
    expect(hoverToMarkdown({ contents: '' })).toBeNull();
  });
});

describe('normalizeLocations', () => {
  const range = { start: { line: 1, character: 2 }, end: { line: 1, character: 5 } };
  it('handles a single Location, an array, LocationLink, and null', () => {
    expect(normalizeLocations({ uri: 'file:///a', range })).toEqual([{ uri: 'file:///a', range }]);
    expect(normalizeLocations([{ uri: 'file:///a', range }])).toEqual([{ uri: 'file:///a', range }]);
    expect(normalizeLocations({ targetUri: 'file:///b', targetRange: range })).toEqual([
      { uri: 'file:///b', range },
    ]);
    expect(normalizeLocations(null)).toEqual([]);
  });
});

describe('lspToMonacoMarkers', () => {
  it('maps LSP diagnostics (0-based) to Monaco markers (1-based) with severity', () => {
    const [m] = lspToMonacoMarkers([
      {
        range: { start: { line: 4, character: 2 }, end: { line: 4, character: 9 } },
        message: 'oops',
        severity: 2,
        source: 'pylsp',
      },
    ]);
    expect(m).toEqual({
      severity: 4, // LSP Warning(2) → Monaco Warning(4)
      message: 'oops',
      source: 'pylsp',
      startLineNumber: 5,
      startColumn: 3,
      endLineNumber: 5,
      endColumn: 10,
    });
  });

  it('defaults missing severity to Error', () => {
    const [m] = lspToMonacoMarkers([
      { range: { start: { line: 0, character: 0 }, end: { line: 0, character: 1 } }, message: 'e' },
    ]);
    expect(m.severity).toBe(8);
  });
});

describe('languageForLsp', () => {
  it('maps known extensions, null otherwise', () => {
    expect(languageForLsp('a.py')).toBe('python');
    expect(languageForLsp('a.tsx')).toBe('typescript');
    expect(languageForLsp('a.cpp')).toBe('cpp');
    expect(languageForLsp('a.txt')).toBeNull();
  });
});

describe('LspClient', () => {
  let sent: { id: string; message: JsonRpcMessage }[];
  let emit: (e: { id: string; message: JsonRpcMessage }) => void;
  let transport: LspTransport;

  beforeEach(() => {
    sent = [];
    transport = {
      start: vi.fn(async () => 'lsp-1'),
      send: vi.fn((id, message) => sent.push({ id, message })),
      stop: vi.fn(),
      onMessage: vi.fn((cb) => {
        emit = cb;
        return () => {};
      }),
    };
  });

  const methods = () => sent.map((s) => s.message.method).filter(Boolean);

  it('handshakes (initialize → initialized → didOpen) and surfaces diagnostics', async () => {
    const onDiagnostics = vi.fn();
    const client = new LspClient(transport, {
      language: 'python',
      uri: 'file:///a.py',
      languageId: 'python',
      text: 'x = 1',
      onDiagnostics,
    });

    await client.start();
    expect(transport.start).toHaveBeenCalledWith('python');
    expect(sent[0].message).toMatchObject({ id: 1, method: 'initialize' });

    // server replies to initialize → client opens the document
    emit({ id: 'lsp-1', message: { jsonrpc: '2.0', id: 1, result: {} } });
    expect(methods()).toContain('initialized');
    expect(methods()).toContain('textDocument/didOpen');

    // server publishes diagnostics
    emit({
      id: 'lsp-1',
      message: {
        jsonrpc: '2.0',
        method: 'textDocument/publishDiagnostics',
        params: {
          diagnostics: [
            {
              range: { start: { line: 0, character: 0 }, end: { line: 0, character: 1 } },
              message: 'bad',
            },
          ],
        },
      },
    });
    expect(onDiagnostics).toHaveBeenCalledWith([
      expect.objectContaining({ message: 'bad' }),
    ]);
  });

  it('ignores messages from other sessions and stops cleanly', async () => {
    const onDiagnostics = vi.fn();
    const client = new LspClient(transport, {
      language: 'python',
      uri: 'file:///a.py',
      languageId: 'python',
      text: '',
      onDiagnostics,
    });
    await client.start();
    emit({ id: 'other', message: { jsonrpc: '2.0', method: 'textDocument/publishDiagnostics', params: { diagnostics: [] } } });
    expect(onDiagnostics).not.toHaveBeenCalled();

    client.stop();
    expect(transport.stop).toHaveBeenCalledWith('lsp-1');
  });

  it('correlates a completion request with its response', async () => {
    const client = new LspClient(transport, {
      language: 'python',
      uri: 'file:///a.py',
      languageId: 'python',
      text: '',
      onDiagnostics: vi.fn(),
    });
    await client.start();
    emit({ id: 'lsp-1', message: { jsonrpc: '2.0', id: 1, result: {} } }); // init reply

    const pending = client.completion({ line: 0, character: 0 });
    const req = sent.find((s) => s.message.method === 'textDocument/completion');
    expect(req).toBeTruthy();
    const reqId = req!.message.id as number;

    emit({ id: 'lsp-1', message: { jsonrpc: '2.0', id: reqId, result: { items: [{ label: 'foo' }] } } });
    const result = await pending;
    expect(normalizeCompletionItems(result)).toEqual([{ label: 'foo' }]);
  });
});
