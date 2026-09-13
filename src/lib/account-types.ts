import type { DietPreferences } from "./types";

export type PriceSource = "live" | "demo" | "crowd" | "ad" | "modeled";

export interface UserAccount {
  id: string;
  email: string;
  /** scrypt salt:hash — N=16384,r=8,p=1 (MVP; see user-store.ts) */
  passwordHash: string;
  displayName: string;
  zip: string;
  /** Optional profile image as a data URL (demo storage). */
  avatarUrl?: string | null;
  points: number;
  badgeIds: string[];
  frequentItems: FrequentItem[];
  alertPrefs: AlertPrefs;
  createdAt: string;
}

export interface PublicUser {
  id: string;
  email: string;
  displayName: string;
  zip: string;
  avatarUrl?: string | null;
  points: number;
  badges: Badge[];
  frequentItems: FrequentItem[];
  alertPrefs: AlertPrefs;
  createdAt: string;
}

export interface FrequentItem {
  id: string;
  query: string;
  quantity: number;
  notes?: string;
  createdAt: string;
}

export interface AlertPrefs {
  sales: boolean;
  coupons: boolean;
}

export interface BadgeDefinition {
  id: string;
  name: string;
  description: string;
  /** Purely cosmetic — Waze-style flair */
  flair: string;
}

export interface Badge extends BadgeDefinition {
  earnedAt: string;
}

export interface ReceiptLine {
  id: string;
  name: string;
  quantity: number;
  priceUsd: number;
  /** Optional link into catalog product intent */
  productId?: string;
}

/** Client-captured photo metadata — OCR/full image storage is a follow-up. */
export interface ReceiptImageMeta {
  name: string;
  mimeType: string;
  sizeBytes: number;
  capturedAt?: string;
}

export interface Receipt {
  id: string;
  userId: string;
  storeId?: string;
  storeName: string;
  zip: string;
  purchasedAt: string;
  uploadedAt: string;
  rawText: string;
  lines: ReceiptLine[];
  totalUsd: number;
  pointsAwarded: number;
  badgesAwarded: string[];
  /** Present when shopper attached a receipt photo (no OCR yet). */
  imageMeta?: ReceiptImageMeta | null;
}

export interface PriceObservation {
  id: string;
  storeId: string;
  storeName: string;
  zip: string;
  name: string;
  productId: string;
  priceUsd: number;
  quantity: number;
  observedAt: string;
  source: "receipt";
  receiptId: string;
  userId: string;
}

export interface SaleAlert {
  id: string;
  userId: string;
  query: string;
  storeName: string;
  title: string;
  detail: string;
  priceUsd?: number;
  createdAt: string;
  read: boolean;
}

export type AccountDietPrefs = DietPreferences;
