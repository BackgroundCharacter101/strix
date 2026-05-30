// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ExtensionsView } from './ExtensionsView';
import { makeStrixApi } from '../test-utils';

const hasServer = vi.fn<[string], Promise<boolean>>();
const installServer = vi.fn<[string], Promise<{ ok: boolean; output: string }>>();

beforeEach(() => {
  hasServer.mockReset();
  installServer.mockReset();
  window.strix = makeStrixApi({ lsp: { hasServer, installServer } as never });
});

describe('ExtensionsView', () => {
  it('shows Installed for present servers and an Install button for missing ones', async () => {
    hasServer.mockImplementation(async (cmd) => cmd === 'rust-analyzer');
    render(<ExtensionsView />);

    await waitFor(() => expect(screen.getAllByText('✓ Installed').length).toBeGreaterThan(0));
    // Python is missing → an Install button exists.
    expect(screen.getAllByRole('button', { name: 'Install' }).length).toBeGreaterThan(0);
  });

  it('installs a server and flips it to Installed', async () => {
    hasServer.mockResolvedValue(false);
    installServer.mockResolvedValue({ ok: true, output: 'Successfully installed' });
    render(<ExtensionsView />);

    const buttons = await screen.findAllByRole('button', { name: 'Install' });
    fireEvent.click(buttons[0]);

    await waitFor(() => expect(installServer).toHaveBeenCalled());
    expect(await screen.findByText('Successfully installed')).toBeInTheDocument();
    await waitFor(() => expect(screen.getAllByText('✓ Installed').length).toBeGreaterThan(0));
  });
});
