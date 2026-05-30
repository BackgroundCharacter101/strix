import { exec } from 'node:child_process';

// Install / uninstall commands keyed by the SAME language id the renderer
// registry uses. The renderer can only pass an id (never a command), so it can
// never ask us to run an arbitrary string — only one of these vetted commands.
const INSTALL: Record<string, string> = {
  python: 'pip install python-lsp-server',
  typescript: 'npm i -g typescript-language-server typescript',
  rust: 'rustup component add rust-analyzer',
  go: 'go install golang.org/x/tools/gopls@latest',
  ruby: 'gem install solargraph',
  php: 'npm i -g intelephense',
  bash: 'npm i -g bash-language-server',
};

const UNINSTALL: Record<string, string> = {
  python: 'pip uninstall -y python-lsp-server',
  typescript: 'npm uninstall -g typescript-language-server',
  rust: 'rustup component remove rust-analyzer',
  ruby: 'gem uninstall -x -a solargraph',
  php: 'npm uninstall -g intelephense',
  bash: 'npm uninstall -g bash-language-server',
};

export interface CommandResult {
  ok: boolean;
  output: string;
}

function run(command: string | undefined, fallback: string): Promise<CommandResult> {
  if (!command) return Promise.resolve({ ok: false, output: fallback });
  return new Promise<CommandResult>((resolve) => {
    exec(
      command,
      { timeout: 180_000, maxBuffer: 8 * 1024 * 1024, windowsHide: true },
      (err, stdout, stderr) => {
        const output = `${stdout}\n${stderr}`.trim().slice(-4000);
        resolve({ ok: !err, output: output || (err ? String(err) : 'Done.') });
      },
    );
  });
}

export function installServer(id: string): Promise<CommandResult> {
  return run(INSTALL[id], 'No automatic installer for this language.');
}

export function uninstallServer(id: string): Promise<CommandResult> {
  return run(UNINSTALL[id], 'No automatic uninstaller for this language.');
}
