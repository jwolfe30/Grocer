export type StoreId = string;

export interface Store {
  id: StoreId;
  name: string;
  chain?: string;
  address: string;
  zip: string;
  lat: number;
  lng: number;
  source: "seed" | "kroger" | "crowd" | "demo";
  /** Kroger Public API locationId (division + store), when this row is a Kroger banner. */
  krogerLocationId?: string;
}

export interface Offer {
  id: string;
  storeId: StoreId;
  productId: string;
  name: string;
  brand?: string;
  category: string;
  sizeLabel: string;
  /** Price before discounts, in USD */
  priceUsd: number;
  /** Unit size for price-per comparison (e.g. ounces) */
  unitAmount: number;
  unitName: "oz" | "lb" | "ct" | "gal" | "each";
  upc?: string;
  isLocal: boolean;
  localOrigin?: string;
  isOrganic?: boolean;
  isNonGmo?: boolean;
  isKosher?: boolean;
  onSale: boolean;
  salePriceUsd?: number;
  couponIds: string[];
  /** Provenance for honest UI labeling */
  priceSource?: "live" | "demo" | "crowd" | "ad" | "modeled";
  asOf?: string;
  /** Optional “cheaper vs 30-day median” badge (live/cache only). */
  dealSignal?: {
    pctBelowMedian: number;
    medianUsd: number;
    currentUsd: number;
  } | null;
}

export interface Coupon {
  id: string;
  storeId: StoreId | "*";
  title: string;
  /** Absolute dollars off */
  amountOffUsd?: number;
  /** Percent off 0-100 */
  percentOff?: number;
  /** Minimum spend on the matched offer before coupon applies */
  minSpendUsd?: number;
  productIds?: string[];
  categories?: string[];
  expiresAt: string;
}

export interface ListItem {
  id: string;
  query: string;
  quantity: number;
  notes?: string;
  /** Hard-locked offer (from matches panel) */
  selectedOfferId?: string;
  /** Canonical grocery intent (e.g. bread-wheat) */
  preferredProductId?: string;
  /** Soft brand preference from autocomplete brand pick */
  preferredBrand?: string;
  /** Crossed off while shopping */
  checked?: boolean;
}

export interface DietPreferences {
  preferLocal: boolean;
  /** Prefer USDA organic or clearly non-GMO labeled items */
  preferOrganic: boolean;
  preferKosher: boolean;
}

export interface GroceryList extends DietPreferences {
  id: string;
  name: string;
  zip: string;
  items: ListItem[];
  savingsThresholdUsd: number;
  /** Set when the list is owned by a signed-in account (syncs across devices). */
  userId?: string | null;
  /** Public share slug — anyone with the link can open the list (check-off only). */
  shareId?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Suggestion {
  offerId: string;
  productId: string;
  name: string;
  brand?: string;
  /** Generic intent row vs a specific branded SKU */
  kind: "generic" | "brand";
  storeId: string;
  storeName: string;
  sizeLabel: string;
  listPriceUsd: number;
  effectivePriceUsd: number;
  onSale: boolean;
  isLocal: boolean;
  localOrigin?: string;
  isOrganic: boolean;
  isNonGmo: boolean;
  isKosher: boolean;
  appliedCouponIds: string[];
  score: number;
  priceSource?: "live" | "demo" | "crowd" | "ad" | "modeled";
  asOf?: string;
}

export interface MatchedOffer {
  offer: Offer;
  store: Store;
  effectivePriceUsd: number;
  appliedCouponIds: string[];
  score: number;
  reasons: string[];
}

export interface ItemMatchResult {
  itemId: string;
  query: string;
  quantity: number;
  matches: MatchedOffer[];
  selectedOfferId?: string;
  preferredBrand?: string;
  preferredProductId?: string;
}

export interface PlanLineReplacement {
  offer: Offer;
  storeId: StoreId;
  storeName: string;
  unitPriceUsd: number;
  lineTotalUsd: number;
  savingsUsd: number;
  reason: string;
}

export interface PlanLine {
  itemId: string;
  query: string;
  quantity: number;
  offer: Offer;
  storeId: StoreId;
  storeName: string;
  unitPriceUsd: number;
  lineTotalUsd: number;
  appliedCouponIds: string[];
  isLocal: boolean;
  /** True when this line honors a brand the shopper picked */
  brandPreferred?: boolean;
  /** Cheaper/better alternate when the plan kept a preferred or locked pick */
  recommendedReplacement?: PlanLineReplacement;
}

export interface CartPlan {
  id: string;
  label: string;
  kind: "single_store" | "multi_store";
  storeIds: StoreId[];
  lines: PlanLine[];
  subtotalUsd: number;
  savingsVsCheapestSingleUsd: number;
  stops: number;
  localItemCount: number;
}

export interface OptimizeResult {
  matches: ItemMatchResult[];
  plans: CartPlan[];
  recommendedPlanId: string;
  explanation: string;
}
