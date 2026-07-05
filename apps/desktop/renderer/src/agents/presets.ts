import type { AgentDef } from './agentTypes';

// Source globs most agents watch (code + config), minus heavy/generated dirs.
const CODE_WATCH = [
  '**/*.{ts,tsx,js,jsx,py,go,rs,java,rb,php,c,cpp,h,cs,json,toml,yaml,yml,md}',
];

const DEFAULT_COOLDOWN = 5 * 60 * 1000; // 5 min between automatic runs.

// Appended to every 'report' agent's persona: agents monitor/audit only — they
// never change code. Their findings are written as actionable instructions so
// the user can hand them straight to the main AI (AI Assistant / FreeBuff).
export const REPORT_OUTPUT_HINT =
  '\n\nYou only monitor and report — never rewrite the code yourself. Write findings so they can be ' +
  'handed to a coding AI to fix: for each, give the file path, the exact problem, and a concrete ' +
  'instruction for the fix. If nothing is wrong, say so in one line.';

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
    description: 'Monitors changed code for vulnerabilities (report).',
    persona:
      'You are a security auditor. Review the changed code for vulnerabilities — injection, broken ' +
      'auth/authz, hard-coded secrets, unsafe deserialization, path traversal, SSRF, XSS, crypto ' +
      'misuse, risky dependencies. Report concrete findings grouped by severity (Critical/High/Medium/' +
      'Low): file:line, the issue, why it is exploitable, and how to fix it. Be precise; do not invent ' +
      'issues.' + REPORT_OUTPUT_HINT,
    outputMode: 'report',
    watch: CODE_WATCH,
    trigger: { on: 'change', cooldownMs: DEFAULT_COOLDOWN },
    builtin: true,
  },
  {
    id: 'bugfixer',
    name: 'Bug spotter',
    description: 'Monitors changed code for correctness bugs (report).',
    persona:
      'You are a senior engineer reviewing changes. Find correctness bugs, broken edge cases, and ' +
      'missing error handling in the changed files. Report each as file:line, the problem, and a ' +
      'concrete fix instruction, most important first. If there are no real bugs, say so.' +
      REPORT_OUTPUT_HINT,
    outputMode: 'report',
    watch: CODE_WATCH,
    trigger: { on: 'change', cooldownMs: DEFAULT_COOLDOWN },
    builtin: true,
  },
  {
    id: 'testgaps',
    name: 'Test-gap finder',
    description: 'Flags untested logic and the tests worth adding (report).',
    persona:
      'You audit test coverage. From the changed source files, identify functions/branches/edge cases ' +
      'that lack tests and list concrete test cases worth adding (one line each, Arrange/Act/Assert), ' +
      'grouped by file, matching the project\'s test framework. Prioritise risky logic.' +
      REPORT_OUTPUT_HINT,
    outputMode: 'report',
    watch: CODE_WATCH,
    trigger: { on: 'change', cooldownMs: DEFAULT_COOLDOWN },
    builtin: true,
  },
  {
    id: 'cleanup',
    name: 'Cleanup advisor',
    description: 'Flags dead code / unused imports (report).',
    persona:
      'You audit for cruft. In the changed files, flag unused imports, unreachable/dead code, leftover ' +
      'debug logging, and obvious smells — WITHOUT proposing behaviour changes. Report each as ' +
      'file:line and what to remove. Be conservative; if unsure something is unused, leave it out.' +
      REPORT_OUTPUT_HINT,
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
  {
    id: 'perf',
    name: 'Performance auditor',
    description: 'Flags slow patterns / hotspots in changed code (report).',
    persona:
      'You audit for performance problems in the changed code: nested loops over large data (O(n²)+), ' +
      'work repeated inside loops that could be hoisted, synchronous/blocking I/O on hot paths, N+1 ' +
      'queries, unbounded caches/leaks, and heavy re-renders (React). Report each as file:line, the cost, ' +
      'and a concrete optimisation. Ignore micro-optimisations that do not matter.' + REPORT_OUTPUT_HINT,
    outputMode: 'report',
    watch: CODE_WATCH,
    trigger: { on: 'change', cooldownMs: DEFAULT_COOLDOWN },
    builtin: true,
  },
  {
    id: 'a11y',
    name: 'Accessibility auditor',
    description: 'Checks UI code for a11y issues (report only).',
    persona:
      'You audit UI code (HTML/JSX/TSX/Vue/Svelte) for accessibility problems: missing alt text, ' +
      'unlabelled inputs/buttons, poor colour contrast, missing ARIA roles/labels, non-semantic ' +
      'elements used as controls, keyboard traps, and focus-order issues. Report each as file:line, ' +
      'the WCAG concern, and the fix. If the UI looks accessible, say so.' + REPORT_OUTPUT_HINT,
    outputMode: 'report',
    watch: ['**/*.{html,htm,jsx,tsx,vue,svelte}'],
    trigger: { on: 'change', cooldownMs: DEFAULT_COOLDOWN },
    builtin: true,
  },
  {
    id: 'errorhandling',
    name: 'Error-handling auditor',
    description: 'Flags swallowed errors / missing handling (report).',
    persona:
      'You audit error handling in the changed code: empty catch blocks, swallowed/ignored errors, ' +
      'unhandled promise rejections, missing await, unchecked return codes, resources not closed on ' +
      'the error path, and user-facing operations with no failure feedback. Report each as file:line, ' +
      'the risk, and how to handle it properly.' + REPORT_OUTPUT_HINT,
    outputMode: 'report',
    watch: CODE_WATCH,
    trigger: { on: 'change', cooldownMs: DEFAULT_COOLDOWN },
    builtin: true,
  },
];

export const PRESET_IDS = new Set(PRESET_AGENTS.map((a) => a.id));
