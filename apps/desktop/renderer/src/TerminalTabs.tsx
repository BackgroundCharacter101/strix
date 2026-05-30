import React, { useEffect, useRef, useState } from 'react';
import { Terminal } from './Terminal';
import { SparkleIcon } from './icons';

interface TabDesc {
  id: number;
  title: string;
  bootCommand?: string;
  notice?: string;
}

const CLAUDE_INSTALL =
  'Claude Code CLI not found on PATH.\r\n' +
  'Install it with:  npm install -g @anthropic-ai/claude-code\r\n' +
  'Then type:  claude';

// Wrap a prompt as a single safe CLI argument (double-quoted; inner double
// quotes downgraded to single quotes, newlines flattened) so it works across
// cmd / PowerShell / bash.
function claudeCommand(prompt?: string): string {
  if (!prompt) return 'claude';
  const safe = prompt.replace(/"/g, "'").replace(/[\r\n]+/g, ' ').trim();
  return `claude "${safe}"`;
}

export function TerminalTabs({
  cwd,
  launch = { nonce: 0 },
}: {
  cwd?: string;
  // Bumping nonce (from a command / menu / AI hand-off) opens a Claude Code
  // session, optionally seeded with a prompt.
  launch?: { nonce: number; prompt?: string };
}) {
  const [tabs, setTabs] = useState<TabDesc[]>([{ id: 0, title: 'Terminal 1' }]);
  const [active, setActive] = useState(0);
  const nextId = useRef(1);

  const addShell = () => {
    const id = nextId.current++;
    setTabs((prev) => [...prev, { id, title: `Terminal ${id + 1}` }]);
    setActive(id);
  };

  const launchClaude = async (prompt?: string) => {
    const id = nextId.current++;
    const installed = await window.strix.terminal.hasCommand('claude');
    const tab: TabDesc = installed
      ? {
          id,
          title: 'Claude Code',
          bootCommand: claudeCommand(prompt),
          notice: prompt ? 'Asking Claude Code…' : 'Starting Claude Code…',
        }
      : { id, title: 'Claude Code', notice: CLAUDE_INSTALL };
    setTabs((prev) => [...prev, tab]);
    setActive(id);
  };

  // Open a Claude Code session when App signals it (command / menu / AI hand-off).
  const launchRef = useRef(launchClaude);
  launchRef.current = launchClaude;
  useEffect(() => {
    if (launch.nonce > 0) void launchRef.current(launch.prompt);
  }, [launch.nonce, launch.prompt]);

  const closeTab = (id: number) => {
    const remaining = tabs.filter((x) => x.id !== id);
    setTabs(remaining);
    if (active === id) {
      setActive(remaining.length ? remaining[remaining.length - 1].id : -1);
    }
  };

  return (
    <div className="terminal-tabs" aria-label="terminals">
      <div className="tablist" role="tablist">
        {tabs.map((tab) => (
          <span key={tab.id}>
            <button
              type="button"
              role="tab"
              aria-selected={tab.id === active}
              onClick={() => setActive(tab.id)}
            >
              {tab.title}
            </button>
            <button
              type="button"
              aria-label={`close ${tab.title}`}
              onClick={() => closeTab(tab.id)}
            >
              ×
            </button>
          </span>
        ))}
        <button type="button" aria-label="new terminal" onClick={addShell}>
          +
        </button>
        <button
          type="button"
          className="term-claude-btn"
          aria-label="Start Claude Code"
          title="Start Claude Code in this workspace"
          onClick={() => void launchClaude()}
        >
          <SparkleIcon size={13} /> Claude Code
        </button>
      </div>
      {/* Each tab keeps its own Terminal mounted (hidden, not unmounted) so its
          PTY session and scrollback survive tab switches. */}
      <div className="terminal-content">
        {tabs.map((tab) => (
          <div
            key={tab.id}
            className="terminal-slot"
            style={{ display: tab.id === active ? 'block' : 'none' }}
          >
            <Terminal cwd={cwd} bootCommand={tab.bootCommand} notice={tab.notice} />
          </div>
        ))}
      </div>
    </div>
  );
}
