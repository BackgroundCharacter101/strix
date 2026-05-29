import type { Language, JsonRpcMessage } from '../../main/lsp';

export type { JsonRpcMessage } from '../../main/lsp';

// --- Diagnostics → Monaco markers ----------------------------------------
// LSP severity (1=Error,2=Warning,3=Info,4=Hint) → Monaco MarkerSeverity
// (Error=8, Warning=4, Info=2, Hint=1). LSP positions are 0-based, Monaco 1-based.
const SEVERITY: Record<number, number> = { 1: 8, 2: 4, 3: 2, 4: 1 };

export interface LspDiagnostic {
  range: {
    start: { line: number; character: number };
    end: { line: number; character: number };
  };
  message: string;
  severity?: number;
  source?: string;
}

export interface MonacoMarker {
  severity: number;
  message: string;
  source?: string;
  startLineNumber: number;
  startColumn: number;
  endLineNumber: number;
  endColumn: number;
}

export function lspToMonacoMarkers(diagnostics: LspDiagnostic[]): MonacoMarker[] {
  return diagnostics.map((d) => ({
    severity: SEVERITY[d.severity ?? 1] ?? 8,
    message: d.message,
    source: d.source,
    startLineNumber: d.range.start.line + 1,
    startColumn: d.range.start.character + 1,
    endLineNumber: d.range.end.line + 1,
    endColumn: d.range.end.character + 1,
  }));
}

// --- File extension → LSP language ---------------------------------------
export function languageForLsp(path: string): Language | null {
  const ext = path.slice(path.lastIndexOf('.') + 1).toLowerCase();
  const map: Record<string, Language> = {
    ts: 'typescript',
    tsx: 'typescript',
    js: 'javascript',
    jsx: 'javascript',
    py: 'python',
    c: 'c',
    h: 'c',
    cpp: 'cpp',
    cc: 'cpp',
    hpp: 'cpp',
    sh: 'bash',
    bash: 'bash',
    rs: 'rust',
    go: 'go',
  };
  return map[ext] ?? null;
}

// --- LSP client over the window.strix.lsp bridge -------------------------
export interface LspTransport {
  start(language: Language): Promise<string>;
  send(id: string, message: JsonRpcMessage): void;
  stop(id: string): void;
  onMessage(cb: (e: { id: string; message: JsonRpcMessage }) => void): () => void;
}

export interface LspClientOptions {
  language: Language;
  uri: string;
  languageId: string;
  text: string;
  onDiagnostics: (diagnostics: LspDiagnostic[]) => void;
}

// Minimal LSP client: drives the initialize handshake, opens the document,
// streams changes, and surfaces diagnostics. Just enough for squiggles (§6.5).
export class LspClient {
  private id: string | null = null;
  private off: (() => void) | null = null;
  private initId = 1;
  private nextId = 2;
  private version = 1;

  constructor(
    private readonly transport: LspTransport,
    private readonly opts: LspClientOptions,
  ) {}

  async start(): Promise<void> {
    this.id = await this.transport.start(this.opts.language);
    this.off = this.transport.onMessage(({ id, message }) => {
      if (id !== this.id) return;
      if (message.id === this.initId && 'result' in message) {
        this.notify('initialized', {});
        this.notify('textDocument/didOpen', {
          textDocument: {
            uri: this.opts.uri,
            languageId: this.opts.languageId,
            version: this.version,
            text: this.opts.text,
          },
        });
        return;
      }
      if (message.method === 'textDocument/publishDiagnostics') {
        const params = message.params as { diagnostics?: LspDiagnostic[] };
        this.opts.onDiagnostics(params.diagnostics ?? []);
      }
    });

    this.request(this.initId, 'initialize', {
      processId: null,
      rootUri: null,
      capabilities: {},
    });
  }

  didChange(text: string): void {
    this.version += 1;
    this.notify('textDocument/didChange', {
      textDocument: { uri: this.opts.uri, version: this.version },
      contentChanges: [{ text }],
    });
  }

  stop(): void {
    this.off?.();
    this.off = null;
    if (this.id) {
      this.transport.stop(this.id);
      this.id = null;
    }
  }

  private request(id: number, method: string, params: unknown): void {
    this.sendRaw({ jsonrpc: '2.0', id, method, params });
  }

  private notify(method: string, params: unknown): void {
    this.sendRaw({ jsonrpc: '2.0', method, params });
  }

  private sendRaw(message: JsonRpcMessage): void {
    if (this.id) this.transport.send(this.id, message);
  }
}
