import React, { useCallback, useEffect, useRef, useState } from 'react';
import type { FileNode } from '../main/fs';
import { FileTree } from './src/FileTree';
import { FileViewer } from './src/FileViewer';
import { EditorTabs } from './src/EditorTabs';
import { Breadcrumbs, relativeSegments } from './src/Breadcrumbs';
import { Palette, type PaletteItem } from './src/Palette';
import { PromptDialog } from './src/PromptDialog';
import { SearchView } from './src/SearchView';
import { SourceControlView } from './src/SourceControlView';
import { ExtensionsView } from './src/ExtensionsView';
import { DiffView } from './src/DiffView';
import { SettingsPage } from './src/SettingsPage';
import { AboutDialog } from './src/AboutDialog';
import { ShortcutsDialog } from './src/ShortcutsDialog';
import { Toaster } from './src/Toaster';
import { TitleBar } from './src/TitleBar';
import { showToast } from './src/toast';
import { useSettings, DEFAULT_SETTINGS } from './src/useSettings';
import { applyAccent } from './src/monaco-setup';
import { accentHex, monacoThemeFor } from './src/themes';
import { AiPanel } from './src/AiPanel';
import { StatusBar } from './src/StatusBar';
import { TerminalTabs } from './src/TerminalTabs';
import { useEditorTabs } from './src/useEditorTabs';
import { useResizable } from './src/useResizable';
import { useGitStatus } from './src/useGitStatus';
import {
  ExtensionsIcon,
  FilesIcon,
  GearIcon,
  SearchIcon,
  SourceControlIcon,
  SparkleIcon,
  TerminalIcon,
} from './src/icons';

export default function App() {
  const [root, setRoot] = useState<string | null>(null);
  const [cursor, setCursor] = useState({ line: 1, column: 1 });
  const [showSidebar, setShowSidebar] = useState(true);
  const [showAi, setShowAi] = useState(true);
  const [showTerminal, setShowTerminal] = useState(true);
  const [sidebarView, setSidebarView] = useState<'explorer' | 'search' | 'scm' | 'extensions'>(
    'explorer',
  );
  const [diff, setDiff] = useState<{ path: string; original: string; modified: string } | null>(
    null,
  );
  const [palette, setPalette] = useState<null | 'files' | 'commands'>(null);
  const [fileItems, setFileItems] = useState<PaletteItem[]>([]);
  const [problems, setProblems] = useState({ errors: 0, warnings: 0 });
  const [cloneOpen, setCloneOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [claudeLaunch, setClaudeLaunch] = useState<{ nonce: number; prompt?: string }>({
    nonce: 0,
  });
  const [selectionReq, setSelectionReq] = useState<{
    nonce: number;
    kind: 'explain' | 'fix';
    selection: string;
  }>();
  const [zen, setZen] = useState(false);
  const [recentCommands, setRecentCommands] = useState<string[]>(() => {
    try {
      return JSON.parse(localStorage.getItem('strix.recentCommands') ?? '[]') as string[];
    } catch {
      return [];
    }
  });
  const [settings, updateSettings] = useSettings();
  // Latest runCommand, so the menu subscription (mounted once) never goes stale.
  const runCommandRef = useRef<(id: string) => void>(() => {});
  const [recents, setRecents] = useState<string[]>(() => {
    try {
      return JSON.parse(localStorage.getItem('strix.recentFolders') ?? '[]') as string[];
    } catch {
      return [];
    }
  });
  const tabs = useEditorTabs();
  const tabsB = useEditorTabs();
  const [split, setSplit] = useState(false);
  const [activeGroup, setActiveGroup] = useState<'a' | 'b'>('a');
  // The group that receives new file-opens / save / close, and feeds the AI
  // panel + status bar.
  const activeTabs = split && activeGroup === 'b' ? tabsB : tabs;
  const chordRef = useRef(false);
  const formatRef = useRef<(() => void) | null>(null);
  const zenRef = useRef(false);
  const registerFormat = useCallback((fn: (() => void) | null) => {
    formatRef.current = fn;
  }, []);

  const openFolder = useCallback(async () => {
    const dir = await window.strix.workspace.open();
    if (dir) setRoot(dir);
  }, []);


  const openFile = useCallback(async () => {
    const filePath = await window.strix.workspace.openFile();
    if (filePath) activeTabs.open(filePath);
  }, [activeTabs]);

  const toggleSplit = () => {
    if (split) {
      setSplit(false);
      setActiveGroup('a');
    } else {
      setSplit(true);
      if (tabs.activePath) tabsB.open(tabs.activePath);
      setActiveGroup('b');
    }
  };

  // Open a file in the second group (splitting if needed) — right-click
  // "Open to the Side" or dropping on the right of a single group.
  const openToSide = (path: string) => {
    setSplit(true);
    tabsB.open(path);
    setActiveGroup('b');
  };

  // Handle a file dropped onto an editor group (from the tree or a tab).
  const onGroupDrop = (which: 'a' | 'b', e: React.DragEvent) => {
    const path = e.dataTransfer.getData('text/strix-path');
    if (!path) return;
    e.preventDefault();
    if (which === 'a' && !split) {
      const r = e.currentTarget.getBoundingClientRect();
      if (e.clientX > r.left + r.width * 0.6) {
        openToSide(path); // dropped on the right edge → split
        return;
      }
      tabs.open(path);
      setActiveGroup('a');
    } else {
      (which === 'b' ? tabsB : tabs).open(path);
      setActiveGroup(which);
    }
  };

  const cloneRepo = useCallback(async (url: string) => {
    setCloneOpen(false);
    showToast('Cloning repository…', 'info');
    try {
      const dir = await window.strix.workspace.clone(url);
      if (dir) {
        setRoot(dir);
        showToast('Repository cloned', 'success');
      }
    } catch (e) {
      showToast(`Clone failed: ${e instanceof Error ? e.message : String(e)}`, 'error', 8000);
    }
  }, []);

  // Load and flatten the workspace tree into Quick Open entries.
  const openQuickFiles = useCallback(async () => {
    if (!root) return;
    const tree = await window.strix.fs.tree(root);
    const items: PaletteItem[] = [];
    const walk = (n: FileNode) => {
      if (n.type === 'file') {
        const segs = relativeSegments(root, n.path);
        items.push({ id: n.path, label: n.name, detail: segs.slice(0, -1).join('/'), icon: n.name });
      } else {
        n.children?.forEach(walk);
      }
    };
    walk(tree);
    setFileItems(items);
    setPalette('files');
  }, [root]);

  const sidebar = useResizable(260, { axis: 'x', direction: 1, min: 150, max: 500 });
  const aiPanel = useResizable(340, { axis: 'x', direction: -1, min: 220, max: 600 });
  const terminal = useResizable(260, { axis: 'y', direction: -1, min: 120, max: 600 });

  useEffect(() => {
    window.strix.workspace.root().then(setRoot);
  }, []);

  // Track recently opened folders (most-recent first, capped, persisted).
  useEffect(() => {
    if (!root) return;
    setRecents((prev) => {
      const next = [root, ...prev.filter((p) => p !== root)].slice(0, 8);
      try {
        localStorage.setItem('strix.recentFolders', JSON.stringify(next));
      } catch {
        /* ignore quota/availability errors */
      }
      return next;
    });
  }, [root]);

  // Global keyboard shortcuts (VS Code-style).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Esc exits Zen mode.
      if (e.key === 'Escape' && zenRef.current) {
        e.preventDefault();
        setZen(false);
        return;
      }
      // Shift+Alt+F — Format Document (no Ctrl, so handle before the guard).
      if (e.altKey && e.shiftKey && e.key.toLowerCase() === 'f') {
        e.preventDefault();
        formatRef.current?.();
        return;
      }
      // Ctrl+K then S / Z chords.
      if (chordRef.current) {
        chordRef.current = false;
        if (e.key.toLowerCase() === 's') {
          e.preventDefault();
          void tabs.saveAll();
          void tabsB.saveAll();
          return;
        }
        if (e.key.toLowerCase() === 'z') {
          e.preventDefault();
          setZen((v) => !v);
          return;
        }
      }
      if (!e.ctrlKey && !e.metaKey) return;
      if (e.key.toLowerCase() === 'k') {
        e.preventDefault();
        chordRef.current = true;
        window.setTimeout(() => {
          chordRef.current = false;
        }, 1500);
        return;
      }
      switch (e.key.toLowerCase()) {
        case 's':
          e.preventDefault();
          void activeTabs.active?.save();
          break;
        case 'b':
          e.preventDefault();
          setShowSidebar((v) => !v);
          break;
        case '`':
          e.preventDefault();
          setShowTerminal((v) => !v);
          break;
        case 'w':
          if (activeTabs.activePath) {
            e.preventDefault();
            activeTabs.close(activeTabs.activePath);
          }
          break;
        case '\\':
          e.preventDefault();
          toggleSplit();
          break;
        case 'p':
          e.preventDefault();
          if (e.shiftKey) {
            setPalette('commands');
          } else {
            void openQuickFiles();
          }
          break;
        case 'o':
          e.preventDefault();
          void openFile();
          break;
        case 'f':
          if (e.shiftKey) {
            e.preventDefault();
            setSidebarView('search');
            setShowSidebar(true);
          }
          break;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [tabs, openQuickFiles, openFile]);

  // Native application menu → run the matching command (via a ref so this
  // subscription is set up once but always calls the latest handler).
  useEffect(() => window.strix.menu.onCommand((id) => runCommandRef.current(id)), []);

  // Activity-bar view switch: re-clicking the active view hides the sidebar.
  const selectView = (view: 'explorer' | 'search' | 'scm' | 'extensions') => {
    if (showSidebar && sidebarView === view) {
      setShowSidebar(false);
    } else {
      setSidebarView(view);
      setShowSidebar(true);
    }
  };

  const toggleZen = () => {
    setZen((v) => {
      if (!v) showToast('Zen mode — press Esc to exit', 'info', 2500);
      return !v;
    });
  };

  const toggleMode = () => {
    const next = settings.mode === 'cybersec' ? 'normal' : 'cybersec';
    updateSettings({ mode: next });
    showToast(
      next === 'cybersec' ? 'Cybersec mode enabled' : 'Normal mode',
      next === 'cybersec' ? 'success' : 'info',
      2200,
    );
  };

  const launchClaude = (prompt?: string) => {
    setShowTerminal(true);
    setClaudeLaunch((p) => ({ nonce: p.nonce + 1, prompt }));
  };

  // Run Explain/Fix on an editor selection — reveal the AI panel and ask it.
  const onSelectionAction = (kind: 'explain' | 'fix', selection: string) => {
    setShowAi(true);
    setSelectionReq((p) => ({ nonce: (p?.nonce ?? 0) + 1, kind, selection }));
  };

  // Hand a question (+ the active file's path) off to a Claude Code session.
  const askClaude = (text: string) => {
    const rel = activeTabs.activePath ? relativeSegments(root, activeTabs.activePath).join('/') : '';
    const q = text.trim();
    let prompt: string;
    if (rel && q) prompt = `In ${rel}: ${q}`;
    else if (rel) prompt = `Review ${rel}`;
    else prompt = q;
    launchClaude(prompt);
  };

  const openDiff = async (absPath: string) => {
    const [original, modified] = await Promise.all([
      window.strix.git.fileHead(absPath),
      window.strix.fs.read(absPath).catch(() => ''),
    ]);
    setDiff({ path: absPath, original, modified });
  };

  const commands: { id: string; label: string; detail: string; run: () => void }[] = [
    { id: 'workspace.openFile', label: 'File: Open File…', detail: 'Ctrl+O', run: () => void openFile() },
    { id: 'workspace.openFolder', label: 'File: Open Folder…', detail: '', run: () => void openFolder() },
    { id: 'workspace.clone', label: 'Git: Clone Repository…', detail: '', run: () => setCloneOpen(true) },
    { id: 'view.explorer', label: 'View: Explorer', detail: 'Ctrl+B', run: () => selectView('explorer') },
    { id: 'view.search', label: 'View: Search', detail: 'Ctrl+Shift+F', run: () => selectView('search') },
    { id: 'view.scm', label: 'View: Source Control', detail: '', run: () => selectView('scm') },
    { id: 'view.ai', label: 'View: Toggle AI Panel', detail: '', run: () => setShowAi((v) => !v) },
    { id: 'view.terminal', label: 'View: Toggle Terminal', detail: 'Ctrl+`', run: () => setShowTerminal((v) => !v) },
    {
      id: 'terminal.claude',
      label: 'Start Claude Code',
      detail: '',
      run: () => launchClaude(),
    },
    { id: 'view.zen', label: 'View: Toggle Zen Mode', detail: 'Ctrl+K Z', run: toggleZen },
    {
      id: 'view.mode',
      label:
        settings.mode === 'cybersec'
          ? 'Strix: Switch to Normal Mode'
          : 'Strix: Switch to Cybersec Mode',
      detail: '',
      run: toggleMode,
    },
    { id: 'pref.settings', label: 'Preferences: Settings', detail: '', run: () => setSettingsOpen(true) },
    {
      id: 'help.shortcuts',
      label: 'Help: Keyboard Shortcuts',
      detail: '',
      run: () => setShortcutsOpen(true),
    },
    { id: 'lang.manage', label: 'Languages & Extensions…', detail: '', run: () => selectView('extensions') },
    { id: 'file.save', label: 'File: Save', detail: 'Ctrl+S', run: () => void activeTabs.active?.save() },
    {
      id: 'file.saveAll',
      label: 'File: Save All',
      detail: 'Ctrl+K S',
      run: () => {
        void tabs.saveAll();
        void tabsB.saveAll();
      },
    },
    { id: 'view.split', label: 'View: Split Editor', detail: 'Ctrl+\\', run: toggleSplit },
    { id: 'editor.format', label: 'Format Document', detail: 'Shift+Alt+F', run: () => formatRef.current?.() },
    {
      id: 'view.closeEditor',
      label: 'View: Close Editor',
      detail: 'Ctrl+W',
      run: () => activeTabs.activePath && activeTabs.close(activeTabs.activePath),
    },
    { id: 'file.quickOpen', label: 'Go to File…', detail: 'Ctrl+P', run: () => void openQuickFiles() },
    ...recents
      .filter((p) => p !== root)
      .map((p) => ({ id: `recent:${p}`, label: `Open Recent: ${p}`, detail: '', run: () => setRoot(p) })),
  ];

  const gitStatus = useGitStatus(root);
  const changedCount = gitStatus?.isRepo ? gitStatus.files.length : 0;

  zenRef.current = zen;

  // In Cybersec mode the editor uses a dedicated green-on-black theme + green
  // accent so it matches the pentester chrome (instead of the user's theme).
  const cybersec = settings.mode === 'cybersec';
  const editorTheme = cybersec ? 'strix-cybersec' : monacoThemeFor(settings.theme);
  const editorAccent = cybersec ? '#21d07a' : accentHex(settings.accent);

  // Keep the Monaco editor theme + accent in sync with the chosen accent/mode.
  useEffect(() => {
    applyAccent(editorAccent, editorTheme);
  }, [editorAccent, editorTheme]);

  const recordRecentCommand = (id: string) => {
    if (id.startsWith('recent:')) return; // don't track "open recent folder" entries
    setRecentCommands((prev) => {
      const next = [id, ...prev.filter((x) => x !== id)].slice(0, 12);
      try {
        localStorage.setItem('strix.recentCommands', JSON.stringify(next));
      } catch {
        /* ignore */
      }
      return next;
    });
  };

  // Run a command by id — shared by the command palette and the native menu.
  const runCommand = (id: string) => {
    if (id === 'view.commandPalette') {
      setPalette('commands');
      return;
    }
    if (id === 'help.about') {
      setAboutOpen(true);
      return;
    }
    commands.find((c) => c.id === id)?.run();
  };
  runCommandRef.current = runCommand;

  const editorOptions = {
    fontSize: settings.fontSize,
    tabSize: settings.tabSize,
    wordWrap: settings.wordWrap,
    minimap: settings.minimap,
    fontFamily: settings.fontFamily || undefined,
    lineNumbers: settings.lineNumbers,
    cursorStyle: settings.cursorStyle,
    renderWhitespace: settings.renderWhitespace,
  };

  // One editor group (tabs + breadcrumbs + editor). With split active there are
  // two; clicking a group focuses it (new opens / save / status bar follow it).
  const renderGroup = (group: typeof tabs, which: 'a' | 'b') => (
    <div
      className="editor-group"
      data-active={split && which === activeGroup}
      onMouseDown={() => setActiveGroup(which)}
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes('text/strix-path')) e.preventDefault();
      }}
      onDrop={(e) => onGroupDrop(which, e)}
    >
      <EditorTabs tabs={group} onSplit={toggleSplit} />
      {group.activePath && <Breadcrumbs rootPath={root} path={group.activePath} />}
      <FileViewer
        path={group.activePath}
        buffer={group.active}
        onCursorChange={setCursor}
        onMarkersChange={setProblems}
        onOpenFolder={openFolder}
        onOpenFile={openFile}
        onCloneRepo={() => setCloneOpen(true)}
        onLanguages={() => selectView('extensions')}
        recents={root ? [] : recents}
        onOpenRecent={(p) => setRoot(p)}
        editorOptions={editorOptions}
        theme={editorTheme}
        registerFormat={registerFormat}
        onSelectionAction={onSelectionAction}
      />
    </div>
  );

  return (
    <div className="app" data-zen={zen}>
      {!zen && <TitleBar />}
      <div className="app-body">
        {!zen && (
        <nav className="activity-bar" aria-label="panels">
          <button
            type="button"
            aria-label="Explorer"
            aria-pressed={showSidebar && sidebarView === 'explorer'}
            title="Explorer"
            onClick={() => selectView('explorer')}
          >
            <FilesIcon />
          </button>
          <button
            type="button"
            aria-label="Search"
            aria-pressed={showSidebar && sidebarView === 'search'}
            title="Search (Ctrl+Shift+F)"
            onClick={() => selectView('search')}
          >
            <SearchIcon />
          </button>
          <button
            type="button"
            className="activity-with-badge"
            aria-label="Source Control"
            aria-pressed={showSidebar && sidebarView === 'scm'}
            title={`Source Control${changedCount ? ` — ${changedCount} changed` : ''}`}
            onClick={() => selectView('scm')}
          >
            <SourceControlIcon />
            {changedCount > 0 && <span className="activity-badge">{changedCount}</span>}
          </button>
          <button
            type="button"
            aria-label="Extensions"
            aria-pressed={showSidebar && sidebarView === 'extensions'}
            title="Languages & Extensions"
            onClick={() => selectView('extensions')}
          >
            <ExtensionsIcon />
          </button>
          <button
            type="button"
            aria-label="Toggle AI"
            aria-pressed={showAi}
            title="AI assistant"
            onClick={() => setShowAi((v) => !v)}
          >
            <SparkleIcon />
          </button>
          <button
            type="button"
            aria-label="Toggle terminal"
            aria-pressed={showTerminal}
            title="Terminal"
            onClick={() => setShowTerminal((v) => !v)}
          >
            <TerminalIcon />
          </button>
          <button
            type="button"
            className="activity-bottom"
            aria-label="Settings"
            title="Settings"
            onClick={() => setSettingsOpen(true)}
          >
            <GearIcon />
          </button>
        </nav>
        )}
        <div className="app-main">
          <div className="workbench">
            {showSidebar && !zen && (
              <>
                <aside className="sidebar" style={{ width: sidebar.size }}>
                  <div className="sidebar-header">
                    {sidebarView === 'search'
                      ? 'Search'
                      : sidebarView === 'scm'
                        ? 'Source Control'
                        : sidebarView === 'extensions'
                          ? 'Languages & Extensions'
                          : 'Explorer'}
                  </div>
                  {sidebarView === 'search' ? (
                    <SearchView onOpen={(p) => activeTabs.open(p)} />
                  ) : sidebarView === 'scm' ? (
                    <SourceControlView rootPath={root} onOpenDiff={(abs) => void openDiff(abs)} />
                  ) : sidebarView === 'extensions' ? (
                    <ExtensionsView />
                  ) : root ? (
                    <FileTree
                      key={root}
                      rootPath={root}
                      activePath={activeTabs.activePath}
                      onSelectFile={(node) => activeTabs.open(node.path)}
                      onOpenToSide={(node) => openToSide(node.path)}
                    />
                  ) : (
                    <p className="muted">Opening workspace…</p>
                  )}
                </aside>
                <div className="resizer resizer-x" onPointerDown={sidebar.onPointerDown} />
              </>
            )}
            <main className="editor-pane">
              {settingsOpen ? (
                <SettingsPage
                  settings={settings}
                  onChange={updateSettings}
                  onReset={() => updateSettings(DEFAULT_SETTINGS)}
                  onClose={() => setSettingsOpen(false)}
                />
              ) : diff ? (
                <DiffView
                  path={diff.path}
                  original={diff.original}
                  modified={diff.modified}
                  theme={editorTheme}
                  onClose={() => setDiff(null)}
                />
              ) : (
                <div className="editor-groups">
                  {renderGroup(tabs, 'a')}
                  {split && (
                    <>
                      <div className="group-divider" />
                      {renderGroup(tabsB, 'b')}
                    </>
                  )}
                </div>
              )}
            </main>
            {showAi && !zen && (
              <>
                <div className="resizer resizer-x" onPointerDown={aiPanel.onPointerDown} />
                <aside className="ai-pane" style={{ width: aiPanel.size }}>
                  <AiPanel
                    filePath={activeTabs.activePath}
                    fileContent={activeTabs.active?.draft ?? ''}
                    onApplyEdit={(content) => activeTabs.active?.setDraft(content)}
                    onAskClaude={askClaude}
                    selectionRequest={selectionReq}
                    aiServerUrl={settings.aiServerUrl}
                    mode={settings.mode}
                    securityStance={settings.securityStance}
                    onSecurityStanceChange={(s) => updateSettings({ securityStance: s })}
                    securityPersonaText={`${settings.securityPersona.base} ${settings.securityPersona[settings.securityStance]}`}
                  />
                </aside>
              </>
            )}
          </div>
          {showTerminal && !zen && (
            <>
              <div className="resizer resizer-y" onPointerDown={terminal.onPointerDown} />
              <section className="panel" style={{ height: terminal.size }}>
                <TerminalTabs cwd={root ?? undefined} launch={claudeLaunch} />
              </section>
            </>
          )}
        </div>
      </div>
      {!zen && (
        <StatusBar
          gitStatus={gitStatus}
          path={activeTabs.activePath}
          dirty={activeTabs.active?.dirty ?? false}
          cursor={cursor}
          content={activeTabs.active?.draft ?? ''}
          problems={activeTabs.activePath ? problems : { errors: 0, warnings: 0 }}
          onOpenScm={() => selectView('scm')}
          mode={settings.mode}
          onToggleMode={toggleMode}
        />
      )}
      {palette === 'files' && (
        <Palette
          items={fileItems}
          placeholder="Search files by name…"
          onSelect={(item) => {
            activeTabs.open(item.id);
            setPalette(null);
          }}
          onClose={() => setPalette(null)}
        />
      )}
      {palette === 'commands' && (
        <Palette
          items={commands.map((c) => ({ id: c.id, label: c.label, detail: c.detail }))}
          placeholder="Type a command…"
          recentIds={recentCommands}
          onSelect={(item) => {
            setPalette(null);
            recordRecentCommand(item.id);
            commands.find((c) => c.id === item.id)?.run();
          }}
          onClose={() => setPalette(null)}
        />
      )}
      {cloneOpen && (
        <PromptDialog
          title="Clone repository (git URL)"
          confirmLabel="Clone"
          onSubmit={(url) => void cloneRepo(url)}
          onCancel={() => setCloneOpen(false)}
        />
      )}
      {aboutOpen && <AboutDialog onClose={() => setAboutOpen(false)} />}
      {shortcutsOpen && <ShortcutsDialog onClose={() => setShortcutsOpen(false)} />}
      <Toaster />
    </div>
  );
}
