import type { FileNode } from './fs';
import type { GitStatus, GitBranches, GitLogEntry } from './git';
import type { SearchMatch, ReplaceResult, MatchOptions } from './search';
import type { TerminalCreateOptions } from './terminal';
import type { Language, JsonRpcMessage } from './lsp';

// Shape of the API exposed to the renderer via contextBridge (window.strix).
// Kept separate from preload so renderer code can import these types without
// depending on the preload module's format/extension.
export interface StrixFsApi {
  read(filePath: string): Promise<string>;
  write(filePath: string, content: string): Promise<void>;
  // Full (capped) tree for the explorer + AI gather. May be `truncated` on huge
  // repos. `readDir` lists ONE level (lazy expansion). `setExcludes` sets extra
  // ignored folder names applied to every walk.
  tree(rootPath: string): Promise<FileNode & { truncated?: boolean }>;
  readDir(dirPath: string): Promise<FileNode[]>;
  setExcludes(list: string[]): Promise<void>;
  create(targetPath: string, type: 'file' | 'directory'): Promise<void>;
  rename(from: string, to: string): Promise<void>;
  remove(targetPath: string): Promise<void>;
  // Watch a folder for external changes (agent/terminal/other apps). Start once
  // per workspace; onChanged delivers debounced absolute paths.
  watch(root: string): void;
  onChanged(cb: (paths: string[]) => void): () => void;
}

export interface StrixWorkspaceApi {
  root(): Promise<string>;
  // Opens a native folder picker; sets and returns the new root, or null if cancelled.
  open(): Promise<string | null>;
  // Opens a native file picker; returns the chosen file path, or null if cancelled.
  openFile(): Promise<string | null>;
  // Clones a git repo into a chosen parent dir; returns the new repo root, or null.
  clone(url: string): Promise<string | null>;
  // Creates a named project folder under a chosen parent; returns its path, or null.
  newProject(name: string): Promise<string | null>;
}

export interface GithubRepo {
  name: string;
  fullName: string;
  cloneUrl: string;
  private: boolean;
  description: string;
  updatedAt: string;
}

export interface GithubDeviceStart {
  deviceCode: string;
  userCode: string;
  verificationUri: string;
  interval: number;
  expiresIn: number;
}

export interface StrixGithubApi {
  // The connected account (null when no/invalid token).
  user(): Promise<{ login: string; avatarUrl: string } | null>;
  // Store + validate a Personal Access Token; returns the login on success.
  connect(token: string): Promise<{ ok: boolean; login?: string; error?: string }>;
  disconnect(): Promise<void>;
  // The connected user's repos (most-recently-updated first).
  repos(): Promise<GithubRepo[]>;
  // OAuth Device Flow: start → show userCode + open verificationUri → wait.
  deviceStart(clientId: string): Promise<GithubDeviceStart>;
  deviceWait(
    clientId: string,
    deviceCode: string,
    interval: number,
  ): Promise<{ ok: boolean; login?: string; error?: string }>;
}

export interface StrixGitApi {
  status(rootPath: string): Promise<GitStatus>;
  fileHead(filePath: string): Promise<string>;
  stage(rootPath: string, filepath: string): Promise<void>;
  unstage(rootPath: string, filepath: string): Promise<void>;
  stageAll(rootPath: string): Promise<void>;
  commit(rootPath: string, message: string): Promise<string>;
  // Unified diff of staged changes (`git diff --cached`) — for AI commit drafts.
  diffStaged(rootPath: string): Promise<string>;
  // Push the current branch and open a GitHub PR compare page in the browser.
  createPr(rootPath: string): Promise<{
    url: string | null;
    pushed: boolean;
    branch: string | null;
    error?: string;
  }>;
  // Branches, history, and remote sync.
  listBranches(rootPath: string): Promise<GitBranches>;
  checkout(rootPath: string, ref: string): Promise<void>;
  createBranch(rootPath: string, name: string): Promise<void>;
  log(rootPath: string, depth?: number): Promise<GitLogEntry[]>;
  pull(rootPath: string): Promise<{ ok: boolean; output: string }>;
  push(rootPath: string): Promise<{ ok: boolean; output: string }>;
  // Sync = pull then push (publishes the branch if it has no upstream yet).
  sync(rootPath: string): Promise<{ ok: boolean; output: string }>;
}

export interface StrixTerminalApi {
  create(opts?: TerminalCreateOptions): Promise<string>;
  input(id: string, data: string): void;
  resize(id: string, cols: number, rows: number): void;
  kill(id: string): void;
  onData(cb: (e: { id: string; data: string }) => void): () => void;
  onExit(cb: (e: { id: string; exitCode: number }) => void): () => void;
  // Whether an executable (e.g. `claude`) is available on PATH.
  hasCommand(command: string): Promise<boolean>;
  // Run a one-off command and capture its exit code + combined output (so the AI
  // can see failures). cwd defaults to the workspace root.
  exec(command: string, cwd?: string): Promise<{ exitCode: number; output: string }>;
}

export interface StrixLspApi {
  // `root` = this window's workspace, the server process cwd (multi-window safe).
  start(language: Language, root?: string): Promise<string>;
  send(id: string, message: JsonRpcMessage): void;
  stop(id: string): void;
  onMessage(cb: (e: { id: string; message: JsonRpcMessage }) => void): () => void;
  // Whether a language-server command is installed on PATH.
  hasServer(command: string): Promise<boolean>;
  // Install a language server by registry id (main runs a vetted command).
  installServer(id: string): Promise<{ ok: boolean; output: string }>;
  // Uninstall a language server by registry id (main runs a vetted command).
  uninstallServer(id: string): Promise<{ ok: boolean; output: string }>;
}

export interface AiProviderKey {
  id: number;
  platform: string;
  label: string;
  maskedKey: string;
  status: string;
  enabled: boolean;
}

export interface StrixAiApi {
  // Lazily boot the local FreeLLMAPI server (no-op when a shared host url is
  // set). Call before the first real AI action so app launch stays fast.
  ensure(url?: string): Promise<void>;
  // Optional url points at a shared FreeLLMAPI host (else the local default).
  config(url?: string): Promise<{ baseURL: string; apiKey: string }>;
  models(url?: string): Promise<string[]>;
  // Manage the FreeLLMAPI provider keys (so users add keys from the IDE rather
  // than the server's web UI). All target the configured host (or local).
  listKeys(url?: string): Promise<AiProviderKey[]>;
  addKey(platform: string, key: string, url?: string): Promise<{ ok: boolean; error?: string }>;
  deleteKey(id: number, url?: string): Promise<{ ok: boolean }>;
  // Detect locally-running model servers (Ollama, LM Studio) so the user can
  // one-click add them as direct models — no URL/model typing.
  detectLocal(): Promise<DetectedLocalModel[]>;
  // Direct "bring your own provider" streaming — calls an OpenAI-compatible
  // endpoint from the main process (renderer CORS forbids it). Tokens arrive via
  // onDirectToken keyed by `id`; finishes with onDirectDone or onDirectError.
  directStart(id: number, params: DirectChatParams): void;
  directCancel(id: number): void;
  onDirectToken(cb: (p: { id: number; token: string }) => void): () => void;
  onDirectDone(cb: (p: { id: number }) => void): () => void;
  onDirectError(cb: (p: { id: number; error?: string }) => void): () => void;
  // FreeLLMAPI streaming via the main process (the unified key never reaches
  // the renderer). Same id-keyed event contract as the direct-provider stream.
  freellmStart(id: number, params: FreeLLMChatParams): void;
  freellmCancel(id: number): void;
  onFreellmToken(cb: (p: { id: number; token: string }) => void): () => void;
  onFreellmDone(cb: (p: { id: number }) => void): () => void;
  onFreellmError(cb: (p: { id: number; error?: string }) => void): () => void;
}

export interface FreeLLMChatParams {
  /** FreeLLMAPI base URL, e.g. http://192.168.1.50:3001 (blank = local). */
  serverUrl: string;
  model: string;
  messages: { role: string; content: unknown }[];
  temperature?: number;
  maxTokens?: number;
}

export interface DetectedLocalModel {
  provider: string;
  label: string;
  baseURL: string;
  apiKey: string;
  model: string;
}

export interface DirectChatParams {
  baseURL: string;
  apiKey: string;
  model: string;
  messages: { role: string; content: unknown }[];
  temperature?: number;
  maxTokens?: number;
}

export interface StrixCollabApi {
  url(): Promise<string | null>;
}

export interface StaticServerInfo {
  url: string;
  port: number;
  root: string;
}

// A local static file server (127.0.0.1 only) for hosting a folder and backing
// the HTML preview. Shared/idempotent per root in the main process.
export interface StrixServeApi {
  start(root?: string): Promise<StaticServerInfo>;
  stop(): Promise<void>;
  info(): Promise<StaticServerInfo | null>;
}

export interface StrixSearchApi {
  // Literal search across the workspace; opts toggle case/whole-word matching.
  find(query: string, opts?: MatchOptions): Promise<SearchMatch[]>;
  // Replace query → replacement across the workspace under the same options.
  replace(query: string, replacement: string, opts?: MatchOptions): Promise<ReplaceResult>;
  // Streaming search: start a walk (results arrive via onMatch, end via onDone);
  // a newer start or cancel() aborts the in-flight walk. id tags each search so
  // the renderer can ignore late events from a superseded query.
  start(id: number, query: string, opts?: MatchOptions): void;
  cancel(): void;
  onMatch(cb: (payload: { id: number; matches: SearchMatch[] }) => void): () => void;
  onDone(cb: (payload: { id: number }) => void): () => void;
}

export interface StrixMenuApi {
  // Subscribe to native-menu commands (id matches the command palette). Returns an unsubscribe.
  onCommand(cb: (id: string) => void): () => void;
}

// Window controls for the custom (frameless) title bar.
export interface StrixWindowApi {
  minimize(): void;
  toggleMaximize(): void;
  close(): void;
  // Enter/leave true OS fullscreen (hides the taskbar) — used by Zen mode.
  setFullScreen(on: boolean): void;
  // Open an http(s) URL in the system browser (e.g. a detected dev-server URL).
  openExternal(url: string): void;
  isMaximized(): Promise<boolean>;
  onMaximizeChange(cb: (maximized: boolean) => void): () => void;
  // Pop a top-level application menu (by label) at the given screen-relative point.
  popupMenu(label: string, x: number, y: number): void;
}

export interface StrixApi {
  fs: StrixFsApi;
  workspace: StrixWorkspaceApi;
  github: StrixGithubApi;
  git: StrixGitApi;
  terminal: StrixTerminalApi;
  lsp: StrixLspApi;
  ai: StrixAiApi;
  collab: StrixCollabApi;
  serve: StrixServeApi;
  search: StrixSearchApi;
  menu: StrixMenuApi;
  win: StrixWindowApi;
}
