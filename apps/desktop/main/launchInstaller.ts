import { spawn } from 'node:child_process';
import * as fs from 'node:fs';

export interface LaunchResult {
  ok: boolean;
  error?: string;
  /** Inno's install log, when one was requested — useful when a step fails. */
  logPath?: string;
}

export const UAC_DECLINED =
  'This update needs administrator approval and the prompt was declined (or closed). ' +
  'Choose Yes on the Windows prompt to update in place, or install the new version manually.';

// How long to wait for the elevation decision. The UAC consent dialog blocks
// until the user answers, so this is really "how long the user has to click
// Yes" — generous, but bounded so a forgotten prompt cannot wedge the app.
const DEFAULT_TIMEOUT_MS = 120_000;

/**
 * Start the installer and resolve only once we know whether it actually began.
 * Nothing may quit the app until this resolves ok — the previous version fired
 * a 1200ms quit timer regardless, so a declined prompt closed the app and
 * installed nothing.
 *
 * For an all-users update we pass `/ALLUSERS` and let **Inno** raise the UAC
 * prompt itself rather than pre-elevating it from here. That matters twice:
 * Inno then records the original (non-elevated) user, so the `runasoriginaluser`
 * relaunch drops admin rights instead of restarting the IDE as administrator;
 * and Inno writes its `/LOG` file the moment installation actually starts, which
 * is a concrete signal that elevation succeeded — far better than guessing from
 * a timer.
 */
export function launchInstaller(
  installer: string,
  args: string[],
  elevated: boolean,
  opts: { logPath?: string; timeoutMs?: number; pollMs?: number } = {},
): Promise<LaunchResult> {
  const { logPath, timeoutMs = DEFAULT_TIMEOUT_MS, pollMs = 250 } = opts;

  // A stale log from a previous attempt would read as instant success.
  if (logPath) {
    try {
      fs.rmSync(logPath, { force: true });
    } catch {
      /* best effort — a locked leftover just costs us the early signal */
    }
  }

  const fullArgs = logPath ? [...args, `/LOG=${logPath}`] : args;

  return new Promise((resolve) => {
    let settled = false;
    let poll: NodeJS.Timeout | undefined;

    const done = (r: LaunchResult) => {
      if (settled) return;
      settled = true;
      clearInterval(poll);
      clearTimeout(timer);
      resolve({ ...r, logPath });
    };

    const child = spawn(installer, fullArgs, { stdio: 'ignore' });

    child.on('error', (e) => done({ ok: false, error: `Could not start the installer: ${e.message}` }));

    // Installation has begun: Inno only creates the log once it is past
    // elevation and actually doing work.
    if (logPath) {
      poll = setInterval(() => {
        if (fs.existsSync(logPath)) {
          child.unref();
          done({ ok: true });
        }
      }, pollMs);
    }

    child.on('exit', (code) => {
      // Exited without ever starting to install → the elevation was refused
      // (or Setup bailed out before doing anything).
      if (logPath && !fs.existsSync(logPath)) {
        done({ ok: false, error: code === 0 ? 'The installer exited without installing.' : UAC_DECLINED });
        return;
      }
      done(code === 0 || code === null ? { ok: true } : { ok: false, error: UAC_DECLINED });
    });

    // No log to watch (per-user path): success is simply "it started".
    if (!logPath) child.on('spawn', () => { child.unref(); done({ ok: true }); });

    const timer = setTimeout(
      () => done({ ok: false, error: 'Timed out waiting for the administrator prompt. Try updating again.' }),
      timeoutMs,
    );
  });
}
