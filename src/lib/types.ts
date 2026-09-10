export type StoreId = string;

export interface Store {
  id: StoreId;
  name: string;
  chain?: string;
  address: string;
  zip: string;
  lat: number;
  lng: number;
  source: "seed" | "kroger";
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
  onSale: boolean;
  salePriceUsd?: number;
  couponIds: string[];
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
  /** Locked offer after user picks a match */
  selectedOfferId?: string;
  preferredProductId?: string;
}

export interface GroceryList {
  id: string;
  name: string;
  zip: string;
  items: ListItem[];
  preferLocal: boolean;
  savingsThresholdUsd: number;
  createdAt: string;
  updatedAt: string;
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
