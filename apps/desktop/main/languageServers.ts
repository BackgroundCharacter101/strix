import { exec } from 'node:child_process';

// Install commands keyed by the SAME language id the renderer registry uses.
// The renderer can only pass an id (never a command), so it can never ask us to
// run an arbitrary string — only one of these vetted, hardcoded installs.
const INSTALL: Record<string, string> = {
  python: 'pip install python-lsp-server',
  typescript: 'npm i -g typescript-language-server typescript',
  rust: 'rustup component add rust-analyzer',
  go: 'go install golang.org/x/tools/gopls@latest',
  ruby: 'gem install solargraph',
  php: 'npm i -g intelephense',
  bash: 'npm i -g bash-language-server',
};

export interface InstallResult {
  ok: boolean;
  output: string;
}

// Run the install command for a known language id and return its combined output.
export function installServer(id: string): Promise<InstallResult> {
  const command = INSTALL[id];
  if (!command) {
    return Promise.resolve({ ok: false, output: 'No automatic installer for this language.' });
  }
  return new Promise<InstallResult>((resolve) => {
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
