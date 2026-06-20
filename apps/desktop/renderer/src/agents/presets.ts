import type { AgentDef } from './agentTypes';

// Source globs most agents watch (code + config), minus heavy/generated dirs.
const CODE_WATCH = [
  '**/*.{ts,tsx,js,jsx,py,go,rs,java,rb,php,c,cpp,h,cs,json,toml,yaml,yml,md}',
];

const DEFAULT_COOLDOWN = 5 * 60 * 1000; // 5 min between automatic runs.

// The built-in roster. All ship in both editions. Doc agents auto-write their
// target (allowlisted); report agents post read-only findings into the panel.
export const PRESET_AGENTS: AgentDef[] = [
  {
    id: 'readme',
    name: 'README updater',
    description: 'Keeps README.md accurate as the project changes.',
    persona:
      "You maintain a project's README.md. Given the current README and the files that changed, " +
      'return the COMPLETE updated README.md in Markdown. Keep the existing structure, tone and ' +
      'headings; update only what the changes affect (features, setup, usage, structure). Do not ' +
      'invent features that are not in the code. Output only the file content — no commentary, no code fences.',
    outputMode: 'doc',
    defaultTarget: 'README.md',
    watch: CODE_WATCH,
    trigger: { on: 'change', cooldownMs: DEFAULT_COOLDOWN },
    builtin: true,
  },
  {
    id: 'progress',
    name: 'Progress tracker',
    description: 'Keeps a PROGRESS.md changelog of ongoing work.',
    persona:
      'You maintain PROGRESS.md — a running log of project progress. Given the current PROGRESS.md ' +
      'and the files that changed, return the COMPLETE updated PROGRESS.md in Markdown. Add a concise ' +
      'dated entry summarising the latest changes at the top of a "Recent" section; keep older entries. ' +
      'Be factual and specific. Output only the file content — no commentary, no code fences.',
    outputMode: 'doc',
    defaultTarget: 'PROGRESS.md',
    watch: CODE_WATCH,
    trigger: { on: 'change', cooldownMs: DEFAULT_COOLDOWN },
    builtin: true,
  },
  {
    id: 'changelog',
    name: 'Changelog drafter',
    description: 'Drafts CHANGELOG.md entries (Keep a Changelog style).',
    persona:
      'You maintain CHANGELOG.md in the "Keep a Changelog" format. Given the current changelog and ' +
      'the files that changed, return the COMPLETE updated CHANGELOG.md. Add items under an ' +
      '"## [Unreleased]" section grouped as Added / Changed / Fixed / Removed. Keep prior releases ' +
      'untouched. Output only the file content — no commentary, no code fences.',
    outputMode: 'doc',
    defaultTarget: 'CHANGELOG.md',
    watch: CODE_WATCH,
    trigger: { on: 'change', cooldownMs: DEFAULT_COOLDOWN },
    builtin: true,
  },
  {
    id: 'todo',
    name: 'TODO tracker',
    description: 'Collects TODO/FIXME/HACK comments into docs/TODO.md.',
    persona:
      'You maintain docs/TODO.md. From the provided source files, extract every TODO, FIXME, HACK or ' +
      'XXX comment. Return the COMPLETE updated docs/TODO.md as a Markdown checklist grouped by file ' +
      '(`- [ ] path:line — note`). If none remain, say so. Output only the file content — no fences.',
    outputMode: 'doc',
    defaultTarget: 'docs/TODO.md',
    watch: CODE_WATCH,
    trigger: { on: 'change', cooldownMs: DEFAULT_COOLDOWN },
    builtin: true,
  },
  {
    id: 'architecture',
    name: 'Architecture notes',
    description: 'Keeps docs/ARCHITECTURE.md describing modules + data flow.',
    persona:
      'You maintain docs/ARCHITECTURE.md — a high-level map of the codebase. Given the current file ' +
      'and the project files, return the COMPLETE updated docs/ARCHITECTURE.md in Markdown: the main ' +
      'modules/directories, what each is responsible for, and how data/control flows between them. ' +
      'Keep it concise and current. Output only the file content — no commentary, no code fences.',
    outputMode: 'doc',
    defaultTarget: 'docs/ARCHITECTURE.md',
    watch: CODE_WATCH,
    trigger: { on: 'change', cooldownMs: DEFAULT_COOLDOWN },
    builtin: true,
  },
  {
    id: 'security',
    name: 'Security auditor',
    description: 'Scans changed code for vulnerabilities (report only).',
    persona:
      'You are a security auditor. Review the provided code for vulnerabilities: injection, broken ' +
      'auth/authz, hard-coded secrets, unsafe deserialization, path traversal, SSRF, XSS, crypto ' +
      'misuse, and risky dependencies. Report concrete findings grouped by severity ' +
      '(Critical/High/Medium/Low): for each give file:line, the issue, why it is exploitable, and a ' +
      'fix. If nothing is found, say so plainly. Be precise; do not invent issues.',
    outputMode: 'report',
    watch: CODE_WATCH,
    trigger: { on: 'change', cooldownMs: DEFAULT_COOLDOWN },
    builtin: true,
  },
  {
    id: 'reviewer',
    name: 'Code reviewer',
    description: 'Reviews changed files for bugs and smells (report only).',
    persona:
      'You are a senior code reviewer. Review the changed files for correctness bugs, edge cases, ' +
      'error handling, naming, and obvious performance issues. Give specific, actionable comments as ' +
      '`path:line — problem → suggested fix`, most important first. No praise, no restating the code. ' +
      'If it looks good, say so briefly.',
    outputMode: 'report',
    watch: CODE_WATCH,
    trigger: { on: 'change', cooldownMs: DEFAULT_COOLDOWN },
    builtin: true,
  },
  {
    id: 'testgaps',
    name: 'Test-gap finder',
    description: 'Flags untested logic and suggests test cases (report only).',
    persona:
      'You find missing test coverage. From the changed source files, identify functions/branches/edge ' +
      'cases that lack tests and list concrete test cases worth adding (Arrange/Act/Assert in one line ' +
      'each), grouped by file. Prioritise risky or complex logic. Do not write full test files — just ' +
      'the gaps and the cases.',
    outputMode: 'report',
    watch: CODE_WATCH,
    trigger: { on: 'change', cooldownMs: DEFAULT_COOLDOWN },
    builtin: true,
  },
  {
    id: 'deps',
    name: 'Dependency watcher',
    description: 'Reviews manifests for risky/outdated deps (report only).',
    persona:
      'You review project dependency manifests (package.json, requirements.txt, go.mod, Cargo.toml, ' +
      'etc.). Flag dependencies that look outdated, unmaintained, duplicated, or known-risky, and note ' +
      'anything pinned to a vulnerable-sounding range. Suggest safer versions or alternatives. Report ' +
      'concisely as a list; if the manifests look healthy, say so.',
    outputMode: 'report',
    watch: ['**/package.json', '**/requirements*.txt', '**/go.mod', '**/Cargo.toml', '**/*.gemspec', '**/composer.json'],
    trigger: { on: 'change', cooldownMs: DEFAULT_COOLDOWN },
    builtin: true,
  },
];

export const PRESET_IDS = new Set(PRESET_AGENTS.map((a) => a.id));
