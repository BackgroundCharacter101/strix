// Pure helpers for the Project Map (Competition): flatten the workspace tree
// into positioned nodes for an SVG structure diagram, and parse the AI's
// architecture JSON. Kept pure so layout + parsing are unit-testable.

export interface MapTreeNode {
  name: string;
  type: 'file' | 'directory';
  path?: string;
  children?: MapTreeNode[];
}

export interface MapNode {
  path: string;
  name: string;
  type: 'file' | 'directory';
  depth: number;
  lang: string;
}

// File extension → a short language key (drives node colour). Folders use 'dir'.
export function langOf(name: string): string {
  const ext = name.slice(name.lastIndexOf('.') + 1).toLowerCase();
  const map: Record<string, string> = {
    ts: 'ts', tsx: 'ts', js: 'js', jsx: 'js', mjs: 'js', cjs: 'js',
    json: 'json', md: 'md', markdown: 'md', css: 'css', scss: 'css', less: 'css',
    html: 'html', htm: 'html', py: 'py', rb: 'rb', go: 'go', rs: 'rs', java: 'java',
    c: 'c', h: 'c', cpp: 'cpp', hpp: 'cpp', cs: 'cs', php: 'php', sh: 'sh', bash: 'sh',
    yml: 'yaml', yaml: 'yaml', toml: 'cfg', ini: 'cfg', env: 'cfg', sql: 'sql',
    svg: 'img', png: 'img', jpg: 'img', jpeg: 'img', gif: 'img', webp: 'img',
  };
  return map[ext] ?? 'file';
}

// Pre-order flatten of the visible tree (directories before their children),
// honouring a per-path "collapsed" set so big trees stay readable.
export function flattenForMap(
  roots: MapTreeNode[],
  collapsed: Set<string> = new Set(),
  depth = 0,
  out: MapNode[] = [],
): MapNode[] {
  // Directories first, then files; each group alphabetical — a stable, readable map.
  const dirs = roots.filter((n) => n.type === 'directory');
  const files = roots.filter((n) => n.type === 'file');
  const ordered = [...sortByName(dirs), ...sortByName(files)];
  for (const n of ordered) {
    const path = n.path ?? n.name;
    out.push({
      path,
      name: n.name,
      type: n.type,
      depth,
      lang: n.type === 'directory' ? 'dir' : langOf(n.name),
    });
    if (n.type === 'directory' && n.children && !collapsed.has(path)) {
      flattenForMap(n.children, collapsed, depth + 1, out);
    }
  }
  return out;
}

function sortByName(nodes: MapTreeNode[]): MapTreeNode[] {
  return [...nodes].sort((a, b) => a.name.localeCompare(b.name));
}

// ---- AI architecture JSON ------------------------------------------------

export interface ArchModule {
  id: string;
  label: string;
  kind?: string;
  files?: string[];
}
export interface ArchEdge {
  from: string;
  to: string;
  label?: string;
}
export interface Architecture {
  summary: string;
  modules: ArchModule[];
  edges: ArchEdge[];
}

// Extract the architecture object from a model reply (tolerates ```json fences
// and surrounding prose). Returns null when nothing parseable is found.
export function parseArchitecture(reply: string): Architecture | null {
  const start = reply.indexOf('{');
  const end = reply.lastIndexOf('}');
  if (start === -1 || end <= start) return null;
  try {
    const obj = JSON.parse(reply.slice(start, end + 1)) as Partial<Architecture>;
    const modules = Array.isArray(obj.modules) ? obj.modules.filter((m) => m && m.id && m.label) : [];
    if (modules.length === 0) return null;
    const ids = new Set(modules.map((m) => m.id));
    const edges = Array.isArray(obj.edges)
      ? obj.edges.filter((e) => e && ids.has(e.from) && ids.has(e.to))
      : [];
    return { summary: typeof obj.summary === 'string' ? obj.summary : '', modules, edges };
  } catch {
    return null;
  }
}
