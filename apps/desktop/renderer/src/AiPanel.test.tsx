// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { makeStrixApi } from '../test-utils';

const { runTask } = vi.hoisted(() => ({ runTask: vi.fn() }));
vi.mock('@strix/ai-gateway', () => ({ runTask }));

import { AiPanel } from './AiPanel';

const read = vi.fn<[string], Promise<string>>();

beforeEach(() => {
  runTask.mockReset();
  read.mockReset();
  read.mockResolvedValue('const a = 1;');
  window.strix = makeStrixApi({ fs: { read } });
});

describe('AiPanel', () => {
  it('disables Send until there is input, and file actions until a file loads', () => {
    render(<AiPanel filePath={null} />);
    expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Explain' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Check security' })).toBeDisabled();
  });

  it('streams the AI response and shows the routed model', async () => {
    runTask.mockImplementation(async (_task, _opts, cb) => {
      cb.onToken('Hel');
      cb.onToken('lo');
      cb.onDone('gemini/gemini-2.5-flash');
    });

    render(<AiPanel filePath="/ws/a.ts" />);

    fireEvent.change(screen.getByLabelText('Ask AI'), {
      target: { value: 'what does this do?' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));

    await waitFor(() =>
      expect(screen.getByLabelText('AI response')).toHaveTextContent('Hello'),
    );
    expect(screen.getByText(/Routed via:/)).toHaveTextContent('gemini/gemini-2.5-flash');

    expect(runTask).toHaveBeenCalledWith(
      'chat',
      expect.objectContaining({ filePath: '/ws/a.ts', userMessage: 'what does this do?' }),
      expect.any(Object),
    );
  });

  it('runs the explain task with the selected file as context once it loads', async () => {
    render(<AiPanel filePath="/ws/a.ts" />);

    const explain = screen.getByRole('button', { name: 'Explain' });
    await waitFor(() => expect(explain).toBeEnabled()); // file content has loaded

    fireEvent.click(explain);

    await waitFor(() =>
      expect(runTask).toHaveBeenCalledWith(
        'explain',
        expect.objectContaining({ filePath: '/ws/a.ts', fileContent: 'const a = 1;' }),
        expect.any(Object),
      ),
    );
  });

  it('runs the vuln_check task from the Check security action', async () => {
    render(<AiPanel filePath="/ws/a.ts" />);

    const check = screen.getByRole('button', { name: 'Check security' });
    await waitFor(() => expect(check).toBeEnabled());

    fireEvent.click(check);

    await waitFor(() =>
      expect(runTask).toHaveBeenCalledWith(
        'vuln_check',
        expect.objectContaining({ filePath: '/ws/a.ts', fileContent: 'const a = 1;' }),
        expect.any(Object),
      ),
    );
  });
});
