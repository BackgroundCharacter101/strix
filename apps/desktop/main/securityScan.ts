import { promises as fs } from 'fs';
import * as path from 'path';

export interface SecurityFinding {
  path: string; // workspace-relative
  line: number;
  rule: string;
  severity: 'high' | 'medium';
  excerpt: string;
}

// Same ruleset as scripts/security-scan.mjs (the commit gate), reused so the
// in-IDE scan matches what blocks a commit.
const RULES: { name: string; re: RegExp; severity: 'high' | 'medium' }[] = [
  {
    name: 'Private key block',
    re: /-----BEGIN (?:RSA |EC |OPENSSH |DSA |PGP )?PRIVATE KEY-----/,
    severity: 'high',
  },
  { name: 'AWS access key id', re: /\bAKIA[0-9A-Z]{16}\b/, severity: 'high' },
  { name: 'GitHub token', re: /\bgh[pousr]_[A-Za-z0-9]{36,}\b/, severity: 'high' },
  { name: 'FreeLLMAPI unified key', re: /\bfreellmapi-[0-9a-f]{40,}\b/, severity: 'high' },
  { name: 'OpenAI key', re: /\bsk-[A-Za-z0-9]{32,}\b/, severity: 'high' },
  {
    name: 'Hardcoded credential',
    re: /(?:secret|token|password|passwd|api[_-]?key)\s*[:=]\s*["'][A-Za-z0-9_\-./+]{20,}["']/i,
    severity: 'medium',
  },
];

const PLACEHOLDER =
  /your[-_]|example|placeholder|change[-_]?me|xxxx|<[^>]+>|redacted|dummy|sample|\bunified-key\b|\.\.\./i;

const IGNORE = new Set(['node_modules', '.git', 'dist', 'build', '.next', 'out', '.turbo']);
const SKIP_FILE = /\.(png|jpe?g|gif|ico|woff2?|webp|pdf|zip|gz|exe|dll|so|dylib)$/i;
const NUL = String.fromCharCode(0);
const MAX_FINDINGS = 500;
const MAX_FILE_BYTES = 2_000_000;

export async function scanWorkspace(root: string): Promise<SecurityFinding[]> {
  const findings: SecurityFinding[] = [];

  async function walk(dir: string): Promise<void> {
    if (findings.length >= MAX_FINDINGS) return;
    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (findings.length >= MAX_FINDINGS) return;
      if (IGNORE.has(entry.name)) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(full);
      } else if (entry.isFile() && !SKIP_FILE.test(entry.name)) {
        let text: string;
        try {
          const stat = await fs.stat(full);
          if (stat.size > MAX_FILE_BYTES) continue;
          text = await fs.readFile(full, 'utf8');
        } catch {
          continue;
        }
        if (text.includes(NUL)) continue;
        const lines = text.split('\n');
        for (let i = 0; i < lines.length; i++) {
          for (const rule of RULES) {
            if (!rule.re.test(lines[i])) continue;
            if (rule.name === 'Hardcoded credential' && PLACEHOLDER.test(lines[i])) continue;
            findings.push({
              path: path.relative(root, full).replace(/\\/g, '/'),
              line: i + 1,
              rule: rule.name,
              severity: rule.severity,
              excerpt: lines[i].trim().slice(0, 200),
            });
            if (findings.length >= MAX_FINDINGS) return;
          }
        }
      }
    }
  }

  await walk(root);
  return findings;
}
