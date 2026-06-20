import { describe, it, expect } from 'vitest';
import { matchGlob, matchAny } from './glob';
import { resolveAgents, dueAgents, canRunNow } from './agentScheduler';
import { isAllowedDocTarget, stripCodeFence, buildAgentContext } from './agentContext';
import type { AgentDef, AgentConfig, AgentStatus } from './agentTypes';

describe('matchGlob', () => {
  it('matches ** across directories', () => {
    expect(matchGlob('**/*.ts', 'src/a/b.ts')).toBe(true);
    expect(matchGlob('**/*.ts', 'b.ts')).toBe(true);
    expect(matchGlob('**/*.ts', 'src/a/b.js')).toBe(false);
  });
  it('handles brace sets', () => {
    expect(matchGlob('**/*.{ts,tsx}', 'src/x.tsx')).toBe(true);
    expect(matchGlob('**/*.{ts,tsx}', 'src/x.py')).toBe(false);
  });
  it('* stays within a segment', () => {
    expect(matchGlob('src/*.ts', 'src/a.ts')).toBe(true);
    expect(matchGlob('src/*.ts', 'src/a/b.ts')).toBe(false);
  });
  it('normalises backslashes', () => {
    expect(matchGlob('**/package.json', 'apps\\desktop\\package.json')).toBe(true);
  });
  it('matchAny ORs patterns', () => {
    expect(matchAny(['**/go.mod', '**/Cargo.toml'], 'svc/Cargo.toml')).toBe(true);
    expect(matchAny(['**/go.mod'], 'svc/Cargo.toml')).toBe(false);
  });
});

const def: AgentDef = {
  id: 'readme',
  name: 'README updater',
  description: '',
  persona: 'x',
  outputMode: 'doc',
  defaultTarget: 'README.md',
  watch: ['**/*.ts'],
  trigger: { on: 'change', cooldownMs: 1000 },
  builtin: true,
};

describe('resolveAgents', () => {
  it('merges config over preset defaults', () => {
    const cfg: AgentConfig[] = [{ id: 'readme', enabled: true, model: 'direct:1', cooldownMs: 5 }];
    const [r] = resolveAgents([def], cfg);
    expect(r.enabled).toBe(true);
    expect(r.model).toBe('direct:1');
    expect(r.cooldownMs).toBe(5);
    expect(r.target).toBe('README.md');
  });
  it('defaults disabled with auto model when no config', () => {
    const [r] = resolveAgents([def], []);
    expect(r.enabled).toBe(false);
    expect(r.model).toBe('auto');
  });
  it('includes custom agents from config', () => {
    const custom: AgentDef = { ...def, id: 'mine', builtin: false };
    const cfg: AgentConfig[] = [{ id: 'mine', enabled: true, model: 'auto', custom }];
    const agents = resolveAgents([def], cfg);
    expect(agents.map((a) => a.id)).toContain('mine');
  });
});

describe('dueAgents', () => {
  const agents = resolveAgents([def], [{ id: 'readme', enabled: true, model: 'auto' }]);
  it('runs when a watched file changed and cooldown elapsed', () => {
    const due = dueAgents(agents, ['src/a.ts'], {}, 10_000);
    expect(due.map((a) => a.id)).toEqual(['readme']);
  });
  it('skips when only its own target changed', () => {
    expect(dueAgents(agents, ['README.md'], {}, 10_000)).toEqual([]);
  });
  it('respects cooldown', () => {
    const statuses: Record<string, AgentStatus> = { readme: { state: 'ok', lastRun: 9500 } };
    expect(dueAgents(agents, ['src/a.ts'], statuses, 10_000)).toEqual([]);
    expect(dueAgents(agents, ['src/a.ts'], statuses, 11_000).map((a) => a.id)).toEqual(['readme']);
  });
  it('skips disabled agents', () => {
    const off = resolveAgents([def], [{ id: 'readme', enabled: false, model: 'auto' }]);
    expect(dueAgents(off, ['src/a.ts'], {}, 10_000)).toEqual([]);
  });
});

describe('canRunNow', () => {
  it('blocks while running or queued', () => {
    expect(canRunNow({ state: 'running' })).toBe(false);
    expect(canRunNow({ state: 'queued' })).toBe(false);
    expect(canRunNow({ state: 'ok' })).toBe(true);
    expect(canRunNow(undefined)).toBe(true);
  });
});

describe('isAllowedDocTarget', () => {
  it('allows safe markdown/text paths', () => {
    expect(isAllowedDocTarget('README.md')).toBe(true);
    expect(isAllowedDocTarget('docs/TODO.md')).toBe(true);
    expect(isAllowedDocTarget('notes.txt')).toBe(true);
  });
  it('rejects code, traversal and absolute paths', () => {
    expect(isAllowedDocTarget('src/index.ts')).toBe(false);
    expect(isAllowedDocTarget('../escape.md')).toBe(false);
    expect(isAllowedDocTarget('/etc/passwd.md')).toBe(false);
    expect(isAllowedDocTarget('')).toBe(false);
  });
});

describe('stripCodeFence', () => {
  it('unwraps a fenced doc and ensures a trailing newline', () => {
    expect(stripCodeFence('```markdown\n# Hi\n```')).toBe('# Hi\n');
    expect(stripCodeFence('# Plain')).toBe('# Plain\n');
  });
});

describe('buildAgentContext', () => {
  it('includes the current target and files', () => {
    const ctx = buildAgentContext({
      projectName: 'demo',
      target: 'README.md',
      currentTarget: '# Old',
      files: [{ path: 'src/a.ts', content: 'export const a = 1;' }],
    });
    expect(ctx).toContain('Current README.md');
    expect(ctx).toContain('# Old');
    expect(ctx).toContain('src/a.ts');
  });
  it('notes a missing target file', () => {
    const ctx = buildAgentContext({ target: 'README.md', files: [] });
    expect(ctx).toContain('does not exist yet');
  });
});
