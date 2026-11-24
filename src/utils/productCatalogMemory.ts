import { INITIAL_PRODUCTS } from '../data/initialData';
import { ProductItem } from '../types/quotation';
import { normalizeMemoryKey } from './correspondenceMemory';

const STORAGE_KEY_CATALOG = 'cotafacil_product_catalog_v1';

export interface MemorizedProductEntry {
  id: string;
  description: string;
  quantity: number;
  unit: string;
  updatedAt: number;
}

const DEFAULT_DEMO_BY_ID = new Map(
  INITIAL_PRODUCTS.map((p) => [p.id, normalizeMemoryKey(p.description)])
);

function isPlaceholderDescription(desc: string): boolean {
  const norm = normalizeMemoryKey(desc);
  return !norm || norm === 'novo produto / material';
}

function isUntouchedDemoProduct(product: ProductItem): boolean {
  const demoNorm = DEFAULT_DEMO_BY_ID.get(product.id);
  if (!demoNorm) return false;
  if (normalizeMemoryKey(product.description) !== demoNorm) return false;
  const demoItem = INITIAL_PRODUCTS.find((p) => p.id === product.id);
  if (!demoItem) return false;
  const samePrices =
    JSON.stringify(product.prices || {}) === JSON.stringify(demoItem.prices || {});
  return samePrices && product.quantity === demoItem.quantity && product.unit === demoItem.unit;
}

export function loadProductCatalogMemory(): MemorizedProductEntry[] {
  try {
    if (typeof localStorage === 'undefined') return [];
    const raw = localStorage.getItem(STORAGE_KEY_CATALOG);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item) =>
        item &&
        typeof item.id === 'string' &&
        typeof item.description === 'string' &&
        !isPlaceholderDescription(item.description)
    );
  } catch {
    return [];
  }
}

export function saveProductCatalogMemory(entries: MemorizedProductEntry[]): void {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(STORAGE_KEY_CATALOG, JSON.stringify(entries));
  } catch (e) {
    console.error('Erro ao salvar lista de produtos memorizada:', e);
  }
}

export function syncProductsIntoCatalog(products: ProductItem[]): MemorizedProductEntry[] {
  const existing = loadProductCatalogMemory();
  if (products.length === 0) return existing;

  // Avoid locking untouched sample/demo products into the user's catalog before they import or edit anything
  const hasAnyRealOrModifiedProduct = products.some((p) => !isUntouchedDemoProduct(p));
  if (!hasAnyRealOrModifiedProduct && existing.length === 0) {
    return existing;
  }

  const next = [...existing];
  const now = Date.now();
  let changed = false;

  for (const product of products) {
    if (isPlaceholderDescription(product.description)) continue;
    if (!hasAnyRealOrModifiedProduct && isUntouchedDemoProduct(product)) continue;

    const normDesc = normalizeMemoryKey(product.description);
    const byIdIdx = next.findIndex((entry) => entry.id === product.id);

    if (byIdIdx !== -1) {
      const current = next[byIdIdx];
      if (
        current.description !== product.description.trim() ||
        current.quantity !== (product.quantity || 1) ||
        current.unit !== (product.unit || 'UN')
      ) {
        next[byIdIdx] = {
          ...current,
          description: product.description.trim(),
          quantity: product.quantity || 1,
          unit: product.unit || 'UN',
          updatedAt: now,
        };
        changed = true;
      }
      continue;
    }

    const byDescIdx = next.findIndex(
      (entry) => normalizeMemoryKey(entry.description) === normDesc
    );
    if (byDescIdx !== -1) {
      const current = next[byDescIdx];
      if (
        current.quantity !== (product.quantity || 1) ||
        current.unit !== (product.unit || 'UN')
      ) {
        next[byDescIdx] = {
          ...current,
          quantity: product.quantity || 1,
          unit: product.unit || 'UN',
          updatedAt: now,
        };
        changed = true;
      }
      continue;
    }

    next.push({
      id: product.id,
      description: product.description.trim(),
      quantity: product.quantity || 1,
      unit: product.unit || 'UN',
      updatedAt: now,
    });
    changed = true;
  }

  if (changed) {
    saveProductCatalogMemory(next);
  }
  return next;
}

export function replaceCatalogWithProducts(products: ProductItem[]): MemorizedProductEntry[] {
  const now = Date.now();
  const seenKeys = new Set<string>();
  const entries: MemorizedProductEntry[] = [];

  for (const product of products) {
    if (isPlaceholderDescription(product.description)) continue;
    const normDesc = normalizeMemoryKey(product.description);
    if (seenKeys.has(normDesc)) continue;
    seenKeys.add(normDesc);
    entries.push({
      id: product.id,
      description: product.description.trim(),
      quantity: product.quantity || 1,
      unit: product.unit || 'UN',
      updatedAt: now,
    });
  }

  saveProductCatalogMemory(entries);
  return entries;
}

export function mergeActiveAndCatalogProducts(
  activeProducts: ProductItem[],
  catalogEntries: MemorizedProductEntry[]
): ProductItem[] {
  if (catalogEntries.length === 0) return activeProducts;

  const activeIds = new Set(activeProducts.map((p) => p.id));
  const activeDescKeys = new Set(
    activeProducts.map((p) => normalizeMemoryKey(p.description)).filter(Boolean)
  );

  const missingFromActive: ProductItem[] = [];
  for (const entry of catalogEntries) {
    const normDesc = normalizeMemoryKey(entry.description);
    if (!normDesc || activeIds.has(entry.id) || activeDescKeys.has(normDesc)) {
      continue;
    }
    missingFromActive.push({
      id: entry.id,
      description: entry.description,
      quantity: entry.quantity || 1,
      unit: entry.unit || 'UN',
      prices: {},
    });
  }

  return missingFromActive.length > 0
    ? [...activeProducts, ...missingFromActive]
    : activeProducts;
}
