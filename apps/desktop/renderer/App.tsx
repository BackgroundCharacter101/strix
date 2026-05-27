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
import { DiffView } from './src/DiffView';
import { SettingsDialog } from './src/SettingsDialog';
import { useSettings } from './src/useSettings';
import { AiPanel } from './src/AiPanel';
import { StatusBar } from './src/StatusBar';
import { TerminalTabs } from './src/TerminalTabs';
import { useEditorTabs } from './src/useEditorTabs';
import { useResizable } from './src/useResizable';
import {
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
  const [sidebarView, setSidebarView] = useState<'explorer' | 'search' | 'scm'>('explorer');
  const [diff, setDiff] = useState<{ path: string; original: string; modified: string } | null>(
    null,
  );
  const [palette, setPalette] = useState<null | 'files' | 'commands'>(null);
  const [fileItems, setFileItems] = useState<PaletteItem[]>([]);
  const [problems, setProblems] = useState({ errors: 0, warnings: 0 });
  const [cloneOpen, setCloneOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settings, updateSettings] = useSettings();
  const [recents, setRecents] = useState<string[]>(() => {
    try {
      return JSON.parse(localStorage.getItem('strix.recentFolders') ?? '[]') as string[];
    } catch {
      return [];
    }
  });
  const tabs = useEditorTabs();
  const chordRef = useRef(false);

  const openFolder = useCallback(async () => {
    const dir = await window.strix.workspace.open();
    if (dir) setRoot(dir);
  }, []);


  const openFile = useCallback(async () => {
    const filePath = await window.strix.workspace.openFile();
    if (filePath) tabs.open(filePath);
  }, [tabs]);

  const cloneRepo = useCallback(async (url: string) => {
    setCloneOpen(false);
    try {
      const dir = await window.strix.workspace.clone(url);
      if (dir) setRoot(dir);
    } catch (e) {
      window.alert(`Clone failed: ${e instanceof Error ? e.message : String(e)}`);
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
      // Ctrl+K then S — Save All chord.
      if (chordRef.current) {
        chordRef.current = false;
        if (e.key.toLowerCase() === 's') {
          e.preventDefault();
          void tabs.saveAll();
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
          void tabs.active?.save();
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
          if (tabs.activePath) {
            e.preventDefault();
            tabs.close(tabs.activePath);
          }
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

  // Activity-bar view switch: re-clicking the active view hides the sidebar.
  const selectView = (view: 'explorer' | 'search' | 'scm') => {
    if (showSidebar && sidebarView === view) {
      setShowSidebar(false);
    } else {
      setSidebarView(view);
      setShowSidebar(true);
    }
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
    { id: 'pref.settings', label: 'Preferences: Settings', detail: '', run: () => setSettingsOpen(true) },
    { id: 'file.save', label: 'File: Save', detail: 'Ctrl+S', run: () => void tabs.active?.save() },
    { id: 'file.saveAll', label: 'File: Save All', detail: 'Ctrl+K S', run: () => void tabs.saveAll() },
    {
      id: 'view.closeEditor',
      label: 'View: Close Editor',
      detail: 'Ctrl+W',
      run: () => tabs.activePath && tabs.close(tabs.activePath),
    },
    { id: 'file.quickOpen', label: 'Go to File…', detail: 'Ctrl+P', run: () => void openQuickFiles() },
    ...recents
      .filter((p) => p !== root)
      .map((p) => ({ id: `recent:${p}`, label: `Open Recent: ${p}`, detail: '', run: () => setRoot(p) })),
  ];

  return (
    <div className="app">
      <header className="titlebar">
        <span className="app-title">Strix IDE</span>
      </header>
      <div className="app-body">
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
            aria-label="Source Control"
            aria-pressed={showSidebar && sidebarView === 'scm'}
            title="Source Control"
            onClick={() => selectView('scm')}
          >
            <SourceControlIcon />
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
        <div className="app-main">
          <div className="workbench">
            {showSidebar && (
              <>
                <aside className="sidebar" style={{ width: sidebar.size }}>
                  <div className="sidebar-header">
                    {sidebarView === 'search'
                      ? 'Search'
                      : sidebarView === 'scm'
                        ? 'Source Control'
                        : 'Explorer'}
                  </div>
                  {sidebarView === 'search' ? (
                    <SearchView onOpen={(p) => tabs.open(p)} />
                  ) : sidebarView === 'scm' ? (
                    <SourceControlView rootPath={root} onOpenDiff={(abs) => void openDiff(abs)} />
                  ) : root ? (
                    <FileTree
                      key={root}
                      rootPath={root}
                      activePath={tabs.activePath}
                      onSelectFile={(node) => tabs.open(node.path)}
                    />
                  ) : (
                    <p className="muted">Opening workspace…</p>
                  )}
                </aside>
                <div className="resizer resizer-x" onPointerDown={sidebar.onPointerDown} />
              </>
            )}
            <main className="editor-pane">
              {diff ? (
                <DiffView
                  path={diff.path}
                  original={diff.original}
                  modified={diff.modified}
                  onClose={() => setDiff(null)}
                />
              ) : (
                <>
                  <EditorTabs tabs={tabs} />
                  {tabs.activePath && <Breadcrumbs rootPath={root} path={tabs.activePath} />}
                  <FileViewer
                    path={tabs.activePath}
                    buffer={tabs.active}
                    onCursorChange={setCursor}
                    onMarkersChange={setProblems}
                    onOpenFolder={openFolder}
                    onOpenFile={openFile}
                    onCloneRepo={() => setCloneOpen(true)}
                    editorOptions={{
                      fontSize: settings.fontSize,
                      tabSize: settings.tabSize,
                      wordWrap: settings.wordWrap,
                      minimap: settings.minimap,
                    }}
                  />
                </>
              )}
            </main>
            {showAi && (
              <>
                <div className="resizer resizer-x" onPointerDown={aiPanel.onPointerDown} />
                <aside className="ai-pane" style={{ width: aiPanel.size }}>
                  <AiPanel
                    filePath={tabs.activePath}
                    fileContent={tabs.active?.draft ?? ''}
                    onApplyEdit={(content) => tabs.active?.setDraft(content)}
                  />
                </aside>
              </>
            )}
          </div>
          {showTerminal && (
            <>
              <div className="resizer resizer-y" onPointerDown={terminal.onPointerDown} />
              <section className="panel" style={{ height: terminal.size }}>
                <TerminalTabs />
              </section>
            </>
          )}
        </div>
      </div>
      <StatusBar
        rootPath={root}
        path={tabs.activePath}
        dirty={tabs.active?.dirty ?? false}
        cursor={cursor}
        content={tabs.active?.draft ?? ''}
        problems={tabs.activePath ? problems : { errors: 0, warnings: 0 }}
      />
      {palette === 'files' && (
        <Palette
          items={fileItems}
          placeholder="Search files by name…"
          onSelect={(item) => {
            tabs.open(item.id);
            setPalette(null);
          }}
          onClose={() => setPalette(null)}
        />
      )}
      {palette === 'commands' && (
        <Palette
          items={commands.map((c) => ({ id: c.id, label: c.label, detail: c.detail }))}
          placeholder="Type a command…"
          onSelect={(item) => {
            setPalette(null);
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
      {settingsOpen && (
        <SettingsDialog
          settings={settings}
          onChange={updateSettings}
          onClose={() => setSettingsOpen(false)}
        />
      )}
    </div>
  );
}
