// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { AgentsView } from './AgentsView';
import type { UseAgents } from './agents/useAgents';
import type { ResolvedAgent } from './agents/agentTypes';
import { makeStrixApi } from '../test-utils';

beforeEach(() => {
  window.strix = makeStrixApi();
});

const agent = (id: string, name: string): ResolvedAgent => ({
  id,
  name,
  description: '',
  persona: 'x',
  outputMode: 'report',
  watch: ['**/*.ts'],
  trigger: { on: 'change', cooldownMs: 1000 },
  builtin: true,
  enabled: true,
  model: 'auto',
  cooldownMs: 1000,
});

function makeHub(overrides: Partial<UseAgents> = {}): UseAgents {
  return {
    agents: [agent('security', 'Security auditor'), agent('bugfixer', 'Bug spotter')],
    statuses: {},
    paused: false,
    setPaused: vi.fn(),
    setConfig: vi.fn(),
    addCustom: vi.fn(),
    removeCustom: vi.fn(),
    runNow: vi.fn(),
    dismissReport: vi.fn(),
    busy: false,
    ...overrides,
  };
}

describe('AgentsView findings inbox', () => {
  it('is hidden when no agent has findings', () => {
    render(
      <AgentsView hub={makeHub()} directModels={[]} noRoot={false} onSendToAi={vi.fn()} onSendToFreebuff={vi.fn()} />,
    );
    expect(screen.queryByLabelText('Findings inbox')).not.toBeInTheDocument();
  });

  it('aggregates reports (newest first), hands off to AI, and dismisses', () => {
    const onSendToAi = vi.fn();
    const dismissReport = vi.fn();
    const hub = makeHub({
      statuses: {
        security: { state: 'ok', lastRun: 2000, report: 'SQL injection in db.ts' },
        bugfixer: { state: 'ok', lastRun: 1000, report: 'off-by-one in loop' },
      },
      dismissReport,
    });
    render(
      <AgentsView hub={hub} directModels={[]} noRoot={false} onSendToAi={onSendToAi} onSendToFreebuff={vi.fn()} />,
    );

    const inbox = screen.getByLabelText('Findings inbox');
    expect(inbox).toHaveTextContent('Findings');
    expect(inbox).toHaveTextContent('2');
    // Newest (security, lastRun 2000) listed before older (bugfixer).
    const items = inbox.querySelectorAll('.agents-inbox-item');
    expect(items[0]).toHaveTextContent('Security auditor');
    expect(items[1]).toHaveTextContent('Bug spotter');

    // Expanding shows the report text.
    fireEvent.click(items[0].querySelector('.agents-inbox-expand') as HTMLElement);
    expect(inbox).toHaveTextContent('SQL injection in db.ts');

    // → AI hands off the findings text.
    const aiButtons = Array.from(inbox.querySelectorAll('button')).filter(
      (b) => b.textContent === '→ AI',
    );
    fireEvent.click(aiButtons[0]);
    expect(onSendToAi).toHaveBeenCalledWith(expect.stringContaining('SQL injection in db.ts'));

    // Dismiss clears that agent's findings.
    fireEvent.click(screen.getByRole('button', { name: 'dismiss Security auditor findings' }));
    expect(dismissReport).toHaveBeenCalledWith('security');
  });
});
