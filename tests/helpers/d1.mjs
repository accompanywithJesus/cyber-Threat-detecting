// Minimal D1 implementation backed by Node's built-in SQLite, covering the
// surface drizzle-orm/d1 actually calls: prepare/bind/all/run/raw and batch.
// Real SQL runs, so schema errors and constraint violations surface in tests
// the same way they would against a live D1 binding.
import { DatabaseSync } from "node:sqlite";

// node:sqlite only accepts null | number | bigint | string | Uint8Array.
function coerce(value) {
  if (typeof value === "boolean") return value ? 1 : 0;
  if (value === undefined) return null;
  return value;
}

class D1Statement {
  constructor(db, sql, params = []) {
    this.db = db;
    this.sql = sql;
    this.params = params;
  }

  bind(...params) {
    return new D1Statement(this.db, this.sql, params.map(coerce));
  }

  #exec() {
    const stmt = this.db.prepare(this.sql);
    // `all()` throws on statements that return no rows; fall back to `run()`.
    try {
      return { results: stmt.all(...this.params), meta: {} };
    } catch (error) {
      if (!/does not return data|no result|not return rows/i.test(String(error?.message))) {
        const info = stmt.run(...this.params);
        return { results: [], meta: { changes: Number(info.changes ?? 0), last_row_id: Number(info.lastInsertRowid ?? 0) } };
      }
      throw error;
    }
  }

  async all() {
    const { results, meta } = this.#exec();
    return { results, success: true, meta };
  }

  async run() {
    const { results, meta } = this.#exec();
    return { results, success: true, meta };
  }

  async first(column) {
    const { results } = this.#exec();
    const row = results[0];
    if (!row) return null;
    return column ? row[column] : row;
  }

  async raw() {
    const { results } = this.#exec();
    return results.map((row) => Object.values(row));
  }
}

export function createD1(schemaSql = "") {
  const db = new DatabaseSync(":memory:");
  if (schemaSql) db.exec(schemaSql);

  return {
    prepare: (sql) => new D1Statement(db, sql),
    async batch(statements) {
      const out = [];
      db.exec("BEGIN");
      try {
        for (const statement of statements) out.push(await statement.run());
        db.exec("COMMIT");
      } catch (error) {
        db.exec("ROLLBACK");
        throw error;
      }
      return out;
    },
    async exec(sql) {
      db.exec(sql);
      return { count: 0, duration: 0 };
    },
    // test-only escape hatch
    _query: (sql) => db.prepare(sql).all(),
  };
}
