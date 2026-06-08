import type {
  BuildPromptOptions,
  ChatMessage,
  ContentPart,
  PromptMessage,
  SecurityStance,
  TaskType,
} from './types';

const SYSTEM_PROMPTS: Record<TaskType, string> = {
  autocomplete:
    'You are a coding assistant. Complete the code. Respond with code only, no explanation.',
  chat: 'You are a helpful coding assistant embedded in the Strix IDE. Answer questions about the user’s code and project. When a "Project structure" listing is provided, use it to reason about the whole project; if you need the contents of a specific file that is not shown, tell the user to open it (or name it) so you can see it.',
  explain: 'You are a coding assistant. Explain the selected code clearly and concisely.',
  fix: 'You are a coding assistant. Given an error and the surrounding code, suggest a fix.',
  generate:
    'You are a coding assistant. Generate code that fulfills the described intent. Respond with code only.',
  refactor:
    'You are a coding assistant. Refactor the selected code while preserving its behavior.',
  vuln_check:
    'You are a security analyst. Inspect the code for vulnerabilities. Report the risk level, the vulnerability class (e.g. SQL injection, XSS, buffer overflow), and a suggested fix.',
  scaffold:
    'You are a coding agent inside the Strix IDE that writes files directly into the user\'s project — never ask the user to open or paste a file; you already have their contents. ' +
    'The user wants to create or modify a project. The current project files (paths and, where shown, contents) are provided as context; modify them as needed. ' +
    'If the request is genuinely ambiguous or you need a decision before editing, reply with a normal plain-text question (NOT JSON) asking for clarification. ' +
    'Otherwise respond with ONLY a JSON object — no prose, no markdown fences — of the form: ' +
    '{"edits":[{"path":"relative/path","search":"EXACT snippet from the current file","replace":"new snippet","summary":"what changed"}],"files":[{"path":"relative/path","content":"FULL contents","summary":"what changed"}],"notes":"1-3 sentence summary","run":"a single shell command to run/test it (optional)"}. ' +
    'PREFER "edits" for changes to EXISTING files: each "search" must be an EXACT substring of the current file (copy it verbatim, include enough surrounding lines to be unique) and "replace" is what to put in its place. This keeps responses short. Use "files" only for NEW files (full content) or a near-total rewrite. ' +
    'Give every edit/file a concrete one-line "summary". Do not touch unchanged files. ' +
    'If running the project would help, set "run" to ONE shell command (the user confirms before it runs). If the user only asks how to run it, you may return just {"run":"...","notes":"..."} with no files. ' +
    'Paths are relative to the project root: forward slashes, no leading slash, no "..", no drive letters. ' +
    'Include everything needed to run (source, config, a package manifest, a short README). Never include node_modules or build output.',
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
  const parts: string[] = [];

  // Whole-project context first, so questions like "explain this project" work
  // even when no file is open.
  if (opts.projectContext) {
    parts.push('Project structure:', opts.projectContext, '');
  }

  // The open file (if any). With no file open we omit the empty "File:" header.
  if (opts.filePath) {
    parts.push(`File: ${opts.filePath}`, '', opts.fileContent);
  }

  if (opts.selection) {
    parts.push('', 'Selected code:', opts.selection);
  }
  if (opts.errorMessage) {
    parts.push('', 'Error:', opts.errorMessage);
  }
  if (opts.userMessage) {
    parts.push('', opts.userMessage);
  }

  // Text from attached files (md / txt / code / extracted PDF text), capped.
  for (const att of opts.attachments ?? []) {
    if (att.text && att.text.trim()) {
      parts.push('', `Attached file "${att.name}":`, '```', att.text.slice(0, 60_000), '```');
    }
  }

  return parts.join('\n');
}

export function buildPrompt(task: TaskType, opts: BuildPromptOptions): PromptMessage[] {
  const stance = opts.securityStance ?? 'balanced';
  // A user-customized persona (from Settings) wins; otherwise use the defaults.
  const persona = opts.securityPersonaText ?? defaultPersonaText(stance);
  const system = opts.securityMode
    ? `${persona}\n\n${SYSTEM_PROMPTS[task]}`
    : SYSTEM_PROMPTS[task];
  const messages: PromptMessage[] = [{ role: 'system', content: system }];

  // Chat + the agent scaffolder are multi-turn: prior conversation is replayed
  // before the new turn so follow-ups ("add those", "make it advanced") work.
  if ((task === 'chat' || task === 'scaffold') && opts.history) {
    messages.push(...(opts.history as ChatMessage[]));
  }

  // The new user turn: plain text, or multimodal parts when images are attached.
  const text = buildUserContent(opts);
  const images = (opts.attachments ?? []).filter((a) => a.imageUrl).map((a) => a.imageUrl as string);
  if (images.length) {
    const content: ContentPart[] = [
      { type: 'text', text },
      ...images.map((url) => ({ type: 'image_url' as const, image_url: { url } })),
    ];
    messages.push({ role: 'user', content });
  } else {
    messages.push({ role: 'user', content: text });
  }

  return messages;
}
