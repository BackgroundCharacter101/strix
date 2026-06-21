// Parse FreeBuff's terminal output for usage/limit info (sessions left, reset
// timer, percent) so the panel can show a live progress bar. FreeBuff renders a
// TUI with ANSI colour, so we strip escapes first, then scan for the numbers.
// The wording is matched loosely (several phrasings) and refined as we see the
// real output.

// Strip ANSI/VT escape sequences (colour, cursor moves, OSC). Built via new
// RegExp (anchored on ESC = ) so the control char stays out of source and
// normal text is never touched.
/* eslint-disable no-control-regex */
const ANSI = new RegExp(
  '\\u001b(?:[@-Z\\\\-_]|\\[[0-?]*[ -/]*[@-~]|\\][^\\u0007\\u001b]*(?:\\u0007|\\u001b\\\\)?)',
  'g',
);
/* eslint-enable no-control-regex */

export function stripAnsi(s: string): string {
  return s.replace(ANSI, '');
}

export interface FreebuffUsage {
  // Remaining sessions/requests, and the total if known.
  left?: number;
  total?: number;
  // Human label for the reset countdown, e.g. "2h 30m" or "45m".
  resetLabel?: string;
  // 0–100 fill for the bar (from left/total, or an explicit percent).
  percent?: number;
  // Short unit noun for the label ("sessions", "requests", "messages").
  unit: string;
  // The active model name FreeBuff shows in its status line (e.g. "MiMo 2.5").
  model?: string;
  // Time left in the current session, e.g. "1h left" (distinct from the reset).
  sessionLabel?: string;
}

// Models FreeBuff may show in its status bar (used to pull the name out cleanly,
// including a trailing version like "MiMo 2.5" or "gpt-4o").
const MODEL_RE =
  /\b((?:mimo|gpt|claude|gemini|llama|qwen|deepseek|mistral|grok)(?:[ .-]?[\w.]+)*)/i;

function clampPct(n: number): number {
  return Math.max(0, Math.min(100, Math.round(n)));
}

// Pull the most recent usage info out of a chunk of (already accumulated)
// FreeBuff output. Returns null when nothing usage-like is present.
export function parseFreebuffUsage(raw: string): FreebuffUsage | null {
  const text = stripAnsi(raw).replace(/\r/g, '\n');
  const out: FreebuffUsage = { unit: 'sessions' };
  let found = false;

  // "X of Y sessions used" / "X/Y used" → convert to remaining (checked first so
  // the generic matcher below doesn't grab "Y sessions").
  const used = /(\d+)\s*(?:of|\/)\s*(\d+)\s*(sessions?|requests?|messages?|credits?)\s*used/i.exec(
    text,
  );
  if (used) {
    out.total = Number(used[2]);
    out.left = out.total - Number(used[1]);
    out.unit = used[3].toLowerCase().replace(/s?$/, 's');
    found = true;
  }

  // "12 / 50 sessions", "12/50 requests left", "3 sessions remaining"
  if (!found) {
    const unitRe =
      /(\d+)\s*(?:\/\s*(\d+))?\s*(sessions?|requests?|messages?|prompts?|credits?)\s*(?:left|remaining|available)?/i;
    const m = unitRe.exec(text);
    if (m) {
      out.left = Number(m[1]);
      if (m[2]) out.total = Number(m[2]);
      out.unit = m[3].toLowerCase().replace(/s?$/, 's');
      found = true;
    }
  }

  // Reset countdown: "resets in 2h 30m", "reset in 45m", "resets in 1:30:00".
  const reset =
    /reset(?:s)?\s*(?:in|:)?\s*((?:\d+\s*[hms]\b\s*)+|\d{1,2}:\d{2}(?::\d{2})?|\d+\s*(?:hours?|hrs?|minutes?|mins?|seconds?|secs?))/i.exec(
      text,
    );
  if (reset) {
    out.resetLabel = reset[1].trim().replace(/\s+/g, ' ');
    found = true;
  }

  // Explicit percentage: "78% left" / "22% used".
  const pct = /(\d{1,3})%\s*(left|remaining|used)?/i.exec(text);
  if (pct) {
    const n = Number(pct[1]);
    out.percent = clampPct(pct[2] && /used/i.test(pct[2]) ? 100 - n : n);
    found = true;
  }

  // Per-session time budget: "1h left", "59m left" (a time unit before "left",
  // so it won't catch "5 sessions left").
  const sess = /(\d+\s*(?:h|hr|hrs|hours?|m|min|mins|minutes?)\s*left)\b/i.exec(text);
  if (sess) out.sessionLabel = sess[1].replace(/\s+/g, ' ').trim();

  // Active model name from the status bar (best-effort).
  const mod = MODEL_RE.exec(text);
  if (mod) out.model = mod[1].trim().replace(/\s+/g, ' ');

  if (!found && !out.model && !out.sessionLabel) return null;

  if (out.percent === undefined && typeof out.left === 'number' && out.total) {
    out.percent = clampPct((out.left / out.total) * 100);
  }
  return out;
}

// One-line summary for the bar (e.g. "12 / 50 sessions · resets in 2h 30m").
export function formatUsage(u: FreebuffUsage): string {
  const parts: string[] = [];
  if (typeof u.left === 'number') {
    parts.push(u.total ? `${u.left} / ${u.total} ${u.unit}` : `${u.left} ${u.unit} left`);
  } else if (typeof u.percent === 'number') {
    parts.push(`${u.percent}% left`);
  }
  if (u.resetLabel) parts.push(`resets in ${u.resetLabel}`);
  return parts.join(' · ');
}
