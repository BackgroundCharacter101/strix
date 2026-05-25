#!/usr/bin/env node
// Strix security scanner — fast, offline, dependency-free.
// Scans git-tracked files for leaked secrets and forbidden files, and blocks
// the commit (exit 1) on any finding. Run on every commit via the pre-commit
// hook, and in CI. Deep semantic review is a separate on-demand agent
// (.github/agents/strix-security-auditor.agent.md).

import { execSync } from 'node:child_process';
import { readFileSync, statSync } from 'node:fs';

const SECRET_RULES = [
  { name: 'Private key block', re: /-----BEGIN (?:RSA |EC |OPENSSH |DSA |PGP )?PRIVATE KEY-----/ },
  { name: 'AWS access key id', re: /\bAKIA[0-9A-Z]{16}\b/ },
  { name: 'GitHub token', re: /\bgh[pousr]_[A-Za-z0-9]{36,}\b/ },
  { name: 'FreeLLMAPI unified key', re: /\bfreellmapi-[0-9a-f]{40,}\b/ },
  { name: 'OpenAI key', re: /\bsk-[A-Za-z0-9]{32,}\b/ },
  {
    name: 'Hardcoded credential',
    re: /(?:secret|token|password|passwd|api[_-]?key)\s*[:=]\s*["'][A-Za-z0-9_\-./+]{20,}["']/i,
  },
];

// Files/dirs excluded from secret scanning (own ruleset, lockfiles with hashes).
const SCAN_SKIP = [/^package-lock\.json$/, /^scripts\/security-scan\.mjs$/, /\.(png|jpg|jpeg|gif|ico|woff2?|webp)$/i];

// Files that must never be committed.
const FORBIDDEN = [/(^|\/)\.env$/, /(^|\/)\.env\.(?!example$).+/];

const files = execSync('git ls-files', { encoding: 'utf8' }).split('\n').filter(Boolean);
const findings = [];

for (const file of files) {
  if (FORBIDDEN.some((re) => re.test(file))) {
    findings.push(`${file}: forbidden file should never be committed (.env)`);
    continue;
  }
  if (SCAN_SKIP.some((re) => re.test(file))) continue;

  let content;
  try {
    if (statSync(file).size > 2_000_000) continue; // skip very large files
    content = readFileSync(file, 'utf8');
  } catch {
    continue;
  }

  const lines = content.split('\n');
  for (const rule of SECRET_RULES) {
    for (let i = 0; i < lines.length; i++) {
      if (rule.re.test(lines[i])) {
        findings.push(`${file}:${i + 1}: possible ${rule.name}`);
      }
    }
  }
}

if (findings.length > 0) {
  console.error('\n✖ Security scan failed — potential secrets / forbidden files:\n');
  for (const f of findings) console.error('  - ' + f);
  console.error('\nRemove the secret (use .env, which is gitignored) and re-commit.\n');
  process.exit(1);
}

console.log(`✓ Security scan clean (${files.length} tracked files, no secrets/forbidden files).`);
