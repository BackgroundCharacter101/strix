// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, fireEvent } from '@testing-library/react';

vi.mock('@strix/editor', () => ({
  languageForPath: (p: string) => (p.endsWith('.ts') ? 'typescript' : 'plaintext'),
}));

import { StatusBar } from './StatusBar';
import type { GitStatus } from '../../main/git';

const repo: GitStatus = { isRepo: true, branch: 'main', files: [] };

describe('StatusBar', () => {
  it('shows Ready when no file is open', () => {
    render(<StatusBar gitStatus={repo} path={null} dirty={false} cursor={{ line: 1, column: 1 }} />);
    expect(screen.getByLabelText('status bar')).toHaveTextContent('Ready');
  });

  it('shows the git branch and is clickable', () => {
    const onOpenScm = vi.fn();
    render(
      <StatusBar
        gitStatus={repo}
        path={null}
        dirty={false}
        cursor={{ line: 1, column: 1 }}
        onOpenScm={onOpenScm}
      />,
    );
    fireEvent.click(screen.getByLabelText('git status'));
    expect(onOpenScm).toHaveBeenCalled();
  });

  it('shows language and cursor position for the active file', () => {
    render(
      <StatusBar gitStatus={repo} path="/ws/a.ts" dirty={false} cursor={{ line: 12, column: 5 }} />,
    );
    const bar = screen.getByLabelText('status bar');
    expect(bar).toHaveTextContent('typescript');
    expect(bar).toHaveTextContent('Ln 12, Col 5');
    expect(screen.queryByLabelText('unsaved changes')).not.toBeInTheDocument();
  });

  it('shows the unsaved marker when dirty', () => {
    render(<StatusBar gitStatus={repo} path="/ws/a.ts" dirty cursor={{ line: 1, column: 1 }} />);
    expect(screen.getByLabelText('unsaved changes')).toBeInTheDocument();
  });
});
