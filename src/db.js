/**
 * Database layer for routine-cli
 * SQLite schema per MVP_SPEC.md Section 9
 * Uses sql.js (pure JavaScript SQLite)
 */

import initSqlJs from 'sql.js';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname } from 'path';

const SCHEMA_VERSION = 1;

const SCHEMA = `
-- routines table
CREATE TABLE IF NOT EXISTS routines (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  tz TEXT NOT NULL,
  rule TEXT NOT NULL,
  created_at TEXT NOT NULL,
  archived_at TEXT NULL
);

CREATE INDEX IF NOT EXISTS idx_routines_name ON routines(name);

-- sessions table
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  routine_id TEXT NOT NULL REFERENCES routines(id),
  start_ts TEXT NOT NULL,
  end_ts TEXT NULL,
  note TEXT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT NULL,
  source_provider TEXT NULL,
  source_key TEXT NULL
);

CREATE INDEX IF NOT EXISTS idx_sessions_routine_start ON sessions(routine_id, start_ts);

-- session_events table (pause/resume)
CREATE TABLE IF NOT EXISTS session_events (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES sessions(id),
  type TEXT NOT NULL,
  ts TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_session_events_session_ts ON session_events(session_id, ts);

-- session_tags table
CREATE TABLE IF NOT EXISTS session_tags (
  session_id TEXT NOT NULL REFERENCES sessions(id),
  tag TEXT NOT NULL,
  PRIMARY KEY (session_id, tag)
);

-- skips table
CREATE TABLE IF NOT EXISTS skips (
  id TEXT PRIMARY KEY,
  routine_id TEXT NOT NULL REFERENCES routines(id),
  date TEXT NOT NULL,
  reason TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE(routine_id, date)
);

-- schema version
CREATE TABLE IF NOT EXISTS schema_info (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`;

let _SQL = null;
let _db = null;
let _dbPath = null;

/**
 * Initialize SQL.js
 */
async function initSQL() {
  if (!_SQL) {
    _SQL = await initSqlJs();
  }
  return _SQL;
}

/**
 * Database wrapper with better-sqlite3-like API
 */
class DatabaseWrapper {
  constructor(sqlDb, dbPath) {
    this.sqlDb = sqlDb;
    this.dbPath = dbPath;
  }

  prepare(sql) {
    return new StatementWrapper(this.sqlDb, sql, this.dbPath);
  }

  exec(sql) {
    this.sqlDb.run(sql);
    this._save();
  }

  pragma(sql) {
    // sql.js doesn't support all pragmas, ignore for now
  }

  close() {
    this._save();
    this.sqlDb.close();
  }

  _save() {
    if (this.dbPath) {
      const data = this.sqlDb.export();
      const buffer = Buffer.from(data);
      const dir = dirname(this.dbPath);
      if (dir && dir !== '.' && !existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }
      writeFileSync(this.dbPath, buffer);
    }
  }
}

/**
 * Statement wrapper with better-sqlite3-like API
 */
class StatementWrapper {
  constructor(sqlDb, sql, dbPath) {
    this.sqlDb = sqlDb;
    this.sql = sql;
    this.dbPath = dbPath;
  }

  run(...params) {
    this.sqlDb.run(this.sql, params);
    this._save();
    return { changes: this.sqlDb.getRowsModified() };
  }

  get(...params) {
    const stmt = this.sqlDb.prepare(this.sql);
    stmt.bind(params);
    if (stmt.step()) {
      const row = stmt.getAsObject();
      stmt.free();
      return row;
    }
    stmt.free();
    return undefined;
  }

  all(...params) {
    const results = [];
    const stmt = this.sqlDb.prepare(this.sql);
    stmt.bind(params);
    while (stmt.step()) {
      results.push(stmt.getAsObject());
    }
    stmt.free();
    return results;
  }

  _save() {
    if (this.dbPath) {
      const data = this.sqlDb.export();
      const buffer = Buffer.from(data);
      const dir = dirname(this.dbPath);
      if (dir && dir !== '.' && !existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }
      writeFileSync(this.dbPath, buffer);
    }
  }
}

/**
 * Initialize and return database connection
 * @param {string} dbPath - Path to SQLite database
 * @returns {Promise<DatabaseWrapper>}
 */
export async function initDb(dbPath) {
  const SQL = await initSQL();
  
  // Ensure directory exists
  const dir = dirname(dbPath);
  if (dir && dir !== '.' && !existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  let sqlDb;
  if (existsSync(dbPath)) {
    const buffer = readFileSync(dbPath);
    sqlDb = new SQL.Database(buffer);
  } else {
    sqlDb = new SQL.Database();
  }
  
  const db = new DatabaseWrapper(sqlDb, dbPath);
  
  // Initialize schema
  db.exec(SCHEMA);
  db.exec(`INSERT OR REPLACE INTO schema_info (key, value) VALUES ('version', '${SCHEMA_VERSION}')`);
  
  return db;
}

/**
 * Get database instance (singleton pattern for CLI)
 */
export async function getDb(dbPath) {
  if (!_db || _dbPath !== dbPath) {
    _db = await initDb(dbPath);
    _dbPath = dbPath;
  }
  return _db;
}

export function closeDb() {
  if (_db) {
    _db.close();
    _db = null;
    _dbPath = null;
  }
}
