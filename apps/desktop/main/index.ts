import { app, BrowserWindow } from 'electron';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { registerIpcHandlers } from './ipc.js';

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
    mainWindow.webContents.openDevTools({ mode: 'right' });
}

app.whenReady().then(() => {
    registerIpcHandlers();
    createWindow();
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});
