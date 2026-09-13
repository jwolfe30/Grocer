import { NextResponse } from "next/server";
import { getCatalog } from "@/lib/catalog";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q") ?? undefined;
  const zip = searchParams.get("zip") ?? "98042";
  const catalog = await getCatalog({ q, zip });
  return NextResponse.json(catalog);
}
