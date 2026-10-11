/**
 * Isomorphic Cloudflare D1 adapter.
 * Uses native Cloudflare D1 in Workers runtime, or built-in node:sqlite in Node 22 / tests.
 */
import type { D1Database, D1PreparedStatement, D1Result, D1ExecResult } from './types.js';

class SqliteD1Statement implements D1PreparedStatement {
  private query: string;
  private params: any[] = [];
  private db: any;

  constructor(db: any, query: string, params: any[] = []) {
    this.db = db;
    this.query = query;
    this.params = params;
  }

  bind(...values: unknown[]): D1PreparedStatement {
    return new SqliteD1Statement(this.db, this.query, values);
  }

  async first<T = unknown>(colName?: string): Promise<T | null> {
    try {
      const stmt = this.db.prepare(this.query);
      const row = stmt.get(...this.params) as Record<string, any> | undefined;
      if (!row) return null;
      if (colName) return (row[colName] ?? null) as T;
      return row as T;
    } catch (err: any) {
      console.error('D1Statement.first error in query:', this.query, err);
      throw err;
    }
  }

  async run(): Promise<{ success: boolean; meta: { changes: number; last_row_id: number } }> {
    try {
      const stmt = this.db.prepare(this.query);
      const result = stmt.run(...this.params);
      return {
        success: true,
        meta: {
          changes: result.changes,
          last_row_id: Number(result.lastInsertRowid || 0),
        },
      };
    } catch (err: any) {
      console.error('D1Statement.run error in query:', this.query, err);
      throw err;
    }
  }

  async all<T = unknown>(): Promise<D1Result<T>> {
    try {
      const stmt = this.db.prepare(this.query);
      const rows = stmt.all(...this.params) as T[];
      return {
        results: rows,
        success: true,
        meta: { served_by: 'local-sqlite' },
      };
    } catch (err: any) {
      console.error('D1Statement.all error in query:', this.query, err);
      throw err;
    }
  }

  async raw<T = unknown>(): Promise<T[]> {
    try {
      const stmt = this.db.prepare(this.query);
      const rows = stmt.all(...this.params) as Record<string, any>[];
      return rows.map((r) => Object.values(r)) as unknown as T[];
    } catch (err: any) {
      console.error('D1Statement.raw error in query:', this.query, err);
      throw err;
    }
  }
}

export class SqliteD1Database implements D1Database {
  private db: any;

  constructor(dbInstance: any) {
    this.db = dbInstance;
  }

  prepare(query: string): D1PreparedStatement {
    return new SqliteD1Statement(this.db, query, []);
  }

  async batch(statements: D1PreparedStatement[]): Promise<D1Result[]> {
    const results: D1Result[] = [];
    this.db.exec('BEGIN TRANSACTION');
    try {
      for (const stmt of statements) {
        results.push(await stmt.all());
      }
      this.db.exec('COMMIT');
    } catch (err) {
      this.db.exec('ROLLBACK');
      throw err;
    }
    return results;
  }

  async exec(query: string): Promise<D1ExecResult> {
    const start = Date.now();
    this.db.exec(query);
    return {
      count: 1,
      duration: Date.now() - start,
    };
  }
}

/**
 * Creates a D1-compatible database instance using node:sqlite.
 * Supports ':memory:' or a file path.
 */
export async function createLocalD1Database(dbPath: string = ':memory:'): Promise<D1Database> {
  const { DatabaseSync } = await import('node:sqlite');
  const db = new DatabaseSync(dbPath);
  db.exec('PRAGMA foreign_keys = ON;');
  return new SqliteD1Database(db);
}
