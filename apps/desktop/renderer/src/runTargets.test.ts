import { describe, it, expect } from 'vitest';
import { detectNpmTargets, detectPythonTargets, extractLocalUrl } from './runTargets';

describe('detectNpmTargets', () => {
  it('lists scripts as npm run commands, dev-ish first', () => {
    const targets = detectNpmTargets(
      JSON.stringify({ scripts: { build: 'tsc', dev: 'vite', test: 'vitest' } }),
    );
    expect(targets.map((t) => t.label)).toEqual(['dev', 'build', 'test']);
    expect(targets[0].command).toBe('npm run dev');
    expect(targets[0].kind).toBe('npm');
  });

  it('returns [] for no scripts or bad JSON', () => {
    expect(detectNpmTargets('{}')).toEqual([]);
    expect(detectNpmTargets('not json')).toEqual([]);
  });
});

describe('detectPythonTargets', () => {
  it('detects Django manage.py', () => {
    const t = detectPythonTargets(['manage.py', 'README.md']);
    expect(t[0].command).toBe('python manage.py runserver');
  });

  it('detects app.py / main.py entrypoints', () => {
    const t = detectPythonTargets(['app.py']);
    expect(t.map((x) => x.command)).toContain('python app.py');
  });

  it('adds a run-current-file target for an open .py', () => {
    const t = detectPythonTargets([], '/ws/scripts/tool.py');
    expect(t[0].command).toBe('python tool.py');
  });

  it('ignores a non-python open file', () => {
    expect(detectPythonTargets([], '/ws/a.ts')).toEqual([]);
  });
});

describe('extractLocalUrl', () => {
  it('finds a localhost URL with a port', () => {
    expect(extractLocalUrl('  ➜  Local:   http://localhost:5173/')).toBe(
      'http://localhost:5173/',
    );
  });

  it('normalizes 0.0.0.0 to localhost', () => {
    expect(extractLocalUrl('Running on http://0.0.0.0:8000')).toBe('http://localhost:8000');
  });

  it('returns null when there is no URL', () => {
    expect(extractLocalUrl('compiling…')).toBeNull();
  });
});
