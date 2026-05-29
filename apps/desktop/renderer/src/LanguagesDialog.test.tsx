// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { LanguagesDialog } from './LanguagesDialog';
import { makeStrixApi } from '../test-utils';

const hasServer = vi.fn<[string], Promise<boolean>>();

beforeEach(() => {
  hasServer.mockReset();
  window.strix = makeStrixApi({ lsp: { hasServer } });
});

describe('LanguagesDialog', () => {
  it('shows installed vs not-found status per language', async () => {
    // rust-analyzer present, everything else missing.
    hasServer.mockImplementation(async (cmd) => cmd === 'rust-analyzer');
    render(<LanguagesDialog onClose={vi.fn()} />);

    expect(screen.getByText('Rust')).toBeInTheDocument();
    await waitFor(() => expect(screen.getAllByText('✓ installed').length).toBeGreaterThan(0));
    // Missing servers surface their install command.
    expect(screen.getByText('pip install python-lsp-server')).toBeInTheDocument();
  });
});
