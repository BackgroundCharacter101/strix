// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { UpdateBanner } from './UpdateBanner';
import { makeStrixApi } from '../test-utils';
import type { UpdateInfo } from '../../main/bridge';

const info: UpdateInfo = {
  version: '0.2.0',
  url: 'http://localhost:8787/Strix-Setup-0.2.0.exe',
  sha256: 'a'.repeat(64),
  notes: 'Nice things',
};

beforeEach(() => {
  window.strix = makeStrixApi();
});

describe('UpdateBanner', () => {
  it('stays hidden when there is no update', async () => {
    window.strix = makeStrixApi({
      update: { check: vi.fn(async () => ({ available: false, current: '0.1.0' })) },
    });
    const { container } = render(<UpdateBanner />);
    await waitFor(() => expect(window.strix.update.check).toHaveBeenCalled());
    expect(container.querySelector('.update-banner')).toBeNull();
  });

  it('shows the offer when an update is available and downloads on "Update now"', async () => {
    const download = vi.fn(async () => ({ ok: true }));
    window.strix = makeStrixApi({
      update: { check: vi.fn(async () => ({ available: true, current: '0.1.0', manifest: info })), download },
    });
    render(<UpdateBanner />);
    const btn = await screen.findByRole('button', { name: 'Update now' });
    expect(screen.getByText('v0.2.0')).toBeInTheDocument();
    expect(screen.getByText(/available/)).toBeInTheDocument();
    fireEvent.click(btn);
    expect(download).toHaveBeenCalledWith(info);
    expect(screen.getByText(/Downloading update/)).toBeInTheDocument();
  });

  it('renders progress, then a Restart button on ready, and applies on click', async () => {
    let readyCb: (p: { version: string }) => void = () => {};
    let progCb: (p: { received: number; total: number; percent: number }) => void = () => {};
    const apply = vi.fn(async () => ({ ok: true }));
    window.strix = makeStrixApi({
      update: {
        check: vi.fn(async () => ({ available: true, current: '0.1.0', manifest: info })),
        onReady: vi.fn((cb) => {
          readyCb = cb;
          return () => {};
        }),
        onProgress: vi.fn((cb) => {
          progCb = cb;
          return () => {};
        }),
        apply,
      },
    });
    render(<UpdateBanner />);
    fireEvent.click(await screen.findByRole('button', { name: 'Update now' }));

    progCb({ received: 50, total: 100, percent: 50 });
    await screen.findByText(/Downloading update… 50%/);

    readyCb({ version: '0.2.0' });
    const restart = await screen.findByRole('button', { name: 'Restart now' });
    fireEvent.click(restart);
    expect(apply).toHaveBeenCalled();
  });

  it('reports "up to date" when the user checks manually from the menu', async () => {
    let menuCb: (id: string) => void = () => {};
    window.strix = makeStrixApi({
      update: { check: vi.fn(async () => ({ available: false, current: '0.1.0' })) },
      menu: {
        onCommand: vi.fn((cb) => {
          menuCb = cb;
          return () => {};
        }),
      },
    });
    render(<UpdateBanner />);
    await waitFor(() => expect(window.strix.update.check).toHaveBeenCalledTimes(1));
    menuCb('help.updates');
    await screen.findByText(/up to date/i);
  });
});
