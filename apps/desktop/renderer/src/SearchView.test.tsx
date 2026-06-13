// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
vi.mock('@strix/editor', () => ({ languageForPath: () => 'typescript' }));
import { SearchView } from './SearchView';
import { makeStrixApi } from '../test-utils';
import type { SearchMatch } from '../../main/search';

const find = vi.fn<[string, unknown?], Promise<SearchMatch[]>>();

beforeEach(() => {
  find.mockReset();
  window.strix = makeStrixApi({ search: { find } });
});

describe('SearchView', () => {
  it('queries the bridge and groups results by file, opening on click', async () => {
    find.mockResolvedValue([
      { path: '/ws/a.ts', line: 3, text: 'const x = 1;' },
      { path: '/ws/a.ts', line: 9, text: 'return x;' },
      { path: '/ws/b.ts', line: 1, text: 'import x;' },
    ]);
    const onOpen = vi.fn();
    render(<SearchView onOpen={onOpen} />);

    fireEvent.change(screen.getByLabelText('Search'), { target: { value: 'x' } });

    await waitFor(() =>
      expect(find).toHaveBeenCalledWith('x', { caseSensitive: false, wholeWord: false }),
    );
    expect(await screen.findByText('const x = 1;')).toBeInTheDocument();
    expect(screen.getByText(/3 results in 2 files/)).toBeInTheDocument();

    fireEvent.click(screen.getByText('return x;'));
    expect(onOpen).toHaveBeenCalledWith('/ws/a.ts', 9);
  });

  it('re-queries with match options when toggles are clicked', async () => {
    find.mockResolvedValue([]);
    render(<SearchView onOpen={vi.fn()} />);
    fireEvent.change(screen.getByLabelText('Search'), { target: { value: 'x' } });
    await waitFor(() =>
      expect(find).toHaveBeenCalledWith('x', { caseSensitive: false, wholeWord: false }),
    );

    fireEvent.click(screen.getByLabelText('Match case'));
    await waitFor(() =>
      expect(find).toHaveBeenCalledWith('x', { caseSensitive: true, wholeWord: false }),
    );

    fireEvent.click(screen.getByLabelText('Match whole word'));
    await waitFor(() =>
      expect(find).toHaveBeenCalledWith('x', { caseSensitive: true, wholeWord: true }),
    );
  });

  it('does not query for an empty string', () => {
    render(<SearchView onOpen={vi.fn()} />);
    fireEvent.change(screen.getByLabelText('Search'), { target: { value: '   ' } });
    expect(find).not.toHaveBeenCalled();
  });
});
