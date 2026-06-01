// A small better-sqlite3-compatible adapter backed by sql.js (SQLite compiled
// to WebAssembly). Pure JS — no native module — so the server bundles cleanly
// into Strix.exe and runs under Electron's Node with no ABI/rebuild headaches.
//
// It replicates only the surface FreeLLMAPI actually uses:
//   db.prepare(sql).{get,all,run}(...positionalParams)
//   db.exec(sql)            (multi-statement DDL)
//   db.pragma(str)          (foreign_keys; journal_mode is a no-op for WASM)
//   db.transaction(fn)      (returns a function; BEGIN/COMMIT/ROLLBACK, nestable)
//   db.close()
// run() returns { changes, lastInsertRowid } like better-sqlite3.
//
// sql.js holds the DB in memory; after each top-level write we persist the whole
// DB file to disk (the DB is tiny, so this is fine).
import fs from 'fs';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

// sql.js types are loose; we only use a small, well-known subset.
type SqlJsStatement = {
  bind(params: unknown[]): boolean;
  step(): boolean;
  getAsObject(): Record<string, unknown>;
  free(): boolean;
};
type SqlJsDatabase = {
  prepare(sql: string): SqlJsStatement;
  exec(sql: string): { columns: string[]; values: unknown[][] }[];
  run(sql: string): void;
  getRowsModified(): number;
  export(): Uint8Array;
  close(): void;
};

export interface RunResult {
  changes: number;
  lastInsertRowid: number | bigint;
}

export class Statement {
  constructor(
    private readonly owner: SqlDatabase,
    private readonly sql: string,
  ) {}

  private get raw(): SqlJsDatabase {
    return this.owner.raw;
  }

  // Returns `unknown` like better-sqlite3's Statement.get(), so existing
  // `.get() as SomeRow` casts at call sites keep working unchanged.
  get(...params: unknown[]): unknown {
    const stmt = this.raw.prepare(this.sql);
    try {
      stmt.bind(params);
      return stmt.step() ? stmt.getAsObject() : undefined;
    } finally {
      stmt.free();
    }
  }

  all(...params: unknown[]): unknown[] {
    const stmt = this.raw.prepare(this.sql);
    const rows: Record<string, unknown>[] = [];
    try {
      stmt.bind(params);
      while (stmt.step()) rows.push(stmt.getAsObject());
      return rows;
    } finally {
      stmt.free();
    }
  }

  run(...params: unknown[]): RunResult {
    const stmt = this.raw.prepare(this.sql);
    try {
      stmt.bind(params);
      stmt.step();
    } finally {
      stmt.free();
    }
    const changes = this.raw.getRowsModified();
    const res = this.raw.exec('SELECT last_insert_rowid() AS id');
    const lastInsertRowid = res.length ? Number(res[0].values[0][0]) : 0;
    this.owner.persistIfTopLevel();
    return { changes, lastInsertRowid };
  }
}

export class SqlDatabase {
  private txDepth = 0;

  constructor(
    public readonly raw: SqlJsDatabase,
    private readonly filePath: string,
  ) {}

  prepare(sql: string): Statement {
    return new Statement(this, sql);
  }

  exec(sql: string): this {
    this.raw.exec(sql);
    this.persistIfTopLevel();
    return this;
  }

  // better-sqlite3 pragma(): we only need foreign_keys. WAL is meaningless for an
  // in-memory WASM DB, so it's a no-op.
  pragma(source: string): void {
    if (/journal_mode/i.test(source)) return;
    this.raw.exec(`PRAGMA ${source}`);
  }

  // Returns a function that runs `fn` inside a transaction (nestable via
  // savepoints). Matches better-sqlite3's db.transaction(fn) shape.
  transaction<A extends unknown[], R>(fn: (...args: A) => R): (...args: A) => R {
    return (...args: A): R => {
      const top = this.txDepth === 0;
      const savepoint = `sp_${this.txDepth}`;
      this.raw.exec(top ? 'BEGIN' : `SAVEPOINT ${savepoint}`);
      this.txDepth++;
      try {
        const result = fn(...args);
        this.txDepth--;
        this.raw.exec(top ? 'COMMIT' : `RELEASE ${savepoint}`);
        if (top) this.persist();
        return result;
      } catch (err) {
        this.txDepth--;
        this.raw.exec(top ? 'ROLLBACK' : `ROLLBACK TO ${savepoint}`);
        throw err;
      }
    };
  }

  // Persist only when not inside a transaction (committing persists once).
  persistIfTopLevel(): void {
    if (this.txDepth === 0) this.persist();
  }

  private persist(): void {
    if (this.filePath === ':memory:') return;
    fs.writeFileSync(this.filePath, Buffer.from(this.raw.export()));
  }

  close(): void {
    this.persist();
    this.raw.close();
  }
}

// Async because sql.js loads its WebAssembly asynchronously. Reads an existing
// DB file if present (else starts empty).
export async function openDatabase(filePath: string): Promise<SqlDatabase> {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const initSqlJs = require('sql.js') as (config?: {
    locateFile?: (file: string) => string;
  }) => Promise<{ Database: new (data?: Uint8Array) => SqlJsDatabase }>;

  const SQL = await initSqlJs({
    locateFile: () => require.resolve('sql.js/dist/sql-wasm.wasm'),
  });

  let bytes: Uint8Array | undefined;
  if (filePath !== ':memory:' && fs.existsSync(filePath)) {
    bytes = fs.readFileSync(filePath);
  }
  const raw = bytes ? new SQL.Database(bytes) : new SQL.Database();
  return new SqlDatabase(raw, filePath);
}
