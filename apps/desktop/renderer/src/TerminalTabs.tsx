import React, { useEffect, useRef, useState } from 'react';
import { Terminal } from './Terminal';
import { SparkleIcon } from './icons';
import { CLAUDE_ENABLED } from './edition';

interface TabDesc {
  id: number;
  // Named tabs (e.g. Claude Code) set a title. Shell tabs leave it undefined and
  // are numbered by position via terminalTitle().
  title?: string;
  bootCommand?: string;
  // Prompt auto-typed + submitted into an interactive agent (FreeBuff hand-off).
  // Bumping the nonce re-prompts a session that's already running.
  seed?: { nonce: number; text: string };
  // Extra env for this session's PTY (FreeBuff → user's VPS/backend).
  env?: Record<string, string>;
  notice?: string;
  // Per-tab shell override (from the new-terminal shell picker).
  shell?: string;
}

// Shells offered by the new-terminal picker (Windows-first, like VS Code).
const SHELL_CHOICES: { label: string; shell: string }[] = [
  { label: 'PowerShell', shell: 'powershell.exe' },
  { label: 'Command Prompt', shell: 'cmd.exe' },
  { label: 'PowerShell 7 (pwsh)', shell: 'pwsh.exe' },
  { label: 'Git Bash', shell: 'bash.exe' },
];

const CLAUDE_INSTALL =
  'Claude Code CLI not found on PATH.\r\n' +
  'Install it with:  npm install -g @anthropic-ai/claude-code\r\n' +
  'Then type:  claude';


// Display title for a tab. Shell tabs are numbered by their position among other
// shell tabs, so the tab bar always reads "Terminal 1, 2, 3…" in order — no gaps
// or out-of-order numbers when tabs are opened/closed. Named tabs keep their
// title and don't consume a number.
export function terminalTitle(tabs: Pick<TabDesc, 'title'>[], index: number): string {
  if (tabs[index].title) return tabs[index].title as string;
  let n = 0;
  for (let i = 0; i <= index; i++) if (!tabs[i].title) n++;
  return `Terminal ${n}`;
}

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
  fontSize,
  fontFamily,
  cursorStyle,
  shell,
}: {
  cwd?: string;
  // Bumping nonce (from a command / menu / Run target) opens a session:
  //  - command set  → a generic run target (e.g. "npm run dev") in a titled tab
  //  - otherwise    → a Claude Code session (optionally seeded with a prompt)
  // (FreeBuff lives in the AI panel now, not the bottom terminal.)
  launch?: {
    nonce: number;
    prompt?: string;
    command?: string;
    title?: string;
    agent?: 'claude';
  };
  // Terminal font, following the editor settings.
  fontSize?: number;
  fontFamily?: string;
  cursorStyle?: 'block' | 'underline' | 'bar';
  shell?: string;
}) {
  const [tabs, setTabs] = useState<TabDesc[]>([{ id: 0 }]);
  const [active, setActive] = useState(0);
  const [shellMenu, setShellMenu] = useState(false);
  const nextId = useRef(1);

  const addShell = (shellOverride?: string) => {
    const id = nextId.current++;
    setTabs((prev) => [...prev, { id, shell: shellOverride }]);
    setActive(id);
    setShellMenu(false);
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

  // Open a titled tab running an arbitrary command (Run/Serve targets).
  const runCommand = (command: string, title: string) => {
    const id = nextId.current++;
    setTabs((prev) => [...prev, { id, title, bootCommand: command, notice: `▶ ${command}` }]);
    setActive(id);
  };

  // React to a launch signal from App: a command opens a run tab, otherwise a
  // Claude Code session.
  const launchRef = useRef<(l: typeof launch) => void>(() => {});
  launchRef.current = (l) => {
    if (l.command) runCommand(l.command, l.title ?? 'Run');
    else void launchClaude(l.prompt);
  };
  useEffect(() => {
    if (launch.nonce > 0) launchRef.current(launch);
  }, [launch.nonce, launch]);

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
        {tabs.map((tab, index) => {
          const title = terminalTitle(tabs, index);
          return (
            <span key={tab.id}>
              <button
                type="button"
                role="tab"
                aria-selected={tab.id === active}
                onClick={() => setActive(tab.id)}
              >
                {title}
              </button>
              <button
                type="button"
                aria-label={`close ${title}`}
                onClick={() => closeTab(tab.id)}
              >
                ×
              </button>
            </span>
          );
        })}
        <button type="button" aria-label="new terminal" onClick={() => addShell()}>
          +
        </button>
        <span className="term-shell-picker">
          <button
            type="button"
            aria-label="choose shell"
            title="New terminal with a specific shell"
            onClick={() => setShellMenu((v) => !v)}
          >
            ▾
          </button>
          {shellMenu && (
            <div className="term-shell-menu" role="menu" onMouseLeave={() => setShellMenu(false)}>
              {SHELL_CHOICES.map((s) => (
                <button
                  key={s.shell}
                  type="button"
                  role="menuitem"
                  onClick={() => addShell(s.shell)}
                >
                  {s.label}
                </button>
              ))}
            </div>
          )}
        </span>
        {CLAUDE_ENABLED && (
          <button
            type="button"
            className="term-agent-btn term-claude-btn"
            aria-label="Start Claude Code"
            title="Start Claude Code in this workspace"
            onClick={() => void launchClaude()}
          >
            <SparkleIcon size={13} /> Claude Code
          </button>
        )}
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
            <Terminal
              cwd={cwd}
              bootCommand={tab.bootCommand}
              seed={tab.seed}
              env={tab.env}
              notice={tab.notice}
              fontSize={fontSize}
              fontFamily={fontFamily}
              cursorStyle={cursorStyle}
              shell={tab.shell ?? shell}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
