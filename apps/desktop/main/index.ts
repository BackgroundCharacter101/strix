import { app, BrowserWindow } from 'electron';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { registerIpcHandlers } from './ipc.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DEV_URL = 'http://localhost:3000';
const USER_DATA_PATH = path.join(app.getPath('temp'), 'tabea-electron-user-data');
app.setPath('userData', USER_DATA_PATH);

function createWindow() {
    const mainWindow = new BrowserWindow({
        width: 1280,
        height: 800,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
        },
    });

    mainWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL) => {
        console.error('Electron failed to load URL:', {
            errorCode,
            errorDescription,
            validatedURL,
        });
    });

    mainWindow.loadURL(DEV_URL).catch((error) => {
        console.error('Electron loadURL error:', error);
    });
    mainWindow.webContents.openDevTools({ mode: 'right' });
    console.log('Electron window created, loading', DEV_URL);
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
