import { isSafeRelPath } from '@strix/ai-gateway';

// Doc agents may only write documentation files: a safe relative path (no `..`,
// not absolute/drive) ending in a doc extension. Markdown/text can't execute, so
// this keeps autonomous writes from ever touching code.
const DOC_EXT = /\.(md|markdown|txt|rst|adoc)$/i;

export function isAllowedDocTarget(target: string): boolean {
  if (!target || !isSafeRelPath(target)) return false;
  return DOC_EXT.test(target);
}

export interface AgentFile {
  path: string;
  content: string;
}

// Build the user-message context for an agent run. Kept deliberately small so a
// run is an "agent-sized" call, not a whole-project dump: a cheap paths-only
// tree for structure, the current target (doc agents), and the CONTENTS of just
// the changed files (the delta) — not every file in the repo.
export function buildAgentContext(opts: {
  projectName?: string;
  target?: string;
  currentTarget?: string;
  // Workspace-relative paths (structure only — no contents). Cheap context.
  tree?: string[];
  // Full contents of the changed/relevant files only.
  files: AgentFile[];
}): string {
  const parts: string[] = [];
  if (opts.projectName) parts.push(`Project: ${opts.projectName}`);

  if (opts.tree && opts.tree.length) {
    parts.push(`\n=== Project structure (${opts.tree.length} files) ===\n${opts.tree.join('\n')}`);
  }

  if (opts.target) {
    parts.push(
      `\n=== Current ${opts.target} ===\n${opts.currentTarget?.trim() ? opts.currentTarget : '(file does not exist yet — create it)'}`,
    );
  }

  if (opts.files.length) {
    parts.push('\n=== Changed files (contents) ===');
    for (const f of opts.files) {
      parts.push(`\n--- ${f.path} ---\n${f.content}`);
    }
  } else {
    parts.push('\n(No changed-file contents — work from the structure above.)');
  }

  return parts.join('\n');
}

// Strip accidental Markdown code-fence wrappers a model may add around a whole
// doc file ("```markdown … ```") so written docs stay clean.
export function stripCodeFence(text: string): string {
  const t = text.trim();
  const m = t.match(/^```[a-zA-Z]*\n([\s\S]*?)\n```$/);
  return (m ? m[1] : t).trim() + '\n';
}
