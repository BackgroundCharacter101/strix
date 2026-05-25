// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { makeStrixApi } from '../test-utils';
import { useEditorTabs } from './useEditorTabs';

const read = vi.fn<[string], Promise<string>>();
const write = vi.fn<[string, string], Promise<void>>();

beforeEach(() => {
  read.mockReset();
  write.mockReset().mockResolvedValue();
  read.mockImplementation(async (p: string) => `contents of ${p}`);
  window.strix = makeStrixApi({ fs: { read, write } });
});

describe('useEditorTabs', () => {
  it('opens a file as a tab and loads its contents', async () => {
    const { result } = renderHook(() => useEditorTabs());
    act(() => result.current.open('/a.ts'));

    expect(result.current.tabs).toEqual(['/a.ts']);
    expect(result.current.activePath).toBe('/a.ts');
    await waitFor(() => expect(result.current.active?.draft).toBe('contents of /a.ts'));
  });

  it('keeps each tab’s unsaved edits when switching between them', async () => {
    const { result } = renderHook(() => useEditorTabs());
    act(() => result.current.open('/a.ts'));
    await waitFor(() => expect(result.current.active?.draft).toBe('contents of /a.ts'));
    act(() => result.current.active?.setDraft('edited A'));

    act(() => result.current.open('/b.ts'));
    await waitFor(() => expect(result.current.active?.draft).toBe('contents of /b.ts'));

    act(() => result.current.activate('/a.ts'));
    expect(result.current.active?.draft).toBe('edited A');
    expect(result.current.isDirty('/a.ts')).toBe(true);
    expect(result.current.isDirty('/b.ts')).toBe(false);
    expect(read).toHaveBeenCalledTimes(2);
  });

  it('saves the active buffer and clears its dirty flag', async () => {
    const { result } = renderHook(() => useEditorTabs());
    act(() => result.current.open('/a.ts'));
    await waitFor(() => expect(result.current.active?.draft).toBe('contents of /a.ts'));

    act(() => result.current.active?.setDraft('new'));
    await act(async () => {
      await result.current.active?.save();
    });

    expect(write).toHaveBeenCalledWith('/a.ts', 'new');
    expect(result.current.isDirty('/a.ts')).toBe(false);
  });

  it('closes a tab and falls back to a remaining one', async () => {
    const { result } = renderHook(() => useEditorTabs());
    act(() => result.current.open('/a.ts'));
    act(() => result.current.open('/b.ts'));
    expect(result.current.activePath).toBe('/b.ts');

    act(() => result.current.close('/b.ts'));
    expect(result.current.tabs).toEqual(['/a.ts']);
    expect(result.current.activePath).toBe('/a.ts');

    act(() => result.current.close('/a.ts'));
    expect(result.current.tabs).toEqual([]);
    expect(result.current.activePath).toBeNull();
    expect(result.current.active).toBeNull();
  });
});
