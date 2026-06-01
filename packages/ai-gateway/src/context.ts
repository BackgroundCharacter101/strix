import type { BuildPromptOptions, ChatMessage, SecurityStance, TaskType } from './types';

const SYSTEM_PROMPTS: Record<TaskType, string> = {
  autocomplete:
    'You are a coding assistant. Complete the code. Respond with code only, no explanation.',
  chat: 'You are a helpful coding assistant embedded in the Strix IDE. Answer questions about the user’s code and project.',
  explain: 'You are a coding assistant. Explain the selected code clearly and concisely.',
  fix: 'You are a coding assistant. Given an error and the surrounding code, suggest a fix.',
  generate:
    'You are a coding assistant. Generate code that fulfills the described intent. Respond with code only.',
  refactor:
    'You are a coding assistant. Refactor the selected code while preserving its behavior.',
  vuln_check:
    'You are a security analyst. Inspect the code for vulnerabilities. Report the risk level, the vulnerability class (e.g. SQL injection, XSS, buffer overflow), and a suggested fix.',
};

// The default security persona used in Strix Cybersec mode: a shared `base`
// framing plus a stance-specific emphasis. Exported so the Settings UI can show,
// edit, and reset these instructions. A user override is passed back in via
// BuildPromptOptions.securityPersonaText.
export type SecurityPersona = { base: string } & Record<SecurityStance, string>;

export const DEFAULT_SECURITY_PERSONA: SecurityPersona = {
  base:
    'You are operating in Strix Cybersec mode, assisting a security engineer and penetration tester who builds security tooling. ' +
    'Be precise about vulnerability classes (cite CWE/CVE when relevant) and name insecure patterns — injection, unsafe deserialization, weak or misused crypto, path traversal, SSRF, auth/session flaws, race conditions. ' +
    'You may discuss exploitation techniques, payloads, and proof-of-concepts for legitimate, authorized security research and defensive tooling. Assume the user is the authorized owner/tester unless stated otherwise.',
  balanced:
    'Bring a balanced offensive AND defensive mindset: reason about attack surface and exploitability, and also give secure-coding guidance, hardening, and concrete mitigations.',
  offensive:
    'Lead with a RED-TEAM, offensive mindset: prioritize attack surface, exploitation paths, payload/PoC construction, control bypasses, and how an attacker would weaponize this. Cover detection/mitigation only briefly and secondarily.',
  defensive:
    'Lead with a BLUE-TEAM, defensive mindset: prioritize secure-by-default design, hardening, input validation, safe APIs, least privilege, and vulnerability avoidance. Reference attacker techniques only as needed to justify the defenses.',
};

// Resolve the persona text for a stance (base + emphasis) from the defaults.
export function defaultPersonaText(stance: SecurityStance): string {
  return `${DEFAULT_SECURITY_PERSONA.base} ${DEFAULT_SECURITY_PERSONA[stance]}`;
}

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
  const stance = opts.securityStance ?? 'balanced';
  // A user-customized persona (from Settings) wins; otherwise use the defaults.
  const persona = opts.securityPersonaText ?? defaultPersonaText(stance);
  const system = opts.securityMode
    ? `${persona}\n\n${SYSTEM_PROMPTS[task]}`
    : SYSTEM_PROMPTS[task];
  const messages: ChatMessage[] = [{ role: 'system', content: system }];

  // Chat is multi-turn: prior conversation is replayed before the new turn (§8.2).
  if (task === 'chat' && opts.history) {
    messages.push(...opts.history);
  }

  messages.push({ role: 'user', content: buildUserContent(opts) });

  return messages;
}
