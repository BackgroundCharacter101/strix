// Instruction sent to the AI to draft a commit message from a staged diff.
export const COMMIT_MESSAGE_INSTRUCTION =
  'You are writing a git commit message for the following staged diff. ' +
  'Use Conventional Commits style (feat:, fix:, refactor:, chore:, docs:, test:). ' +
  'Respond with ONLY the commit message: a short imperative subject line under 72 ' +
  'characters, optionally followed by a blank line and a concise body. ' +
  'No surrounding quotes, no code fences, no commentary.';

// Tidy a model's reply into a usable commit message: strip code fences, wrapping
// quotes, and a leading "commit message:" preamble some models add.
export function cleanCommitMessage(raw: string): string {
  let s = (raw ?? '').trim();
  // Strip a ```fence``` wrapper.
  s = s.replace(/^```[\w-]*\s*\n?/, '').replace(/\n?```$/, '').trim();
  // Strip a leading label like "Commit message:".
  s = s.replace(/^commit message:\s*/i, '').trim();
  // Strip symmetric wrapping quotes/backticks.
  if (s.length >= 2) {
    const first = s[0];
    const last = s[s.length - 1];
    if ((first === '"' || first === "'" || first === '`') && first === last) {
      s = s.slice(1, -1).trim();
    }
  }
  return s;
}
