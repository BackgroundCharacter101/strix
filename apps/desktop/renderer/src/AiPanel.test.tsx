// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';

const { runTask, configureAi, complete } = vi.hoisted(() => ({
  runTask: vi.fn(),
  configureAi: vi.fn(),
  complete: vi.fn(),
}));
vi.mock('@strix/ai-gateway', () => ({ runTask, configureAi, complete }));
vi.mock('@strix/editor', () => ({
  languageForPath: () => 'typescript',
  DiffViewer: ({ original, modified }: { original: string; modified: string }) => (
    <div aria-label="diff" data-original={original} data-modified={modified} />
  ),
}));

import { AiPanel } from './AiPanel';
import { makeStrixApi } from '../test-utils';

beforeEach(() => {
  runTask.mockReset();
  configureAi.mockReset();
  complete.mockReset();
  localStorage.clear();
  window.strix = makeStrixApi({
    ai: {
      config: vi.fn(async () => ({ baseURL: 'http://localhost:3001/v1', apiKey: 'real-key' })),
      models: vi.fn(async () => ['auto', 'groq/llama-3.3-70b', 'gemini/gemini-2.5-flash']),
    },
  });
});

describe('AiPanel', () => {
  it('configures the AI client from the bridge on mount', async () => {
    render(<AiPanel filePath={null} fileContent="" />);
    await waitFor(() =>
      expect(configureAi).toHaveBeenCalledWith({
        baseURL: 'http://localhost:3001/v1',
        apiKey: 'real-key',
      }),
    );
  });

  it('lists models from the bridge with Auto as the default', async () => {
    render(<AiPanel filePath={null} fileContent="" />);
    const select = screen.getByLabelText('model') as HTMLSelectElement;
    await waitFor(() => expect(screen.getByRole('option', { name: 'groq/llama-3.3-70b' })).toBeInTheDocument());
    expect(select.value).toBe('auto');
  });

  it('disables Send until input, and file actions until a file is selected', () => {
    render(<AiPanel filePath={null} fileContent="" />);
    expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Explain' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Check security' })).toBeDisabled();
  });

  it('sends chat with history + selected model and appends the turn to the thread', async () => {
    runTask.mockImplementation(async (_task, _opts, cb) => {
      cb.onToken('Hel');
      cb.onToken('lo');
      cb.onDone('groq/llama-3.3-70b');
    });

    render(<AiPanel filePath="/ws/a.ts" fileContent="const a = 1;" />);
    // wait for the model list to load, then pick a specific model
    await screen.findByRole('option', { name: 'groq/llama-3.3-70b' });
    fireEvent.change(screen.getByLabelText('model'), { target: { value: 'groq/llama-3.3-70b' } });
    fireEvent.change(screen.getByLabelText('Ask AI'), { target: { value: 'what is this?' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));

    await waitFor(() =>
      expect(screen.getByLabelText('AI conversation')).toHaveTextContent('Hello'),
    );
    expect(screen.getByText(/Routed via:/)).toHaveTextContent('groq/llama-3.3-70b');

    expect(runTask).toHaveBeenCalledWith(
      'chat',
      expect.objectContaining({ filePath: '/ws/a.ts', userMessage: 'what is this?' }),
      expect.any(Object),
      { model: 'groq/llama-3.3-70b' },
    );
    // user message persisted to the thread + localStorage
    expect(screen.getByLabelText('AI conversation')).toHaveTextContent('what is this?');
    expect(localStorage.getItem('strix.ai.history')).toContain('what is this?');
  });

  it('runs explain against the live editor content', async () => {
    render(<AiPanel filePath="/ws/a.ts" fileContent="const unsaved = 2;" />);
    fireEvent.click(screen.getByRole('button', { name: 'Explain' }));
    await waitFor(() =>
      expect(runTask).toHaveBeenCalledWith(
        'explain',
        expect.objectContaining({ filePath: '/ws/a.ts', fileContent: 'const unsaved = 2;' }),
        expect.any(Object),
        { model: 'auto' },
      ),
    );
  });

  it('proposes a refactor diff and applies it to the editor', async () => {
    complete.mockResolvedValue('const refactored = true;');
    const onApplyEdit = vi.fn();
    render(
      <AiPanel filePath="/ws/a.ts" fileContent="const old = 1;" onApplyEdit={onApplyEdit} />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Refactor' }));

    const proposal = await screen.findByLabelText('proposed change');
    expect(complete).toHaveBeenCalledWith(
      'refactor',
      expect.objectContaining({ filePath: '/ws/a.ts', fileContent: 'const old = 1;' }),
      { model: 'auto' },
    );
    expect(within(proposal).getByLabelText('diff')).toHaveAttribute(
      'data-modified',
      'const refactored = true;',
    );

    fireEvent.click(screen.getByRole('button', { name: 'Apply' }));
    expect(onApplyEdit).toHaveBeenCalledWith('const refactored = true;');
  });

  it('restores a persisted conversation from localStorage', () => {
    localStorage.setItem(
      'strix.ai.history',
      JSON.stringify([{ role: 'user', content: 'earlier question' }]),
    );
    render(<AiPanel filePath={null} fileContent="" />);
    expect(screen.getByLabelText('AI conversation')).toHaveTextContent('earlier question');
  });
});
