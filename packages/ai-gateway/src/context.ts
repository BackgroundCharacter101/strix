import type { BuildPromptOptions, ChatMessage, TaskType } from './types';

const SYSTEM_PROMPTS: Record<TaskType, string> = {
  autocomplete:
    'You are a coding assistant. Complete the code. Respond with code only, no explanation.',
  chat: 'You are a helpful coding assistant embedded in the Tabea IDE. Answer questions about the user’s code and project.',
  explain: 'You are a coding assistant. Explain the selected code clearly and concisely.',
  fix: 'You are a coding assistant. Given an error and the surrounding code, suggest a fix.',
  generate:
    'You are a coding assistant. Generate code that fulfills the described intent. Respond with code only.',
  refactor:
    'You are a coding assistant. Refactor the selected code while preserving its behavior.',
  vuln_check:
    'You are a security analyst. Inspect the code for vulnerabilities. Report the risk level, the vulnerability class (e.g. SQL injection, XSS, buffer overflow), and a suggested fix.',
};

function buildUserContent(opts: BuildPromptOptions): string {
  const parts = [`File: ${opts.filePath}`, '', opts.fileContent];

  if (opts.selection) {
    parts.push('', 'Selected code:', opts.selection);
  }
  if (opts.errorMessage) {
    parts.push('', 'Error:', opts.errorMessage);
  }
  if (opts.userMessage) {
    parts.push('', opts.userMessage);
  }

  return parts.join('\n');
}

export function buildPrompt(task: TaskType, opts: BuildPromptOptions): ChatMessage[] {
  const messages: ChatMessage[] = [{ role: 'system', content: SYSTEM_PROMPTS[task] }];

  // Chat is multi-turn: prior conversation is replayed before the new turn (§8.2).
  if (task === 'chat' && opts.history) {
    messages.push(...opts.history);
  }

  messages.push({ role: 'user', content: buildUserContent(opts) });

  return messages;
}
