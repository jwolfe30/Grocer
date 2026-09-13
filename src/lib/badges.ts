import type { BadgeDefinition } from "./account-types";

export const BADGE_CATALOG: BadgeDefinition[] = [
  {
    id: "first-receipt",
    name: "Receipt Rookie",
    description: "Uploaded your first receipt. The fridge thanks you.",
    flair: "🧾✨",
  },
  {
    id: "price-scout",
    name: "Price Scout",
    description: "Contributed 5 price sightings for fellow shoppers.",
    flair: "🔎🥕",
  },
  {
    id: "aisle-archivist",
    name: "Aisle Archivist",
    description: "Three receipts logged. History is delicious.",
    flair: "📚🥛",
  },
  {
    id: "coupon-cryptid",
    name: "Coupon Cryptid",
    description: "Caught a coupon or sale in the wild.",
    flair: "🦶🏷️",
  },
  {
    id: "staple-steward",
    name: "Staple Steward",
    description: "Saved five frequent items for faster lists.",
    flair: "🥣💛",
  },
  {
    id: "two-bag-tango",
    name: "Two-Bag Tango",
    description: "Kept alerts on — ready when milk goes soft on price.",
    flair: "💃🛍️",
  },
  {
    id: "community-carrot",
    name: "Community Carrot",
    description: "Earned 100 good-shopping points. Still worth $0. Fun only.",
    flair: "🥕🏆",
  },
];

export function badgeById(id: string): BadgeDefinition | undefined {
  return BADGE_CATALOG.find((b) => b.id === id);
}
