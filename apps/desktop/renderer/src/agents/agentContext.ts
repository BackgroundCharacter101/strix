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

// Build the user-message context for an agent run: the current target file (for
// doc agents, so they edit in place) plus the relevant source files.
export function buildAgentContext(opts: {
  projectName?: string;
  target?: string;
  currentTarget?: string;
  files: AgentFile[];
}): string {
  const parts: string[] = [];
  if (opts.projectName) parts.push(`Project: ${opts.projectName}`);

  if (opts.target) {
    parts.push(
      `\n=== Current ${opts.target} ===\n${opts.currentTarget?.trim() ? opts.currentTarget : '(file does not exist yet — create it)'}`,
    );
  }

  if (opts.files.length) {
    parts.push('\n=== Project files (most relevant first) ===');
    for (const f of opts.files) {
      parts.push(`\n--- ${f.path} ---\n${f.content}`);
    }
  } else {
    parts.push('\n(No file contents available — work from the description.)');
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
