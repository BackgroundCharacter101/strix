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
    rb: 'ruby',
    php: 'php',
  };
  return map[ext] ?? null;
}

// --- LSP client over the window.strix.lsp bridge -------------------------
export interface LspTransport {
  start(language: Language, root?: string): Promise<string>;
  send(id: string, message: JsonRpcMessage): void;
  stop(id: string): void;
  onMessage(cb: (e: { id: string; message: JsonRpcMessage }) => void): () => void;
}

export interface LspClientOptions {
  language: Language;
  uri: string;
  languageId: string;
  text: string;
  // Workspace root as a file:// URI, so the server loads the project config
  // (tsconfig.json, etc.) instead of analysing the file in isolation.
  rootUri?: string | null;
  // Plain workspace root path — the server process's cwd. Passed per window so
  // multiple Strix windows spawn their LSPs in their OWN project.
  rootPath?: string | null;
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
  // In-flight request id → resolver, for request/response methods (completion,
  // hover, definition). Resolved when the matching response arrives.
  private pending = new Map<number, (message: JsonRpcMessage) => void>();

  constructor(
    private readonly transport: LspTransport,
    private readonly opts: LspClientOptions,
  ) {}

  async start(): Promise<void> {
    this.id = await this.transport.start(this.opts.language, this.opts.rootPath ?? undefined);
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
      if (typeof message.id === 'number' && this.pending.has(message.id)) {
        const resolve = this.pending.get(message.id);
        this.pending.delete(message.id);
        resolve?.(message);
        return;
      }
      if (message.method === 'textDocument/publishDiagnostics') {
        const params = message.params as { diagnostics?: LspDiagnostic[] };
        this.opts.onDiagnostics(params.diagnostics ?? []);
      }
    });

    this.request(this.initId, 'initialize', {
      processId: null,
      rootUri: this.opts.rootUri ?? null,
      workspaceFolders: this.opts.rootUri
        ? [{ uri: this.opts.rootUri, name: 'workspace' }]
        : null,
      capabilities: {
        textDocument: {
          completion: { completionItem: { snippetSupport: false } },
          hover: { contentFormat: ['markdown', 'plaintext'] },
          definition: {},
          rename: { prepareSupport: true },
          references: {},
          codeAction: { codeActionLiteralSupport: { codeActionKind: { valueSet: [] } } },
          formatting: {},
        },
      },
    });
  }

  // --- Request/response features (completion, hover, go-to-definition) ------
  // Resolves with the server's `result` (or null on error/timeout/no-session).
  private sendRequest<T>(method: string, params: unknown, timeoutMs = 4000): Promise<T | null> {
    if (!this.id) return Promise.resolve(null);
    const id = this.nextId++;
    return new Promise<T | null>((resolve) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        resolve(null);
      }, timeoutMs);
      this.pending.set(id, (message) => {
        clearTimeout(timer);
        resolve('result' in message ? ((message.result ?? null) as T | null) : null);
      });
      this.sendRaw({ jsonrpc: '2.0', id, method, params });
    });
  }

  completion(position: LspPosition): Promise<unknown> {
    return this.sendRequest('textDocument/completion', {
      textDocument: { uri: this.opts.uri },
      position,
    });
  }

  hover(position: LspPosition): Promise<unknown> {
    return this.sendRequest('textDocument/hover', {
      textDocument: { uri: this.opts.uri },
      position,
    });
  }

  definition(position: LspPosition): Promise<unknown> {
    return this.sendRequest('textDocument/definition', {
      textDocument: { uri: this.opts.uri },
      position,
    });
  }

  documentSymbols(): Promise<unknown> {
    return this.sendRequest('textDocument/documentSymbol', {
      textDocument: { uri: this.opts.uri },
    });
  }

  // Rename a symbol at `position` to `newName`. Returns a WorkspaceEdit.
  rename(position: LspPosition, newName: string): Promise<unknown> {
    return this.sendRequest(
      'textDocument/rename',
      { textDocument: { uri: this.opts.uri }, position, newName },
      6000,
    );
  }

  // Prepare rename: validate the word under cursor before showing the inline
  // rename input. Returns { range, placeholder } or null if not renameable.
  prepareRename(position: LspPosition): Promise<unknown> {
    return this.sendRequest(
      'textDocument/prepareRename',
      { textDocument: { uri: this.opts.uri }, position },
    );
  }

  // Find all references to the symbol at `position`.
  references(position: LspPosition): Promise<unknown> {
    return this.sendRequest(
      'textDocument/references',
      {
        textDocument: { uri: this.opts.uri },
        position,
        context: { includeDeclaration: true },
      },
    );
  }

  // Request code actions (quick fixes, refactors) for `range` in the document.
  codeAction(range: LspRange, context: { diagnostics: LspDiagnostic[] }): Promise<unknown> {
    return this.sendRequest(
      'textDocument/codeAction',
      { textDocument: { uri: this.opts.uri }, range, context },
    );
  }

  // Format the entire document. Returns TextEdit[] or null.
  formatting(options: { tabSize: number; insertSpaces: boolean }): Promise<unknown> {
    return this.sendRequest(
      'textDocument/formatting',
      { textDocument: { uri: this.opts.uri }, options },
      10000,
    );
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

// --- Request/response result types + pure normalizers (testable) ----------
export interface LspPosition {
  line: number; // 0-based
  character: number; // 0-based
}

interface LspMarkup {
  kind?: string;
  value: string;
}

export interface LspCompletionItem {
  label: string;
  kind?: number;
  detail?: string;
  documentation?: string | LspMarkup;
  insertText?: string;
  sortText?: string;
}

export interface LspLocation {
  uri: string;
  range: {
    start: { line: number; character: number };
    end: { line: number; character: number };
  };
}

// completion result: CompletionItem[] | { items: CompletionItem[] } | null
export function normalizeCompletionItems(result: unknown): LspCompletionItem[] {
  if (!result) return [];
  if (Array.isArray(result)) return result as LspCompletionItem[];
  const list = result as { items?: LspCompletionItem[] };
  return Array.isArray(list.items) ? list.items : [];
}

// hover result: { contents } where contents is string | MarkedString |
// MarkedString[] | MarkupContent. Flattened to a markdown string.
export function hoverToMarkdown(result: unknown): string | null {
  const contents = (result as { contents?: unknown } | null)?.contents;
  if (contents == null) return null;
  const one = (c: unknown): string => {
    if (typeof c === 'string') return c;
    if (c && typeof c === 'object') {
      const m = c as { value?: string; language?: string };
      if (typeof m.value === 'string') {
        return m.language ? `\`\`\`${m.language}\n${m.value}\n\`\`\`` : m.value;
      }
    }
    return '';
  };
  const text = Array.isArray(contents)
    ? contents.map(one).filter(Boolean).join('\n\n')
    : one(contents);
  return text.trim() || null;
}

// definition result: Location | Location[] | LocationLink[] | null
export function normalizeLocations(result: unknown): LspLocation[] {
  if (!result) return [];
  const arr = Array.isArray(result) ? result : [result];
  const out: LspLocation[] = [];
  for (const item of arr) {
    const o = item as Record<string, unknown>;
    if (o.uri && o.range) {
      out.push({ uri: o.uri as string, range: o.range as LspLocation['range'] });
    } else if (o.targetUri && o.targetRange) {
      // LocationLink shape
      out.push({ uri: o.targetUri as string, range: o.targetRange as LspLocation['range'] });
    }
  }
  return out;
}

// --- WorkspaceEdit normalizer (rename) -----------------------------------
export interface LspTextEdit {
  range: LspRange;
  newText: string;
}

export interface LspWorkspaceEdit {
  // file URI → edits to apply
  changes?: Record<string, LspTextEdit[]>;
  // LSP 3.13 documentChanges (optional; we fall back to changes)
  documentChanges?: Array<{
    textDocument: { uri: string };
    edits: LspTextEdit[];
  }>;
}

// Flatten a WorkspaceEdit into a map of file URI → TextEdit[]
export function normalizeWorkspaceEdit(result: unknown): Map<string, LspTextEdit[]> {
  const out = new Map<string, LspTextEdit[]>();
  if (!result || typeof result !== 'object') return out;
  const edit = result as LspWorkspaceEdit;
  if (Array.isArray(edit.documentChanges)) {
    for (const dc of edit.documentChanges) {
      if (dc.textDocument?.uri && Array.isArray(dc.edits)) {
        out.set(dc.textDocument.uri, dc.edits as LspTextEdit[]);
      }
    }
  } else if (edit.changes) {
    for (const [uri, edits] of Object.entries(edit.changes)) {
      if (Array.isArray(edits)) out.set(uri, edits as LspTextEdit[]);
    }
  }
  return out;
}

// --- TextEdit[] normalizer (formatting) ----------------------------------
export function normalizeTextEdits(result: unknown): LspTextEdit[] {
  if (!Array.isArray(result)) return [];
  return result as LspTextEdit[];
}

export interface LspRange {
  start: { line: number; character: number };
  end: { line: number; character: number };
}

export interface NormalizedSymbol {
  name: string;
  detail?: string;
  kind: number;
  range: LspRange;
  selectionRange: LspRange;
  children: NormalizedSymbol[];
}

// documentSymbol result: DocumentSymbol[] (hierarchical) | SymbolInformation[]
// (flat). Normalized to a single hierarchical shape.
export function normalizeSymbols(result: unknown): NormalizedSymbol[] {
  if (!Array.isArray(result)) return [];
  return result
    .map((s): NormalizedSymbol | null => {
      const o = s as Record<string, unknown>;
      if (o.range && o.selectionRange) {
        return {
          name: String(o.name ?? ''),
          detail: typeof o.detail === 'string' ? o.detail : undefined,
          kind: typeof o.kind === 'number' ? o.kind : 13,
          range: o.range as LspRange,
          selectionRange: o.selectionRange as LspRange,
          children: normalizeSymbols(o.children),
        };
      }
      const loc = o.location as { range?: LspRange } | undefined;
      if (loc?.range) {
        return {
          name: String(o.name ?? ''),
          kind: typeof o.kind === 'number' ? o.kind : 13,
          range: loc.range,
          selectionRange: loc.range,
          children: [],
        };
      }
      return null;
    })
    .filter((s): s is NormalizedSymbol => s !== null);
}

// LSP SymbolKind (number) → name. Monaco's SymbolKind enum uses the same names.
export const LSP_SYMBOL_KIND: Record<number, string> = {
  1: 'File', 2: 'Module', 3: 'Namespace', 4: 'Package', 5: 'Class',
  6: 'Method', 7: 'Property', 8: 'Field', 9: 'Constructor', 10: 'Enum',
  11: 'Interface', 12: 'Function', 13: 'Variable', 14: 'Constant', 15: 'String',
  16: 'Number', 17: 'Boolean', 18: 'Array', 19: 'Object', 20: 'Key',
  21: 'Null', 22: 'EnumMember', 23: 'Struct', 24: 'Event', 25: 'Operator',
  26: 'TypeParameter',
};

// LSP CompletionItemKind (number) → name. Monaco's CompletionItemKind enum uses
// the same names, so a provider does monaco.languages.CompletionItemKind[name].
export const LSP_COMPLETION_KIND: Record<number, string> = {
  1: 'Text', 2: 'Method', 3: 'Function', 4: 'Constructor', 5: 'Field',
  6: 'Variable', 7: 'Class', 8: 'Interface', 9: 'Module', 10: 'Property',
  11: 'Unit', 12: 'Value', 13: 'Enum', 14: 'Keyword', 15: 'Snippet',
  16: 'Color', 17: 'File', 18: 'Reference', 19: 'Folder', 20: 'EnumMember',
  21: 'Constant', 22: 'Struct', 23: 'Event', 24: 'Operator', 25: 'TypeParameter',
};
