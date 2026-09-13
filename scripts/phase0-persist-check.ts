/**
 * One-off Phase 0 persistence check: write → close DB → reopen → read.
 */
import { existsSync } from "node:fs";
import { appDbPath, appDbStats, closeAppDb } from "../src/lib/app-db";
import { createList, getList } from "../src/lib/list-store";
import {
  createReceipt,
  listReceiptsForUser,
} from "../src/lib/receipt-store";
import {
  logoutSession,
  registerUser,
  userFromToken,
} from "../src/lib/user-store";

const email = `phase0-${Date.now()}@test.local`;
const list = createList({
  name: "Phase0 Persist",
  zip: "98042",
  items: [{ query: "milk", quantity: 1 }],
});
const reg = registerUser({
  email,
  password: "secret12",
  displayName: "Phase0",
  zip: "98042",
});
if ("error" in reg) throw new Error(reg.error);
const token = reg.token;
const receipt = createReceipt({
  userId: reg.user.id,
  storeName: "Fred Meyer",
  rawText: "Whole milk 3.49\nEggs 2.99",
});
if ("error" in receipt) throw new Error(receipt.error);

const path = appDbPath();
console.log("wrote", {
  listId: list.id,
  userId: reg.user.id,
  token: `${token.slice(0, 8)}…`,
  receiptId: receipt.id,
  path,
  stats: appDbStats(),
});
if (!existsSync(path)) throw new Error(`DB file missing on disk: ${path}`);

closeAppDb();

const list2 = getList(list.id);
const user2 = userFromToken(token);
const receipts2 = listReceiptsForUser(reg.user.id);
if (!list2) throw new Error("list missing after reopen");
if (list2.name !== "Phase0 Persist") throw new Error("list name mismatch");
if (!list2.items.some((i) => i.query === "milk")) {
  throw new Error("list items missing");
}
if (!user2 || user2.email !== email) {
  throw new Error("session/user missing after reopen");
}
if (!receipts2.some((r) => r.id === receipt.id)) {
  throw new Error("receipt missing after reopen");
}
console.log("PASS persistence after close+reopen", {
  listName: list2.name,
  email: user2.email,
  receipts: receipts2.length,
  stats: appDbStats(),
});
logoutSession(token);
