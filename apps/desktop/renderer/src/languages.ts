// Registry of languages with first-class support. Syntax highlighting works for
// all of these out of the box (Monaco); IntelliSense/diagnostics additionally
// need the listed language server installed on the machine.
//
// `id` is a stable key shared with the main process (main/languageServers.ts),
// which holds the actual install command. The renderer only ever passes the id
// to `lsp.installServer(id)` — never a command string — so there's no injection.
export interface LanguageInfo {
  id: string;
  label: string;
  extensions: string[];
  /** Language-server executable expected on PATH. */
  server: string;
  /** Human-readable install command (shown + copyable). */
  install: string;
  /** Whether Strix can run the install automatically (one clean command). */
  installable: boolean;
  /** Whether Strix can run an uninstall automatically. */
  uninstallable: boolean;
}

export const LANGUAGES: LanguageInfo[] = [
  {
    id: 'python',
    label: 'Python',
    extensions: ['.py'],
    server: 'pylsp',
    install: 'pip install python-lsp-server',
    installable: true,
    uninstallable: true,
  },
  {
    id: 'typescript',
    label: 'TypeScript / JavaScript',
    extensions: ['.ts', '.tsx', '.js', '.jsx'],
    server: 'typescript-language-server',
    install: 'npm i -g typescript-language-server typescript',
    installable: true,
    uninstallable: true,
  },
  {
    id: 'rust',
    label: 'Rust',
    extensions: ['.rs'],
    server: 'rust-analyzer',
    install: 'rustup component add rust-analyzer',
    installable: true,
    uninstallable: true,
  },
  {
    id: 'go',
    label: 'Go',
    extensions: ['.go'],
    server: 'gopls',
    install: 'go install golang.org/x/tools/gopls@latest',
    installable: true,
    uninstallable: false,
  },
  {
    id: 'ruby',
    label: 'Ruby',
    extensions: ['.rb'],
    server: 'solargraph',
    install: 'gem install solargraph',
    installable: true,
    uninstallable: true,
  },
  {
    id: 'php',
    label: 'PHP',
    extensions: ['.php'],
    server: 'intelephense',
    install: 'npm i -g intelephense',
    installable: true,
    uninstallable: true,
  },
  {
    id: 'bash',
    label: 'Bash',
    extensions: ['.sh'],
    server: 'bash-language-server',
    install: 'npm i -g bash-language-server',
    installable: true,
    uninstallable: true,
  },
  {
    id: 'cpp',
    label: 'C / C++',
    extensions: ['.c', '.h', '.cpp', '.hpp'],
    server: 'clangd',
    install: 'Install clangd (bundled with LLVM)',
    installable: false,
    uninstallable: false,
  },
];
