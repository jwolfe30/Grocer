/** Shopper-facing generic names for autocomplete (brand rows come after). */
export const PRODUCT_GENERIC_LABELS: Record<string, string> = {
  "milk-gallon": "Whole milk",
  "eggs-dozen": "Cage-free eggs",
  "bread-wheat": "Whole wheat loaf",
  bananas: "Bananas",
  "chicken-breast": "Chicken breast",
  "rice-white": "White rice",
  "coffee-ground": "Ground coffee",
  "olive-oil": "Olive oil",
};

export function brandsMatch(a?: string | null, b?: string | null): boolean {
  if (!a || !b) return false;
  const left = a.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const right = b.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  if (!left || !right) return false;
  return left === right || left.includes(right) || right.includes(left);
}
