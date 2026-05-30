// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
vi.mock('@strix/editor', () => ({ languageForPath: () => 'typescript' }));
import { SourceControlView } from './SourceControlView';
import { makeStrixApi } from '../test-utils';
import type { GitStatus } from '../../main/git';

const status = vi.fn<[string], Promise<GitStatus>>();
const stage = vi.fn<[string, string], Promise<void>>();
const commit = vi.fn<[string, string], Promise<string>>();

beforeEach(() => {
  status.mockReset();
  stage.mockReset();
  commit.mockReset();
  stage.mockResolvedValue();
  commit.mockResolvedValue('oid');
  window.strix = makeStrixApi({
    git: { status, fileHead: vi.fn(async () => ''), stage, commit },
  });
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

  it('stages a file via its + button', async () => {
    status.mockResolvedValue({
      isRepo: true,
      branch: 'main',
      files: [{ path: 'src/a.ts', status: 'modified', staged: false }],
    });
    render(<SourceControlView rootPath="/ws" onOpenDiff={vi.fn()} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Stage src/a.ts' }));
    await waitFor(() => expect(stage).toHaveBeenCalledWith('/ws', 'src/a.ts'));
  });

  it('commits the staged changes with the message', async () => {
    status.mockResolvedValue({
      isRepo: true,
      branch: 'main',
      files: [{ path: 'src/a.ts', status: 'modified', staged: true }],
    });
    render(<SourceControlView rootPath="/ws" onOpenDiff={vi.fn()} />);

    fireEvent.change(await screen.findByLabelText('Commit message'), {
      target: { value: 'my commit' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Commit/ }));
    await waitFor(() => expect(commit).toHaveBeenCalledWith('/ws', 'my commit'));
  });

  it('shows a clean message when there are no changes', async () => {
    status.mockResolvedValue({ isRepo: true, branch: 'main', files: [] });
    render(<SourceControlView rootPath="/ws" onOpenDiff={vi.fn()} />);
    expect(await screen.findByText('No changes.')).toBeInTheDocument();
  });
});
