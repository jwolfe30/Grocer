import { NextResponse } from "next/server";
import { getStores } from "@/lib/catalog";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const zip = searchParams.get("zip") ?? "97209";
  const stores = await getStores(zip);
  return NextResponse.json({ stores });
}
