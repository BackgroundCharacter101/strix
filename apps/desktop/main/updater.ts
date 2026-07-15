// Live auto-update — pure core (no `electron` import, so it unit-tests under
// Vitest's node environment). The Electron glue (app version, temp path, spawn
// installer, quit, renderer events) lives in ipc.ts; this module only decides
// *whether* to update and *downloads + verifies* the installer.
//
// See docs/superpowers/specs/2026-07-11-live-auto-update-design.md.
import { createHash } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { mkdir, rm } from 'node:fs/promises';
import * as path from 'node:path';

// Build-time default feed URL, baked by esbuild (--define __STRIX_UPDATE_URL__).
// Undefined under Vitest/tsc, so guard like edition.ts. Runtime env overrides it
// (see ipc.ts), which is how Phase 2 points at the real host.
declare const __STRIX_UPDATE_URL__: string;
export const DEFAULT_FEED_URL: string =
  typeof __STRIX_UPDATE_URL__ === 'undefined' ? 'http://localhost:8787' : __STRIX_UPDATE_URL__;

export interface UpdateManifest {
  version: string;
  url: string;
  sha256: string;
  notes?: string;
  mandatory?: boolean;
  pubDate?: string;
  /** Build identity (git short hash) so a rebuild at the SAME version is still
   *  detected as an update — the dev republishes without bumping the version. */
  buildId?: string;
}

export interface UpdateCheckResult {
  available: boolean;
  current: string;
  currentBuildId?: string;
  manifest?: UpdateManifest;
  /** Set when the check itself failed (server down, bad manifest) — distinct
   *  from a successful "no update". Lets the UI avoid showing "up to date". */
  error?: string;
}

// Build identity baked at build time (git short hash), so the running app can
// tell "same version, different build" apart. Undefined under tsc/Vitest.
declare const __STRIX_BUILD_ID__: string;
export const APP_BUILD_ID: string =
  typeof __STRIX_BUILD_ID__ === 'undefined' ? 'dev' : __STRIX_BUILD_ID__;

export interface DownloadProgress {
  received: number;
  total: number;
  percent: number;
}

// Minimal fetch shape we depend on — lets tests inject a fake without a server.
type FetchLike = (url: string) => Promise<{
  ok: boolean;
  status: number;
  text(): Promise<string>;
  headers?: { get(name: string): string | null };
  body?: ReadableStream<Uint8Array> | null;
}>;

/**
 * Compare two dotted numeric versions (e.g. "0.2.0" vs "0.1.9").
 * Returns 1 if a>b, -1 if a<b, 0 if equal. Pre-release suffixes are ignored
 * (split on the first '-'), which is enough for our simple 0.x scheme.
 */
export function compareVersions(a: string, b: string): number {
  const parse = (v: string): number[] =>
    String(v)
      .split('-')[0]
      .split('.')
      .map((n) => parseInt(n, 10) || 0);
  const pa = parse(a);
  const pb = parse(b);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const da = pa[i] ?? 0;
    const db = pb[i] ?? 0;
    if (da > db) return 1;
    if (da < db) return -1;
  }
  return 0;
}

/**
 * Whether the app is installed system-wide (an all-users / Program Files
 * install) rather than per-user. All-users installs live under a Program Files
 * dir and need elevation to self-update; per-user installs (under the user
 * profile) update silently. Case-insensitive prefix match (Windows paths).
 */
export function isSystemInstall(exePath: string, programFilesDirs: (string | undefined)[]): boolean {
  const exe = exePath.replace(/\//g, '\\').toLowerCase();
  return programFilesDirs
    .filter((d): d is string => !!d)
    .some((dir) => exe.startsWith(dir.replace(/\//g, '\\').toLowerCase() + '\\'));
}

/** Parse + validate a manifest document. Throws on missing/invalid fields. */
export function parseManifest(text: string): UpdateManifest {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error('update manifest is not valid JSON');
  }
  const m = raw as Record<string, unknown>;
  if (typeof m.version !== 'string' || !m.version.trim())
    throw new Error('update manifest missing "version"');
  if (typeof m.url !== 'string' || !/^https?:\/\//i.test(m.url))
    throw new Error('update manifest missing/invalid "url"');
  if (typeof m.sha256 !== 'string' || !/^[a-f0-9]{64}$/i.test(m.sha256))
    throw new Error('update manifest missing/invalid "sha256"');
  return {
    version: m.version.trim(),
    url: m.url,
    sha256: m.sha256,
    notes: typeof m.notes === 'string' ? m.notes : undefined,
    mandatory: m.mandatory === true,
    pubDate: typeof m.pubDate === 'string' ? m.pubDate : undefined,
    buildId: typeof m.buildId === 'string' ? m.buildId : undefined,
  };
}

/**
 * Fetch `{feedURL}/latest-{edition}.json` and decide whether it's newer than the
 * running version. Never throws for "no update" — only for real fetch/parse
 * failures the caller surfaces as an error event.
 */
export async function checkForUpdate(opts: {
  feedURL: string;
  edition: string;
  currentVersion: string;
  currentBuildId?: string;
  fetchImpl?: FetchLike;
}): Promise<UpdateCheckResult> {
  const { feedURL, edition, currentVersion } = opts;
  const currentBuildId = opts.currentBuildId ?? APP_BUILD_ID;
  const fetchImpl = opts.fetchImpl ?? (globalThis.fetch as unknown as FetchLike);
  const base = feedURL.replace(/\/+$/, '');
  const res = await fetchImpl(`${base}/latest-${edition}.json`);
  if (!res.ok) throw new Error(`update check failed: HTTP ${res.status}`);
  const manifest = parseManifest(await res.text());
  const cmp = compareVersions(manifest.version, currentVersion);
  // Offer when the feed is a newer version, OR the SAME version but a different
  // build (a republish after a change) — never a downgrade.
  const sameVersionNewBuild =
    cmp === 0 && !!manifest.buildId && manifest.buildId !== currentBuildId;
  const available = cmp > 0 || sameVersionNewBuild;
  return { available, current: currentVersion, currentBuildId, manifest };
}

/**
 * Stream the installer to `destPath`, hashing as we go, and verify the sha256
 * before returning. On mismatch the partial file is deleted and we throw — the
 * caller must never run an unverified installer.
 */
export async function downloadAndVerify(opts: {
  url: string;
  sha256: string;
  destPath: string;
  fetchImpl?: FetchLike;
  onProgress?: (p: DownloadProgress) => void;
}): Promise<string> {
  const { url, sha256, destPath, onProgress } = opts;
  const fetchImpl = opts.fetchImpl ?? (globalThis.fetch as unknown as FetchLike);
  const res = await fetchImpl(url);
  if (!res.ok) throw new Error(`update download failed: HTTP ${res.status}`);
  if (!res.body) throw new Error('update download has no body');

  const total = Number(res.headers?.get?.('content-length')) || 0;
  const hash = createHash('sha256');
  await mkdir(path.dirname(destPath), { recursive: true });
  const out = createWriteStream(destPath);
  let received = 0;

  const reader = res.body.getReader();
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      const buf = Buffer.from(value);
      hash.update(buf);
      received += buf.length;
      await new Promise<void>((resolve, reject) =>
        out.write(buf, (err) => (err ? reject(err) : resolve())),
      );
      onProgress?.({
        received,
        total,
        percent: total ? Math.min(100, Math.round((received / total) * 100)) : 0,
      });
    }
  } finally {
    out.end();
  }
  await new Promise<void>((resolve, reject) => {
    out.on('finish', () => resolve());
    out.on('error', reject);
  });

  const digest = hash.digest('hex');
  if (digest.toLowerCase() !== sha256.toLowerCase()) {
    await rm(destPath, { force: true });
    throw new Error(`update checksum mismatch (expected ${sha256}, got ${digest})`);
  }
  return destPath;
}
