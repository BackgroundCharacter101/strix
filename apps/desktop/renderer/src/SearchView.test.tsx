// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
vi.mock('@strix/editor', () => ({ languageForPath: () => 'typescript' }));
import { SearchView } from './SearchView';
import { makeStrixApi } from '../test-utils';
import type { SearchMatch } from '../../main/search';

const start = vi.fn<[number, string, unknown?], void>();
const cancel = vi.fn();
// Captured streaming callbacks so tests can push matches/done like the main proc.
let matchCb: (p: { id: number; matches: SearchMatch[] }) => void = () => {};
let doneCb: (p: { id: number }) => void = () => {};

beforeEach(() => {
  start.mockReset();
  cancel.mockReset();
  window.strix = makeStrixApi({
    search: {
      start,
      cancel,
      onMatch: (cb) => {
        matchCb = cb;
        return () => {};
      },
      onDone: (cb) => {
        doneCb = cb;
        return () => {};
      },
    },
  });
});

describe('SearchView', () => {
  it('streams results, groups them by file, and opens on click', async () => {
    const onOpen = vi.fn();
    render(<SearchView onOpen={onOpen} />);

    fireEvent.change(screen.getByLabelText('Search'), { target: { value: 'x' } });
    await waitFor(() =>
      expect(start).toHaveBeenCalledWith(expect.any(Number), 'x', {
        caseSensitive: false,
        wholeWord: false,
      }),
    );

    // Feed streamed matches with the active search id, then signal done.
    const id = start.mock.calls[start.mock.calls.length - 1][0];
    act(() => {
      matchCb({
        id,
        matches: [
          { path: '/ws/a.ts', line: 3, text: 'const x = 1;' },
          { path: '/ws/a.ts', line: 9, text: 'return x;' },
          { path: '/ws/b.ts', line: 1, text: 'import x;' },
        ],
      });
      doneCb({ id });
    });

    expect(await screen.findByText('const x = 1;')).toBeInTheDocument();
    expect(screen.getByText(/3 results in 2 files/)).toBeInTheDocument();

    fireEvent.click(screen.getByText('return x;'));
    expect(onOpen).toHaveBeenCalledWith('/ws/a.ts', 9);
  });

  it('ignores late matches from a superseded search id', async () => {
    render(<SearchView onOpen={vi.fn()} />);
    fireEvent.change(screen.getByLabelText('Search'), { target: { value: 'x' } });
    await waitFor(() => expect(start).toHaveBeenCalled());
    const staleId = start.mock.calls[0][0];

    // Type again → new id; the stale id's matches must be dropped.
    fireEvent.change(screen.getByLabelText('Search'), { target: { value: 'xy' } });
    await waitFor(() => expect(start).toHaveBeenCalledTimes(2));
    act(() => matchCb({ id: staleId, matches: [{ path: '/ws/a.ts', line: 1, text: 'stale' }] }));
    expect(screen.queryByText('stale')).not.toBeInTheDocument();
  });

  it('re-queries with match options when toggles are clicked', async () => {
    render(<SearchView onOpen={vi.fn()} />);
    fireEvent.change(screen.getByLabelText('Search'), { target: { value: 'x' } });
    await waitFor(() =>
      expect(start).toHaveBeenCalledWith(expect.any(Number), 'x', {
        caseSensitive: false,
        wholeWord: false,
      }),
    );

    fireEvent.click(screen.getByLabelText('Match case'));
    await waitFor(() =>
      expect(start).toHaveBeenCalledWith(expect.any(Number), 'x', {
        caseSensitive: true,
        wholeWord: false,
      }),
    );

    fireEvent.click(screen.getByLabelText('Match whole word'));
    await waitFor(() =>
      expect(start).toHaveBeenCalledWith(expect.any(Number), 'x', {
        caseSensitive: true,
        wholeWord: true,
      }),
    );
  });

  it('does not start a search for an empty string', () => {
    render(<SearchView onOpen={vi.fn()} />);
    fireEvent.change(screen.getByLabelText('Search'), { target: { value: '   ' } });
    expect(start).not.toHaveBeenCalled();
  });
});
