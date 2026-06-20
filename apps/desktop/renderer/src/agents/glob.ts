// Tiny glob matcher for agent watch patterns — supports `**`, `*`, `?` and
// brace sets `{a,b,c}`. Paths are matched with forward slashes, case-sensitive
// on segments but extension-friendly. Enough for watch lists; no external dep.

function expandBraces(pattern: string): string[] {
  const m = pattern.match(/\{([^{}]*)\}/);
  if (!m) return [pattern];
  const [whole, inner] = m;
  const out: string[] = [];
  for (const opt of inner.split(',')) {
    out.push(...expandBraces(pattern.replace(whole, opt)));
  }
  return out;
}

function segmentToRegex(glob: string): string {
  let re = '';
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === '*') {
      if (glob[i + 1] === '*') {
        // `**` — match across path separators (any depth).
        re += '.*';
        i++;
        // Swallow a following slash so `a/**/b` also matches `a/b`.
        if (glob[i + 1] === '/') i++;
      } else {
        // `*` — match within a path segment (no slash).
        re += '[^/]*';
      }
    } else if (c === '?') {
      re += '[^/]';
    } else if ('\\^$.|+()[]{}'.includes(c)) {
      re += `\\${c}`;
    } else {
      re += c;
    }
  }
  return re;
}

const cache = new Map<string, RegExp>();

export function matchGlob(pattern: string, path: string): boolean {
  const p = path.replace(/\\/g, '/').replace(/^\.\//, '');
  for (const variant of expandBraces(pattern)) {
    let re = cache.get(variant);
    if (!re) {
      re = new RegExp(`^${segmentToRegex(variant)}$`);
      cache.set(variant, re);
    }
    if (re.test(p)) return true;
  }
  return false;
}

export function matchAny(patterns: string[], path: string): boolean {
  return patterns.some((pat) => matchGlob(pat, path));
}
