// Publish a built Strix installer to the local update feed (`dist-updates/`).
//
// After `npm run package:m1` (or :competition), this:
//   1. finds the installer in apps/desktop/release/<edition>/,
//   2. copies it into dist-updates/,
//   3. computes its sha256,
//   4. writes dist-updates/latest-<edition>.json (the manifest the app fetches).
//
// Usage:  node scripts/update-publish.mjs <m1|competition> [--notes "text"]
//   STRIX_UPDATE_URL sets the base URL baked into the manifest `url`
//   (default http://localhost:8787).
import { readFileSync, existsSync, readdirSync, copyFileSync, writeFileSync, mkdirSync, createReadStream } from 'node:fs';
import { createHash } from 'node:crypto';
import { execSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(repo, 'dist-updates');

/** Build the manifest object the client validates (see main/updater.ts). */
export function buildManifest({ version, fileName, sha256, notes, feedBase, mandatory = false, buildId }) {
  const base = String(feedBase).replace(/\/+$/, '');
  return {
    version,
    url: `${base}/${fileName}`,
    sha256,
    notes: notes ?? `Strix ${version}`,
    mandatory: Boolean(mandatory),
    pubDate: new Date().toISOString(),
    // Build identity so the client detects a republish even at the same version
    // (must match the id the app baked in — both come from git HEAD).
    buildId: buildId ?? undefined,
  };
}

/** Stream a file through sha256 → lowercase hex digest. */
export function sha256File(filePath) {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256');
    createReadStream(filePath)
      .on('data', (d) => hash.update(d))
      .on('end', () => resolve(hash.digest('hex')))
      .on('error', reject);
  });
}

async function main() {
  const edition = process.argv[2] === 'competition' ? 'competition' : 'm1';
  const notesFlag = process.argv.indexOf('--notes');
  const notes = notesFlag !== -1 ? process.argv[notesFlag + 1] : undefined;
  const feedBase = process.env.STRIX_UPDATE_URL || 'http://localhost:8787';

  const version = JSON.parse(readFileSync(path.join(repo, 'apps/desktop/package.json'), 'utf8')).version;
  const relDir = path.join(repo, 'apps/desktop/release', edition);
  if (!existsSync(relDir)) {
    console.error(`[update-publish] no build at ${relDir}. Run "npm run package:${edition}" first.`);
    process.exit(1);
  }
  // Prefer the installer matching this version; else the newest *Setup*.exe.
  const setups = readdirSync(relDir).filter((f) => /setup.*\.exe$/i.test(f));
  const installer = setups.find((f) => f.includes(version)) ?? setups.sort().at(-1);
  if (!installer) {
    console.error(`[update-publish] no *Setup*.exe in ${relDir}.`);
    process.exit(1);
  }

  mkdirSync(OUT, { recursive: true });
  const src = path.join(relDir, installer);
  const dest = path.join(OUT, installer);
  copyFileSync(src, dest);
  const sha256 = await sha256File(dest);

  const manifestPath = path.join(OUT, `latest-${edition}.json`);
  if (existsSync(manifestPath)) {
    const prev = JSON.parse(readFileSync(manifestPath, 'utf8'));
    if (prev.version === version) {
      console.warn(
        `[update-publish] ⚠ version ${version} unchanged from the last manifest — ` +
          `bump "version" in apps/desktop/package.json so clients see an update.`,
      );
    }
  }
  let buildId;
  try {
    buildId = execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim();
  } catch {
    buildId = undefined;
  }
  const manifest = buildManifest({ version, fileName: installer, sha256, notes, feedBase, buildId });
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');

  console.log(`[update-publish] ${edition} v${version}`);
  console.log(`[update-publish]   installer → dist-updates/${installer}`);
  console.log(`[update-publish]   manifest  → dist-updates/latest-${edition}.json`);
  console.log(`[update-publish]   url        = ${manifest.url}`);
  console.log(`[update-publish]   sha256     = ${sha256}`);
}

// Only run when invoked directly (not when imported by the test).
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  void main();
}
