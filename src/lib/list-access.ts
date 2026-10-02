import { NextResponse } from "next/server";
import type { GroceryList } from "./types";
import { getList } from "./list-store";
import { parseBearer, userFromToken } from "./user-store";
import type { UserAccount } from "./account-types";

export type ListAccess =
  | { ok: true; list: GroceryList | undefined; user: UserAccount | undefined }
  | { ok: false; response: NextResponse };

/**
 * Device lists (no owner) are reachable by their unguessable id.
 * Account-owned lists require that owner's bearer token; others get 404 so ids don't leak.
 */
export function authorizeList(request: Request, id: string): ListAccess {
  const user = userFromToken(parseBearer(request));
  const list = getList(id);
  if (list?.userId && list.userId !== user?.id) {
    return {
      ok: false,
      response: NextResponse.json({ error: "List not found" }, { status: 404 }),
    };
  }
  return { ok: true, list, user };
}
