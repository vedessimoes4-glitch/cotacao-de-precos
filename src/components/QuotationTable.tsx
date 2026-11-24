import React, { useState, useRef, useEffect } from 'react';
import { 
  Plus, 
  Trash2, 
  Search, 
  Trophy, 
  ArrowUpDown, 
  MoreVertical, 
  Edit2, 
  AlertCircle,
  Copy,
  Eraser,
  RotateCcw,
  X
} from 'lucide-react';
import { Supplier, ProductItem, CalculatedItem } from '../types/quotation';
import { formatBRL } from '../utils/calculations';
import { extractProductBrand } from '../utils/productMatcher';

interface QuotationTableProps {
  products: ProductItem[];
  calculatedItems: CalculatedItem[];
  suppliers: Supplier[];
  onUpdateProduct: (id: string, updates: Partial<ProductItem>) => void;
  onSortProducts?: () => void;
  lastAddedProductId?: string | null;
  onClearLastAdded?: () => void;
  onUpdatePrice: (productId: string, supplierId: string, price: number | null) => void;
  onAddProduct: () => void;
  onDeleteProduct: (id: string) => void;
  onClearProductPrices: (id: string) => void;
  onClearAllPrices: () => void;
  onDeleteAllProducts: () => void;
  onRestoreCatalogProducts: () => void;
  savedCatalogCount: number;
  onDuplicateProduct: (id: string) => void;
  onOpenAddSupplier: () => void;
  onDeleteSupplier: (supplierId: string) => void;
  onEditSupplier: (supplier: Supplier) => void;
  grandTotalLowest: number;
}

export const QuotationTable: React.FC<QuotationTableProps> = ({
  products,
  calculatedItems,
  suppliers,
  onUpdateProduct,
  onSortProducts,
  lastAddedProductId,
  onClearLastAdded,
  onUpdatePrice,
  onAddProduct,
  onDeleteProduct,
  onClearProductPrices,
  onClearAllPrices,
  onDeleteAllProducts,
  onRestoreCatalogProducts,
  savedCatalogCount,
  onDuplicateProduct,
  onOpenAddSupplier,
  onDeleteSupplier,
  onEditSupplier,
  grandTotalLowest,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedWinnerFilter, setSelectedWinnerFilter] = useState<string>('all');
  const [activeSupplierMenu, setActiveSupplierMenu] = useState<string | null>(null);
  const [isConfirmDeleteAllOpen, setIsConfirmDeleteAllOpen] = useState(false);
  const [hoveredImagePreview, setHoveredImagePreview] = useState<{
    imageUrl: string;
    productName: string;
    brand?: string;
    supplierName: string;
    unitPrice: number | null;
    rect: DOMRect;
  } | null>(null);
  const [zoomedImagePreview, setZoomedImagePreview] = useState<{
    imageUrl: string;
    productName: string;
    brand?: string;
    supplierName: string;
    unitPrice: number | null;
  } | null>(null);
  const descInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  useEffect(() => {
    if (!zoomedImagePreview) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setZoomedImagePreview(null);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [zoomedImagePreview]);

  useEffect(() => {
    if (!lastAddedProductId) return;
    const inputEl = descInputRefs.current[lastAddedProductId];
    if (inputEl) {
      inputEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
      inputEl.focus();
      inputEl.select();
      onClearLastAdded?.();
    }
  }, [lastAddedProductId, onClearLastAdded]);

  // Filter items based on search and winner filter
  const filteredCalculatedItems = calculatedItems.filter((item) => {
    const matchesSearch = item.description.toLowerCase().includes(searchTerm.toLowerCase());
    if (!matchesSearch) return false;

    if (selectedWinnerFilter === 'all') return true;
    if (selectedWinnerFilter === 'no_winner') return item.winnerSupplierId === null;
    return item.winnerSupplierId === selectedWinnerFilter;
  });

  // Calculate sum of each supplier column across all items
  const supplierTotalSums: Record<string, number> = {};
  const supplierWonSums: Record<string, number> = {};
  suppliers.forEach((s) => {
    supplierTotalSums[s.id] = 0;
    supplierWonSums[s.id] = 0;
  });

  calculatedItems.forEach((item) => {
    suppliers.forEach((s) => {
      const p = item.prices[s.id];
      if (p !== null && p !== undefined && p > 0) {
        supplierTotalSums[s.id] += p * (item.quantity || 1);
      }
    });

    if (item.winnerSupplierId && item.lowestPrice !== null) {
      if (supplierWonSums[item.winnerSupplierId] !== undefined) {
        supplierWonSums[item.winnerSupplierId] += item.lowestPrice * (item.quantity || 1);
      }
    }
  });

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden flex flex-col">
      {/* Table Toolbar */}
      <div className="p-4 border-b border-slate-200 flex flex-col md:flex-row md:items-center justify-between gap-3 bg-slate-50/50">
        <div className="flex flex-wrap items-center gap-2 flex-1">
          {/* Search Input */}
          <div className="relative min-w-[240px] max-w-sm flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Buscar item ou lista de faltas..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 text-xs bg-white border border-slate-200 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-slate-900 focus:border-slate-900 transition-all"
            />
          </div>

          {/* Winner Filter */}
          <select
            value={selectedWinnerFilter}
            onChange={(e) => setSelectedWinnerFilter(e.target.value)}
            className="text-xs bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-slate-700 focus:outline-hidden focus:ring-2 focus:ring-slate-900"
          >
            <option value="all">Todos os Vencedores</option>
            <option value="no_winner">Sem Cotação / Sem Vencedor</option>
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>
                Ganhos por {s.name}
              </option>
            ))}
          </select>
        </div>

        {/* Quick Actions */}
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            onClick={onAddProduct}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-slate-900 rounded-lg hover:bg-slate-800 transition-colors shadow-xs cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Adicionar Produto</span>
          </button>

          <button
            onClick={onOpenAddSupplier}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5 text-emerald-600" />
            <span>Adicionar Fornecedor</span>
          </button>

          <button
            type="button"
            onClick={() => setIsConfirmDeleteAllOpen(true)}
            disabled={products.length === 0}
            title="Excluir todos os itens do mapa"
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-rose-700 bg-rose-50 border border-rose-200 rounded-lg hover:bg-rose-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Excluir Todos</span>
          </button>
        </div>
      </div>

      {/* Main High-Density Spreadsheet Table */}
      <div
        onScroll={() => hoveredImagePreview && setHoveredImagePreview(null)}
        className="table-scroll-container overflow-x-scroll max-h-[75vh] relative"
      >
        <table className="w-full text-left border-collapse text-xs">
          {/* Header Row - Dark Sleek Professional Header like Reference Image */}
          <thead className="sticky top-0 z-20 bg-slate-900 text-white shadow-sm select-none">
            <tr>
              <th className="py-2.5 px-3 font-semibold uppercase tracking-wider text-[11px] w-14 text-center border-r border-slate-800">
                Qtd
              </th>
              <th className="py-2.5 px-2 font-semibold uppercase tracking-wider text-[11px] w-14 text-center border-r border-slate-800">
                Unid
              </th>
              <th className="py-2.5 px-4 font-semibold uppercase tracking-wider text-[11px] min-w-[220px] max-w-[320px] border-r border-slate-800">
                Lista de Faltas / Produto
              </th>
              <th className="py-2.5 px-3 font-semibold uppercase tracking-wider text-[11px] min-w-[125px] bg-emerald-950/80 text-emerald-300 border-r border-slate-800 text-right">
                <div className="flex items-center justify-end gap-1">
                  <ArrowUpDown className="w-3 h-3" />
                  <span>Menor Valor</span>
                </div>
              </th>
              <th className="py-2.5 px-3 font-semibold uppercase tracking-wider text-[11px] min-w-[130px] bg-slate-850 border-r border-slate-800 text-center">
                <div className="flex items-center justify-center gap-1 text-amber-300">
                  <Trophy className="w-3 h-3" />
                  <span>Vencedor</span>
                </div>
              </th>

              {/* Dynamic Supplier Columns */}
              {suppliers.map((supplier) => {
                const wonItemsCount = calculatedItems.filter(
                  (item) => item.winnerSupplierId === supplier.id
                ).length;

                return (
                  <th
                    key={supplier.id}
                    className="py-2.5 px-3 font-semibold uppercase tracking-wider text-[11px] min-w-[136px] border-r border-slate-800 relative group"
                  >
                    <div className="flex items-center justify-between gap-1">
                      <span className="truncate font-bold" title={supplier.name}>
                        {supplier.name}
                      </span>
                      <div className="flex items-center">
                        {wonItemsCount > 0 && (
                          <span
                            className="bg-emerald-500 text-slate-950 font-bold px-1.5 py-0.2 rounded-full text-[9px] tabular-nums mr-1"
                            title={`${wonItemsCount} item(ns) ganhos por este fornecedor`}
                          >
                            {wonItemsCount}
                          </span>
                        )}
                        <button
                          onClick={() =>
                            setActiveSupplierMenu(
                              activeSupplierMenu === supplier.id ? null : supplier.id
                            )
                          }
                          className="opacity-60 group-hover:opacity-100 hover:text-amber-300 transition-opacity p-0.5"
                          title="Opções do fornecedor"
                        >
                          <MoreVertical className="w-3 h-3" />
                        </button>
                      </div>
                    </div>

                    {/* Dropdown Menu for Supplier */}
                    {activeSupplierMenu === supplier.id && (
                      <div
                        className="absolute right-1 top-full mt-1 bg-white text-slate-900 border border-slate-200 rounded-lg shadow-lg z-30 py-1 min-w-[150px] font-normal normal-case"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <button
                          onClick={() => {
                            onEditSupplier(supplier);
                            setActiveSupplierMenu(null);
                          }}
                          className="w-full text-left px-3 py-1.5 text-xs hover:bg-slate-50 flex items-center gap-2"
                        >
                          <Edit2 className="w-3.5 h-3.5 text-slate-500" />
                          <span>Editar Fornecedor</span>
                        </button>
                        <button
                          onClick={() => {
                            if (
                              confirm(
                                `Deseja remover a coluna do fornecedor "${supplier.name}"?`
                              )
                            ) {
                              onDeleteSupplier(supplier.id);
                            }
                            setActiveSupplierMenu(null);
                          }}
                          className="w-full text-left px-3 py-1.5 text-xs hover:bg-rose-50 text-rose-600 flex items-center gap-2"
                        >
                          <Trash2 className="w-3.5 h-3.5 text-rose-500" />
                          <span>Remover Coluna</span>
                        </button>
                      </div>
                    )}
                  </th>
                );
              })}

              <th className="py-2.5 px-3 w-20 text-center">Ações</th>
            </tr>
          </thead>

          {/* Table Body */}
          <tbody className="divide-y divide-slate-200">
            {filteredCalculatedItems.length === 0 ? (
              <tr>
                <td
                  colSpan={5 + suppliers.length + 1}
                  className="py-12 text-center text-slate-400 bg-slate-50/50"
                >
                  <AlertCircle className="w-8 h-8 mx-auto mb-2 text-slate-300" />
                  <p className="font-medium text-slate-600">Nenhum produto encontrado</p>
                  <p className="text-xs text-slate-400 mt-1">
                    Adicione itens à lista ou altere o filtro de busca acima.
                  </p>
                  <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
                    {products.length === 0 && savedCatalogCount > 0 && (
                      <button
                        type="button"
                        onClick={onRestoreCatalogProducts}
                        className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-lg hover:bg-emerald-100 transition-colors cursor-pointer"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                        <span>Restaurar Lista de Produtos ({savedCatalogCount})</span>
                      </button>
                    )}
                    <button
                      onClick={onAddProduct}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-slate-900 rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Adicionar Primeiro Produto</span>
                    </button>
                  </div>
                </td>
              </tr>
            ) : (
              filteredCalculatedItems.map((item, index) => {
                const isEven = index % 2 === 0;

                return (
                  <tr
                    key={item.id}
                    className={`transition-colors hover:bg-slate-100/60 ${
                      isEven ? 'bg-white' : 'bg-slate-50/40'
                    }`}
                  >
                    {/* Qtd */}
                    <td className="p-1 border-r border-slate-200 text-center">
                      <input
                        type="number"
                        min="1"
                        value={item.quantity || ''}
                        onChange={(e) =>
                          onUpdateProduct(item.id, {
                            quantity: Math.max(1, parseInt(e.target.value) || 1),
                          })
                        }
                        className="w-12 text-center py-1 px-1 font-mono font-medium rounded-sm border border-transparent hover:border-slate-300 focus:border-slate-900 focus:bg-white focus:outline-hidden tabular-nums"
                      />
                    </td>

                    {/* Unid */}
                    <td className="p-1 border-r border-slate-200 text-center">
                      <input
                        type="text"
                        value={item.unit || 'UN'}
                        onChange={(e) =>
                          onUpdateProduct(item.id, { unit: e.target.value.toUpperCase() })
                        }
                        className="w-12 text-center uppercase py-1 px-1 font-mono text-[11px] rounded-sm border border-transparent hover:border-slate-300 focus:border-slate-900 focus:bg-white focus:outline-hidden"
                      />
                    </td>

                    {/* Lista de Faltas / Descrição */}
                    <td className="p-1.5 border-r border-slate-200">
                      <input
                        ref={(el) => {
                          descInputRefs.current[item.id] = el;
                        }}
                        type="text"
                        value={item.description}
                        onChange={(e) =>
                          onUpdateProduct(item.id, { description: e.target.value })
                        }
                        onBlur={() => onSortProducts?.()}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.currentTarget.blur();
                          }
                        }}
                        placeholder="Ex: Cimento CP II 50kg..."
                        className="w-full py-1 px-2 font-medium text-slate-800 rounded-sm border border-transparent hover:border-slate-300 focus:border-slate-900 focus:bg-white focus:outline-hidden"
                      />
                    </td>

                    {/* Menor Valor (Calculado Automaticamente) */}
                    <td className="p-1.5 border-r border-slate-200 text-right bg-emerald-50/50">
                      {item.lowestPrice !== null ? (
                        <div className="font-mono tabular-nums">
                          <span className="font-bold text-emerald-700 text-xs">
                            {formatBRL(item.lowestPrice)}
                          </span>
                          <div className="text-[10px] text-slate-500 font-normal">
                            Total: {formatBRL(item.totalLowest)}
                          </div>
                        </div>
                      ) : (
                        <span className="text-slate-400 font-mono">-</span>
                      )}
                    </td>

                    {/* Vencedor (Fornecedor com Menor Preço) */}
                    <td className="p-1.5 border-r border-slate-200 text-center bg-slate-50/50">
                      {item.winnerSupplierName ? (
                        <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-900 font-semibold text-[11px] border border-emerald-200">
                          <Trophy className="w-3 h-3 text-emerald-700 shrink-0" />
                          <span className="truncate max-w-[100px]">
                            {item.winnerSupplierName}
                          </span>
                          {item.isTie && (
                            <span
                              className="text-[9px] bg-amber-200 text-amber-900 px-1 rounded-sm ml-0.5"
                              title="Houve empate com outro(s) fornecedor(es)"
                            >
                              Empate
                            </span>
                          )}
                        </div>
                      ) : (
                        <span className="text-slate-400 text-xs italic">Sem cotação</span>
                      )}
                    </td>

                    {/* Colunas dos Fornecedores (Valores Cotados + Imagem do Item) */}
                    {suppliers.map((supplier) => {
                      const price = item.prices[supplier.id];
                      const imageUrl = item.images?.[supplier.id];
                      const brand =
                        item.brands?.[supplier.id] ||
                        extractProductBrand(item.description);
                      const isWinner =
                        price !== null &&
                        price !== undefined &&
                        price === item.lowestPrice &&
                        price > 0;

                      return (
                        <td
                          key={supplier.id}
                          className={`p-1 border-r border-slate-200 text-right transition-colors ${
                            isWinner
                              ? 'bg-emerald-50/90 font-bold'
                              : 'hover:bg-slate-100/50'
                          }`}
                        >
                          <div
                            onMouseEnter={(e) => {
                              if (!imageUrl) return;
                              setHoveredImagePreview({
                                imageUrl,
                                productName: item.description,
                                brand,
                                supplierName: supplier.name,
                                unitPrice: price ?? null,
                                rect: e.currentTarget.getBoundingClientRect(),
                              });
                            }}
                            onMouseLeave={() => {
                              if (imageUrl) setHoveredImagePreview(null);
                            }}
                            className={`flex items-center gap-1 rounded-sm border px-1 transition-all ${
                              isWinner
                                ? 'border-emerald-400 bg-emerald-50 focus-within:ring-1 focus-within:ring-emerald-500'
                                : 'border-transparent hover:border-slate-300 focus-within:border-slate-900 focus-within:bg-white'
                            }`}
                          >
                            {imageUrl && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setZoomedImagePreview({
                                    imageUrl,
                                    productName: item.description,
                                    brand,
                                    supplierName: supplier.name,
                                    unitPrice: price ?? null,
                                  });
                                }}
                                aria-label={`Ampliar foto de ${item.description} em ${supplier.name}`}
                                className="w-7 h-7 rounded-xs border border-slate-200 bg-white shrink-0 flex items-center justify-center overflow-hidden hover:border-slate-500 hover:scale-105 transition-transform cursor-zoom-in shadow-2xs"
                              >
                                <img
                                  src={imageUrl}
                                  alt={item.description}
                                  loading="lazy"
                                  className="w-full h-full object-contain"
                                />
                              </button>
                            )}
                            {isWinner && (
                              <span
                                className="text-emerald-600 text-[11px] shrink-0 pointer-events-none"
                                title="Menor preço cotado!"
                              >
                                ★
                              </span>
                            )}
                            <input
                              type="number"
                              step="0.01"
                              min="0"
                              placeholder="-"
                              value={price !== null && price !== undefined ? price : ''}
                              onChange={(e) => {
                                const val = e.target.value;
                                onUpdatePrice(
                                  item.id,
                                  supplier.id,
                                  val === '' ? null : parseFloat(val) || 0
                                );
                              }}
                              className={`w-full min-w-0 py-1 px-1 text-right font-mono tabular-nums text-xs bg-transparent border-0 focus:outline-hidden ${
                                isWinner
                                  ? 'text-emerald-800 font-bold'
                                  : 'text-slate-700'
                              }`}
                            />
                          </div>
                        </td>
                      );
                    })}

                    {/* Ações da Linha */}
                    <td className="p-1 text-center">
                      <div className="flex items-center justify-center gap-0.5">
                        <button
                          type="button"
                          onClick={() => onClearProductPrices(item.id)}
                          className="p-1 text-slate-400 hover:text-amber-600 rounded-sm hover:bg-amber-50 transition-colors cursor-pointer"
                          title="Limpar preços da linha (manter produto)"
                        >
                          <Eraser className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => onDuplicateProduct(item.id)}
                          className="p-1 text-slate-400 hover:text-slate-700 rounded-sm hover:bg-slate-100 transition-colors cursor-pointer"
                          title="Duplicar linha"
                        >
                          <Copy className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => onDeleteProduct(item.id)}
                          className="p-1 text-slate-400 hover:text-rose-600 rounded-sm hover:bg-rose-50 transition-colors cursor-pointer"
                          title="Excluir linha do mapa (mantém na lista de produtos)"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>

          {/* Table Footer: Totals and Summaries */}
          {filteredCalculatedItems.length > 0 && (
            <tfoot className="sticky bottom-0 z-10 bg-slate-900 text-white font-mono font-semibold text-xs border-t-2 border-slate-700 shadow-lg">
              <tr>
                <td className="py-2.5 px-3 text-center border-r border-slate-800">
                  {filteredCalculatedItems.reduce((acc, i) => acc + (i.quantity || 1), 0)}
                </td>
                <td className="py-2.5 px-2 text-center border-r border-slate-800 text-[10px] text-slate-400">
                  TOT
                </td>
                <td className="py-2.5 px-4 uppercase text-[11px] font-sans font-bold border-r border-slate-800">
                  Total das Faltas ({filteredCalculatedItems.length} itens)
                </td>

                {/* Total Menor Valor */}
                <td className="py-2.5 px-3 text-right bg-emerald-950 text-emerald-300 border-r border-slate-800 font-bold tabular-nums">
                  {formatBRL(grandTotalLowest)}
                </td>

                <td className="py-2.5 px-3 text-center border-r border-slate-800 text-slate-400 font-sans text-[11px]">
                  Otimizado
                </td>

                {/* Subtotais por Fornecedor */}
                {suppliers.map((supplier) => {
                  const wonSum = supplierWonSums[supplier.id] || 0;
                  const totalSum = supplierTotalSums[supplier.id] || 0;

                  return (
                    <td
                      key={supplier.id}
                      className="py-2.5 px-2 text-right border-r border-slate-800 tabular-nums text-[11px]"
                    >
                      {wonSum > 0 ? (
                        <div title={`Total ganho por ${supplier.name}: ${formatBRL(wonSum)}`}>
                          <span className="text-emerald-300 font-bold">
                            {formatBRL(wonSum)}
                          </span>
                          <div className="text-[9px] text-slate-400 font-normal">
                            Cotado: {formatBRL(totalSum)}
                          </div>
                        </div>
                      ) : (
                        <div className="text-slate-500 font-normal" title="Nenhum item ganho">
                          {totalSum > 0 ? formatBRL(totalSum) : '-'}
                        </div>
                      )}
                    </td>
                  );
                })}

                <td className="py-2.5 px-2 text-center text-slate-500">·</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {/* Confirmation Modal for Deleting All Items */}
      {isConfirmDeleteAllOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-lg w-full overflow-hidden">
            <div className="p-5 flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-rose-100 text-rose-600 flex items-center justify-center shrink-0">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900">
                  Limpar cotações ou excluir itens do mapa?
                </h3>
                <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                  Você pode zerar apenas os valores cotados mantendo todos os <strong>{products.length}</strong> produto(s) na tabela, ou remover as linhas do mapa atual. Em ambos os casos, sua <strong>lista de produtos</strong> e as <strong>correspondências memorizadas</strong> continuarão salvas.
                </p>
              </div>
            </div>
            <div className="px-5 py-3.5 bg-slate-50 border-t border-slate-200 flex flex-wrap items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setIsConfirmDeleteAllOpen(false)}
                className="px-3.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-200 rounded-lg transition-colors cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => {
                  onDeleteAllProducts();
                  setIsConfirmDeleteAllOpen(false);
                }}
                className="px-3.5 py-1.5 text-xs font-semibold text-rose-700 bg-rose-50 border border-rose-200 hover:bg-rose-100 rounded-lg transition-colors cursor-pointer"
              >
                Excluir linhas da tabela
              </button>
              <button
                type="button"
                onClick={() => {
                  onClearAllPrices();
                  setIsConfirmDeleteAllOpen(false);
                }}
                className="px-3.5 py-1.5 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg transition-colors shadow-xs cursor-pointer"
              >
                Limpar preços e manter lista
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Floating Hover Image Preview on Price Cell */}
      {hoveredImagePreview && !zoomedImagePreview && (
        <div
          className="fixed z-[60] pointer-events-none bg-white border border-slate-200 rounded-2xl shadow-2xl overflow-hidden w-72"
          style={{
            left: Math.min(
              Math.max(12, hoveredImagePreview.rect.left),
              window.innerWidth - 300
            ),
            top:
              hoveredImagePreview.rect.bottom + 8 + 340 > window.innerHeight
                ? Math.max(12, hoveredImagePreview.rect.top - 344)
                : hoveredImagePreview.rect.bottom + 8,
          }}
        >
          <div className="relative w-full h-56 p-3 bg-white flex items-center justify-center overflow-hidden border-b border-slate-100">
            {hoveredImagePreview.brand && (
              <span className="absolute top-2 left-2 z-10 inline-flex items-center px-2 py-0.5 rounded-md bg-slate-900/85 backdrop-blur-xs text-white text-[10px] font-bold uppercase tracking-wider shadow-sm border border-white/15">
                Marca: {hoveredImagePreview.brand}
              </span>
            )}
            <img
              src={hoveredImagePreview.imageUrl}
              alt={hoveredImagePreview.productName}
              className="w-full h-full object-contain"
            />
          </div>
          <div className="p-2.5 bg-slate-50/70 space-y-1">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 truncate">
                {hoveredImagePreview.supplierName}
              </span>
              {hoveredImagePreview.unitPrice !== null && (
                <span className="text-xs font-mono font-bold text-emerald-700 shrink-0">
                  {formatBRL(hoveredImagePreview.unitPrice)}
                </span>
              )}
            </div>
            <p className="text-[11px] font-semibold text-slate-800 line-clamp-2 leading-snug">
              {hoveredImagePreview.productName}
            </p>
          </div>
        </div>
      )}

      {/* Click Enlarged Lightbox Modal */}
      {zoomedImagePreview && (
        <div
          onClick={() => setZoomedImagePreview(null)}
          className="fixed inset-0 z-[70] bg-slate-950/75 backdrop-blur-xs flex items-center justify-center p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-lg w-full overflow-hidden"
          >
            <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <div className="min-w-0 pr-4">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block">
                  {zoomedImagePreview.supplierName}
                </span>
                <h4 className="text-xs font-bold text-slate-900 truncate">
                  {zoomedImagePreview.productName}
                </h4>
              </div>
              <button
                type="button"
                onClick={() => setZoomedImagePreview(null)}
                aria-label="Fechar ampliação"
                className="p-1 text-slate-400 hover:text-slate-700 rounded-md hover:bg-slate-200 cursor-pointer shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="relative w-full h-80 sm:h-96 p-4 bg-white flex items-center justify-center overflow-hidden">
              {zoomedImagePreview.brand && (
                <span className="absolute top-3 left-3 z-10 inline-flex items-center px-2.5 py-1 rounded-md bg-slate-900/85 backdrop-blur-xs text-white text-[11px] font-bold uppercase tracking-wider shadow-md border border-white/15">
                  Marca: {zoomedImagePreview.brand}
                </span>
              )}
              <img
                src={zoomedImagePreview.imageUrl}
                alt={zoomedImagePreview.productName}
                className="w-full h-full object-contain"
              />
            </div>
            <div className="px-4 py-3 border-t border-slate-200 flex items-center justify-between text-xs bg-white">
              <span className="text-slate-500">Preço unitário neste fornecedor</span>
              <span className="font-mono font-bold text-emerald-700 text-sm">
                {zoomedImagePreview.unitPrice !== null
                  ? formatBRL(zoomedImagePreview.unitPrice)
                  : 'Sem preço'}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
