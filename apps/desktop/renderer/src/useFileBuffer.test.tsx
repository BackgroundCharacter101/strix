// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { makeStrixApi } from '../test-utils';
import { useFileBuffer } from './useFileBuffer';

const read = vi.fn<[string], Promise<string>>();
const write = vi.fn<[string, string], Promise<void>>();

beforeEach(() => {
  read.mockReset();
  write.mockReset().mockResolvedValue();
  window.strix = makeStrixApi({ fs: { read, write } });
});

describe('useFileBuffer', () => {
  it('loads on-disk content into the draft (clean)', async () => {
    read.mockResolvedValue('hello');
    const { result } = renderHook(() => useFileBuffer('/a.ts'));

    await waitFor(() => expect(result.current.draft).toBe('hello'));
    expect(result.current.dirty).toBe(false);
  });

  it('marks dirty on edit and persists on save', async () => {
    read.mockResolvedValue('old');
    const { result } = renderHook(() => useFileBuffer('/a.ts'));
    await waitFor(() => expect(result.current.draft).toBe('old'));

    act(() => result.current.setDraft('new'));
    expect(result.current.dirty).toBe(true);

    await act(async () => {
      await result.current.save();
    });

    expect(write).toHaveBeenCalledWith('/a.ts', 'new');
    expect(result.current.dirty).toBe(false);
  });

  it('captures a save error without losing the draft', async () => {
    read.mockResolvedValue('x');
    write.mockRejectedValue(new Error('EACCES'));
    const { result } = renderHook(() => useFileBuffer('/a.ts'));
    await waitFor(() => expect(result.current.draft).toBe('x'));

    act(() => result.current.setDraft('y'));
    await act(async () => {
      await result.current.save();
    });

    expect(result.current.saveError).toBe('EACCES');
    expect(result.current.draft).toBe('y');
    expect(result.current.dirty).toBe(true);
  });
});
