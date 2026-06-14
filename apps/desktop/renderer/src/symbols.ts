// Lightweight, dependency-free symbol extraction for the Outline view + Go to
// Symbol. Line/regex based (not a real parser) so it's pure, fast, and unit-
// testable, and works without the language server. Good enough to navigate a
// file; not a semantic index.

export type SymbolKind =
  | 'class'
  | 'interface'
  | 'type'
  | 'enum'
  | 'function'
  | 'method'
  | 'const'
  | 'heading'
  | 'rule';

export interface CodeSymbol {
  name: string;
  kind: SymbolKind;
  line: number; // 1-based
}

// Pick an extractor by file extension.
export function languageOfPath(path: string): 'ts' | 'py' | 'md' | 'css' | 'go' | 'rust' | 'other' {
  const ext = path.slice(path.lastIndexOf('.') + 1).toLowerCase();
  if (['ts', 'tsx', 'js', 'jsx', 'mjs', 'cjs'].includes(ext)) return 'ts';
  if (ext === 'py') return 'py';
  if (['md', 'markdown'].includes(ext)) return 'md';
  if (['css', 'scss', 'less'].includes(ext)) return 'css';
  if (ext === 'go') return 'go';
  if (ext === 'rs') return 'rust';
  return 'other';
}

const TS_PATTERNS: { re: RegExp; kind: SymbolKind }[] = [
  { re: /^\s*(?:export\s+)?(?:default\s+)?(?:abstract\s+)?class\s+([A-Za-z0-9_$]+)/, kind: 'class' },
  { re: /^\s*(?:export\s+)?interface\s+([A-Za-z0-9_$]+)/, kind: 'interface' },
  { re: /^\s*(?:export\s+)?type\s+([A-Za-z0-9_$]+)\s*[=<]/, kind: 'type' },
  { re: /^\s*(?:export\s+)?(?:const\s+)?enum\s+([A-Za-z0-9_$]+)/, kind: 'enum' },
  {
    re: /^\s*(?:export\s+)?(?:default\s+)?(?:async\s+)?function\s*\*?\s*([A-Za-z0-9_$]+)/,
    kind: 'function',
  },
  // const foo = (…) => / const foo = async (…) => / const foo = function
  {
    re: /^\s*(?:export\s+)?(?:const|let|var)\s+([A-Za-z0-9_$]+)\s*=\s*(?:async\s*)?(?:\([^)]*\)|[A-Za-z0-9_$]+)\s*=>/,
    kind: 'function',
  },
  { re: /^\s*(?:export\s+)?(?:const|let|var)\s+([A-Za-z0-9_$]+)\s*=\s*function\b/, kind: 'function' },
];

// Class-method heuristic: indented `name(...) {` that isn't a keyword/control.
const TS_METHOD =
  /^\s+(?:public\s+|private\s+|protected\s+|static\s+|readonly\s+|async\s+|get\s+|set\s+|\*\s*)*([A-Za-z0-9_$]+)\s*\([^)]*\)\s*[:{]/;
const TS_METHOD_SKIP = new Set([
  'if',
  'for',
  'while',
  'switch',
  'catch',
  'return',
  'function',
  'constructor',
  'await',
]);

function extractTs(text: string): CodeSymbol[] {
  const out: CodeSymbol[] = [];
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    let matched = false;
    for (const { re, kind } of TS_PATTERNS) {
      const m = re.exec(line);
      if (m) {
        out.push({ name: m[1], kind, line: i + 1 });
        matched = true;
        break;
      }
    }
    if (matched) continue;
    const mm = TS_METHOD.exec(line);
    if (mm && !TS_METHOD_SKIP.has(mm[1])) out.push({ name: mm[1], kind: 'method', line: i + 1 });
  }
  return out;
}

function extractPy(text: string): CodeSymbol[] {
  const out: CodeSymbol[] = [];
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const cls = /^\s*class\s+([A-Za-z0-9_]+)/.exec(lines[i]);
    if (cls) {
      out.push({ name: cls[1], kind: 'class', line: i + 1 });
      continue;
    }
    const fn = /^(\s*)(?:async\s+)?def\s+([A-Za-z0-9_]+)/.exec(lines[i]);
    if (fn) out.push({ name: fn[2], kind: fn[1] ? 'method' : 'function', line: i + 1 });
  }
  return out;
}

function extractMd(text: string): CodeSymbol[] {
  const out: CodeSymbol[] = [];
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const h = /^(#{1,6})\s+(.+?)\s*#*\s*$/.exec(lines[i]);
    if (h) out.push({ name: h[2], kind: 'heading', line: i + 1 });
  }
  return out;
}

function extractCss(text: string): CodeSymbol[] {
  const out: CodeSymbol[] = [];
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    // A selector line ends with '{' and isn't an at-rule body / property.
    const m = /^\s*([.#&:\-\w][^{};]*?)\s*\{\s*$/.exec(lines[i]);
    if (m && !m[1].startsWith('@')) out.push({ name: m[1].trim(), kind: 'rule', line: i + 1 });
  }
  return out;
}

function extractGo(text: string): CodeSymbol[] {
  const out: CodeSymbol[] = [];
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const fn = /^\s*func\s*(?:\([^)]*\)\s*)?([A-Za-z0-9_]+)\s*\(/.exec(lines[i]);
    if (fn) {
      out.push({ name: fn[1], kind: 'function', line: i + 1 });
      continue;
    }
    const ty = /^\s*type\s+([A-Za-z0-9_]+)\s+(?:struct|interface)\b/.exec(lines[i]);
    if (ty) out.push({ name: ty[1], kind: 'type', line: i + 1 });
  }
  return out;
}

function extractRust(text: string): CodeSymbol[] {
  const out: CodeSymbol[] = [];
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const fn = /^\s*(?:pub\s+)?(?:async\s+)?fn\s+([A-Za-z0-9_]+)/.exec(lines[i]);
    if (fn) {
      out.push({ name: fn[1], kind: 'function', line: i + 1 });
      continue;
    }
    const st = /^\s*(?:pub\s+)?struct\s+([A-Za-z0-9_]+)/.exec(lines[i]);
    if (st) {
      out.push({ name: st[1], kind: 'class', line: i + 1 });
      continue;
    }
    const en = /^\s*(?:pub\s+)?enum\s+([A-Za-z0-9_]+)/.exec(lines[i]);
    if (en) out.push({ name: en[1], kind: 'enum', line: i + 1 });
  }
  return out;
}

// Extract a file's symbols, dispatching on path/extension.
export function extractSymbols(path: string, text: string): CodeSymbol[] {
  switch (languageOfPath(path)) {
    case 'ts':
      return extractTs(text);
    case 'py':
      return extractPy(text);
    case 'md':
      return extractMd(text);
    case 'css':
      return extractCss(text);
    case 'go':
      return extractGo(text);
    case 'rust':
      return extractRust(text);
    default:
      return [];
  }
}

// Case-insensitive fuzzy-ish filter for the Go to Symbol box: keep symbols whose
// name contains the query characters in order.
export function filterSymbols(symbols: CodeSymbol[], query: string): CodeSymbol[] {
  const q = query.trim().toLowerCase();
  if (!q) return symbols;
  return symbols.filter((s) => {
    const name = s.name.toLowerCase();
    let j = 0;
    for (let i = 0; i < name.length && j < q.length; i++) if (name[i] === q[j]) j++;
    return j === q.length;
  });
}
