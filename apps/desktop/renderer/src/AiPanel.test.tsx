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
  it('disables Send until there is input', () => {
    render(<AiPanel filePath={null} />);
    expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled();
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
});
