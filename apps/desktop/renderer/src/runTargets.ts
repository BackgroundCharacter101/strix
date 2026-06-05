// Pure, testable helpers for the Run/Serve panel: detect runnable targets from a
// project (npm scripts, Python entrypoints) and spot a served localhost URL in
// terminal output.

export interface RunTarget {
  id: string;
  label: string; // short name, e.g. "dev" or "manage.py runserver"
  command: string; // the actual shell command to run
  kind: 'npm' | 'python';
}

// npm scripts that usually start a dev server — surfaced first.
const NPM_PRIORITY = ['dev', 'start', 'serve', 'preview', 'watch'];

// Parse package.json text into npm run targets, dev-ish scripts first.
export function detectNpmTargets(packageJsonText: string): RunTarget[] {
  let scripts: Record<string, string> = {};
  try {
    const pkg = JSON.parse(packageJsonText) as { scripts?: Record<string, string> };
    scripts = pkg.scripts ?? {};
  } catch {
    return [];
  }
  const names = Object.keys(scripts);
  names.sort((a, b) => {
    const ia = NPM_PRIORITY.indexOf(a);
    const ib = NPM_PRIORITY.indexOf(b);
    if (ia !== ib) return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
    return a.localeCompare(b);
  });
  return names.map((name) => ({
    id: `npm:${name}`,
    label: name,
    command: `npm run ${name}`,
    kind: 'npm',
  }));
}

// Known Python entrypoints → a run command. `fileNames` are the project root's
// top-level file names. `openFile` (if a .py) adds a "run current file" target.
export function detectPythonTargets(
  fileNames: string[],
  openFile?: string | null,
): RunTarget[] {
  const set = new Set(fileNames.map((f) => f.toLowerCase()));
  const targets: RunTarget[] = [];

  if (set.has('manage.py')) {
    targets.push({
      id: 'py:manage',
      label: 'manage.py runserver',
      command: 'python manage.py runserver',
      kind: 'python',
    });
  }
  for (const entry of ['app.py', 'main.py', 'wsgi.py', 'server.py']) {
    if (set.has(entry)) {
      targets.push({ id: `py:${entry}`, label: entry, command: `python ${entry}`, kind: 'python' });
    }
  }

  if (openFile && /\.py$/i.test(openFile)) {
    const base = openFile.split(/[\\/]/).pop() ?? openFile;
    const id = `py:open:${base}`;
    if (!targets.some((t) => t.id === id)) {
      targets.push({ id, label: `Run ${base}`, command: `python ${base}`, kind: 'python' });
    }
  }

  return targets;
}

// Find the first localhost/loopback URL printed by a dev server. Normalizes a
// 0.0.0.0 host to localhost so the browser can actually open it.
export function extractLocalUrl(text: string): string | null {
  const m = /https?:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0)(:\d+)?(\/[^\s"'<>]*)?/i.exec(text);
  if (!m) return null;
  return m[0].replace('0.0.0.0', 'localhost');
}
