// Parsing + validation for the AI project scaffolder. Pure (no IO) so it's
// unit-testable; the renderer does the actual file writes behind a confirmation.

export interface ScaffoldFile {
  path: string;
  content: string;
}

export interface ScaffoldPlan {
  files: ScaffoldFile[];
  notes?: string;
}

// A safe relative path: non-empty, forward-slashed, staying inside the project
// (no absolute paths, drive letters, or ".." traversal), and not a dotfile dir
// escape. Returned false for anything we won't write.
export function isSafeRelPath(p: string): boolean {
  if (typeof p !== 'string') return false;
  const s = p.trim().replace(/\\/g, '/');
  if (!s || s.length > 200) return false;
  if (s.startsWith('/')) return false; // absolute
  if (/^[a-zA-Z]:/.test(s)) return false; // drive letter
  if (s.includes('\0')) return false;
  const segs = s.split('/');
  if (segs.some((seg) => seg === '..' || seg === '.' || seg.trim() === '')) return false;
  return true;
}

// Extract the JSON object from a model reply that may be wrapped in prose or a
// ```json fence. Returns the parsed plan or an { error } describing the failure.
export function parseScaffold(
  text: string,
  opts: { maxFiles?: number; maxBytes?: number } = {},
): ScaffoldPlan | { error: string } {
  const maxFiles = opts.maxFiles ?? 80;
  const maxBytes = opts.maxBytes ?? 2_000_000;

  // Prefer a fenced block; otherwise take the outermost {...}.
  let body = text.trim();
  const fence = /```(?:json)?\s*([\s\S]*?)```/i.exec(body);
  if (fence) body = fence[1].trim();
  const first = body.indexOf('{');
  const last = body.lastIndexOf('}');
  if (first === -1 || last <= first) return { error: 'No JSON object found in the reply.' };

  let parsed: unknown;
  try {
    parsed = JSON.parse(body.slice(first, last + 1));
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Invalid JSON.' };
  }

  const obj = parsed as { files?: unknown; notes?: unknown };
  if (!Array.isArray(obj.files) || obj.files.length === 0) {
    return { error: 'The plan has no files.' };
  }
  if (obj.files.length > maxFiles) {
    return { error: `Too many files (${obj.files.length} > ${maxFiles}).` };
  }

  const files: ScaffoldFile[] = [];
  let total = 0;
  for (const raw of obj.files) {
    const f = raw as { path?: unknown; content?: unknown };
    if (typeof f.path !== 'string' || typeof f.content !== 'string') {
      return { error: 'A file entry is missing a string path/content.' };
    }
    if (!isSafeRelPath(f.path)) {
      return { error: `Unsafe path rejected: ${f.path}` };
    }
    total += f.content.length;
    if (total > maxBytes) return { error: 'Plan exceeds the size limit.' };
    files.push({ path: f.path.trim().replace(/\\/g, '/'), content: f.content });
  }

  return { files, notes: typeof obj.notes === 'string' ? obj.notes : undefined };
}
