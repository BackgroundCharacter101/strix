import { describe, it, expect, beforeEach } from 'vitest';
import { openDatabase, type SqlDatabase } from '../../db/sqljs-adapter.js';
import { initEncryptionKey, encrypt, decrypt } from '../../lib/crypto.js';

async function freshDb(): Promise<SqlDatabase> {
  const db = await openDatabase(':memory:');
  db.exec(`CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)`);
  return db;
}

describe('initEncryptionKey — input validation', () => {
  beforeEach(() => {
    delete process.env.ENCRYPTION_KEY;
  });

  it('accepts a valid 64-char hex env key', async () => {
    process.env.ENCRYPTION_KEY = 'a'.repeat(64);
    const db = await freshDb();
    expect(() => initEncryptionKey(db)).not.toThrow();
    // Round-trip a value to confirm the key actually works.
    const enc = encrypt('hello');
    expect(decrypt(enc.encrypted, enc.iv, enc.authTag)).toBe('hello');
  });

  it('throws on too-short env key (typo guard)', async () => {
    process.env.ENCRYPTION_KEY = 'abc';
    const db = await freshDb();
    expect(() => initEncryptionKey(db)).toThrow(/Invalid ENCRYPTION_KEY \(env\).+expected 64 hex chars/);
  });

  it('throws on too-long env key', async () => {
    process.env.ENCRYPTION_KEY = 'a'.repeat(80);
    const db = await freshDb();
    expect(() => initEncryptionKey(db)).toThrow(/Invalid ENCRYPTION_KEY \(env\)/);
  });

  it('throws on non-hex env key of correct length', async () => {
    process.env.ENCRYPTION_KEY = 'g'.repeat(64); // g is not hex
    const db = await freshDb();
    expect(() => initEncryptionKey(db)).toThrow(/Invalid ENCRYPTION_KEY \(env\)/);
  });

  it('still treats the placeholder as "not set" and falls through to DB / generation', async () => {
    process.env.ENCRYPTION_KEY = 'your-64-char-hex-key-here';
    const db = await freshDb();
    expect(() => initEncryptionKey(db)).not.toThrow();
    // Fell through to generation — DB now has a key.
    const row = db.prepare("SELECT value FROM settings WHERE key = 'encryption_key'").get() as { value: string };
    expect(row.value).toMatch(/^[0-9a-f]{64}$/);
  });

  it('throws on a corrupted DB-stored key', async () => {
    const db = await freshDb();
    db.prepare("INSERT INTO settings (key, value) VALUES ('encryption_key', ?)").run('not-hex');
    expect(() => initEncryptionKey(db)).toThrow(/Invalid ENCRYPTION_KEY \(db\)/);
  });

  it('generates a fresh key on a virgin DB and persists it', async () => {
    const db = await freshDb();
    initEncryptionKey(db);
    const row = db.prepare("SELECT value FROM settings WHERE key = 'encryption_key'").get() as { value: string };
    expect(row.value).toMatch(/^[0-9a-f]{64}$/);
  });
});
