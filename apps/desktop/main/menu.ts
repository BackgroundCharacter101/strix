import {
  Menu,
  shell,
  type BrowserWindow,
  type MenuItemConstructorOptions,
} from 'electron';

// Build the native application menu (the File / Edit / View / … bar). Items that
// trigger app behaviour send a `menu:command` IPC with a command id the renderer
// already knows (same ids as the command palette). Edit uses native roles so
// undo/copy/paste work inside inputs and Monaco.
//
// `registerAccelerator: false` is used for any item whose shortcut the renderer's
// own keydown handler already owns — that shows the shortcut text in the menu but
// lets the keystroke flow to the renderer, so nothing fires twice.
export function buildAppMenu(win: BrowserWindow): void {
  const isMac = process.platform === 'darwin';
  const send = (id: string) => () => win.webContents.send('menu:command', id);

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
        { type: 'separator' },
        cmd('Languages & Extensions…', 'lang.manage'),
        { type: 'separator' },
        { role: 'reload' },
        { role: 'toggleDevTools' },
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
      role: 'help',
      submenu: [
        { label: 'About Strix', click: send('help.about') },
        {
          label: 'Strix on GitHub',
          click: () => void shell.openExternal('https://github.com/BackgroundCharacter101/strix'),
        },
      ],
    },
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}
