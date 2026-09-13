/**
 * Durable app DB for lists, users, sessions, receipts (SQLite).
 * Separate from price cache (data/prices.sqlite) — default path data/app.sqlite.
 */

import { existsSync, mkdirSync } from "node:fs";
import { dirname, isAbsolute, join } from "node:path";
import Database from "better-sqlite3";

type SqliteDb = Database.Database;

let dbSingleton: SqliteDb | null = null;

function defaultDbPath(): string {
  const fromEnv = process.env.APP_DB_PATH?.trim();
  if (fromEnv) {
    return isAbsolute(fromEnv) ? fromEnv : join(process.cwd(), fromEnv);
  }
  return join(process.cwd(), "data", "app.sqlite");
}

function ensureSchema(db: SqliteDb) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      display_name TEXT NOT NULL,
      zip TEXT NOT NULL,
      avatar_url TEXT,
      points INTEGER NOT NULL DEFAULT 0,
      badge_ids_json TEXT NOT NULL DEFAULT '[]',
      frequent_items_json TEXT NOT NULL DEFAULT '[]',
      alert_prefs_json TEXT NOT NULL DEFAULT '{"sales":true,"coupons":true}',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);

    CREATE TABLE IF NOT EXISTS lists (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      zip TEXT NOT NULL,
      prefer_local INTEGER NOT NULL DEFAULT 0,
      prefer_organic INTEGER NOT NULL DEFAULT 0,
      prefer_kosher INTEGER NOT NULL DEFAULT 0,
      savings_threshold_usd REAL NOT NULL DEFAULT 8,
      user_id TEXT,
      share_id TEXT,
      items_json TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_lists_share_id
      ON lists(share_id) WHERE share_id IS NOT NULL;
    CREATE INDEX IF NOT EXISTS idx_lists_user ON lists(user_id);

    CREATE TABLE IF NOT EXISTS receipts (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      store_id TEXT,
      store_name TEXT NOT NULL,
      zip TEXT NOT NULL,
      purchased_at TEXT NOT NULL,
      uploaded_at TEXT NOT NULL,
      raw_text TEXT NOT NULL,
      lines_json TEXT NOT NULL,
      total_usd REAL NOT NULL,
      points_awarded INTEGER NOT NULL DEFAULT 0,
      badges_awarded_json TEXT NOT NULL DEFAULT '[]',
      image_meta_json TEXT,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_receipts_user ON receipts(user_id);

    CREATE TABLE IF NOT EXISTS crowd_observations (
      id TEXT PRIMARY KEY,
      store_id TEXT NOT NULL,
      store_name TEXT NOT NULL,
      zip TEXT NOT NULL,
      name TEXT NOT NULL,
      product_id TEXT NOT NULL,
      price_usd REAL NOT NULL,
      quantity INTEGER NOT NULL DEFAULT 1,
      observed_at TEXT NOT NULL,
      source TEXT NOT NULL DEFAULT 'receipt',
      receipt_id TEXT NOT NULL,
      user_id TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_crowd_zip ON crowd_observations(zip);
    CREATE INDEX IF NOT EXISTS idx_crowd_user ON crowd_observations(user_id);
    CREATE INDEX IF NOT EXISTS idx_crowd_receipt ON crowd_observations(receipt_id);

    CREATE TABLE IF NOT EXISTS sale_alerts (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      query TEXT NOT NULL,
      store_name TEXT NOT NULL,
      title TEXT NOT NULL,
      detail TEXT NOT NULL,
      price_usd REAL,
      created_at TEXT NOT NULL,
      read INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_alerts_user ON sale_alerts(user_id);
  `);

  // Lightweight migrations for existing DBs (Phase 1 receipt photo path).
  const receiptCols = db
    .prepare(`PRAGMA table_info(receipts)`)
    .all() as Array<{ name: string }>;
  if (!receiptCols.some((c) => c.name === "image_meta_json")) {
    db.exec(`ALTER TABLE receipts ADD COLUMN image_meta_json TEXT`);
  }
}

export function initAppDb(path = defaultDbPath()): SqliteDb {
  if (dbSingleton) return dbSingleton;
  const dir = dirname(path);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const db = new Database(path);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  ensureSchema(db);
  dbSingleton = db;
  return db;
}

/** Close singleton (tests / scripts). */
export function closeAppDb() {
  if (dbSingleton) {
    dbSingleton.close();
    dbSingleton = null;
  }
}

export function appDbPath(): string {
  return defaultDbPath();
}

export function appDbStats(): {
  users: number;
  sessions: number;
  lists: number;
  receipts: number;
  crowdObservations: number;
  saleAlerts: number;
  path: string;
} {
  const path = defaultDbPath();
  const db = initAppDb(path);
  const count = (table: string) =>
    (db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number }).n;
  return {
    users: count("users"),
    sessions: count("sessions"),
    lists: count("lists"),
    receipts: count("receipts"),
    crowdObservations: count("crowd_observations"),
    saleAlerts: count("sale_alerts"),
    path,
  };
}
