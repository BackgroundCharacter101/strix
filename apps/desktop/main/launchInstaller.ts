import { spawn } from 'node:child_process';

export interface LaunchResult {
  ok: boolean;
  error?: string;
}

// Build the PowerShell command that launches the installer elevated.
// `-ErrorAction Stop` + the try/catch turns a declined UAC prompt (or any other
// ShellExecute failure) into exit code 1, which is the only way to tell
// "the user said no" apart from "it started fine" — Start-Process is otherwise
// silent about it.
export function elevateCommand(installer: string, args: string[]): string {
  const q = (s: string) => `'${s.replace(/'/g, "''")}'`; // PowerShell single-quote escape
  const list = args.map(q).join(',');
  return `try { Start-Process -FilePath ${q(installer)} -ArgumentList ${list} -Verb RunAs -ErrorAction Stop } catch { exit 1 }`;
}

// How long to wait for the elevation decision. The UAC consent dialog blocks
// Start-Process until the user answers, so this is really "how long the user has
// to click Yes" — generous, but bounded so a dismissed-and-forgotten prompt
// cannot wedge the app forever.
const ELEVATION_TIMEOUT_MS = 120_000;

// Start the installer and resolve only once we know whether it actually began.
// Nothing may quit the app until this resolves ok.
export function launchInstaller(
  installer: string,
  args: string[],
  elevated: boolean,
  timeoutMs = ELEVATION_TIMEOUT_MS,
): Promise<LaunchResult> {
  return new Promise((resolve) => {
    let settled = false;
    const done = (r: LaunchResult) => {
      if (settled) return;
      settled = true;
      resolve(r);
    };

    if (!elevated) {
      // Per-user install: run it directly and detach so it outlives us.
      const child = spawn(installer, args, { detached: true, stdio: 'ignore' });
      child.on('error', (e) => done({ ok: false, error: e.message }));
      child.on('spawn', () => {
        child.unref();
        done({ ok: true });
      });
      return;
    }

    // All-users install: PowerShell raises the UAC prompt, then returns as soon
    // as the elevated installer starts — so its exit code tells us the outcome
    // while the installer itself keeps running independently.
    const child = spawn(
      'powershell.exe',
      ['-NoProfile', '-Command', elevateCommand(installer, args)],
      { stdio: 'ignore' },
    );
    const timer = setTimeout(
      () =>
        done({
          ok: false,
          error: 'Timed out waiting for the administrator prompt. Try updating again.',
        }),
      timeoutMs,
    );
    child.on('error', (e) => {
      clearTimeout(timer);
      done({ ok: false, error: `Could not start the installer: ${e.message}` });
    });
    child.on('exit', (code) => {
      clearTimeout(timer);
      done(
        code === 0
          ? { ok: true }
          : {
              ok: false,
              error:
                'This update needs administrator approval, and the prompt was declined or failed. ' +
                'Approve it to update in place, or install the new version manually.',
            },
      );
    });
  });
}
