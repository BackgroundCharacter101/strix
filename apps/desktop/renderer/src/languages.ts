// Registry of languages with first-class support. Syntax highlighting works for
// all of these out of the box (Monaco); IntelliSense/diagnostics additionally
// need the listed language server installed on the machine.
export interface LanguageInfo {
  label: string;
  extensions: string[];
  /** Language-server executable expected on PATH. */
  server: string;
  /** One-line install hint shown in the Languages panel. */
  install: string;
}

export const LANGUAGES: LanguageInfo[] = [
  {
    label: 'Python',
    extensions: ['.py'],
    server: 'pylsp',
    install: 'pip install python-lsp-server',
  },
  {
    label: 'TypeScript / JavaScript',
    extensions: ['.ts', '.tsx', '.js', '.jsx'],
    server: 'typescript-language-server',
    install: 'npm i -g typescript-language-server',
  },
  {
    label: 'Rust',
    extensions: ['.rs'],
    server: 'rust-analyzer',
    install: 'rustup component add rust-analyzer',
  },
  {
    label: 'Go',
    extensions: ['.go'],
    server: 'gopls',
    install: 'go install golang.org/x/tools/gopls@latest',
  },
  {
    label: 'C / C++',
    extensions: ['.c', '.h', '.cpp', '.hpp'],
    server: 'clangd',
    install: 'Install clangd (part of LLVM)',
  },
  {
    label: 'Bash',
    extensions: ['.sh'],
    server: 'bash-language-server',
    install: 'npm i -g bash-language-server',
  },
];
