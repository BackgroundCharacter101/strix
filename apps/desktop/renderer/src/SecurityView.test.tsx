// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
vi.mock('@strix/editor', () => ({ languageForPath: () => 'typescript' }));
import { SecurityView } from './SecurityView';
import { makeStrixApi } from '../test-utils';
import type { SecurityFinding } from '../../main/securityScan';

const scan = vi.fn<[], Promise<SecurityFinding[]>>();

beforeEach(() => {
  scan.mockReset();
  window.strix = makeStrixApi({ security: { scan } });
});

describe('SecurityView', () => {
  it('scans on open and lists findings, opening one on click', async () => {
    scan.mockResolvedValue([
      { path: 'src/a.ts', line: 2, rule: 'AWS access key id', severity: 'high', excerpt: '…' },
    ]);
    const onOpen = vi.fn();
    render(<SecurityView rootPath="/ws" onOpen={onOpen} />);

    expect(await screen.findByText('a.ts')).toBeInTheDocument();
    expect(screen.getByText('1 high · 0 medium')).toBeInTheDocument();
    fireEvent.click(screen.getByText('a.ts'));
    expect(onOpen).toHaveBeenCalledWith('/ws/src/a.ts');
  });

  it('shows a clean message when there are no findings', async () => {
    scan.mockResolvedValue([]);
    render(<SecurityView rootPath="/ws" onOpen={vi.fn()} />);
    await waitFor(() =>
      expect(screen.getByText('✓ No secrets or credentials found.')).toBeInTheDocument(),
    );
  });
});
