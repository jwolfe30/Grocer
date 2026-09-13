import { NextResponse } from "next/server";
import { z } from "zod";
import { createReceipt, listReceiptsForUser, spendingSummary } from "@/lib/receipt-store";
import { parseBearer, toPublicUser, userFromToken } from "@/lib/user-store";
import { badgeById } from "@/lib/badges";
import type { Badge } from "@/lib/account-types";

const imageMetaSchema = z.object({
  name: z.string().min(1).max(200),
  mimeType: z.string().min(3).max(120),
  sizeBytes: z.number().int().nonnegative().max(25_000_000),
  capturedAt: z.string().optional(),
});

const receiptSchema = z
  .object({
    storeName: z.string().min(1).max(120),
    zip: z.string().min(3).max(12).optional(),
    purchasedAt: z.string().optional(),
    rawText: z.string().max(20_000).optional().default(""),
    imageMeta: imageMetaSchema.optional(),
  })
  .refine((v) => Boolean(v.rawText?.trim()) || Boolean(v.imageMeta), {
    message: "Paste receipt text or attach a photo.",
  });

export async function GET(request: Request) {
  const user = userFromToken(parseBearer(request));
  if (!user) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  return NextResponse.json({
    receipts: listReceiptsForUser(user.id),
    spending: spendingSummary(user.id),
  });
}

export async function POST(request: Request) {
  const user = userFromToken(parseBearer(request));
  if (!user) return NextResponse.json({ error: "Sign in required." }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const parsed = receiptSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const result = createReceipt({
    userId: user.id,
    storeName: parsed.data.storeName,
    zip: parsed.data.zip,
    purchasedAt: parsed.data.purchasedAt,
    rawText: parsed.data.rawText,
    imageMeta: parsed.data.imageMeta,
  });

  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  const refreshed = userFromToken(parseBearer(request)) ?? user;
  const badges = refreshed.badgeIds
    .map((id) => {
      const def = badgeById(id);
      if (!def) return null;
      return { ...def, earnedAt: refreshed.createdAt } as Badge;
    })
    .filter((b): b is Badge => b != null);

  const photoOnly = Boolean(result.imageMeta) && result.lines.length === 0;
  return NextResponse.json(
    {
      receipt: result,
      user: { ...toPublicUser(refreshed), badges },
      spending: spendingSummary(refreshed.id),
      message: photoOnly
        ? "Receipt photo saved (metadata only — OCR is a follow-up). Paste priced lines anytime to contribute crowd prices."
        : "Receipt saved. Your spending history updated, and those prices now help other shoppers as crowd estimates.",
    },
    { status: 201 },
  );
}
