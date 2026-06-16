import React, { useEffect, useMemo, useState } from 'react';
import { complete, configureAi } from '@strix/ai-gateway';
import {
  flattenForMap,
  parseArchitecture,
  type MapTreeNode,
  type Architecture,
} from './projectMap';
import { showToast } from './toast';

// Colour per language key — accent-independent so the map reads at a glance.
const LANG_COLOR: Record<string, string> = {
  dir: '#8b93a7', ts: '#3b82f6', js: '#eab308', json: '#a3a3a3', md: '#60a5fa',
  css: '#ec4899', html: '#f97316', py: '#22c55e', rb: '#ef4444', go: '#06b6d4',
  rs: '#f59e0b', java: '#f43f5e', c: '#94a3b8', cpp: '#818cf8', cs: '#16a34a',
  php: '#7c3aed', sh: '#10b981', yaml: '#a78bfa', cfg: '#9ca3af', sql: '#0ea5e9',
  img: '#f472b6', file: '#6b7280',
};
const colorOf = (lang: string) => LANG_COLOR[lang] ?? LANG_COLOR.file;

const ROW_H = 22;
const INDENT = 16;

const ARCH_INSTRUCTION =
  'Analyze this project file tree and output ONLY JSON (no prose, no code fence) of the form ' +
  '{"summary": string, "modules": [{"id": string, "label": string, "kind": string, "files": string[]}], ' +
  '"edges": [{"from": string, "to": string, "label": string}]}. ' +
  'modules = the 6–14 main logical components/layers of the system (e.g. UI, main process, services, data). ' +
  'edges = dependency or data-flow relationships between module ids. Keep labels short. summary = 1–2 sentences.';

export function ProjectMapView({
  rootPath,
  onOpen,
  aiServerUrl,
}: {
  rootPath: string | null;
  onOpen: (path: string) => void;
  aiServerUrl?: string;
}) {
  const [tab, setTab] = useState<'structure' | 'architecture'>('structure');
  const [tree, setTree] = useState<MapTreeNode[]>([]);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [arch, setArch] = useState<Architecture | null>(null);
  const [loadingArch, setLoadingArch] = useState(false);

  useEffect(() => {
    if (!rootPath) {
      setTree([]);
      return;
    }
    let cancelled = false;
    void window.strix.fs.tree(rootPath).then((t) => {
      if (!cancelled) setTree(((t as MapTreeNode).children as MapTreeNode[]) ?? []);
    });
    return () => {
      cancelled = true;
    };
  }, [rootPath]);

  const rows = useMemo(() => flattenForMap(tree, collapsed), [tree, collapsed]);
  const maxDepth = rows.reduce((m, r) => Math.max(m, r.depth), 0);
  const svgW = (maxDepth + 1) * INDENT + 260;
  const svgH = Math.max(rows.length * ROW_H + 12, 40);

  const toggle = (path: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });

  const analyze = async () => {
    if (!rootPath || loadingArch) return;
    setLoadingArch(true);
    try {
      await window.strix.ai.ensure(aiServerUrl || undefined);
      configureAi(await window.strix.ai.config(aiServerUrl || undefined));
      const listing = flattenForMap(tree)
        .map((n) => '  '.repeat(n.depth) + n.name + (n.type === 'directory' ? '/' : ''))
        .join('\n')
        .slice(0, 12_000);
      const reply = await complete('chat', {
        filePath: '',
        fileContent: listing,
        userMessage: ARCH_INSTRUCTION,
      });
      const a = parseArchitecture(reply);
      if (a) setArch(a);
      else showToast('Could not read the architecture — try again.', 'info', 5000);
    } catch (e) {
      showToast(`Analyze failed: ${e instanceof Error ? e.message : String(e)}`, 'error', 7000);
    } finally {
      setLoadingArch(false);
    }
  };

  if (!rootPath) {
    return <div className="map-empty muted">Open a folder to map it.</div>;
  }

  return (
    <div className="map-view">
      <div className="map-tabs" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'structure'}
          className={`map-tab${tab === 'structure' ? ' is-active' : ''}`}
          onClick={() => setTab('structure')}
        >
          Structure
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'architecture'}
          className={`map-tab${tab === 'architecture' ? ' is-active' : ''}`}
          onClick={() => setTab('architecture')}
        >
          Architecture
        </button>
      </div>

      {tab === 'structure' ? (
        <div className="map-scroll">
          <svg width={svgW} height={svgH} role="img" aria-label="Project structure map">
            {rows.map((n, i) => {
              const x = 10 + n.depth * INDENT;
              const y = 10 + i * ROW_H + ROW_H / 2;
              const isDir = n.type === 'directory';
              const open = isDir && !collapsed.has(n.path);
              return (
                <g
                  key={n.path}
                  className="map-node"
                  onClick={() => (isDir ? toggle(n.path) : onOpen(n.path))}
                  style={{ cursor: 'pointer' }}
                >
                  <rect x={0} y={10 + i * ROW_H} width={svgW} height={ROW_H} fill="transparent" />
                  {n.depth > 0 && (
                    <line x1={x - INDENT + 4} y1={y} x2={x - 2} y2={y} className="map-link" />
                  )}
                  {isDir ? (
                    <text x={x - 2} y={y + 4} className="map-chevron">
                      {open ? '▾' : '▸'}
                    </text>
                  ) : (
                    <circle cx={x + 3} cy={y} r={4} fill={colorOf(n.lang)} />
                  )}
                  <text
                    x={x + (isDir ? 12 : 12)}
                    y={y + 4}
                    className={`map-label${isDir ? ' is-dir' : ''}`}
                  >
                    {n.name}
                  </text>
                </g>
              );
            })}
          </svg>
        </div>
      ) : (
        <div className="map-scroll map-arch">
          <button type="button" className="map-analyze" disabled={loadingArch} onClick={() => void analyze()}>
            {loadingArch ? 'Analyzing…' : arch ? 'Re-analyze project' : 'Analyze project'}
          </button>
          {arch && (
            <>
              {arch.summary && <p className="map-summary">{arch.summary}</p>}
              <div className="map-modules">
                {arch.modules.map((m) => (
                  <div key={m.id} className="map-module">
                    <div className="map-module-head">
                      <span className="map-module-label">{m.label}</span>
                      {m.kind && <span className="map-module-kind">{m.kind}</span>}
                    </div>
                    {m.files && m.files.length > 0 && (
                      <ul className="map-module-files">
                        {m.files.slice(0, 8).map((f) => (
                          <li key={f}>
                            <button
                              type="button"
                              className="map-file-link"
                              onClick={() => rootPath && onOpen(joinPath(rootPath, f))}
                              title={f}
                            >
                              {f}
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                ))}
              </div>
              {arch.edges.length > 0 && (
                <div className="map-edges">
                  <div className="map-edges-title">Relationships</div>
                  {arch.edges.map((e, i) => {
                    const from = arch.modules.find((m) => m.id === e.from)?.label ?? e.from;
                    const to = arch.modules.find((m) => m.id === e.to)?.label ?? e.to;
                    return (
                      <div key={i} className="map-edge">
                        {from} <span className="map-arrow">→</span> {to}
                        {e.label && <span className="map-edge-label"> ({e.label})</span>}
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

function joinPath(root: string, rel: string): string {
  const sep = root.includes('\\') ? '\\' : '/';
  return root.replace(/[\\/]+$/, '') + sep + rel.replace(/^[\\/]+/, '').replace(/[\\/]+/g, sep);
}
