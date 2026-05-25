import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  lspToMonacoMarkers,
  languageForLsp,
  LspClient,
  type LspTransport,
  type JsonRpcMessage,
} from './lspClient';

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
});
