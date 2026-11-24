export interface Supplier {
  id: string;
  name: string;
  phone?: string;
  color?: string;
}

export interface ProductItem {
  id: string;
  quantity: number;
  description: string; // "Lista de Faltas" / Produto
  unit: string;        // "UN", "CX", "KG", "MT", "PC"
  prices: Record<string, number | null>; // supplierId -> unit price
  images?: Record<string, string>; // supplierId -> extracted thumbnail URL
  brands?: Record<string, string>; // supplierId -> product brand quoted by supplier
}

export interface CalculatedItem extends ProductItem {
  lowestPrice: number | null;
  winnerSupplierId: string | null;
  winnerSupplierName: string | null;
  isTie: boolean;
  tiedSupplierIds: string[];
  totalLowest: number;
  highestPrice: number | null;
}

export interface SupplierOrderSummary {
  supplier: Supplier;
  items: Array<{
    item: CalculatedItem;
    unitPrice: number;
    subtotal: number;
  }>;
  totalItemsCount: number;
  totalOrderAmount: number;
}
