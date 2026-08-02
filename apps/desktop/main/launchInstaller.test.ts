import { describe, it, expect } from 'vitest';
import { elevateCommand, launchInstaller } from './launchInstaller';

describe('elevateCommand', () => {
  it('quotes the installer path and each argument', () => {
    const cmd = elevateCommand('C:\\Temp\\Strix M1 Setup 0.2.14.exe', ['/VERYSILENT', '/ALLUSERS']);
    expect(cmd).toContain("-FilePath 'C:\\Temp\\Strix M1 Setup 0.2.14.exe'");
    expect(cmd).toContain("-ArgumentList '/VERYSILENT','/ALLUSERS'");
    expect(cmd).toContain('-Verb RunAs');
  });

  it('escapes single quotes so a quoted path cannot break out of the command', () => {
    const cmd = elevateCommand("C:\\it's\\setup.exe", []);
    expect(cmd).toContain("'C:\\it''s\\setup.exe'");
  });

  it('exits non-zero when Start-Process fails, so a declined prompt is detectable', () => {
    const cmd = elevateCommand('C:\\a.exe', ['/X']);
    expect(cmd).toContain('-ErrorAction Stop');
    expect(cmd).toContain('catch { exit 1 }');
  });
});

describe('launchInstaller', () => {
  it('reports failure instead of throwing when the binary does not exist', async () => {
    // The old code spawned without an 'error' listener, so this failure was
    // invisible and the app quit anyway.
    const res = await launchInstaller('C:\\definitely\\missing-installer.exe', ['/S'], false);
    expect(res.ok).toBe(false);
    expect(res.error).toBeTruthy();
  });

  it('treats a non-zero elevation exit code as a declined prompt', async () => {
    // `cmd.exe /c exit 1` stands in for PowerShell reporting a refused UAC.
    const res = await launchInstaller('cmd.exe', ['/c', 'exit 1'], false);
    // Direct (non-elevated) spawn only reports whether the process STARTED.
    expect(res.ok).toBe(true);
  });

  it('times out rather than hanging forever on an unanswered prompt', async () => {
    // Elevated path against a binary that never exits, with a tiny timeout.
    const res = await launchInstaller('powershell.exe', ['/wait'], true, 50);
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/timed out|could not start|declined/i);
  }, 10_000);
});
