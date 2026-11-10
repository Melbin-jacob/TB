import type { Unit } from '@/lib/engine/types';

/**
 * Display-only metadata for catalog items: category, picture and quantity stepper.
 * The engine and data/catalog.json are unaffected; this file only drives the UI.
 *
 * Pictures: every product shows `emoji` today. To use a photo instead, add the file under
 * `public/products/` (e.g. public/products/milk-2pct.webp) and set `image: '/products/milk-2pct.webp'`
 * on that product below. The product card shows the photo when `image` is set and falls back to the
 * emoji if it is missing or fails to load. Only use photos you have the rights to (e.g. CC0 / public domain).
 */

export type CategoryId = 'vegetables' | 'fruit' | 'dairy' | 'meat' | 'bakery' | 'pantry' | 'drinks' | 'frozen';

export interface Category {
  id: CategoryId;
  label: string;
  /** Short subtitle shown on the category tile. */
  hint: string;
  emoji: string;
  /** Optional photo for the category tile, same rules as ProductMeta.image. */
  image?: string;
}

export const CATEGORIES: readonly Category[] = [
  { id: 'vegetables', label: 'Vegetables', hint: 'Fresh produce', emoji: '🥦' },
  { id: 'fruit', label: 'Fruit', hint: 'Fresh produce', emoji: '🍎' },
  { id: 'dairy', label: 'Dairy & eggs', hint: 'Milk, cheese, eggs', emoji: '🧀' },
  { id: 'meat', label: 'Meat, fish & tofu', hint: 'Protein', emoji: '🍗' },
  { id: 'bakery', label: 'Bakery & grains', hint: 'Bread, pasta, rice', emoji: '🍞' },
  { id: 'pantry', label: 'Pantry', hint: 'Cans, oils, staples', emoji: '🥫' },
  { id: 'drinks', label: 'Drinks', hint: 'Juice & coffee', emoji: '🧃' },
  { id: 'frozen', label: 'Frozen', hint: 'Freezer aisle', emoji: '🍨' },
];

export interface ProductMeta {
  category: CategoryId;
  emoji: string;
  /** Optional photo path under /products/ — takes precedence over `emoji` when set. */
  image?: string;
  /** Unit the "+" button adds in; must match the catalog item's dimension. */
  unit: Unit;
  /** Amount one "+" press adds, in `unit` (e.g. 1 L of milk, 6 eggs, 0.5 kg of chicken). */
  step: number;
}

export const PRODUCT_META: Readonly<Record<string, ProductMeta>> = {
  // Dairy & eggs
  'milk-2pct': { category: 'dairy', emoji: '🥛', unit: 'L', step: 1 },
  'milk-oat': { category: 'dairy', emoji: '🥛', unit: 'L', step: 1 },
  'cream-35': { category: 'dairy', emoji: '🫗', unit: 'mL', step: 500 },
  'butter-salted': { category: 'dairy', emoji: '🧈', unit: 'g', step: 500 },
  'cheese-cheddar': { category: 'dairy', emoji: '🧀', unit: 'g', step: 500 },
  'yogurt-greek-plain': { category: 'dairy', emoji: '🥣', unit: 'g', step: 750 },
  'eggs-large': { category: 'dairy', emoji: '🥚', unit: 'each', step: 6 },

  // Bakery & grains
  'bread-whole-wheat': { category: 'bakery', emoji: '🍞', unit: 'g', step: 675 },
  'bread-white': { category: 'bakery', emoji: '🍞', unit: 'g', step: 675 },
  'tortillas-flour': { category: 'bakery', emoji: '🫓', unit: 'each', step: 10 },
  'pasta-spaghetti': { category: 'bakery', emoji: '🍝', unit: 'g', step: 500 },
  'rice-basmati': { category: 'bakery', emoji: '🍚', unit: 'kg', step: 1 },
  'oats-rolled': { category: 'bakery', emoji: '🥣', unit: 'kg', step: 1 },
  'flour-all-purpose': { category: 'bakery', emoji: '🌾', unit: 'kg', step: 2 },
  'cereal-corn-flakes': { category: 'bakery', emoji: '🥣', unit: 'g', step: 750 },

  // Fruit
  'apples-gala': { category: 'fruit', emoji: '🍎', unit: 'kg', step: 0.5 },
  bananas: { category: 'fruit', emoji: '🍌', unit: 'kg', step: 0.5 },
  'oranges-navel': { category: 'fruit', emoji: '🍊', unit: 'kg', step: 0.5 },
  strawberries: { category: 'fruit', emoji: '🍓', unit: 'g', step: 500 },
  avocados: { category: 'fruit', emoji: '🥑', unit: 'each', step: 1 },

  // Vegetables
  'potatoes-russet': { category: 'vegetables', emoji: '🥔', unit: 'kg', step: 1 },
  'onions-yellow': { category: 'vegetables', emoji: '🧅', unit: 'kg', step: 0.5 },
  carrots: { category: 'vegetables', emoji: '🥕', unit: 'kg', step: 0.5 },
  'tomatoes-roma': { category: 'vegetables', emoji: '🍅', unit: 'kg', step: 0.5 },
  broccoli: { category: 'vegetables', emoji: '🥦', unit: 'kg', step: 0.5 },
  'bell-peppers-red': { category: 'vegetables', emoji: '🫑', unit: 'kg', step: 0.5 },
  'spinach-baby': { category: 'vegetables', emoji: '🥬', unit: 'g', step: 250 },
  'lettuce-romaine': { category: 'vegetables', emoji: '🥬', unit: 'each', step: 1 },
  cilantro: { category: 'vegetables', emoji: '🌿', unit: 'each', step: 1 },

  // Meat, fish & tofu
  'chicken-breast-boneless': { category: 'meat', emoji: '🍗', unit: 'kg', step: 0.5 },
  'chicken-thighs-boneless': { category: 'meat', emoji: '🍗', unit: 'kg', step: 0.5 },
  'ground-beef-lean': { category: 'meat', emoji: '🥩', unit: 'kg', step: 0.5 },
  'pork-chops': { category: 'meat', emoji: '🥩', unit: 'kg', step: 0.5 },
  bacon: { category: 'meat', emoji: '🥓', unit: 'g', step: 500 },
  'salmon-fillet': { category: 'meat', emoji: '🐟', unit: 'kg', step: 0.5 },
  'tofu-firm': { category: 'meat', emoji: '🫘', unit: 'g', step: 450 },

  // Pantry
  'beans-black-canned': { category: 'pantry', emoji: '🥫', unit: 'mL', step: 540 },
  'tomatoes-diced-canned': { category: 'pantry', emoji: '🥫', unit: 'mL', step: 796 },
  'lentils-red': { category: 'pantry', emoji: '🫘', unit: 'kg', step: 1 },
  'peanut-butter': { category: 'pantry', emoji: '🥜', unit: 'kg', step: 1 },
  almonds: { category: 'pantry', emoji: '🌰', unit: 'g', step: 400 },
  'olive-oil': { category: 'pantry', emoji: '🫒', unit: 'L', step: 1 },
  'canola-oil': { category: 'pantry', emoji: '🫙', unit: 'L', step: 1 },
  'sugar-white': { category: 'pantry', emoji: '🍬', unit: 'kg', step: 2 },
  honey: { category: 'pantry', emoji: '🍯', unit: 'g', step: 500 },

  // Drinks
  'orange-juice': { category: 'drinks', emoji: '🧃', unit: 'L', step: 1 },
  'coffee-ground': { category: 'drinks', emoji: '☕', unit: 'g', step: 500 },

  // Frozen
  'ice-cream-vanilla': { category: 'frozen', emoji: '🍨', unit: 'L', step: 1 },
  'peas-frozen': { category: 'frozen', emoji: '🫛', unit: 'kg', step: 1 },
};

/** Fallback for catalog items added to data/catalog.json without an entry above. */
const FALLBACK_UNIT = { mass: 'kg', volume: 'L', count: 'each' } as const;

export function productMeta(catalogItemId: string, dimension: 'mass' | 'volume' | 'count'): ProductMeta {
  return PRODUCT_META[catalogItemId] ?? { category: 'pantry', emoji: '🛒', unit: FALLBACK_UNIT[dimension], step: 1 };
}
