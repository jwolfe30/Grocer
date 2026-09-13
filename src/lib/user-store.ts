import { createHash, randomBytes, randomUUID, scryptSync, timingSafeEqual } from "crypto";
import { initAppDb } from "./app-db";
import { badgeById } from "./badges";
import type {
  AlertPrefs,
  Badge,
  FrequentItem,
  PublicUser,
  SaleAlert,
  UserAccount,
} from "./account-types";

/**
 * Password hashing (MVP / production-acceptable for this phase):
 * - Algorithm: Node crypto scryptSync
 * - N (CPU/memory cost): 16384 (2^14) — Node default; OK for MVP; raise to 2^15+ later
 * - r: 8, p: 1, keylen: 32
 * - Salt: 16 random bytes (hex), stored as `salt:hash` hex pair
 *
 * Rate limiting: in-memory per-IP on /api/auth/login, /api/auth/register, and DELETE /api/account
 * (see src/lib/rate-limit.ts). Sessions: durable in SQLite (token → userId). Client still sends
 * Bearer token (localStorage); no httpOnly cookie path in this app yet.
 */

const SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const SCRYPT_KEYLEN = 32;

type UserRow = {
  id: string;
  email: string;
  password_hash: string;
  display_name: string;
  zip: string;
  avatar_url: string | null;
  points: number;
  badge_ids_json: string;
  frequent_items_json: string;
  alert_prefs_json: string;
  created_at: string;
};

type AlertRow = {
  id: string;
  user_id: string;
  query: string;
  store_name: string;
  title: string;
  detail: string;
  price_usd: number | null;
  created_at: string;
  read: number;
};

function nowIso() {
  return new Date().toISOString();
}

function hashPassword(password: string, salt?: string): string {
  const useSalt = salt ?? randomBytes(16).toString("hex");
  const hash = scryptSync(password, useSalt, SCRYPT_KEYLEN, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
  }).toString("hex");
  return `${useSalt}:${hash}`;
}

function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const next = scryptSync(password, salt, SCRYPT_KEYLEN, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
  });
  const prev = Buffer.from(hash, "hex");
  if (prev.length !== next.length) return false;
  return timingSafeEqual(prev, next);
}

function parseJson<T>(raw: string, fallback: T): T {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function rowToUser(row: UserRow): UserAccount {
  return {
    id: row.id,
    email: row.email,
    passwordHash: row.password_hash,
    displayName: row.display_name,
    zip: row.zip,
    avatarUrl: row.avatar_url,
    points: row.points,
    badgeIds: parseJson<string[]>(row.badge_ids_json, []),
    frequentItems: parseJson<FrequentItem[]>(row.frequent_items_json, []),
    alertPrefs: parseJson<AlertPrefs>(row.alert_prefs_json, { sales: true, coupons: true }),
    createdAt: row.created_at,
  };
}

function persistUser(user: UserAccount): void {
  const db = initAppDb();
  db.prepare(
    `
    INSERT INTO users (
      id, email, password_hash, display_name, zip, avatar_url, points,
      badge_ids_json, frequent_items_json, alert_prefs_json, created_at
    ) VALUES (
      @id, @email, @password_hash, @display_name, @zip, @avatar_url, @points,
      @badge_ids_json, @frequent_items_json, @alert_prefs_json, @created_at
    )
    ON CONFLICT(id) DO UPDATE SET
      email = excluded.email,
      password_hash = excluded.password_hash,
      display_name = excluded.display_name,
      zip = excluded.zip,
      avatar_url = excluded.avatar_url,
      points = excluded.points,
      badge_ids_json = excluded.badge_ids_json,
      frequent_items_json = excluded.frequent_items_json,
      alert_prefs_json = excluded.alert_prefs_json
  `,
  ).run({
    id: user.id,
    email: user.email,
    password_hash: user.passwordHash,
    display_name: user.displayName,
    zip: user.zip,
    avatar_url: user.avatarUrl ?? null,
    points: user.points,
    badge_ids_json: JSON.stringify(user.badgeIds),
    frequent_items_json: JSON.stringify(user.frequentItems),
    alert_prefs_json: JSON.stringify(user.alertPrefs),
    created_at: user.createdAt,
  });
}

function findUserByEmail(email: string): UserAccount | undefined {
  const db = initAppDb();
  const row = db
    .prepare(`SELECT * FROM users WHERE email = ?`)
    .get(email) as UserRow | undefined;
  return row ? rowToUser(row) : undefined;
}

export function toPublicUser(user: UserAccount): PublicUser {
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    zip: user.zip,
    avatarUrl: user.avatarUrl ?? null,
    points: user.points,
    badges: user.badgeIds
      .map((id) => {
        const def = badgeById(id);
        if (!def) return null;
        return { ...def, earnedAt: user.createdAt } as Badge;
      })
      .filter((b): b is Badge => b != null),
    frequentItems: user.frequentItems,
    alertPrefs: user.alertPrefs,
    createdAt: user.createdAt,
  };
}

const DEV_EMAIL = "dev@grocer.local";

/** Instant sign-in for UI testing (no password). */
export function ensureDevUser(zip = "98042"): { user: PublicUser; token: string } {
  let user = findUserByEmail(DEV_EMAIL);
  if (!user) {
    user = {
      id: randomUUID(),
      email: DEV_EMAIL,
      passwordHash: hashPassword("dev-toggle-only"),
      displayName: "Dev Tester",
      zip: zip.trim() || "98042",
      avatarUrl: null,
      points: 40,
      badgeIds: [],
      frequentItems: [],
      alertPrefs: { sales: true, coupons: true },
      createdAt: nowIso(),
    };
    persistUser(user);
  }
  return { user: toPublicUser(user), token: createSession(user.id) };
}

export function setAvatarUrl(
  user: UserAccount,
  avatarUrl: string | null,
): UserAccount {
  user.avatarUrl = avatarUrl;
  persistUser(user);
  return user;
}

export function registerUser(input: {
  email: string;
  password: string;
  displayName?: string;
  zip?: string;
}): { user: PublicUser; token: string } | { error: string } {
  const email = input.email.trim().toLowerCase();
  if (!email.includes("@") || input.password.length < 6) {
    return { error: "Use a valid email and a password of at least 6 characters." };
  }
  if (findUserByEmail(email)) {
    return { error: "An account with that email already exists." };
  }

  const user: UserAccount = {
    id: randomUUID(),
    email,
    passwordHash: hashPassword(input.password),
    displayName: input.displayName?.trim() || email.split("@")[0],
    zip: input.zip?.trim() || "98042",
    avatarUrl: null,
    points: 0,
    badgeIds: [],
    frequentItems: [],
    alertPrefs: { sales: true, coupons: true },
    createdAt: nowIso(),
  };
  persistUser(user);
  const token = createSession(user.id);
  return { user: toPublicUser(user), token };
}

export function loginUser(input: {
  email: string;
  password: string;
}): { user: PublicUser; token: string } | { error: string } {
  const email = input.email.trim().toLowerCase();
  const user = findUserByEmail(email);
  if (!user || !verifyPassword(input.password, user.passwordHash)) {
    return { error: "Email or password is incorrect." };
  }
  return { user: toPublicUser(user), token: createSession(user.id) };
}

function createSession(userId: string): string {
  const token = createHash("sha256").update(randomBytes(32)).digest("hex");
  const db = initAppDb();
  db.prepare(
    `INSERT INTO sessions (token, user_id, created_at) VALUES (?, ?, ?)`,
  ).run(token, userId, nowIso());
  return token;
}

export function logoutSession(token: string) {
  const db = initAppDb();
  db.prepare(`DELETE FROM sessions WHERE token = ?`).run(token);
}

/** Delete sale alerts, sessions, and the user row (call after lists/receipts cleanup). */
export function deleteUserRecord(userId: string): boolean {
  const user = getUser(userId);
  if (!user) return false;
  const db = initAppDb();
  db.prepare(`DELETE FROM sale_alerts WHERE user_id = ?`).run(userId);
  db.prepare(`DELETE FROM sessions WHERE user_id = ?`).run(userId);
  db.prepare(`DELETE FROM users WHERE id = ?`).run(userId);
  return true;
}

export function userFromToken(token: string | null | undefined): UserAccount | undefined {
  if (!token) return undefined;
  const db = initAppDb();
  const session = db
    .prepare(`SELECT user_id FROM sessions WHERE token = ?`)
    .get(token) as { user_id: string } | undefined;
  if (!session) return undefined;
  return getUser(session.user_id);
}

export function getUser(id: string): UserAccount | undefined {
  const db = initAppDb();
  const row = db.prepare(`SELECT * FROM users WHERE id = ?`).get(id) as UserRow | undefined;
  return row ? rowToUser(row) : undefined;
}

export function saveUser(user: UserAccount) {
  persistUser(user);
}

export function awardPoints(user: UserAccount, points: number): UserAccount {
  user.points += points;
  if (user.points >= 100 && !user.badgeIds.includes("community-carrot")) {
    user.badgeIds.push("community-carrot");
  }
  persistUser(user);
  return user;
}

export function awardBadge(user: UserAccount, badgeId: string): boolean {
  if (user.badgeIds.includes(badgeId)) return false;
  if (!badgeById(badgeId)) return false;
  user.badgeIds.push(badgeId);
  persistUser(user);
  return true;
}

export function setFrequentItems(user: UserAccount, items: FrequentItem[]): UserAccount {
  user.frequentItems = items;
  if (items.length >= 5) awardBadge(user, "staple-steward");
  persistUser(user);
  return user;
}

export function setAlertPrefs(user: UserAccount, prefs: AlertPrefs): UserAccount {
  user.alertPrefs = prefs;
  if (prefs.sales || prefs.coupons) awardBadge(user, "two-bag-tango");
  persistUser(user);
  return user;
}

function rowToAlert(row: AlertRow): SaleAlert {
  return {
    id: row.id,
    userId: row.user_id,
    query: row.query,
    storeName: row.store_name,
    title: row.title,
    detail: row.detail,
    priceUsd: row.price_usd ?? undefined,
    createdAt: row.created_at,
    read: Boolean(row.read),
  };
}

export function listAlerts(userId: string): SaleAlert[] {
  const db = initAppDb();
  const rows = db
    .prepare(
      `SELECT * FROM sale_alerts WHERE user_id = ? ORDER BY created_at DESC LIMIT 50`,
    )
    .all(userId) as AlertRow[];
  return rows.map(rowToAlert);
}

export function pushAlert(alert: Omit<SaleAlert, "id" | "createdAt" | "read">) {
  const row: SaleAlert = {
    ...alert,
    id: randomUUID(),
    createdAt: nowIso(),
    read: false,
  };
  const db = initAppDb();
  const tx = db.transaction(() => {
    db.prepare(
      `
      INSERT INTO sale_alerts (
        id, user_id, query, store_name, title, detail, price_usd, created_at, read
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)
    `,
    ).run(
      row.id,
      row.userId,
      row.query,
      row.storeName,
      row.title,
      row.detail,
      row.priceUsd ?? null,
      row.createdAt,
    );
    // Keep newest 50 per user (materialize ids — SQLite dislikes DELETE+same-table LIMIT subquery)
    const keep = db
      .prepare(
        `SELECT id FROM sale_alerts WHERE user_id = ? ORDER BY created_at DESC LIMIT 50`,
      )
      .all(row.userId) as Array<{ id: string }>;
    if (keep.length) {
      const placeholders = keep.map(() => "?").join(",");
      db.prepare(
        `DELETE FROM sale_alerts WHERE user_id = ? AND id NOT IN (${placeholders})`,
      ).run(row.userId, ...keep.map((k) => k.id));
    }
  });
  tx();
  return row;
}

export function seedDemoAlerts(user: UserAccount) {
  if (!user.alertPrefs.sales && !user.alertPrefs.coupons) return;
  const existing = listAlerts(user.id);
  if (existing.length) return;
  for (const item of user.frequentItems.slice(0, 3)) {
    if (user.alertPrefs.sales) {
      pushAlert({
        userId: user.id,
        query: item.query,
        storeName: "Harbor Fresh Co-op",
        title: `${item.query} is on sale`,
        detail: "A nearby match dropped in price — check before your next trip.",
        priceUsd: undefined,
      });
    }
    if (user.alertPrefs.coupons) {
      pushAlert({
        userId: user.id,
        query: item.query,
        storeName: "Green Valley Market",
        title: `Coupon spotted for ${item.query}`,
        detail: "A digital/clip coupon may apply. Still free to browse — no premium unlock.",
      });
    }
  }
}

export function parseBearer(request: Request): string | null {
  const header = request.headers.get("authorization");
  if (!header?.toLowerCase().startsWith("bearer ")) return null;
  return header.slice(7).trim() || null;
}
