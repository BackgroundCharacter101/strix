import { ipcMain, shell, app } from 'electron';
import * as os from 'os';
import * as path from 'node:path';
import { spawn } from 'node:child_process';
import { streamDirect, streamFreeLLM, detectLocalModels } from './aiProxy.js';
import {
  checkForUpdate,
  downloadAndVerify,
  isSystemInstall,
  DEFAULT_FEED_URL,
  type UpdateManifest,
} from './updater.js';
import { EDITION } from './edition.js';
import {
  buildFileTree,
  readDir,
  setUserIgnore,
  readFileContents,
  writeFileContents,
  createEntry,
  renameEntry,
  removeEntry,
} from './fs.js';
import {
  getGitStatus,
  getFileHeadContent,
  stageFile,
  unstageFile,
  stageAll,
  commit,
  getStagedDiff,
  createPullRequest,
  listBranches,
  checkoutBranch,
  createBranch,
  gitLog,
  pull,
  push,
  sync,
  stashList,
  stashPush,
  stashPop,
  stashApply,
  stashDrop,
} from './git.js';
import {
  getRoot,
  openFolderDialog,
  openFileDialog,
  saveFileDialog,
  cloneRepo,
  newProjectDialog,
} from './workspace.js';
import {
  getUser as githubUser,
  connect as githubConnect,
  clearToken as clearGithubToken,
  listRepos as listGithubRepos,
  deviceStart as githubDeviceStart,
  deviceWait as githubDeviceWait,
} from './github.js';
import { BrowserWindow } from 'electron';
import {
  searchInFiles,
  searchInFilesStream,
  replaceInFiles,
  type MatchOptions,
} from './search.js';
import { popupMenu } from './menu.js';
import { TerminalManager, execCommand, type TerminalCreateOptions } from './terminal.js';
import { LspManager, type Language, type JsonRpcMessage } from './lsp.js';
import { commandExists } from './commandExists.js';
import { installServer, uninstallServer } from './languageServers.js';
import { startStaticServer, stopStaticServer, staticServerInfo } from './staticServer.js';
import { startDevServer, stopDevServer, devServerStatus } from './devServer.js';
import { startWatching, stopWatching } from './watcher.js';

// Maps the file:*, workspace:*, git:*, and terminal:* channels
// (ARCHITECTURE §6.7) to the corresponding main-process services.
export function registerIpcHandlers(ensureAiServer: () => void = () => {}): void {
  // Per-window workspace root (keyed by sender id). The process-wide getRoot()
  // is a single value, so with multiple windows it points at whichever opened
  // last — search/replace/exec must use THIS window's root instead. Updated
  // whenever a window (re)starts watching its workspace.
  const windowRoots = new Map<number, string>();
  const rootFor = (event: Electron.IpcMainEvent | Electron.IpcMainInvokeEvent): string =>
    windowRoots.get(event.sender.id) || getRoot();
  ipcMain.handle('file:read', (_event, filePath: string) => readFileContents(filePath));
  ipcMain.handle('file:write', (_event, filePath: string, content: string) =>
    writeFileContents(filePath, content),
  );
  ipcMain.handle('file:tree', (_event, rootPath: string) => buildFileTree(rootPath));
  ipcMain.handle('file:readDir', (_event, dirPath: string) => readDir(dirPath));
  ipcMain.handle('file:setExcludes', (_event, list: string[]) => setUserIgnore(list ?? []));
  ipcMain.handle('file:create', (_event, targetPath: string, type: 'file' | 'directory') =>
    createEntry(targetPath, type),
  );
  ipcMain.handle('file:rename', (_event, from: string, to: string) => renameEntry(from, to));
  ipcMain.handle('file:remove', (_event, targetPath: string) => removeEntry(targetPath));
  // Watch the workspace for external changes → push debounced paths to renderer.
  // Watchers are keyed per window (sender), so several Strix windows can each
  // watch their own workspace; a window's watcher dies with it.
  ipcMain.on('fs:watch', (event, root: string) => {
    const owner = event.sender.id;
    windowRoots.set(owner, root);
    startWatching(owner, root, (paths) => {
      if (!event.sender.isDestroyed()) event.sender.send('fs:changed', paths);
    });
    event.sender.once('destroyed', () => {
      stopWatching(owner);
      windowRoots.delete(owner);
    });
  });
  ipcMain.handle('workspace:root', () => getRoot());
  ipcMain.handle('workspace:open', (event) =>
    openFolderDialog(BrowserWindow.fromWebContents(event.sender)),
  );
  ipcMain.handle('workspace:openFile', (event) =>
    openFileDialog(BrowserWindow.fromWebContents(event.sender)),
  );
  ipcMain.handle('workspace:saveAs', (event, defaultName: string) =>
    saveFileDialog(BrowserWindow.fromWebContents(event.sender), defaultName),
  );
  ipcMain.handle('workspace:clone', (event, url: string) =>
    cloneRepo(BrowserWindow.fromWebContents(event.sender), url),
  );

  // --- GitHub account (optional): connect a token to list/clone your repos ---
  ipcMain.handle('github:user', () => githubUser());
  ipcMain.handle('github:connect', (_event, token: string) => githubConnect(token));
  ipcMain.handle('github:disconnect', () => clearGithubToken());
  ipcMain.handle('github:repos', () => listGithubRepos());
  ipcMain.handle('github:deviceStart', (_event, clientId: string) => githubDeviceStart(clientId));
  ipcMain.handle('github:deviceWait', (_event, clientId: string, code: string, interval: number) =>
    githubDeviceWait(clientId, code, interval),
  );
  ipcMain.handle('workspace:newProject', (event, name: string) =>
    newProjectDialog(BrowserWindow.fromWebContents(event.sender), name),
  );
  ipcMain.handle('search:find', (event, query: string, opts?: MatchOptions) =>
    searchInFiles(rootFor(event), query, opts),
  );
  // Streaming search: results arrive in batches and a newer query (or cancel)
  // aborts the in-flight walk so we don't waste CPU on superseded searches.
  let searchToken = 0;
  ipcMain.on(
    'search:start',
    (event, { id, query, opts }: { id: number; query: string; opts?: MatchOptions }) => {
      searchToken = id;
      void searchInFilesStream(
        rootFor(event),
        query,
        (matches) => {
          if (searchToken === id) event.sender.send('search:match', { id, matches });
        },
        opts,
        () => searchToken !== id,
      ).finally(() => {
        if (searchToken === id) event.sender.send('search:done', { id });
      });
    },
  );
  ipcMain.on('search:cancel', () => {
    searchToken += 1;
  });
  ipcMain.handle('search:replace', (event, query: string, replacement: string, opts?: MatchOptions) =>
    replaceInFiles(rootFor(event), query, replacement, opts),
  );

  // --- Custom title bar: window controls + menu popups ---
  const winOf = (event: Electron.IpcMainEvent | Electron.IpcMainInvokeEvent) =>
    BrowserWindow.fromWebContents(event.sender);
  ipcMain.on('win:minimize', (event) => winOf(event)?.minimize());
  ipcMain.on('win:toggleMaximize', (event) => {
    const w = winOf(event);
    if (w?.isMaximized()) w.unmaximize();
    else w?.maximize();
  });
  ipcMain.on('win:close', (event) => winOf(event)?.close());
  ipcMain.on('win:setFullScreen', (event, on: boolean) => winOf(event)?.setFullScreen(!!on));
  ipcMain.on('win:openExternal', (_event, url: string) => {
    if (typeof url === 'string' && /^https?:\/\//i.test(url)) void shell.openExternal(url);
  });
  ipcMain.handle('win:isMaximized', (event) => winOf(event)?.isMaximized() ?? false);
  ipcMain.on('win:popupMenu', (event, { label, x, y }: { label: string; x: number; y: number }) => {
    const w = winOf(event);
    if (w) popupMenu(w, label, x, y);
  });
  ipcMain.handle('git:status', (_event, rootPath: string) => getGitStatus(rootPath));
  ipcMain.handle('git:fileHead', (_event, filePath: string) => getFileHeadContent(filePath));
  ipcMain.handle('git:stage', (_event, root: string, filepath: string) => stageFile(root, filepath));
  ipcMain.handle('git:unstage', (_event, root: string, filepath: string) =>
    unstageFile(root, filepath),
  );
  ipcMain.handle('git:stageAll', (_event, root: string) => stageAll(root));
  ipcMain.handle('git:commit', (_event, root: string, message: string) => commit(root, message));
  ipcMain.handle('git:diffStaged', (_event, root: string) => getStagedDiff(root));
  ipcMain.handle('git:createPr', async (_event, root: string) => {
    const res = await createPullRequest(root);
    if (res.url) void shell.openExternal(res.url);
    return res;
  });
  ipcMain.handle('git:listBranches', (_event, root: string) => listBranches(root));
  ipcMain.handle('git:checkout', (_event, root: string, ref: string) => checkoutBranch(root, ref));
  ipcMain.handle('git:createBranch', (_event, root: string, name: string) =>
    createBranch(root, name),
  );
  ipcMain.handle('git:log', (_event, root: string, depth?: number) => gitLog(root, depth));
  ipcMain.handle('git:pull', (_event, root: string) => pull(root));
  ipcMain.handle('git:push', (_event, root: string) => push(root));
  ipcMain.handle('git:sync', (_event, root: string) => sync(root));
  ipcMain.handle('git:stashList', (_event, root: string) => stashList(root));
  ipcMain.handle('git:stashPush', (_event, root: string, message?: string, includeUntracked?: boolean) =>
    stashPush(root, message, includeUntracked),
  );
  ipcMain.handle('git:stashPop', (_event, root: string, ref?: string) => stashPop(root, ref));
  ipcMain.handle('git:stashApply', (_event, root: string, ref: string) => stashApply(root, ref));
  ipcMain.handle('git:stashDrop', (_event, root: string, ref: string) => stashDrop(root, ref));

  const terminals = new TerminalManager();
  ipcMain.handle('terminal:create', (event, opts: TerminalCreateOptions) =>
    // Never fall back to process.cwd() (the install dir for a packaged build).
    // Prefer the open workspace, else the user's home directory.
    terminals.create(
      { ...opts, cwd: opts.cwd || rootFor(event) || os.homedir() },
      (id, data) => event.sender.send('terminal:data', { id, data }),
      (id, exitCode) => event.sender.send('terminal:exit', { id, exitCode }),
    ),
  );
  ipcMain.on('terminal:input', (_event, { id, data }: { id: string; data: string }) =>
    terminals.write(id, data),
  );
  ipcMain.on(
    'terminal:resize',
    (_event, { id, cols, rows }: { id: string; cols: number; rows: number }) =>
      terminals.resize(id, cols, rows),
  );
  ipcMain.on('terminal:kill', (_event, { id }: { id: string }) => terminals.kill(id));
  ipcMain.handle('terminal:hasCommand', (_event, command: string) => commandExists(command));
  ipcMain.handle('terminal:exec', (event, command: string, cwd?: string) =>
    execCommand(command, cwd || rootFor(event) || undefined),
  );

  const lsp = new LspManager();
  ipcMain.handle('lsp:start', (event, language: Language, root?: string) =>
    // Run the server in the WINDOW'S workspace root so it finds tsconfig.json /
    // node_modules (falls back to the last-opened root for old callers).
    lsp.start(language, { cwd: root || getRoot() || undefined }, (id, message) =>
      event.sender.send('lsp:message', { id, message }),
    ),
  );
  ipcMain.on(
    'lsp:send',
    (_event, { id, message }: { id: string; message: JsonRpcMessage }) => lsp.send(id, message),
  );
  ipcMain.on('lsp:stop', (_event, { id }: { id: string }) => lsp.stop(id));
  ipcMain.handle('lsp:hasServer', (_event, command: string) => commandExists(command));
  ipcMain.handle('lsp:installServer', (_event, id: string) => installServer(id));
  ipcMain.handle('lsp:uninstallServer', (_event, id: string) => uninstallServer(id));

  // --- AI: bridge the renderer to a FreeLLMAPI server ---
  // Default is a local server, but a URL can be passed (from Settings) so a team
  // can point every Strix at one shared FreeLLMAPI host on the LAN.
  const defaultBase =
    process.env.FREELLMAPI_URL ?? `http://localhost:${process.env.FREELLMAPI_PORT ?? '3001'}`;
  const baseFrom = (url?: string) =>
    url && url.trim() ? url.trim().replace(/\/+$/, '') : defaultBase;

  const fetchKey = async (base: string): Promise<string> => {
    const res = await fetch(`${base}/api/settings/api-key`);
    const body = (await res.json()) as { apiKey: string };
    return body.apiKey;
  };

  // Boot the local server (if not using a shared host) and wait until it's
  // actually accepting requests. Settings actions (add/list keys) can happen
  // before any chat, when the lazily-started server isn't up yet — without this
  // the fetch hits a dead port and fails with "fetch failed".
  const ensureServerReady = async (url?: string): Promise<void> => {
    if (url && url.trim()) return; // shared host — not ours to start
    ensureAiServer();
    for (let i = 0; i < 50; i++) {
      try {
        const res = await fetch(`${defaultBase}/api/settings/api-key`);
        if (res.ok) return;
      } catch {
        /* server still coming up */
      }
      await new Promise((r) => setTimeout(r, 200));
    }
  };

  // Lazy boot: the renderer calls this right before the first real AI action
  // (chat/explain/fix/scaffold) when using the local server, so app launch
  // stays fast and the FreeLLMAPI child only spawns when actually needed.
  // No-op when a shared host URL is configured.
  ipcMain.handle('ai:ensure', (_event, url?: string) => {
    if (!url || !url.trim()) ensureAiServer();
  });

  ipcMain.handle('ai:config', async (_event, url?: string) => {
    const base = baseFrom(url);
    try {
      return { baseURL: `${base}/v1`, apiKey: await fetchKey(base) };
    } catch {
      return { baseURL: `${base}/v1`, apiKey: '' };
    }
  });

  // Collaboration is opt-in: set COLLAB_SERVER_URL to enable (off by default).
  ipcMain.handle('collab:url', () => process.env.COLLAB_SERVER_URL ?? null);

  // --- Local static host server (Run & Serve + HTML preview) ---
  ipcMain.handle('serve:start', (_event, root?: string) => {
    const target = root || getRoot();
    if (!target) throw new Error('No workspace folder open to host.');
    return startStaticServer(target);
  });
  ipcMain.handle('serve:stop', () => stopStaticServer());
  ipcMain.handle('serve:info', () => staticServerInfo());

  ipcMain.handle('ai:models', async (_event, url?: string) => {
    const base = baseFrom(url);
    try {
      const apiKey = await fetchKey(base);
      const res = await fetch(`${base}/v1/models`, {
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      const body = (await res.json()) as { data?: { id: string }[] };
      const ids = (body.data ?? []).map((m) => m.id).filter((id) => id !== 'auto');
      return ['auto', ...ids];
    } catch {
      return ['auto'];
    }
  });

  // --- AI provider keys: add/list/delete FreeLLMAPI keys from the IDE ---
  ipcMain.handle('ai:listKeys', async (_event, url?: string) => {
    try {
      await ensureServerReady(url);
      const res = await fetch(`${baseFrom(url)}/api/keys`);
      if (!res.ok) return [];
      return await res.json();
    } catch {
      return [];
    }
  });

  ipcMain.handle('ai:addKey', async (_event, platform: string, key: string, url?: string) => {
    try {
      await ensureServerReady(url);
      const res = await fetch(`${baseFrom(url)}/api/keys`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ platform, key }),
      });
      if (res.ok) return { ok: true };
      const body = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
      return { ok: false, error: body.error?.message ?? `HTTP ${res.status}` };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : 'Could not reach the AI server' };
    }
  });

  ipcMain.handle('ai:deleteKey', async (_event, id: number, url?: string) => {
    try {
      await ensureServerReady(url);
      const res = await fetch(`${baseFrom(url)}/api/keys/${id}`, { method: 'DELETE' });
      return { ok: res.ok };
    } catch {
      return { ok: false };
    }
  });

  // --- Direct "bring your own provider" streaming (bypasses FreeLLMAPI) ---
  // The renderer can't call external providers directly (webSecurity/CORS), so
  // it streams an OpenAI-compatible completion through here. Tokens flow back as
  // `ai:directToken` events keyed by a renderer-supplied request id.
  const directCancels = new Map<number, boolean>();
  ipcMain.on(
    'ai:directStart',
    (event, payload: { id: number; params: Parameters<typeof streamDirect>[0] }) => {
      const { id, params } = payload;
      directCancels.set(id, false);
      streamDirect(
        params,
        (token) => {
          if (!event.sender.isDestroyed()) event.sender.send('ai:directToken', { id, token });
        },
        () => directCancels.get(id) === true,
      )
        .then((r) => {
          if (event.sender.isDestroyed()) return;
          if (r.ok) event.sender.send('ai:directDone', { id });
          else event.sender.send('ai:directError', { id, error: r.error });
        })
        .catch((e: unknown) => {
          if (!event.sender.isDestroyed())
            event.sender.send('ai:directError', {
              id,
              error: e instanceof Error ? e.message : String(e),
            });
        })
        .finally(() => directCancels.delete(id));
    },
  );
  ipcMain.handle('ai:detectLocal', () => detectLocalModels());
  ipcMain.on('ai:directCancel', (_event, payload: { id: number }) => {
    if (directCancels.has(payload.id)) directCancels.set(payload.id, true);
  });

  // --- FreeLLMAPI streaming proxy (keeps API key inside main process) -------
  // The renderer sends the prompt + serverUrl; we fetch the key here and stream
  // tokens back as `ai:freellmToken` events (same pattern as ai:directToken).
  const freellmCancels = new Map<number, boolean>();
  ipcMain.on(
    'ai:freellmStart',
    (event, payload: { id: number; params: Parameters<typeof streamFreeLLM>[0] }) => {
      const { id, params } = payload;
      freellmCancels.set(id, false);
      streamFreeLLM(
        params,
        (token) => {
          if (!event.sender.isDestroyed()) event.sender.send('ai:freellmToken', { id, token });
        },
        () => freellmCancels.get(id) === true,
      )
        .then((r) => {
          if (event.sender.isDestroyed()) return;
          if (r.ok) event.sender.send('ai:freellmDone', { id });
          else event.sender.send('ai:freellmError', { id, error: r.error });
        })
        .catch((e: unknown) => {
          if (!event.sender.isDestroyed())
            event.sender.send('ai:freellmError', {
              id,
              error: e instanceof Error ? e.message : String(e),
            });
        })
        .finally(() => freellmCancels.delete(id));
    },
  );
  ipcMain.on('ai:freellmCancel', (_event, payload: { id: number }) => {
    if (freellmCancels.has(payload.id)) freellmCancels.set(payload.id, true);
  });

  // ── Live auto-update ─────────────────────────────────────────────────────
  // Feed URL: build-time default, overridable at runtime (Phase 2 real host).
  const feedURL = process.env.STRIX_UPDATE_URL || DEFAULT_FEED_URL;
  // The verified installer path from the last successful download, consumed by
  // update:apply. Held in the closure so it survives across the two IPC calls.
  let stagedInstaller: string | null = null;

  ipcMain.handle('update:check', async (event) => {
    try {
      const result = await checkForUpdate({
        feedURL,
        edition: EDITION,
        currentVersion: app.getVersion(),
      });
      if (result.available && result.manifest && !event.sender.isDestroyed()) {
        event.sender.send('update:available', result.manifest);
      }
      return result;
    } catch (e) {
      const error = e instanceof Error ? e.message : String(e);
      // Return the error in the result (not just an event) so the UI can show
      // "couldn't reach the update server" instead of a misleading "up to date".
      return { available: false, current: app.getVersion(), error };
    }
  });

  ipcMain.handle('update:download', async (event, manifest: UpdateManifest) => {
    try {
      const destPath = path.join(app.getPath('temp'), `strix-update-${manifest.version}.exe`);
      await downloadAndVerify({
        url: manifest.url,
        sha256: manifest.sha256,
        destPath,
        onProgress: (p) => {
          if (!event.sender.isDestroyed()) event.sender.send('update:progress', p);
        },
      });
      stagedInstaller = destPath;
      if (!event.sender.isDestroyed())
        event.sender.send('update:ready', { version: manifest.version });
      return { ok: true, path: destPath };
    } catch (e) {
      const error = e instanceof Error ? e.message : String(e);
      if (!event.sender.isDestroyed()) event.sender.send('update:error', { error });
      return { ok: false, error };
    }
  });

  // ── Live Preview (managed dev server) ────────────────────────────────────
  ipcMain.handle('preview:start', (event, command: string) => {
    const root = rootFor(event);
    if (!root) throw new Error('No workspace folder open to preview.');
    const send = (channel: string, payload: unknown) => {
      if (!event.sender.isDestroyed()) event.sender.send(channel, payload);
    };
    return startDevServer(root, command, {
      onUrl: (url) => send('preview:url', url),
      onLog: (chunk) => send('preview:log', chunk),
      onExit: (code) => send('preview:exit', code),
    });
  });
  ipcMain.handle('preview:stop', () => {
    stopDevServer();
  });
  ipcMain.handle('preview:status', () => devServerStatus());

  ipcMain.handle('update:apply', async () => {
    if (!stagedInstaller) return { ok: false, error: 'no update downloaded' };
    try {
      // An all-users (Program Files) install needs admin rights AND must install
      // in all-users MODE — a silent Inno install otherwise defaults to per-user
      // (lowest) and never replaces the Program Files copy. So force the mode with
      // /ALLUSERS (elevated) or /CURRENTUSER (per-user), matching the running app.
      const elevated = isSystemInstall(app.getPath('exe'), [
        process.env['ProgramFiles'],
        process.env['ProgramFiles(x86)'],
        process.env['ProgramW6432'],
      ]);
      const args = [
        '/VERYSILENT',
        '/SUPPRESSMSGBOXES',
        '/NORESTART',
        elevated ? '/ALLUSERS' : '/CURRENTUSER',
      ];
      console.log(`[update] applying ${stagedInstaller} elevated=${elevated} args=${args.join(' ')}`);
      if (elevated) {
        // ShellExecute "runas" via PowerShell triggers the UAC consent dialog,
        // then runs the installer silently under the elevated token.
        const list = args.map((a) => `'${a}'`).join(',');
        spawn(
          'powershell.exe',
          [
            '-NoProfile',
            '-Command',
            `Start-Process -FilePath '${stagedInstaller.replace(/'/g, "''")}' -ArgumentList ${list} -Verb RunAs`,
          ],
          { detached: true, stdio: 'ignore' },
        ).unref();
      } else {
        spawn(stagedInstaller, args, { detached: true, stdio: 'ignore' }).unref();
      }
      // Quit so our exe/handles are free for the installer to overwrite (Inno
      // also closes us via Restart Manager). A little longer than before so the
      // elevated UAC + installer has time to take over before we release.
      setTimeout(() => app.quit(), 1200);
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
  });
}
