// Optional GitHub account connection: the user pastes a Personal Access Token
// once; we store it under userData and use it to list their repos (so Clone can
// show a searchable list instead of pasting a URL) and to clone private repos.
import { app } from 'electron';
import { promises as fs } from 'fs';
import * as path from 'path';

const tokenPath = (): string => path.join(app.getPath('userData'), 'github-token');

export async function getToken(): Promise<string> {
  try {
    return (await fs.readFile(tokenPath(), 'utf8')).trim();
  } catch {
    return '';
  }
}

export async function setToken(token: string): Promise<void> {
  await fs.writeFile(tokenPath(), token.trim(), 'utf8');
}

export async function clearToken(): Promise<void> {
  try {
    await fs.unlink(tokenPath());
  } catch {
    /* already gone */
  }
}

const ghHeaders = (token: string): Record<string, string> => ({
  Authorization: `Bearer ${token}`,
  Accept: 'application/vnd.github+json',
  'User-Agent': 'Strix-IDE',
});

export interface GithubUser {
  login: string;
  avatarUrl: string;
}

// Validate the token + return the account login (null when no/invalid token).
export async function getUser(): Promise<GithubUser | null> {
  const token = await getToken();
  if (!token) return null;
  try {
    const res = await fetch('https://api.github.com/user', { headers: ghHeaders(token) });
    if (!res.ok) return null;
    const b = (await res.json()) as { login: string; avatar_url?: string };
    return { login: b.login, avatarUrl: b.avatar_url ?? '' };
  } catch {
    return null;
  }
}

export interface GithubRepo {
  name: string;
  fullName: string;
  cloneUrl: string;
  private: boolean;
  description: string;
  updatedAt: string;
}

// The signed-in user's repos, most-recently-updated first (up to 300).
export async function listRepos(): Promise<GithubRepo[]> {
  const token = await getToken();
  if (!token) return [];
  const out: GithubRepo[] = [];
  for (let page = 1; page <= 3; page++) {
    const res = await fetch(
      `https://api.github.com/user/repos?per_page=100&sort=updated&page=${page}`,
      { headers: ghHeaders(token) },
    );
    if (!res.ok) {
      if (page === 1) throw new Error(`GitHub API error (HTTP ${res.status})`);
      break;
    }
    const body = (await res.json()) as Array<{
      name: string;
      full_name: string;
      clone_url: string;
      private: boolean;
      description: string | null;
      updated_at: string;
    }>;
    for (const r of body) {
      out.push({
        name: r.name,
        fullName: r.full_name,
        cloneUrl: r.clone_url,
        private: r.private,
        description: r.description ?? '',
        updatedAt: r.updated_at,
      });
    }
    if (body.length < 100) break;
  }
  return out;
}

// Connect: store + validate. Clears the token again if it doesn't authenticate.
export async function connect(token: string): Promise<{ ok: boolean; login?: string; error?: string }> {
  await setToken(token);
  const user = await getUser();
  if (!user) {
    await clearToken();
    return { ok: false, error: 'That token did not authenticate. Check it has the "repo" scope.' };
  }
  return { ok: true, login: user.login };
}
