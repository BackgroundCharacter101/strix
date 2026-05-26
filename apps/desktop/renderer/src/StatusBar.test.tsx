// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';

vi.mock('@strix/editor', () => ({
  languageForPath: (p: string) => (p.endsWith('.ts') ? 'typescript' : 'plaintext'),
}));
// Git status reads from window.strix; stub it out here so we test StatusBar in isolation.
vi.mock('./GitStatusBar', () => ({
  GitStatusBar: () => <span aria-label="git status">main</span>,
}));

import { StatusBar } from './StatusBar';

describe('StatusBar', () => {
  it('shows Ready when no file is open', () => {
    render(<StatusBar rootPath={null} path={null} dirty={false} cursor={{ line: 1, column: 1 }} />);
    expect(screen.getByLabelText('status bar')).toHaveTextContent('Ready');
  });

  it('shows language and cursor position for the active file', () => {
    render(
      <StatusBar rootPath="/ws" path="/ws/a.ts" dirty={false} cursor={{ line: 12, column: 5 }} />,
    );
    const bar = screen.getByLabelText('status bar');
    expect(bar).toHaveTextContent('typescript');
    expect(bar).toHaveTextContent('Ln 12, Col 5');
    expect(screen.queryByLabelText('unsaved changes')).not.toBeInTheDocument();
  });

  it('shows the unsaved marker when dirty', () => {
    render(<StatusBar rootPath="/ws" path="/ws/a.ts" dirty cursor={{ line: 1, column: 1 }} />);
    expect(screen.getByLabelText('unsaved changes')).toBeInTheDocument();
  });
});
