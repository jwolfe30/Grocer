/**
 * Phase 1 smoke: share check-off + deal math + receipt photo meta (no OCR).
 */
import {
  createList,
  enableListSharing,
  getListByShareId,
  setSharedItemChecked,
} from "../src/lib/list-store";
import {
  DEAL_BELOW_MEDIAN_PCT,
  dealSignalFromHistory,
} from "../src/lib/pricing";
import { createReceipt } from "../src/lib/receipt-store";
import { registerUser } from "../src/lib/user-store";

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

const registered = registerUser({
  email: `share-smoke-${Date.now()}@example.com`,
  password: "smoke-test-pass-12",
  displayName: "Share Smoke",
  zip: "98042",
});
assert(!("error" in registered), `register: ${"error" in registered ? registered.error : ""}`);
const ownerId = registered.user.id;

const list = createList({
  name: "Share smoke",
  zip: "98042",
  userId: ownerId,
  items: [
    { query: "milk", quantity: 1 },
    { query: "eggs", quantity: 1 },
  ],
});

const shared = enableListSharing(list.id, ownerId);
assert(!("error" in shared), `enable: ${"error" in shared ? shared.error : ""}`);
assert(shared.shareId, "missing shareId");

const byShare = getListByShareId(shared.shareId);
assert(byShare && byShare.id === list.id, "getListByShareId failed");

const itemId = byShare.items[0]!.id;
const checked = setSharedItemChecked(shared.shareId, itemId, true);
assert(!("error" in checked), `check: ${"error" in checked ? checked.error : ""}`);

const again = getListByShareId(shared.shareId);
assert(
  again?.items.find((i) => i.id === itemId)?.checked === true,
  "checked not persisted in SQLite",
);

const unchecked = setSharedItemChecked(shared.shareId, itemId, false);
assert(
  !("error" in unchecked),
  `uncheck: ${"error" in unchecked ? unchecked.error : ""}`,
);
console.log("SHARE_OK", shared.shareId, "items", again?.items.length);

const deal = dealSignalFromHistory(2.5, [
  { priceUsd: 3.0 },
  { priceUsd: 3.1 },
  { priceUsd: 2.9 },
  { priceUsd: 3.2 },
]);
assert(deal, "expected deal signal");
assert(!dealSignalFromHistory(3.0, [{ priceUsd: 3.0 }, { priceUsd: 3.1 }]), "thin history");
assert(
  !dealSignalFromHistory(2.95, [
    { priceUsd: 3.0 },
    { priceUsd: 3.0 },
    { priceUsd: 3.0 },
  ]),
  "below threshold should be null",
);
console.log("DEAL_OK", deal.pctBelowMedian, "threshold", DEAL_BELOW_MEDIAN_PCT);

const photoReceipt = createReceipt({
  userId: ownerId,
  storeName: "Fred Meyer",
  zip: "98042",
  rawText: "",
  imageMeta: {
    name: "receipt-cam.jpg",
    mimeType: "image/jpeg",
    sizeBytes: 120_000,
    capturedAt: new Date().toISOString(),
  },
});
assert(
  !("error" in photoReceipt),
  `photo receipt: ${"error" in photoReceipt ? photoReceipt.error : ""}`,
);
assert(photoReceipt.imageMeta?.name === "receipt-cam.jpg", "image meta missing");
assert(photoReceipt.lines.length === 0, "photo-only should have no OCR lines");

const textReceipt = createReceipt({
  userId: ownerId,
  storeName: "QFC",
  zip: "98042",
  rawText: "Whole milk 3.49\nEggs 2.99",
});
assert(
  !("error" in textReceipt),
  `text receipt: ${"error" in textReceipt ? textReceipt.error : ""}`,
);
assert(textReceipt.lines.length >= 2, "paste parser should yield lines");
console.log(
  "RECEIPT_OK",
  "photo",
  photoReceipt.id,
  "text",
  textReceipt.id,
  "lines",
  textReceipt.lines.length,
);

console.log("phase1-slice-check passed");
