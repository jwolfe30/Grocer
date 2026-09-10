import { NextResponse } from "next/server";
import { createList, ensureDemoList } from "@/lib/list-store";
import { createListSchema } from "@/lib/schemas";

export async function GET() {
  const list = ensureDemoList();
  return NextResponse.json({ list });
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const parsed = createListSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const list = createList(parsed.data);
  return NextResponse.json({ list }, { status: 201 });
}
