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

export function renderMarkdown(src: string): React.ReactNode[] {
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
        <pre key={`pre${key++}`}>
          <code>{code.join('\n')}</code>
        </pre>,
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
