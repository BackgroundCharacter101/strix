import React from 'react';

// A small, dependency-free Markdown renderer that produces React elements
// (never raw HTML), so there is no XSS surface. Covers the common subset:
// headings, fenced/indented code, lists, blockquotes, rules, and inline
// code/bold/italic/links. Unknown syntax falls back to plain text.

// Only allow safe link targets; anything else renders as plain text.
function safeHref(url: string): string | null {
  return /^(https?:\/\/|mailto:|#|\/|\.)/i.test(url.trim()) ? url.trim() : null;
}

// Inline: scan for the earliest of `code`, **bold**, *italic*, [text](url).
function inline(text: string, keyBase: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  let rest = text;
  let i = 0;

  const matchers: { re: RegExp; make: (m: RegExpExecArray, k: string) => React.ReactNode }[] = [
    { re: /`([^`]+)`/, make: (m, k) => <code key={k}>{m[1]}</code> },
    { re: /\*\*([^*]+)\*\*/, make: (m, k) => <strong key={k}>{inline(m[1], k)}</strong> },
    { re: /\*([^*]+)\*/, make: (m, k) => <em key={k}>{inline(m[1], k)}</em> },
    {
      re: /\[([^\]]+)\]\(([^)]+)\)/,
      make: (m, k) => {
        const href = safeHref(m[2]);
        return href ? (
          <a key={k} href={href} target="_blank" rel="noreferrer noopener">
            {m[1]}
          </a>
        ) : (
          <span key={k}>{m[0]}</span>
        );
      },
    },
  ];

  while (rest.length > 0) {
    let best: { index: number; len: number; node: React.ReactNode } | null = null;
    for (const { re, make } of matchers) {
      const m = re.exec(rest);
      if (m && (best === null || m.index < best.index)) {
        best = { index: m.index, len: m[0].length, node: make(m, `${keyBase}-${i}`) };
      }
    }
    if (!best) {
      nodes.push(rest);
      break;
    }
    if (best.index > 0) nodes.push(rest.slice(0, best.index));
    nodes.push(best.node);
    rest = rest.slice(best.index + best.len);
    i += 1;
  }
  return nodes;
}

// --- GFM tables -------------------------------------------------------------
type Align = 'left' | 'center' | 'right' | undefined;

// Split a `| a | b |` row into trimmed cells, tolerating optional leading/
// trailing pipes and escaped \| inside cells.
function splitTableRow(line: string): string[] {
  let s = line.trim();
  if (s.startsWith('|')) s = s.slice(1);
  if (s.endsWith('|')) s = s.slice(0, -1);
  return s.split(/(?<!\\)\|/).map((c) => c.trim().replace(/\\\|/g, '|'));
}

// A separator row is the second line of a table, e.g. `| --- | :--: |`.
function isTableSeparator(line: string): boolean {
  if (!line.includes('|')) return false;
  const cells = splitTableRow(line);
  return cells.length > 0 && cells.every((c) => /^:?-+:?$/.test(c));
}

function cellAlign(sep: string): Align {
  const s = sep.trim();
  const left = s.startsWith(':');
  const right = s.endsWith(':');
  if (left && right) return 'center';
  if (right) return 'right';
  if (left) return 'left';
  return undefined;
}

export interface MarkdownOptions {
  // When provided, code blocks show a "Save to file" button that hands the code
  // (and any detected filename hint) to the host (e.g. the AI panel writes it).
  onSaveCode?: (code: string, suggestedName?: string) => void;
}

// Detect a filename hint from the first line, e.g. "# filename: app.py",
// "// app.ts", or "<!-- index.html -->".
function detectFilename(code: string): string | undefined {
  const first = code.split('\n', 1)[0]?.trim() ?? '';
  const m = /(?:filename:?\s*)?([\w./-]+\.[A-Za-z0-9]{1,8})\s*(?:-->)?$/.exec(
    first.replace(/^(#|\/\/|<!--|\/\*|\*)\s*/, ''),
  );
  return m ? m[1] : undefined;
}

// A fenced code block with Copy (and optionally Save-to-file) overlaid top-right.
function CodeBlock({
  code,
  onSaveCode,
}: {
  code: string;
  onSaveCode?: (code: string, suggestedName?: string) => void;
}) {
  const [copied, setCopied] = React.useState(false);
  const copy = () => {
    void navigator.clipboard?.writeText(code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    });
  };
  return (
    <pre className="md-pre">
      <span className="md-pre-actions">
        {onSaveCode && (
          <button
            type="button"
            className="md-copy"
            onClick={() => onSaveCode(code, detectFilename(code))}
            aria-label="Save code to a file"
          >
            Save to file
          </button>
        )}
        <button type="button" className="md-copy" onClick={copy} aria-label="Copy code">
          {copied ? 'Copied' : 'Copy'}
        </button>
      </span>
      <code>{code}</code>
    </pre>
  );
}

export function renderMarkdown(src: string, opts: MarkdownOptions = {}): React.ReactNode[] {
  const lines = src.replace(/\r\n/g, '\n').split('\n');
  const blocks: React.ReactNode[] = [];
  let para: string[] = [];
  let key = 0;

  const flushPara = () => {
    if (para.length) {
      blocks.push(<p key={`p${key++}`}>{inline(para.join(' '), `p${key}`)}</p>);
      para = [];
    }
  };

  for (let li = 0; li < lines.length; li++) {
    const line = lines[li];

    // Fenced code block.
    if (/^```/.test(line)) {
      flushPara();
      const code: string[] = [];
      li++;
      while (li < lines.length && !/^```/.test(lines[li])) code.push(lines[li++]);
      blocks.push(
        <CodeBlock key={`pre${key++}`} code={code.join('\n')} onSaveCode={opts.onSaveCode} />,
      );
      continue;
    }

    const heading = /^(#{1,6})\s+(.*)$/.exec(line);
    if (heading) {
      flushPara();
      const level = heading[1].length;
      const Tag = `h${level}` as keyof React.JSX.IntrinsicElements;
      blocks.push(<Tag key={`h${key++}`}>{inline(heading[2], `h${key}`)}</Tag>);
      continue;
    }

    // GFM table: a row containing pipes immediately followed by a separator row.
    if (line.includes('|') && li + 1 < lines.length && isTableSeparator(lines[li + 1])) {
      flushPara();
      const headers = splitTableRow(line);
      const aligns = splitTableRow(lines[li + 1]).map(cellAlign);
      li += 2; // consume header + separator
      const rows: string[][] = [];
      while (li < lines.length && lines[li].includes('|') && lines[li].trim() !== '') {
        rows.push(splitTableRow(lines[li]));
        li++;
      }
      li--; // the outer for-loop will advance past the last consumed row
      const tk = key++;
      blocks.push(
        <table key={`tbl${tk}`}>
          <thead>
            <tr>
              {headers.map((h, idx) => (
                <th key={idx} style={{ textAlign: aligns[idx] }}>
                  {inline(h, `th${tk}-${idx}`)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, ri) => (
              <tr key={ri}>
                {r.map((c, ci) => (
                  <td key={ci} style={{ textAlign: aligns[ci] }}>
                    {inline(c, `td${tk}-${ri}-${ci}`)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>,
      );
      continue;
    }

    if (/^\s*([-*+])\s+/.test(line)) {
      flushPara();
      const items: string[] = [];
      while (li < lines.length && /^\s*([-*+])\s+/.test(lines[li])) {
        items.push(lines[li].replace(/^\s*([-*+])\s+/, ''));
        li++;
      }
      li--;
      blocks.push(
        <ul key={`ul${key++}`}>
          {items.map((it, idx) => (
            <li key={idx}>{inline(it, `ul${key}-${idx}`)}</li>
          ))}
        </ul>,
      );
      continue;
    }

    if (/^\s*\d+\.\s+/.test(line)) {
      flushPara();
      const items: string[] = [];
      while (li < lines.length && /^\s*\d+\.\s+/.test(lines[li])) {
        items.push(lines[li].replace(/^\s*\d+\.\s+/, ''));
        li++;
      }
      li--;
      blocks.push(
        <ol key={`ol${key++}`}>
          {items.map((it, idx) => (
            <li key={idx}>{inline(it, `ol${key}-${idx}`)}</li>
          ))}
        </ol>,
      );
      continue;
    }

    if (/^\s*>\s?/.test(line)) {
      flushPara();
      blocks.push(
        <blockquote key={`bq${key++}`}>{inline(line.replace(/^\s*>\s?/, ''), `bq${key}`)}</blockquote>,
      );
      continue;
    }

    if (/^\s*([-*_])\1{2,}\s*$/.test(line)) {
      flushPara();
      blocks.push(<hr key={`hr${key++}`} />);
      continue;
    }

    if (line.trim() === '') {
      flushPara();
      continue;
    }

    para.push(line.trim());
  }
  flushPara();
  return blocks;
}
