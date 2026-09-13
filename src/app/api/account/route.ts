import { NextResponse } from "next/server";
import { z } from "zod";
import { randomUUID } from "crypto";
import {
  deleteUserRecord,
  listAlerts,
  parseBearer,
  seedDemoAlerts,
  setAlertPrefs,
  setAvatarUrl,
  setFrequentItems,
  toPublicUser,
  userFromToken,
} from "@/lib/user-store";
import { deleteReceiptsForUser, listReceiptsForUser, spendingSummary } from "@/lib/receipt-store";
import { badgeById } from "@/lib/badges";
import type { Badge } from "@/lib/account-types";
import { deleteListsForUser, ensureUserCloudList, listsForUser } from "@/lib/list-store";
import { initAppDb } from "@/lib/app-db";
import { clientIp, rateLimit } from "@/lib/rate-limit";

export async function GET(request: Request) {
  const user = userFromToken(parseBearer(request));
  if (!user) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  seedDemoAlerts(user);
  const publicUser = toPublicUser(user);
  publicUser.badges = user.badgeIds
    .map((id) => {
      const def = badgeById(id);
      if (!def) return null;
      return { ...def, earnedAt: user.createdAt } as Badge;
    })
    .filter((b): b is Badge => b != null);

  return NextResponse.json({
    user: publicUser,
    alerts: listAlerts(user.id),
    receipts: listReceiptsForUser(user.id),
    spending: spendingSummary(user.id),
    lists: listsForUser(user.id),
    list: listsForUser(user.id)[0] ?? ensureUserCloudList(user.id, user.zip),
    sync: "cloud" as const,
  });
}

const patchSchema = z.object({
  frequentItems: z
    .array(
      z.object({
        id: z.string().optional(),
        query: z.string().min(1).max(120),
        quantity: z.coerce.number().int().min(1).max(99),
        notes: z.string().max(240).optional(),
      }),
    )
    .optional(),
  alertPrefs: z
    .object({
      sales: z.boolean(),
      coupons: z.boolean(),
    })
    .optional(),
  avatarUrl: z.union([z.string().max(800_000), z.null()]).optional(),
});

export async function PATCH(request: Request) {
  const user = userFromToken(parseBearer(request));
  if (!user) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  if (parsed.data.frequentItems) {
    setFrequentItems(
      user,
      parsed.data.frequentItems.map((item) => ({
        id: item.id || randomUUID(),
        query: item.query.trim(),
        quantity: item.quantity,
        notes: item.notes,
        createdAt: new Date().toISOString(),
      })),
    );
  }
  if (parsed.data.alertPrefs) {
    setAlertPrefs(user, parsed.data.alertPrefs);
    seedDemoAlerts(user);
  }
  if (parsed.data.avatarUrl !== undefined) {
    const next = parsed.data.avatarUrl;
    if (
      next !== null &&
      !next.startsWith("data:image/") &&
      !/^https?:\/\//i.test(next)
    ) {
      return NextResponse.json({ error: "Invalid avatar image." }, { status: 400 });
    }
    setAvatarUrl(user, next);
  }

  return NextResponse.json({
    user: toPublicUser(user),
    alerts: listAlerts(user.id),
  });
}

/**
 * DELETE /api/account
 * Auth: Bearer session token (same as other account routes).
 * Effect: removes the signed-in user, sessions, owned lists, receipts, crowd
 * observations for that user, and sale alerts. Missing/invalid token → 401.
 * Rate limit: 10/min per IP (same class as auth).
 */
export async function DELETE(request: Request) {
  const limited = rateLimit(`auth:account-delete:${clientIp(request)}`, {
    limit: 10,
    windowMs: 60_000,
  });
  if (!limited.ok) {
    return NextResponse.json(
      { error: "Too many account deletion attempts. Try again shortly." },
      { status: 429, headers: { "Retry-After": String(limited.retryAfterSec) } },
    );
  }

  const user = userFromToken(parseBearer(request));
  if (!user) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }

  const db = initAppDb();
  const tx = db.transaction(() => {
    deleteReceiptsForUser(user.id);
    deleteListsForUser(user.id);
    deleteUserRecord(user.id);
  });
  tx();

  return NextResponse.json({ ok: true, deleted: true });
}
