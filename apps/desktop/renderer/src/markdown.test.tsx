// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import { renderMarkdown } from './markdown';

function show(src: string) {
  return render(<div>{renderMarkdown(src)}</div>);
}

describe('renderMarkdown', () => {
  it('renders headings, bold, and inline code', () => {
    show('# Title\n\nSome **bold** and `code` here.');
    expect(screen.getByRole('heading', { level: 1, name: 'Title' })).toBeInTheDocument();
    expect(screen.getByText('bold').tagName).toBe('STRONG');
    expect(screen.getByText('code').tagName).toBe('CODE');
  });

  it('renders lists and fenced code blocks', () => {
    const { container } = show('- one\n- two\n\n```\nconst x = 1;\n```');
    expect(container.querySelectorAll('li')).toHaveLength(2);
    expect(container.querySelector('pre code')?.textContent).toBe('const x = 1;');
  });

  it('renders safe links but downgrades dangerous ones to text', () => {
    show('[ok](https://example.com) and [bad](javascript:alert(1))');
    const link = screen.getByRole('link', { name: 'ok' });
    expect(link).toHaveAttribute('href', 'https://example.com');
    // The javascript: link is not rendered as an anchor.
    expect(screen.queryByRole('link', { name: 'bad' })).not.toBeInTheDocument();
  });

  it('renders GFM tables with header and body cells', () => {
    const { container } = show('| Name | Role |\n| --- | --- |\n| Ada | Eng |\n| Bob | PM |');
    expect(container.querySelector('table')).toBeInTheDocument();
    expect(container.querySelectorAll('thead th')).toHaveLength(2);
    expect(screen.getByText('Name').tagName).toBe('TH');
    expect(container.querySelectorAll('tbody tr')).toHaveLength(2);
    expect(screen.getByText('Ada').tagName).toBe('TD');
  });

  it('renders inline markup inside table cells', () => {
    show('| Tech | Note |\n| --- | --- |\n| **Electron** | `fs` API |');
    expect(screen.getByText('Electron').tagName).toBe('STRONG');
    expect(screen.getByText('fs').tagName).toBe('CODE');
  });

  it('applies column alignment from the separator row', () => {
    const { container } = show('| L | C | R |\n| :-- | :-: | --: |\n| a | b | c |');
    const cells = container.querySelectorAll('tbody td');
    expect((cells[0] as HTMLElement).style.textAlign).toBe('left');
    expect((cells[1] as HTMLElement).style.textAlign).toBe('center');
    expect((cells[2] as HTMLElement).style.textAlign).toBe('right');
  });

  it('does not mistake a horizontal rule for a table', () => {
    const { container } = show('Above\n\n---\n\nBelow');
    expect(container.querySelector('table')).not.toBeInTheDocument();
    expect(container.querySelector('hr')).toBeInTheDocument();
  });
});
