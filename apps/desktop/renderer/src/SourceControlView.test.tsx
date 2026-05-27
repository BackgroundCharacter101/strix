// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, fireEvent } from '@testing-library/react';
vi.mock('@strix/editor', () => ({ languageForPath: () => 'typescript' }));
import { SourceControlView } from './SourceControlView';
import { makeStrixApi } from '../test-utils';
import type { GitStatus } from '../../main/git';

const status = vi.fn<[string], Promise<GitStatus>>();

beforeEach(() => {
  status.mockReset();
  window.strix = makeStrixApi({ git: { status, fileHead: vi.fn(async () => '') } });
});

describe('SourceControlView', () => {
  it('lists changed files and opens a diff on click', async () => {
    status.mockResolvedValue({
      isRepo: true,
      branch: 'main',
      files: [{ path: 'src/a.ts', status: 'modified', staged: false }],
    });
    const onOpenDiff = vi.fn();
    render(<SourceControlView rootPath="/ws" onOpenDiff={onOpenDiff} />);

    expect(await screen.findByText('a.ts')).toBeInTheDocument();
    fireEvent.click(screen.getByText('a.ts'));
    expect(onOpenDiff).toHaveBeenCalledWith('/ws/src/a.ts', 'src/a.ts');
  });

  it('shows a clean message when there are no changes', async () => {
    status.mockResolvedValue({ isRepo: true, branch: 'main', files: [] });
    render(<SourceControlView rootPath="/ws" onOpenDiff={vi.fn()} />);
    expect(await screen.findByText('No changes.')).toBeInTheDocument();
  });
});
