import { NextResponse } from "next/server";
import { getListByShareId } from "@/lib/list-store";

export async function GET(
  _request: Request,
  context: { params: Promise<{ shareId: string }> },
) {
  const { shareId } = await context.params;
  const list = getListByShareId(shareId);
  if (!list) {
    return NextResponse.json({ error: "Shared list not found." }, { status: 404 });
  }

  return NextResponse.json({
    list: {
      id: list.id,
      name: list.name,
      zip: list.zip,
      shareId: list.shareId,
      items: list.items.map((item) => ({
        id: item.id,
        query: item.query,
        quantity: item.quantity,
        notes: item.notes,
        checked: Boolean(item.checked),
      })),
      updatedAt: list.updatedAt,
    },
    permissions: {
      canCheck: true,
      canEdit: false,
      canDelete: false,
      canClear: false,
    },
  });
}
