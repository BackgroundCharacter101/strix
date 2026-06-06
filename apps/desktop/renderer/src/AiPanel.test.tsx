// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';

const { runTask, configureAi, complete } = vi.hoisted(() => ({
  runTask: vi.fn(),
  configureAi: vi.fn(),
  complete: vi.fn(),
}));
vi.mock('@strix/ai-gateway', async (importActual) => {
  const actual = await importActual<typeof import('@strix/ai-gateway')>();
  // Keep the real pure helpers (parseScaffold, etc.); stub the network calls.
  return { ...actual, runTask, configureAi, complete };
});
vi.mock('@strix/editor', () => ({
  languageForPath: () => 'typescript',
  DiffViewer: ({ original, modified }: { original: string; modified: string }) => (
    <div aria-label="diff" data-original={original} data-modified={modified} />
  ),
}));

import { AiPanel, flattenTree } from './AiPanel';
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
      expect.objectContaining({ model: 'groq/llama-3.3-70b' }),
    );
    // user message persisted to the thread + localStorage
    expect(screen.getByLabelText('AI conversation')).toHaveTextContent('what is this?');
    expect(localStorage.getItem('strix.ai.history:global')).toContain('what is this?');
  });

  it('sends on Enter and inserts a newline on Shift+Enter', async () => {
    runTask.mockImplementation(async (_t, _o, cb) => {
      cb.onToken('Hi');
      cb.onDone('groq');
    });
    render(<AiPanel filePath="/ws/a.ts" fileContent="x" />);
    const box = screen.getByLabelText('Ask AI');

    // Shift+Enter must NOT send.
    fireEvent.change(box, { target: { value: 'line one' } });
    fireEvent.keyDown(box, { key: 'Enter', shiftKey: true });
    expect(runTask).not.toHaveBeenCalled();

    // Enter sends a chat turn.
    fireEvent.keyDown(box, { key: 'Enter' });
    await waitFor(() => expect(runTask).toHaveBeenCalledWith('chat', expect.any(Object), expect.any(Object), expect.any(Object)));
  });

  it('shows a Stop button while generating and aborts on click', async () => {
    runTask.mockImplementation(
      (_t, _o, _cb, settings) =>
        new Promise<void>((resolve) => {
          settings.signal?.addEventListener('abort', () => resolve());
        }),
    );
    render(<AiPanel filePath={null} fileContent="" />);
    fireEvent.change(screen.getByLabelText('Ask AI'), { target: { value: 'hi' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));

    const stopBtn = await screen.findByRole('button', { name: 'Stop generating' });
    fireEvent.click(stopBtn);

    // Aborting ends the run → the Send button returns.
    await waitFor(() => expect(screen.getByRole('button', { name: 'Send' })).toBeInTheDocument());
  });

  it('runs explain against the live editor content', async () => {
    render(<AiPanel filePath="/ws/a.ts" fileContent="const unsaved = 2;" />);
    fireEvent.click(screen.getByRole('button', { name: 'Explain' }));
    await waitFor(() =>
      expect(runTask).toHaveBeenCalledWith(
        'explain',
        expect.objectContaining({ filePath: '/ws/a.ts', fileContent: 'const unsaved = 2;' }),
        expect.any(Object),
        expect.objectContaining({ model: 'auto' }),
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
      expect.objectContaining({ model: 'auto' }),
    );
    expect(within(proposal).getByLabelText('diff')).toHaveAttribute(
      'data-modified',
      'const refactored = true;',
    );

    fireEvent.click(screen.getByRole('button', { name: 'Apply' }));
    expect(onApplyEdit).toHaveBeenCalledWith('const refactored = true;');
  });

  it('runs Explain on a selection request and shows it in the thread', async () => {
    runTask.mockImplementation(async (_t, _o, cb) => {
      cb.onToken('This code ');
      cb.onToken('does X.');
      cb.onDone('groq');
    });
    const { rerender } = render(
      <AiPanel filePath="/ws/a.ts" fileContent="full" selectionRequest={{ nonce: 0, kind: 'explain', selection: '' }} />,
    );
    rerender(
      <AiPanel
        filePath="/ws/a.ts"
        fileContent="full"
        selectionRequest={{ nonce: 1, kind: 'explain', selection: 'const x = 1;' }}
      />,
    );

    await waitFor(() =>
      expect(screen.getByLabelText('AI conversation')).toHaveTextContent('This code does X.'),
    );
    expect(runTask).toHaveBeenCalledWith(
      'explain',
      expect.objectContaining({ fileContent: 'const x = 1;' }),
      expect.any(Object),
      expect.any(Object),
    );
  });

  it('prompts to add a key when the AI has no provider key configured', async () => {
    const onConfigure = vi.fn();
    // makeStrixApi's listKeys returns [] by default → not configured.
    render(<AiPanel filePath={null} fileContent="" onConfigure={onConfigure} />);
    const btn = await screen.findByRole('button', { name: 'Add a key' });
    fireEvent.click(btn);
    expect(onConfigure).toHaveBeenCalled();
  });

  it('hides the config prompt once a provider key exists', async () => {
    window.strix = makeStrixApi({
      ai: {
        config: vi.fn(async () => ({ baseURL: 'http://localhost:3001/v1', apiKey: 'k' })),
        models: vi.fn(async () => ['auto']),
        listKeys: vi.fn(async () => [
          { id: 1, platform: 'groq', label: '', maskedKey: 'gsk_…abcd', status: 'valid', enabled: true },
        ]),
      },
    });
    render(<AiPanel filePath={null} fileContent="" onConfigure={vi.fn()} />);
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'Add a key' })).not.toBeInTheDocument(),
    );
  });

  it('scaffolds a project from a prompt and writes files on confirm', async () => {
    complete.mockResolvedValue(
      '{"files":[{"path":"src/index.ts","content":"export const x = 1;"}],"notes":"demo"}',
    );
    const write = vi.fn(async () => {});
    const onOpenPath = vi.fn();
    window.strix = makeStrixApi({ fs: { write } });
    render(
      <AiPanel filePath={null} fileContent="" workspaceKey="/ws" onOpenPath={onOpenPath} />,
    );

    fireEvent.change(screen.getByLabelText('Ask AI'), { target: { value: 'a todo app' } });
    fireEvent.click(screen.getByRole('button', { name: /Build project/ }));

    // Confirmation preview lists the planned file.
    await screen.findByText('src/index.ts');
    fireEvent.click(screen.getByRole('button', { name: 'Create files' }));

    await waitFor(() =>
      expect(write).toHaveBeenCalledWith('/ws/src/index.ts', 'export const x = 1;'),
    );
    await waitFor(() => expect(onOpenPath).toHaveBeenCalledWith('/ws/src/index.ts'));
  });

  it('hands the question off to Claude Code', async () => {
    const onAskClaude = vi.fn();
    render(<AiPanel filePath="/ws/a.ts" fileContent="x" onAskClaude={onAskClaude} />);
    fireEvent.change(screen.getByLabelText('Ask AI'), { target: { value: 'why is this slow?' } });
    fireEvent.click(screen.getByRole('button', { name: /Ask Claude Code/ }));
    expect(onAskClaude).toHaveBeenCalledWith('why is this slow?');
  });

  it('restores a persisted conversation from localStorage', () => {
    localStorage.setItem(
      'strix.ai.history:global',
      JSON.stringify([{ role: 'user', content: 'earlier question' }]),
    );
    render(<AiPanel filePath={null} fileContent="" />);
    expect(screen.getByLabelText('AI conversation')).toHaveTextContent('earlier question');
  });

  it('flattens a workspace tree into an indented listing', () => {
    const out = flattenTree({
      name: 'root',
      type: 'directory',
      children: [
        {
          name: 'src',
          type: 'directory',
          children: [{ name: 'index.ts', type: 'file' }],
        },
        { name: 'README.md', type: 'file' },
      ],
    });
    expect(out).toBe('src/\n  index.ts\nREADME.md');
  });

  it('keeps AI history separate per workspace', () => {
    localStorage.setItem(
      'strix.ai.history:/projA',
      JSON.stringify([{ role: 'user', content: 'question in A' }]),
    );
    localStorage.setItem(
      'strix.ai.history:/projB',
      JSON.stringify([{ role: 'user', content: 'question in B' }]),
    );
    const { rerender } = render(
      <AiPanel filePath={null} fileContent="" workspaceKey="/projA" />,
    );
    expect(screen.getByLabelText('AI conversation')).toHaveTextContent('question in A');

    rerender(<AiPanel filePath={null} fileContent="" workspaceKey="/projB" />);
    expect(screen.getByLabelText('AI conversation')).toHaveTextContent('question in B');
    expect(screen.queryByText('question in A')).not.toBeInTheDocument();
  });
});
