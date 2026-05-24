// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const { runTask } = vi.hoisted(() => ({ runTask: vi.fn() }));
vi.mock('@strix/ai-gateway', () => ({ runTask }));

import { AiPanel } from './AiPanel';

beforeEach(() => {
  runTask.mockReset();
});

describe('AiPanel', () => {
  it('disables Send until there is input, and file actions until a file is selected', () => {
    render(<AiPanel filePath={null} fileContent="" />);
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

    render(<AiPanel filePath="/ws/a.ts" fileContent="const a = 1;" />);

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

  it('runs the explain task against the live editor draft (not on-disk)', async () => {
    render(<AiPanel filePath="/ws/a.ts" fileContent="const unsaved = 2;" />);

    fireEvent.click(screen.getByRole('button', { name: 'Explain' }));

    await waitFor(() =>
      expect(runTask).toHaveBeenCalledWith(
        'explain',
        expect.objectContaining({ filePath: '/ws/a.ts', fileContent: 'const unsaved = 2;' }),
        expect.any(Object),
      ),
    );
  });

  it('runs the vuln_check task from the Check security action', async () => {
    render(<AiPanel filePath="/ws/a.ts" fileContent="x" />);

    fireEvent.click(screen.getByRole('button', { name: 'Check security' }));

    await waitFor(() =>
      expect(runTask).toHaveBeenCalledWith(
        'vuln_check',
        expect.objectContaining({ filePath: '/ws/a.ts', fileContent: 'x' }),
        expect.any(Object),
      ),
    );
  });
});
