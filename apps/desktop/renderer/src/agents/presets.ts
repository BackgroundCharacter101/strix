import type { AgentDef } from './agentTypes';

// Source globs most agents watch (code + config), minus heavy/generated dirs.
const CODE_WATCH = [
  '**/*.{ts,tsx,js,jsx,py,go,rs,java,rb,php,c,cpp,h,cs,json,toml,yaml,yml,md}',
];

const DEFAULT_COOLDOWN = 5 * 60 * 1000; // 5 min between automatic runs.

// Appended to every 'edit' agent's persona: the strict output contract so the
// reply can be parsed by parseScaffold and applied to the project.
export const EDIT_OUTPUT_CONTRACT =
  '\n\nOUTPUT FORMAT — return ONLY a JSON object, no prose, no code fences:\n' +
  '{"edits":[{"path":"rel/path","search":"exact existing snippet","replace":"new snippet","summary":"what/why"}],' +
  '"files":[{"path":"rel/path","content":"full file content","summary":"what/why"}],"notes":"one-line summary"}\n' +
  'Rules: use "edits" (search/replace) for changes to existing files — "search" MUST match the current file ' +
  'text EXACTLY (whitespace included); use "files" only for brand-new files or full rewrites. Keep changes ' +
  'minimal and correct; never break the build. Only touch files inside the project (relative paths, no ".."). ' +
  'If nothing needs changing, return {"edits":[],"files":[],"notes":"no changes needed"}.';

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
    name: 'Security fixer',
    description: 'Finds vulnerabilities in changed code and fixes them.',
    persona:
      'You are a security engineer. Review the changed code for vulnerabilities — injection, broken ' +
      'auth/authz, hard-coded secrets, unsafe deserialization, path traversal, SSRF, XSS, crypto ' +
      'misuse — and FIX them directly with minimal, correct edits that preserve behaviour. Prefer ' +
      'small search/replace edits. Do not introduce new dependencies. Only fix real, confirmed issues; ' +
      'if the code is safe, make no changes.' + EDIT_OUTPUT_CONTRACT,
    outputMode: 'edit',
    watch: CODE_WATCH,
    trigger: { on: 'change', cooldownMs: DEFAULT_COOLDOWN },
    builtin: true,
  },
  {
    id: 'bugfixer',
    name: 'Bug fixer',
    description: 'Fixes correctness bugs and bad error handling in changed code.',
    persona:
      'You are a senior engineer. Find and FIX correctness bugs, broken edge cases, and missing error ' +
      'handling in the changed files. Make minimal, surgical edits that keep the existing style and ' +
      'public behaviour. Do not refactor for taste or rename things. If there are no real bugs, make ' +
      'no changes.' + EDIT_OUTPUT_CONTRACT,
    outputMode: 'edit',
    watch: CODE_WATCH,
    trigger: { on: 'change', cooldownMs: DEFAULT_COOLDOWN },
    builtin: true,
  },
  {
    id: 'testwriter',
    name: 'Test writer',
    description: 'Writes/updates unit tests for changed code.',
    persona:
      'You write unit tests. For the changed source files, add or update tests covering the important ' +
      'functions, branches and edge cases, matching the project\'s existing test framework and file ' +
      'naming (look at existing *.test.* / *_test.* files for the pattern). Create new test files or ' +
      'extend existing ones. Do not modify the source under test. If adequate tests already exist, make ' +
      'no changes.' + EDIT_OUTPUT_CONTRACT,
    outputMode: 'edit',
    watch: CODE_WATCH,
    trigger: { on: 'change', cooldownMs: DEFAULT_COOLDOWN },
    builtin: true,
  },
  {
    id: 'doccomments',
    name: 'Doc-comment writer',
    description: 'Adds doc comments (JSDoc/docstrings) to undocumented code.',
    persona:
      'You document code. For the changed files, add concise doc comments (JSDoc for JS/TS, docstrings ' +
      'for Python, etc.) to public functions, classes and exported symbols that lack them. Describe ' +
      'purpose, params and return — do not change any code logic, only add comments. If everything is ' +
      'already documented, make no changes.' + EDIT_OUTPUT_CONTRACT,
    outputMode: 'edit',
    watch: CODE_WATCH,
    trigger: { on: 'change', cooldownMs: DEFAULT_COOLDOWN },
    builtin: true,
  },
  {
    id: 'cleanup',
    name: 'Cleanup agent',
    description: 'Removes dead code / unused imports in changed files.',
    persona:
      'You tidy code safely. In the changed files, remove unused imports, unreachable/dead code, and ' +
      'leftover debug logging, and fix trivially obvious issues — WITHOUT changing behaviour or public ' +
      'APIs. Be conservative: if you are unsure something is unused, leave it. If nothing is safe to ' +
      'remove, make no changes.' + EDIT_OUTPUT_CONTRACT,
    outputMode: 'edit',
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
