import { app, BrowserWindow, shell, Menu, MenuItem } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import { fileURLToPath } from 'url';
import { registerIpcHandlers } from './ipc.js';
import { startAiServer, stopAiServer } from './aiServer.js';
import { stopDevServer } from './devServer.js';
import { buildAppMenu } from './menu.js';
import { EDITION } from './edition.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Set STRIX_DEV_URL (e.g. http://localhost:3000) to load the Vite dev server
// with hot reload; otherwise the built renderer is loaded from disk.
const DEV_URL = process.env.STRIX_DEV_URL;
const BUILT_INDEX = path.join(__dirname, '../../renderer/dist/index.html');
// Per-edition userData (so M1 and M1 Competition don't share a single-instance
// lock) under the persistent AppData dir — NOT temp, which Windows clears and
// which would wipe settings, AI keys, the GitHub token and recents.
const USER_DATA_PATH = path.join(app.getPath('appData'), `Strix-${EDITION}`);
app.setPath('userData', USER_DATA_PATH);

// Crash-visible logging. A packaged GUI app has no console, so a startup error
// would otherwise be invisible (process lingers, no window). Mirror milestones
// and any uncaught error to a log file in userData so failures are diagnosable.
const LOG_FILE = path.join(USER_DATA_PATH, 'strix-main.log');
function logLine(level: string, args: unknown[]): void {
  const msg = args
    .map((a) => (a instanceof Error ? (a.stack ?? a.message) : String(a)))
    .join(' ');
  try {
    fs.mkdirSync(USER_DATA_PATH, { recursive: true });
    fs.appendFileSync(LOG_FILE, `${new Date().toISOString()} [${level}] ${msg}\n`);
  } catch {
    /* logging must never throw */
  }
}
const log = (...args: unknown[]): void => {
  console.log(...args);
  logLine('info', args);
};
const logError = (...args: unknown[]): void => {
  console.error(...args);
  logLine('error', args);
};
process.on('uncaughtException', (err) => logError('uncaughtException:', err));
process.on('unhandledRejection', (reason) => logError('unhandledRejection:', reason));
log('--- main start --- packaged=' + app.isPackaged + ' execPath=' + process.execPath);

// `blank` = a second/New Window: start on the welcome screen with NO folder,
// instead of inheriting the process-wide "current root" (which made every new
// window reopen the project the first window has open).
function createWindow(blank = false) {
    const mainWindow = new BrowserWindow({
        width: 1280,
        height: 800,
        // Frameless: Strix draws its own title bar (see renderer TitleBar).
        frame: false,
        backgroundColor: '#1e1e1e',
        // Explicit window icon so the taskbar shows the Strix logo everywhere —
        // including dev runs (`electron .` would otherwise show Electron's icon).
        // dist/main → ../../build/icon.png; "build/icon.png" ships via files[].
        icon: path.join(__dirname, '../../build/icon.png'),
        webPreferences: {
            preload: path.join(__dirname, 'preload.cjs'),
            contextIsolation: true,
            // ESM preload scripts require the sandbox to be disabled.
            sandbox: false,
            // Native spell-check for the AI prompt and other text inputs.
            spellcheck: true,
            // Live Preview embeds the running dev-server app in a <webview>
            // (isolated from the renderer's CSP). We only ever load localhost/dev
            // URLs and route external navigations to the OS browser.
            webviewTag: true,
        },
    });

    // Spell-check in English (red underline). Wrapped — locale data may be absent.
    try {
        mainWindow.webContents.session.setSpellCheckerLanguages(['en-US']);
    } catch {
        /* keep the system default */
    }

    // Right-click in an editable field → spelling suggestions + add-to-dictionary
    // and the standard cut/copy/paste actions. Without this handler the red
    // underline shows but offers no corrections.
    mainWindow.webContents.on('context-menu', (_event, params) => {
        const menu = new Menu();
        for (const suggestion of params.dictionarySuggestions) {
            menu.append(
                new MenuItem({
                    label: suggestion,
                    click: () => mainWindow.webContents.replaceMisspelling(suggestion),
                }),
            );
        }
        if (params.misspelledWord) {
            menu.append(new MenuItem({ type: 'separator' }));
            menu.append(
                new MenuItem({
                    label: 'Add to dictionary',
                    click: () =>
                        mainWindow.webContents.session.addWordToSpellCheckerDictionary(
                            params.misspelledWord,
                        ),
                }),
            );
        }
        if (params.isEditable) {
            if (menu.items.length) menu.append(new MenuItem({ type: 'separator' }));
            menu.append(new MenuItem({ role: 'cut', enabled: params.editFlags.canCut }));
            menu.append(new MenuItem({ role: 'copy', enabled: params.editFlags.canCopy }));
            menu.append(new MenuItem({ role: 'paste', enabled: params.editFlags.canPaste }));
            menu.append(new MenuItem({ role: 'selectAll' }));
        } else if (params.editFlags.canCopy) {
            menu.append(new MenuItem({ role: 'copy' }));
        }
        if (menu.items.length) menu.popup();
    });

    // Security hardening: this is a single-page app that never navigates its top
    // frame, and should never spawn uncontrolled child windows. Block both, and
    // route real http(s) links (e.g. from rendered markdown) to the OS browser.
    mainWindow.webContents.setWindowOpenHandler(({ url }) => {
        if (/^https?:\/\//i.test(url)) void shell.openExternal(url);
        return { action: 'deny' };
    });
    mainWindow.webContents.on('will-navigate', (event, url) => {
        if (url === mainWindow.webContents.getURL()) return; // in-place reload is fine
        event.preventDefault();
        if (/^https?:\/\//i.test(url)) void shell.openExternal(url);
    });

    mainWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL) => {
        logError('renderer failed to load:', errorCode, errorDescription, validatedURL);
    });
    mainWindow.webContents.on('did-finish-load', () => log('renderer loaded'));

    const hash = blank ? 'blank' : undefined;
    if (DEV_URL) {
        mainWindow
            .loadURL(DEV_URL + (blank ? '#blank' : ''))
            .catch((error) => logError('loadURL error:', error));
        log('loading dev server', DEV_URL);
    } else {
        mainWindow.loadFile(BUILT_INDEX, { hash }).catch((error) => logError('loadFile error:', error));
        log('loading built renderer', BUILT_INDEX);
    }
    // DevTools is a full second renderer process — heavy on CPU/RAM. Only
    // auto-open it when explicitly debugging (STRIX_DEVTOOLS=1 or a dev server).
    // It's always available from the View menu (Toggle Developer Tools).
    if (process.env.STRIX_DEVTOOLS === '1' || DEV_URL) {
        mainWindow.webContents.openDevTools({ mode: 'right' });
    }
    buildAppMenu(mainWindow, () => createWindow(true));

    // Tell the renderer's custom title bar when the maximize state changes.
    const sendMax = () => mainWindow.webContents.send('win:maximized', mainWindow.isMaximized());
    mainWindow.on('maximize', sendMax);
    mainWindow.on('unmaximize', sendMax);
}

// Single-instance lock: relaunching Strix stays in ONE process (no duplicate AI
// server / port conflicts) but opens a NEW window — one window per project.
const gotLock = app.requestSingleInstanceLock();
log('single-instance lock acquired=' + gotLock);
if (!gotLock) {
    app.quit();
} else {
    app.on('second-instance', () => {
        try {
            createWindow(true);
        } catch (e) {
            logError('second-instance createWindow failed:', e);
            const win = BrowserWindow.getAllWindows()[0];
            if (win) {
                if (win.isMinimized()) win.restore();
                win.focus();
            }
        }
    });

    app.whenReady().then(() => {
        log('app ready; packaged=' + app.isPackaged);
        // Create the window FIRST and in its own try/catch so a later failure
        // (IPC wiring, AI server) can never leave a windowless, lingering
        // process — the symptom of a packaged-startup crash.
        try {
            createWindow();
            log('window created');
        } catch (e) {
            logError('createWindow failed:', e);
        }
        try {
            // Lazy AI-server boot: spawn the bundled FreeLLMAPI only on the first
            // real AI action (renderer calls ai:ensure), so app launch stays fast.
            // Packaged builds have no system `node`: run FreeLLMAPI via the Electron
            // binary as Node, from the extraResources copy. startAiServer is
            // idempotent, so repeated ai:ensure calls are safe.
            const ensureAiServer = () => {
                try {
                    startAiServer(
                        __dirname,
                        {
                            nodeExec: app.isPackaged ? process.execPath : 'node',
                            runAsNode: app.isPackaged,
                            baseDir: app.isPackaged ? process.resourcesPath : undefined,
                            // Persist the server's DB in the per-user data dir (the
                            // install dir is read-only once packaged).
                            dataDir: app.isPackaged ? app.getPath('userData') : undefined,
                        },
                        log,
                    );
                } catch (e) {
                    logError('startAiServer failed:', e);
                }
            };
            registerIpcHandlers(ensureAiServer);
            log('ipc handlers registered');
        } catch (e) {
            logError('registerIpcHandlers failed:', e);
        }
    }).catch((e) => logError('whenReady failed:', e));
}

// Live Preview <webview> guests: open external (non-localhost) links and any
// window.open/target=_blank in the OS browser instead of spawning child windows.
app.on('web-contents-created', (_event, contents) => {
    if (contents.getType() === 'webview') {
        contents.setWindowOpenHandler(({ url }) => {
            if (/^https?:\/\//i.test(url)) void shell.openExternal(url);
            return { action: 'deny' };
        });
    }
});

app.on('will-quit', () => {
    stopAiServer();
    stopDevServer();
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});
