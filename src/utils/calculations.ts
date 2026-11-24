import { ProductItem, Supplier, CalculatedItem, SupplierOrderSummary } from '../types/quotation';

export function formatBRL(value: number | null | undefined): string {
  if (value === null || value === undefined || isNaN(value)) {
    return '-';
  }
  return value.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function parseBRLInput(input: string): number | null {
  if (!input || input.trim() === '') return null;
  // Replace R$, spaces, thousand separators (dot in pt-BR), change comma to dot
  const clean = input
    .replace(/[R$\s]/g, '')
    .replace(/\./g, '')
    .replace(',', '.');
  const num = parseFloat(clean);
  return isNaN(num) || num < 0 ? null : num;
}

export function compareAlphabetical(a: string, b: string): number {
  return (a || '').trim().localeCompare((b || '').trim(), 'pt-BR', {
    sensitivity: 'base',
    numeric: true,
  });
}

export function sortProductsAlphabetically<T extends { description: string }>(items: T[]): T[] {
  return [...items].sort((a, b) => compareAlphabetical(a.description, b.description));
}

export function sortSuppliersAlphabetically<T extends { name: string }>(suppliers: T[]): T[] {
  return [...suppliers].sort((a, b) => compareAlphabetical(a.name, b.name));
}

export function calculateQuotation(
  products: ProductItem[],
  suppliers: Supplier[]
): {
  calculatedItems: CalculatedItem[];
  supplierOrders: SupplierOrderSummary[];
  grandTotalLowest: number;
  grandTotalHighest: number;
  totalSavings: number;
  savingsPercentage: number;
  itemsWithWinnerCount: number;
} {
  const sortedSuppliers = sortSuppliersAlphabetically(suppliers);
  const supplierMap = new Map<string, Supplier>();
  sortedSuppliers.forEach((s) => supplierMap.set(s.id, s));

  let grandTotalLowest = 0;
  let grandTotalHighest = 0;
  let itemsWithWinnerCount = 0;

  const calculatedItems: CalculatedItem[] = products.map((product) => {
    let minPrice: number | null = null;
    let maxPrice: number | null = null;
    let winningSupplierIds: string[] = [];

    // Evaluate all valid prices for this product (ties resolve alphabetically)
    for (const supplier of sortedSuppliers) {
      const price = product.prices[supplier.id];
      if (price !== null && price !== undefined && price > 0) {
        if (minPrice === null || price < minPrice) {
          minPrice = price;
          winningSupplierIds = [supplier.id];
        } else if (price === minPrice) {
          winningSupplierIds.push(supplier.id);
        }

        if (maxPrice === null || price > maxPrice) {
          maxPrice = price;
        }
      }
    }

    const isTie = winningSupplierIds.length > 1;
    const winnerSupplierId = winningSupplierIds.length > 0 ? winningSupplierIds[0] : null;
    const winnerSupplier = winnerSupplierId ? supplierMap.get(winnerSupplierId) : null;
    const totalLowest = minPrice !== null ? minPrice * (product.quantity || 1) : 0;

    if (minPrice !== null) {
      grandTotalLowest += totalLowest;
      itemsWithWinnerCount++;
      if (maxPrice !== null) {
        grandTotalHighest += maxPrice * (product.quantity || 1);
      } else {
        grandTotalHighest += totalLowest;
      }
    }

    return {
      ...product,
      lowestPrice: minPrice,
      winnerSupplierId,
      winnerSupplierName: winnerSupplier ? winnerSupplier.name : null,
      isTie,
      tiedSupplierIds: winningSupplierIds,
      totalLowest,
      highestPrice: maxPrice,
    };
  });

  const totalSavings = Math.max(0, grandTotalHighest - grandTotalLowest);
  const savingsPercentage =
    grandTotalHighest > 0 ? (totalSavings / grandTotalHighest) * 100 : 0;

  // Group items won by each supplier
  const ordersMap = new Map<string, SupplierOrderSummary>();
  sortedSuppliers.forEach((s) => {
    ordersMap.set(s.id, {
      supplier: s,
      items: [],
      totalItemsCount: 0,
      totalOrderAmount: 0,
    });
  });

  calculatedItems.forEach((item) => {
    if (item.winnerSupplierId && item.lowestPrice !== null) {
      const order = ordersMap.get(item.winnerSupplierId);
      if (order) {
        const subtotal = item.lowestPrice * (item.quantity || 1);
        order.items.push({
          item,
          unitPrice: item.lowestPrice,
          subtotal,
        });
        order.totalItemsCount += 1;
        order.totalOrderAmount += subtotal;
      }
    }
  });

  // Filter only suppliers that won at least 1 item and keep both suppliers and their items alphabetical
  const supplierOrders = Array.from(ordersMap.values())
    .filter((order) => order.items.length > 0)
    .map((order) => ({
      ...order,
      items: [...order.items].sort((a, b) =>
        compareAlphabetical(a.item.description, b.item.description)
      ),
    }))
    .sort((a, b) => compareAlphabetical(a.supplier.name, b.supplier.name));

  return {
    calculatedItems,
    supplierOrders,
    grandTotalLowest,
    grandTotalHighest,
    totalSavings,
    savingsPercentage,
    itemsWithWinnerCount,
  };
}
