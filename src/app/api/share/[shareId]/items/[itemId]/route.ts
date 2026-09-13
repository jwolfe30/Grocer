import { NextResponse } from "next/server";
import { setSharedItemChecked } from "@/lib/list-store";
import { shareCheckSchema } from "@/lib/schemas";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ shareId: string; itemId: string }> },
) {
  const { shareId, itemId } = await context.params;
  const body = await request.json().catch(() => ({}));
  const parsed = shareCheckSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const result = setSharedItemChecked(shareId, itemId, parsed.data.checked);
  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: 404 });
  }

  return NextResponse.json({
    list: {
      id: result.id,
      name: result.name,
      shareId: result.shareId,
      items: result.items.map((item) => ({
        id: item.id,
        query: item.query,
        quantity: item.quantity,
        notes: item.notes,
        checked: Boolean(item.checked),
      })),
      updatedAt: result.updatedAt,
    },
  });
}
