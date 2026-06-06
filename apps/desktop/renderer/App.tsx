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
  RunIcon,
  SearchIcon,
  SourceControlIcon,
  SparkleIcon,
  TerminalIcon,
} from './src/icons';
import { RunView } from './src/RunView';
import { extractLocalUrl } from './src/runTargets';

export default function App() {
  const [root, setRoot] = useState<string | null>(null);
  const [cursor, setCursor] = useState({ line: 1, column: 1 });
  const [showSidebar, setShowSidebar] = useState(true);
  const [showAi, setShowAi] = useState(true);
  const [showTerminal, setShowTerminal] = useState(true);
  const [sidebarView, setSidebarView] = useState<'explorer' | 'search' | 'scm' | 'run' | 'extensions'>(
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
  // Which Settings section to open at (deep-link, e.g. from the AI panel).
  const [settingsSection, setSettingsSection] = useState<
    'appearance' | 'editor' | 'ai' | 'security'
  >('appearance');
  const [aboutOpen, setAboutOpen] = useState(false);
  const [claudeLaunch, setClaudeLaunch] = useState<{
    nonce: number;
    prompt?: string;
    command?: string;
    title?: string;
  }>({
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
  const [recentFiles, setRecentFiles] = useState<string[]>(() => {
    try {
      return JSON.parse(localStorage.getItem('strix.recentFiles') ?? '[]') as string[];
    } catch {
      return [];
    }
  });
  const tabs = useEditorTabs();
  const tabsB = useEditorTabs();
  const tabsC = useEditorTabs();
  // Editor groups: 1 (single), 2 or 3 side-by-side. `split` is the legacy
  // "more than one group" flag used throughout the UI.
  const [splitCount, setSplitCount] = useState<1 | 2 | 3>(1);
  const split = splitCount > 1;
  const [splitRatio, setSplitRatio] = useState(0.5); // width fraction of group A (2-up only)
  const [activeGroup, setActiveGroup] = useState<'a' | 'b' | 'c'>('a');
  const groupsRef = useRef<HTMLDivElement>(null);

  const GROUP_ORDER = ['a', 'b', 'c'] as const;
  const groupTabs = { a: tabs, b: tabsB, c: tabsC } as const;

  // Drag the split divider to resize the two editor groups (percentage-based so
  // it clamps naturally to the container).
  const onDividerDown = (e: React.PointerEvent) => {
    e.preventDefault();
    const el = groupsRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const move = (ev: PointerEvent) => {
      const r = Math.min(0.85, Math.max(0.15, (ev.clientX - rect.left) / rect.width));
      setSplitRatio(r);
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      document.body.style.cursor = '';
    };
    document.body.style.cursor = 'col-resize';
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };
  // The group that receives new file-opens / save / close, and feeds the AI
  // panel + status bar. Clamp to a visible group if the active one was closed.
  const visibleGroups = GROUP_ORDER.slice(0, splitCount);
  const effectiveActive = visibleGroups.includes(activeGroup) ? activeGroup : 'a';
  const activeTabs = split ? groupTabs[effectiveActive] : tabs;

  // Track recently opened files (most-recent first, capped, persisted) whenever
  // the active file changes — surfaced first in Quick Open.
  useEffect(() => {
    const p = activeTabs.activePath;
    if (!p) return;
    setRecentFiles((prev) => {
      const next = [p, ...prev.filter((x) => x !== p)].slice(0, 15);
      try {
        localStorage.setItem('strix.recentFiles', JSON.stringify(next));
      } catch {
        /* ignore */
      }
      return next;
    });
  }, [activeTabs.activePath]);
  // Mirror recentFiles into a ref so openQuickFiles can read it without
  // re-creating on every file change.
  const recentFilesRef = useRef<string[]>(recentFiles);
  recentFilesRef.current = recentFiles;

  // Auto-save: periodically write dirty buffers in both groups. The ref always
  // points at the latest saveAll, so the interval needn't be recreated on edits.
  const autoSaveRef = useRef<() => void>(() => {});
  autoSaveRef.current = () => {
    void tabs.saveAll();
    void tabsB.saveAll();
    void tabsC.saveAll();
  };
  useEffect(() => {
    if (!settings.autoSave) return;
    const ms = Math.max(5, settings.autoSaveSeconds) * 1000;
    const id = window.setInterval(() => autoSaveRef.current(), ms);
    return () => window.clearInterval(id);
  }, [settings.autoSave, settings.autoSaveSeconds]);

  // --- Per-project session: remember each workspace's open tabs ---
  const { replaceAll: replaceTabsA } = tabs;
  // The root the group-A tabs currently belong to (so we save under the right key).
  const tabsRootRef = useRef<string | null>(null);
  // Restore the saved tab session when the workspace changes. Flush unsaved
  // edits of the previous project first (no data loss), then reset to one group.
  useEffect(() => {
    if (!root) return;
    autoSaveRef.current();
    let saved: { tabs: string[]; active: string | null } = { tabs: [], active: null };
    try {
      const raw = localStorage.getItem(`strix.openTabs:${root}`);
      if (raw) saved = JSON.parse(raw) as typeof saved;
    } catch {
      /* ignore corrupt session */
    }
    setSplitCount(1);
    setActiveGroup('a');
    replaceTabsA(saved.tabs ?? [], saved.active ?? null);
    tabsRootRef.current = root;
  }, [root, replaceTabsA]);
  // Persist the group-A session whenever it changes (for its own root).
  useEffect(() => {
    if (!root || tabsRootRef.current !== root) return;
    try {
      localStorage.setItem(
        `strix.openTabs:${root}`,
        JSON.stringify({ tabs: tabs.tabs, active: tabs.activePath }),
      );
    } catch {
      /* ignore quota/availability */
    }
  }, [root, tabs.tabs, tabs.activePath]);

  const chordRef = useRef(false);
  const formatRef = useRef<(() => Promise<string | null>) | null>(null);
  const zenRef = useRef(false);
  const settingsRef = useRef(false);
  const registerFormat = useCallback((fn: (() => Promise<string | null>) | null) => {
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

  // Save the active file; with format-on-save, format first and persist the
  // formatted text directly (so no stale-draft race).
  const saveActive = async () => {
    const t = activeTabs.active;
    if (!t) return;
    if (settings.formatOnSave && formatRef.current) {
      try {
        const formatted = await formatRef.current();
        await t.save(formatted ?? undefined);
        return;
      } catch {
        /* fall back to a plain save below */
      }
    }
    await t.save();
  };

  // Cycle the editor layout 1 → 2 → 3 → 1 group(s). Each step opens the active
  // file in the newly added group and focuses it; wrapping back to 1 collapses.
  const cycleSplit = () => {
    const next: 1 | 2 | 3 = splitCount >= 3 ? 1 : ((splitCount + 1) as 2 | 3);
    setSplitCount(next);
    if (next === 1) {
      setActiveGroup('a');
      return;
    }
    const newGroup = GROUP_ORDER[next - 1];
    if (tabs.activePath) groupTabs[newGroup].open(tabs.activePath);
    setActiveGroup(newGroup);
  };

  // Collapse back to a single group.
  const unsplit = () => {
    setSplitCount(1);
    setActiveGroup('a');
  };

  // Open a file in the next group (splitting if needed) — right-click
  // "Open to the Side" or dropping on the right of a single group.
  const openToSide = (path: string) => {
    const target: 'b' | 'c' = splitCount >= 2 ? 'c' : 'b';
    setSplitCount((n) => (n < 2 ? 2 : 3));
    groupTabs[target].open(path);
    setActiveGroup(target);
  };

  // Handle a file dropped onto an editor group (from the tree or a tab).
  const onGroupDrop = (which: 'a' | 'b' | 'c', e: React.DragEvent) => {
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
      groupTabs[which].open(path);
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
    // Surface recently opened files first (MRU order), then the rest.
    const byPath = new Map(items.map((it) => [it.id, it]));
    const recentOrdered = recentFilesRef.current
      .map((p) => byPath.get(p))
      .filter((it): it is PaletteItem => Boolean(it));
    const recentIds = new Set(recentOrdered.map((it) => it.id));
    const rest = items.filter((it) => !recentIds.has(it.id));
    setFileItems([...recentOrdered, ...rest]);
    setPalette('files');
  }, [root]);

  const sidebar = useResizable(260, { axis: 'x', direction: 1, min: 150, max: 500, persistKey: 'strix.size.sidebar' });
  const aiPanel = useResizable(400, { axis: 'x', direction: -1, min: 240, max: 760, persistKey: 'strix.size.ai' });
  const terminal = useResizable(260, { axis: 'y', direction: -1, min: 120, max: 600, persistKey: 'strix.size.terminal' });

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
      // Esc closes the full-screen Settings.
      if (e.key === 'Escape' && settingsRef.current) {
        e.preventDefault();
        setSettingsOpen(false);
        return;
      }
      // Shift+Alt+F — Format Document (no Ctrl, so handle before the guard).
      if (e.altKey && e.shiftKey && e.key.toLowerCase() === 'f') {
        e.preventDefault();
        void formatRef.current?.();
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
          void saveActive();
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
            const p = activeTabs.activePath;
            const name = p.split(/[\\/]/).pop();
            if (!activeTabs.isDirty(p) || window.confirm(`Discard unsaved changes to ${name}?`)) {
              activeTabs.close(p);
            }
          }
          break;
        case '\\':
          e.preventDefault();
          cycleSplit();
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
  const selectView = (view: 'explorer' | 'search' | 'scm' | 'run' | 'extensions') => {
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

  // Run a project target (npm script / Python) in a new integrated terminal.
  const runTarget = (command: string, title: string) => {
    setShowTerminal(true);
    setClaudeLaunch((p) => ({ nonce: p.nonce + 1, command, title }));
    showToast(`Running ${title}…`, 'info', 2500);
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
    { id: 'view.run', label: 'View: Run & Serve', detail: '', run: () => selectView('run') },
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
    { id: 'file.save', label: 'File: Save', detail: 'Ctrl+S', run: () => void saveActive() },
    {
      id: 'file.saveAll',
      label: 'File: Save All',
      detail: 'Ctrl+K S',
      run: () => {
        void tabs.saveAll();
        void tabsB.saveAll();
      },
    },
    { id: 'view.split', label: 'View: Split Editor (cycle 1/2/3)', detail: 'Ctrl+\\', run: cycleSplit },
    { id: 'view.unsplit', label: 'View: Unsplit Editor', detail: '', run: unsplit },
    { id: 'editor.format', label: 'Format Document', detail: 'Shift+Alt+F', run: () => void formatRef.current?.() },
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
  settingsRef.current = settingsOpen;

  // Warn before quitting with unsaved edits in any editor group.
  const anyDirtyRef = useRef<() => boolean>(() => false);
  anyDirtyRef.current = () =>
    [tabs, tabsB, tabsC].some((t) => t.tabs.some((p) => t.isDirty(p)));
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (anyDirtyRef.current() && !window.confirm('You have unsaved changes. Close Strix anyway?')) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, []);

  // Zen mode goes truly full-screen (hides the OS taskbar), and restores the
  // normal window on exit. Driven by the zen state so every entry/exit path
  // (toggle, chord, Esc, command, menu) is covered.
  useEffect(() => {
    window.strix.win.setFullScreen(zen);
  }, [zen]);

  // Watch terminal output for a dev-server URL (e.g. after "npm run dev") and
  // open it in the browser once. A ref tracks already-opened URLs so we don't
  // re-open on every repaint/log line.
  const openedUrls = useRef(new Set<string>());
  useEffect(() => {
    return window.strix.terminal.onData(({ data }) => {
      const url = extractLocalUrl(data);
      if (url && !openedUrls.current.has(url)) {
        openedUrls.current.add(url);
        window.strix.win.openExternal(url);
        showToast(`Opened dev server: ${url}`, 'success', 4000);
      }
    });
  }, []);

  // In Cybersec mode the editor uses a dedicated green-on-black theme + green
  // accent so it matches the pentester chrome (instead of the user's theme).
  const cybersec = settings.mode === 'cybersec';
  const editorTheme = cybersec ? 'strix-cybersec' : monacoThemeFor(settings.theme);
  const editorAccent = cybersec ? '#2ea871' : accentHex(settings.accent);

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
    cursorBlinking: settings.cursorBlinking,
    renderWhitespace: settings.renderWhitespace,
    lineHeight: settings.lineHeight,
    fontLigatures: settings.fontLigatures,
    smoothScrolling: settings.smoothScrolling,
    stickyScroll: settings.stickyScroll,
    bracketColorization: settings.bracketColorization,
    scrollBeyondLastLine: settings.scrollBeyondLastLine,
  };

  // One editor group (tabs + breadcrumbs + editor). With split active there are
  // up to three; clicking a group focuses it (new opens / save / status bar
  // follow it). In 2-up, group A honours the draggable ratio; 3-up is equal.
  const renderGroup = (group: typeof tabs, which: 'a' | 'b' | 'c') => (
    <div
      className="editor-group"
      data-active={split && which === effectiveActive}
      style={splitCount === 2 && which === 'a' ? { flex: `0 0 ${splitRatio * 100}%` } : undefined}
      onMouseDown={() => setActiveGroup(which)}
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes('text/strix-path')) e.preventDefault();
      }}
      onDrop={(e) => onGroupDrop(which, e)}
    >
      <EditorTabs tabs={group} onSplit={cycleSplit} onCloseGroup={split ? unsplit : undefined} />
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
        rootPath={root}
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
            aria-label="Run and Serve"
            aria-pressed={showSidebar && sidebarView === 'run'}
            title="Run & Serve"
            onClick={() => selectView('run')}
          >
            <RunIcon />
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
                        : sidebarView === 'run'
                          ? 'Run & Serve'
                          : sidebarView === 'extensions'
                            ? 'Languages & Extensions'
                            : 'Explorer'}
                  </div>
                  {sidebarView === 'search' ? (
                    <SearchView onOpen={(p) => activeTabs.open(p)} />
                  ) : sidebarView === 'scm' ? (
                    <SourceControlView
                      rootPath={root}
                      onOpenDiff={(abs) => void openDiff(abs)}
                      aiServerUrl={settings.aiServerUrl}
                    />
                  ) : sidebarView === 'run' ? (
                    <RunView
                      rootPath={root}
                      activeFilePath={activeTabs.activePath}
                      onRun={runTarget}
                    />
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
              {diff ? (
                <DiffView
                  path={diff.path}
                  original={diff.original}
                  modified={diff.modified}
                  theme={editorTheme}
                  onClose={() => setDiff(null)}
                />
              ) : (
                <div className="editor-groups" ref={groupsRef} data-count={splitCount}>
                  {renderGroup(tabs, 'a')}
                  {splitCount >= 2 && (
                    <>
                      {splitCount === 2 ? (
                        <div
                          className="group-divider"
                          role="separator"
                          aria-orientation="vertical"
                          aria-label="Resize editor split"
                          tabIndex={0}
                          onPointerDown={onDividerDown}
                          onKeyDown={(e) => {
                            if (e.key === 'ArrowLeft')
                              setSplitRatio((r) => Math.max(0.15, r - 0.05));
                            else if (e.key === 'ArrowRight')
                              setSplitRatio((r) => Math.min(0.85, r + 0.05));
                          }}
                          onDoubleClick={() => setSplitRatio(0.5)}
                        />
                      ) : (
                        <div className="group-divider is-static" aria-hidden="true" />
                      )}
                      {renderGroup(tabsB, 'b')}
                    </>
                  )}
                  {splitCount >= 3 && (
                    <>
                      <div className="group-divider is-static" aria-hidden="true" />
                      {renderGroup(tabsC, 'c')}
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
                    workspaceKey={root}
                    onConfigure={() => {
                      setSettingsSection('ai');
                      setSettingsOpen(true);
                    }}
                  />
                </aside>
              </>
            )}
          </div>
          {showTerminal && !zen && (
            <>
              <div className="resizer resizer-y" onPointerDown={terminal.onPointerDown} />
              <section className="panel" style={{ height: terminal.size }}>
                <TerminalTabs
                  cwd={root ?? undefined}
                  launch={claudeLaunch}
                  fontSize={settings.fontSize}
                  fontFamily={settings.fontFamily || undefined}
                />
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
      {settingsOpen && (
        <div className="settings-overlay" role="dialog" aria-modal="true" aria-label="Settings">
          <SettingsPage
            settings={settings}
            onChange={updateSettings}
            onReset={() => updateSettings(DEFAULT_SETTINGS)}
            onClose={() => setSettingsOpen(false)}
            onSave={() => updateSettings({})}
            initialSection={settingsSection}
          />
        </div>
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
