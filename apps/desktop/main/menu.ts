import {
  Menu,
  shell,
  BrowserWindow as ElectronBrowserWindow,
  type BrowserWindow,
  type MenuItemConstructorOptions,
} from 'electron';
import { CLAUDE_ENABLED } from './edition';

// The built application menu, kept so the custom (frameless) title bar can pop
// individual top-level submenus by label.
let appMenu: Menu | null = null;

// The top-level menu labels, in order — the renderer title bar renders these.
export const MENU_LABELS = ['File', 'Edit', 'View', 'Go', 'Help'] as const;

export function popupMenu(win: BrowserWindow, label: string, x: number, y: number): void {
  const item = appMenu?.items.find((i) => i.label === label);
  item?.submenu?.popup({ window: win, x: Math.round(x), y: Math.round(y) });
}

// Build the native application menu (the File / Edit / View / … bar). Items that
// trigger app behaviour send a `menu:command` IPC with a command id the renderer
// already knows (same ids as the command palette). Edit uses native roles so
// undo/copy/paste work inside inputs and Monaco.
//
// `registerAccelerator: false` is used for any item whose shortcut the renderer's
// own keydown handler already owns — that shows the shortcut text in the menu but
// lets the keystroke flow to the renderer, so nothing fires twice.
export function buildAppMenu(win: BrowserWindow, onNewWindow?: () => void): void {
  const isMac = process.platform === 'darwin';
  // Route commands to the FOCUSED window (multi-window: each window has its own
  // project); fall back to the window the menu was built with.
  const send = (id: string) => () => {
    const target = ElectronBrowserWindow.getFocusedWindow() ?? win;
    if (!target.isDestroyed()) target.webContents.send('menu:command', id);
  };

  // Item that sends a command but leaves the shortcut to the renderer.
  const cmd = (
    label: string,
    id: string,
    accelerator?: string,
  ): MenuItemConstructorOptions => ({
    label,
    accelerator,
    registerAccelerator: false,
    click: send(id),
  });

  const template: MenuItemConstructorOptions[] = [
    {
      label: 'File',
      submenu: [
        cmd('New Project…', 'file.newProject'),
        cmd('New File…', 'file.newFile'),
        cmd('New Folder…', 'file.newFolder'),
        // Multi-project workflow: a second Strix window with its own project.
        ...(onNewWindow
          ? [
              {
                label: 'New Window',
                accelerator: 'CmdOrCtrl+Shift+N',
                click: () => onNewWindow(),
              } as MenuItemConstructorOptions,
            ]
          : []),
        { type: 'separator' },
        cmd('Open File…', 'workspace.openFile', 'CmdOrCtrl+O'),
        cmd('Open Folder…', 'workspace.openFolder'),
        cmd('Clone Repository…', 'workspace.clone'),
        { type: 'separator' },
        cmd('Save', 'file.save', 'CmdOrCtrl+S'),
        cmd('Save All', 'file.saveAll', 'CmdOrCtrl+K S'),
        cmd('Close Editor', 'view.closeEditor', 'CmdOrCtrl+W'),
        { type: 'separator' },
        // Settings owns Ctrl+, natively (renderer doesn't handle it).
        { label: 'Settings', accelerator: 'CmdOrCtrl+,', click: send('pref.settings') },
        { type: 'separator' },
        isMac ? { role: 'close' } : { role: 'quit' },
      ],
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
        { type: 'separator' },
        cmd('Find in Files', 'view.search', 'CmdOrCtrl+Shift+F'),
      ],
    },
    {
      label: 'View',
      submenu: [
        cmd('Command Palette…', 'view.commandPalette', 'CmdOrCtrl+Shift+P'),
        cmd('Go to File…', 'file.quickOpen', 'CmdOrCtrl+P'),
        { type: 'separator' },
        cmd('Explorer', 'view.explorer'),
        cmd('Search', 'view.search'),
        cmd('Source Control', 'view.scm'),
        { type: 'separator' },
        cmd('Toggle Terminal', 'view.terminal', 'CmdOrCtrl+`'),
        cmd('Toggle AI Assistant', 'view.ai'),
        cmd('Split Editor', 'view.split', 'CmdOrCtrl+\\'),
        cmd('Toggle Zen Mode', 'view.zen', 'CmdOrCtrl+K Z'),
        // FreeBuff now lives in the AI Assistant panel (not the terminal).
        cmd('Open FreeBuff', 'ai.freebuff'),
        // Claude Code is a Competition-edition-only feature.
        ...(CLAUDE_ENABLED ? [cmd('Start Claude Code', 'terminal.claude')] : []),
        { type: 'separator' },
        cmd('Languages & Extensions…', 'lang.manage'),
        { type: 'separator' },
        { role: 'reload' },
        { role: 'togglefullscreen' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
      ],
    },
    {
      label: 'Go',
      submenu: [cmd('Format Document', 'editor.format', 'Shift+Alt+F')],
    },
    {
      label: 'Help',
      submenu: [
        { label: 'Check for Updates…', click: send('help.updates') },
        { type: 'separator' },
        { label: 'About Strix', click: send('help.about') },
        {
          label: 'Strix on GitHub',
          click: () => void shell.openExternal('https://github.com/BackgroundCharacter101/strix'),
        },
      ],
    },
  ];

  appMenu = Menu.buildFromTemplate(template);
  // Keep it as the application menu so accelerators stay registered app-wide,
  // even though the frameless window renders its own title bar.
  Menu.setApplicationMenu(appMenu);
}
