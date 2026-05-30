import { app, BrowserWindow } from 'electron';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { registerIpcHandlers } from './ipc.js';
import { startAiServer, stopAiServer } from './aiServer.js';
import { buildAppMenu } from './menu.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Set STRIX_DEV_URL (e.g. http://localhost:3000) to load the Vite dev server
// with hot reload; otherwise the built renderer is loaded from disk.
const DEV_URL = process.env.STRIX_DEV_URL;
const BUILT_INDEX = path.join(__dirname, '../../renderer/dist/index.html');
const USER_DATA_PATH = path.join(app.getPath('temp'), 'strix-electron-user-data');
app.setPath('userData', USER_DATA_PATH);

function createWindow() {
    const mainWindow = new BrowserWindow({
        width: 1280,
        height: 800,
        // Frameless: Strix draws its own title bar (see renderer TitleBar).
        frame: false,
        backgroundColor: '#1e1e1e',
        webPreferences: {
            preload: path.join(__dirname, 'preload.mjs'),
            contextIsolation: true,
            // ESM preload scripts require the sandbox to be disabled.
            sandbox: false,
        },
    });

    mainWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL) => {
        console.error('Electron failed to load URL:', {
            errorCode,
            errorDescription,
            validatedURL,
        });
    });

    if (DEV_URL) {
        mainWindow.loadURL(DEV_URL).catch((error) => {
            console.error('Electron loadURL error:', error);
        });
        console.log('Electron window created, loading dev server', DEV_URL);
    } else {
        mainWindow.loadFile(BUILT_INDEX).catch((error) => {
            console.error('Electron loadFile error:', error);
        });
        console.log('Electron window created, loading built renderer', BUILT_INDEX);
    }
    // DevTools is a full second renderer process — heavy on CPU/RAM. Only
    // auto-open it when explicitly debugging (STRIX_DEVTOOLS=1 or a dev server).
    // It's always available from the View menu (Toggle Developer Tools).
    if (process.env.STRIX_DEVTOOLS === '1' || DEV_URL) {
        mainWindow.webContents.openDevTools({ mode: 'right' });
    }
    buildAppMenu(mainWindow);

    // Tell the renderer's custom title bar when the maximize state changes.
    const sendMax = () => mainWindow.webContents.send('win:maximized', mainWindow.isMaximized());
    mainWindow.on('maximize', sendMax);
    mainWindow.on('unmaximize', sendMax);
}

// Single-instance lock: relaunching Strix focuses the existing window instead
// of spawning a second (heavy) process. Big resource win on Windows where users
// often double-click the icon again.
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
    app.quit();
} else {
    app.on('second-instance', () => {
        const win = BrowserWindow.getAllWindows()[0];
        if (win) {
            if (win.isMinimized()) win.restore();
            win.focus();
        }
    });

    app.whenReady().then(() => {
        registerIpcHandlers();
        startAiServer(__dirname);
        createWindow();
    });
}

app.on('will-quit', () => {
    stopAiServer();
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});
