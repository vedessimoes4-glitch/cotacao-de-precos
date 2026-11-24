import React, { useState, useEffect, useMemo } from 'react';
import { ProductItem, Supplier, SupplierOrderSummary } from './types/quotation';
import { INITIAL_SUPPLIERS, INITIAL_PRODUCTS } from './data/initialData';
import {
  calculateQuotation,
  sortProductsAlphabetically,
  sortSuppliersAlphabetically,
} from './utils/calculations';
import { exportFullQuotationToExcel } from './utils/excelUtils';
import { findBestProductMatch, extractProductBrand } from './utils/productMatcher';
import {
  findMemorizedProductMatch,
  isCorrespondenceRejected,
  memorizeCorrespondence,
  normalizeMemoryKey,
} from './utils/correspondenceMemory';
import {
  loadProductCatalogMemory,
  syncProductsIntoCatalog,
  replaceCatalogWithProducts,
  mergeActiveAndCatalogProducts,
  MemorizedProductEntry,
} from './utils/productCatalogMemory';
import { Header } from './components/Header';
import { SummaryCards } from './components/SummaryCards';
import { QuotationTable } from './components/QuotationTable';
import { SupplierOrdersView } from './components/SupplierOrdersView';
import { AIExtractorModal } from './components/AIExtractorModal';
import { ImportExportModal } from './components/ImportExportModal';
import { NewSupplierModal } from './components/NewSupplierModal';
import { PrintOrderModal } from './components/PrintOrderModal';
import { MobileAccessModal } from './components/MobileAccessModal';

const STORAGE_KEY_PRODUCTS = 'cotafacil_products_v1';
const STORAGE_KEY_SUPPLIERS = 'cotafacil_suppliers_v1';

export default function App() {
  // Load state from localStorage or initial datasets
  const [suppliers, setSuppliers] = useState<Supplier[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_SUPPLIERS);
      if (saved) return sortSuppliersAlphabetically(JSON.parse(saved));
    } catch (e) {
      console.error(e);
    }
    return sortSuppliersAlphabetically(INITIAL_SUPPLIERS);
  });

  const [products, setProducts] = useState<ProductItem[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_PRODUCTS);
      if (saved) return sortProductsAlphabetically(JSON.parse(saved));
    } catch (e) {
      console.error(e);
    }
    return sortProductsAlphabetically(INITIAL_PRODUCTS);
  });

  // Navigation & Modals state
  const [activeTab, setActiveTab] = useState<'table' | 'orders' | 'ai'>('table');
  const [isImportExportOpen, setIsImportExportOpen] = useState(false);
  const [isMobileModalOpen, setIsMobileModalOpen] = useState(false);
  const [isNewSupplierOpen, setIsNewSupplierOpen] = useState(false);
  const [supplierToEdit, setSupplierToEdit] = useState<Supplier | null>(null);
  const [printOrder, setPrintOrder] = useState<SupplierOrderSummary | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [lastAddedProductId, setLastAddedProductId] = useState<string | null>(null);

  const [catalogMemory, setCatalogMemory] = useState<MemorizedProductEntry[]>(() =>
    loadProductCatalogMemory()
  );

  // Heartbeat & Automatic process shutdown on window close
  useEffect(() => {
    // 1. Send immediate ping and periodic heartbeat
    const sendPing = () => {
      fetch('/api/heartbeat', { method: 'POST', keepalive: true }).catch(() => {});
    };
    sendPing();
    const interval = setInterval(sendPing, 4000);

    // 2. Notify backend when window/tab is being closed
    const handleUnload = () => {
      try {
        if (navigator.sendBeacon) {
          navigator.sendBeacon('/api/window-closed');
        } else {
          fetch('/api/window-closed', { method: 'POST', keepalive: true }).catch(() => {});
        }
      } catch {}
    };

    window.addEventListener('beforeunload', handleUnload);
    window.addEventListener('pagehide', handleUnload);

    return () => {
      clearInterval(interval);
      window.removeEventListener('beforeunload', handleUnload);
      window.removeEventListener('pagehide', handleUnload);
    };
  }, []);

  // Sync to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY_SUPPLIERS, JSON.stringify(suppliers));
    } catch (e) {
      console.error(e);
    }
  }, [suppliers]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY_PRODUCTS, JSON.stringify(products));
    } catch (e) {
      console.error(e);
    }
    const updatedCatalog = syncProductsIntoCatalog(products);
    setCatalogMemory(updatedCatalog);
  }, [products]);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  // Real-time calculation engine
  const {
    calculatedItems,
    supplierOrders,
    grandTotalLowest,
    grandTotalHighest,
    totalSavings,
    savingsPercentage,
    itemsWithWinnerCount,
  } = useMemo(() => {
    return calculateQuotation(products, suppliers);
  }, [products, suppliers]);

  // Product manipulations
  const handleUpdateProduct = (id: string, updates: Partial<ProductItem>) => {
    setProducts((prev) =>
      prev.map((p) => (p.id === id ? { ...p, ...updates } : p))
    );
  };

  const handleUpdatePrice = (
    productId: string,
    supplierId: string,
    price: number | null
  ) => {
    setProducts((prev) =>
      prev.map((p) => {
        if (p.id !== productId) return p;
        return {
          ...p,
          prices: {
            ...p.prices,
            [supplierId]: price,
          },
        };
      })
    );
  };

  const handleSortProducts = () => {
    setProducts((prev) => sortProductsAlphabetically(prev));
  };

  const handleAddProduct = () => {
    const newId = `p_${Date.now()}`;
    const newProduct: ProductItem = {
      id: newId,
      quantity: 1,
      description: 'Novo Produto / Material',
      unit: 'UN',
      prices: {},
    };
    setProducts((prev) => sortProductsAlphabetically([newProduct, ...prev]));
    setLastAddedProductId(newId);
    showToast('Novo item adicionado à lista de faltas.');
  };

  const handleDeleteProduct = (id: string) => {
    setProducts((prev) => {
      syncProductsIntoCatalog(prev);
      return prev.filter((p) => p.id !== id);
    });
    showToast('Item removido do mapa (mantido na lista de produtos salva).');
  };

  const handleClearProductPrices = (id: string) => {
    setProducts((prev) =>
      prev.map((p) =>
        p.id === id
          ? {
              ...p,
              prices: {},
              images: undefined,
              brands: undefined,
            }
          : p
      )
    );
    showToast('Preços da linha limpos (produto mantido).');
  };

  const handleClearAllPrices = () => {
    setProducts((prev) =>
      prev.map((p) => ({
        ...p,
        prices: {},
        images: undefined,
        brands: undefined,
      }))
    );
    showToast('Cotações limpas! Toda a lista de produtos foi mantida.');
  };

  const handleDeleteAllProducts = () => {
    setProducts((prev) => {
      syncProductsIntoCatalog(prev);
      return [];
    });
    setLastAddedProductId(null);
    showToast('Itens removidos da tabela (lista de produtos mantida na memória).');
  };

  const handleRestoreCatalogProducts = () => {
    const saved = loadProductCatalogMemory();
    if (saved.length === 0) return;

    setProducts((prev) => {
      const existingKeys = new Set(
        prev.map((p) => normalizeMemoryKey(p.description)).filter(Boolean)
      );
      const existingIds = new Set(prev.map((p) => p.id));
      const restored: ProductItem[] = saved
        .filter(
          (entry) =>
            !existingIds.has(entry.id) &&
            !existingKeys.has(normalizeMemoryKey(entry.description))
        )
        .map((entry) => ({
          id: entry.id,
          description: entry.description,
          quantity: entry.quantity || 1,
          unit: entry.unit || 'UN',
          prices: {},
        }));
      return sortProductsAlphabetically([...prev, ...restored]);
    });
    showToast(`Lista com ${saved.length} produto(s) restaurada no mapa!`);
  };

  const handleDuplicateProduct = (id: string) => {
    const item = products.find((p) => p.id === id);
    if (!item) return;

    const duplicated: ProductItem = {
      ...item,
      id: `p_${Date.now()}`,
      description: `${item.description} (Cópia)`,
      prices: { ...item.prices },
      ...(item.images ? { images: { ...item.images } } : {}),
      ...(item.brands ? { brands: { ...item.brands } } : {}),
    };

    setProducts((prev) => sortProductsAlphabetically([...prev, duplicated]));
    showToast('Linha duplicada.');
  };

  // Supplier manipulations
  const handleSaveSupplier = (supplierData: {
    id?: string;
    name: string;
    phone?: string;
  }) => {
    if (supplierData.id) {
      // Edit
      setSuppliers((prev) =>
        sortSuppliersAlphabetically(
          prev.map((s) =>
            s.id === supplierData.id
              ? { ...s, name: supplierData.name, phone: supplierData.phone }
              : s
          )
        )
      );
      showToast(`Fornecedor "${supplierData.name}" atualizado.`);
    } else {
      // Create
      const newSupplier: Supplier = {
        id: `s_${Date.now()}`,
        name: supplierData.name,
        phone: supplierData.phone,
      };
      setSuppliers((prev) => sortSuppliersAlphabetically([...prev, newSupplier]));
      showToast(`Fornecedor "${supplierData.name}" adicionado com sucesso!`);
    }
  };

  const handleDeleteSupplier = (supplierId: string) => {
    setSuppliers((prev) => prev.filter((s) => s.id !== supplierId));
    // Clean up prices, images, and brands for that supplier
    setProducts((prev) =>
      prev.map((p) => {
        const newPrices = { ...p.prices };
        delete newPrices[supplierId];

        const newImages = p.images ? { ...p.images } : undefined;
        if (newImages) delete newImages[supplierId];

        const newBrands = p.brands ? { ...p.brands } : undefined;
        if (newBrands) delete newBrands[supplierId];

        return {
          ...p,
          prices: newPrices,
          images: newImages && Object.keys(newImages).length > 0 ? newImages : undefined,
          brands: newBrands && Object.keys(newBrands).length > 0 ? newBrands : undefined,
        };
      })
    );
    showToast('Coluna do fornecedor removida.');
  };

  const handleResetToDefault = () => {
    if (
      confirm(
        'Deseja restaurar os dados de exemplo da planilha com os fornecedores padrão (Atacadão, Bartofil, Dimacol, etc.)?'
      )
    ) {
      setSuppliers(sortSuppliersAlphabetically(INITIAL_SUPPLIERS));
      setProducts(sortProductsAlphabetically(INITIAL_PRODUCTS));
      showToast('Dados de demonstração restaurados com sucesso.');
    }
  };

  // AI Extractor Application
  const handleApplyExtractedPrices = (
    supplierId: string,
    extractedItems: Array<{
      productName: string;
      brand?: string;
      unit?: string;
      quantity: number;
      packQuantity?: number;
      totalItemPrice?: number;
      unitPrice: number;
      calculationNote?: string;
      matchedExistingId?: string;
      imageUrl?: string;
    }>
  ) => {
    setProducts((prev) => {
      const nextProducts = prev.map((p) => ({
        ...p,
        prices: { ...p.prices },
        ...(p.images ? { images: { ...p.images } } : {}),
        ...(p.brands ? { brands: { ...p.brands } } : {}),
      }));

      extractedItems.forEach((extracted) => {
        // 1. Respect explicit/selected matchedExistingId
        let existingIdx = extracted.matchedExistingId
          ? nextProducts.findIndex((p) => p.id === extracted.matchedExistingId)
          : -1;

        // 2. Fallback: exact trimmed description match
        if (existingIdx === -1) {
          existingIdx = nextProducts.findIndex(
            (p) =>
              p.description.toLowerCase().trim() ===
              extracted.productName.toLowerCase().trim()
          );
        }

        // 3. Fallback: memorized correspondences (persisted even after products are deleted)
        if (existingIdx === -1) {
          const memId = findMemorizedProductMatch(
            extracted.productName,
            nextProducts.map((p) => ({
              id: p.id,
              name: p.description,
              quantity: p.quantity,
            }))
          );
          if (memId) {
            existingIdx = nextProducts.findIndex((p) => p.id === memId);
          }
        }

        // 4. Fallback: brand-agnostic intelligent product matching (respecting unlinked pairs)
        if (existingIdx === -1) {
          const allowedCandidates = nextProducts
            .filter((p) => !isCorrespondenceRejected(extracted.productName, p.description))
            .map((p) => ({
              id: p.id,
              name: p.description,
              quantity: p.quantity,
            }));
          const matchedId = findBestProductMatch(extracted.productName, allowedCandidates);
          if (matchedId) {
            existingIdx = nextProducts.findIndex((p) => p.id === matchedId);
          }
        }

        const resolvedBrand =
          (extracted.brand || extractProductBrand(extracted.productName)).trim();

        if (existingIdx !== -1) {
          // Memorize confirmed link permanently so it works even if all products are cleared later
          memorizeCorrespondence(extracted.productName, nextProducts[existingIdx].description);

          const mergedImages = {
            ...(nextProducts[existingIdx].images || {}),
            ...(extracted.imageUrl ? { [supplierId]: extracted.imageUrl } : {}),
          };
          const mergedBrands = {
            ...(nextProducts[existingIdx].brands || {}),
            ...(resolvedBrand ? { [supplierId]: resolvedBrand } : {}),
          };

          // Same product (even if different brand): apply unit price, thumbnail & brand on the same row
          nextProducts[existingIdx] = {
            ...nextProducts[existingIdx],
            prices: {
              ...nextProducts[existingIdx].prices,
              [supplierId]: extracted.unitPrice,
            },
            ...(Object.keys(mergedImages).length > 0 ? { images: mergedImages } : {}),
            ...(Object.keys(mergedBrands).length > 0 ? { brands: mergedBrands } : {}),
          };
        } else {
          // Check memorized product catalog before creating a brand-new row
          const savedCatalog = loadProductCatalogMemory();
          let catalogMatch = extracted.matchedExistingId
            ? savedCatalog.find((c) => c.id === extracted.matchedExistingId)
            : undefined;

          if (!catalogMatch) {
            const normExt = normalizeMemoryKey(extracted.productName);
            catalogMatch = savedCatalog.find(
              (c) => normalizeMemoryKey(c.description) === normExt
            );
          }

          if (!catalogMatch && savedCatalog.length > 0) {
            const catalogCandidates = savedCatalog.map((c) => ({
              id: c.id,
              name: c.description,
              quantity: c.quantity,
            }));
            const memCatalogId = findMemorizedProductMatch(
              extracted.productName,
              catalogCandidates
            );
            if (memCatalogId) {
              catalogMatch = savedCatalog.find((c) => c.id === memCatalogId);
            } else {
              const allowedCatalog = catalogCandidates.filter(
                (c) => !isCorrespondenceRejected(extracted.productName, c.name)
              );
              const bestCatalogId = findBestProductMatch(
                extracted.productName,
                allowedCatalog
              );
              if (bestCatalogId) {
                catalogMatch = savedCatalog.find((c) => c.id === bestCatalogId);
              }
            }
          }

          if (catalogMatch) {
            memorizeCorrespondence(extracted.productName, catalogMatch.description);
            nextProducts.push({
              id: catalogMatch.id,
              description: catalogMatch.description,
              quantity: catalogMatch.quantity || 1,
              unit: catalogMatch.unit || extracted.unit || 'UN',
              prices: {
                [supplierId]: extracted.unitPrice,
              },
              ...(extracted.imageUrl ? { images: { [supplierId]: extracted.imageUrl } } : {}),
              ...(resolvedBrand ? { brands: { [supplierId]: resolvedBrand } } : {}),
            });
          } else {
            // Add as new product with total individual units (quantity * packQuantity)
            const totalUnits =
              (extracted.quantity > 0 ? extracted.quantity : 1) *
              (extracted.packQuantity && extracted.packQuantity > 0
                ? extracted.packQuantity
                : 1);

            nextProducts.push({
              id: `p_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
              description: extracted.productName,
              quantity: totalUnits,
              unit: extracted.unit || 'UN',
              prices: {
                [supplierId]: extracted.unitPrice,
              },
              ...(extracted.imageUrl ? { images: { [supplierId]: extracted.imageUrl } } : {}),
              ...(resolvedBrand ? { brands: { [supplierId]: resolvedBrand } } : {}),
            });
          }
        }
      });

      const finalSorted = sortProductsAlphabetically(nextProducts);
      syncProductsIntoCatalog(finalSorted);
      return finalSorted;
    });

    const targetSupplier = suppliers.find((s) => s.id === supplierId);
    showToast(
      `Preços aplicados com sucesso na coluna de ${targetSupplier?.name || 'fornecedor'}!`
    );
    setActiveTab('table');
  };

  // Excel / CSV Import
  const handleImportProducts = (
    importedList: Array<{
      quantity: number;
      description: string;
      unit: string;
      pricesBySupplierName: Record<string, number>;
    }>,
    detectedSupplierNames: string[]
  ) => {
    // 1. Ensure all detected supplier columns exist
    const currentSupplierNames = new Set(
      suppliers.map((s) => s.name.trim().toLowerCase())
    );
    const newSuppliersToAdd: Supplier[] = [];

    detectedSupplierNames.forEach((name) => {
      const lower = name.trim().toLowerCase();
      if (!currentSupplierNames.has(lower)) {
        const newSup: Supplier = {
          id: `s_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
          name: name.trim(),
        };
        newSuppliersToAdd.push(newSup);
        currentSupplierNames.add(lower);
      }
    });

    const allSuppliers = sortSuppliersAlphabetically([...suppliers, ...newSuppliersToAdd]);
    if (newSuppliersToAdd.length > 0) {
      setSuppliers(allSuppliers);
    }

    // Map supplier names to IDs
    const supplierNameToId: Record<string, string> = {};
    allSuppliers.forEach((s) => {
      supplierNameToId[s.name.trim().toLowerCase()] = s.id;
    });

    // 2. Build products
    const newProducts: ProductItem[] = sortProductsAlphabetically(
      importedList.map((item, idx) => {
        const prices: Record<string, number | null> = {};
        Object.entries(item.pricesBySupplierName).forEach(([name, price]) => {
          const supId = supplierNameToId[name.trim().toLowerCase()];
          if (supId) {
            prices[supId] = price;
          }
        });

        return {
          id: `p_import_${Date.now()}_${idx}`,
          quantity: item.quantity,
          description: item.description,
          unit: item.unit || 'UN',
          prices,
        };
      })
    );

    setProducts(newProducts);
    const replacedCatalog = replaceCatalogWithProducts(newProducts);
    setCatalogMemory(replacedCatalog);
    showToast(`${newProducts.length} itens importados da planilha com sucesso!`);
  };

  const allAvailableProducts = useMemo(
    () => mergeActiveAndCatalogProducts(products, catalogMemory),
    [products, catalogMemory]
  );

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 text-slate-900">
      {/* Top Bar Contract Navigation */}
      <Header
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        winningSuppliersCount={supplierOrders.length}
        onOpenMobileModal={() => setIsMobileModalOpen(true)}
        onOpenImportExport={() => setIsImportExportOpen(true)}
        onExportExcel={() =>
          exportFullQuotationToExcel(calculatedItems, suppliers, grandTotalLowest)
        }
        onResetToDefault={handleResetToDefault}
        onStopAllProcesses={async () => {
          if (
            !window.confirm(
              'Deseja encerrar o servidor e parar todos os processos deste sistema?'
            )
          ) {
            return;
          }
          try {
            await fetch('/api/shutdown', { method: 'POST' });
          } catch {
            // Server already closing
          }
          window.close();
        }}
      />

      {/* Main Content Viewport */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 lg:px-8 py-6">
        {/* KPI Summary Cards */}
        <SummaryCards
          totalItems={products.length}
          itemsWithWinnerCount={itemsWithWinnerCount}
          grandTotalLowest={grandTotalLowest}
          grandTotalHighest={grandTotalHighest}
          totalSavings={totalSavings}
          savingsPercentage={savingsPercentage}
          winningSuppliersCount={supplierOrders.length}
          onViewOrders={() => setActiveTab('orders')}
        />

        {/* Dynamic Views */}
        {activeTab === 'table' && (
          <QuotationTable
            products={products}
            calculatedItems={calculatedItems}
            suppliers={suppliers}
            onUpdateProduct={handleUpdateProduct}
            onSortProducts={handleSortProducts}
            lastAddedProductId={lastAddedProductId}
            onClearLastAdded={() => setLastAddedProductId(null)}
            onUpdatePrice={handleUpdatePrice}
            onAddProduct={handleAddProduct}
            onDeleteProduct={handleDeleteProduct}
            onClearProductPrices={handleClearProductPrices}
            onClearAllPrices={handleClearAllPrices}
            onDeleteAllProducts={handleDeleteAllProducts}
            onRestoreCatalogProducts={handleRestoreCatalogProducts}
            savedCatalogCount={catalogMemory.length}
            onDuplicateProduct={handleDuplicateProduct}
            onOpenAddSupplier={() => {
              setSupplierToEdit(null);
              setIsNewSupplierOpen(true);
            }}
            onDeleteSupplier={handleDeleteSupplier}
            onEditSupplier={(sup) => {
              setSupplierToEdit(sup);
              setIsNewSupplierOpen(true);
            }}
            grandTotalLowest={grandTotalLowest}
          />
        )}

        {activeTab === 'orders' && (
          <SupplierOrdersView
            supplierOrders={supplierOrders}
            onPrintOrder={(order) => setPrintOrder(order)}
            onBackToTable={() => setActiveTab('table')}
          />
        )}

        {activeTab === 'ai' && (
          <div className="bg-white rounded-xl border border-slate-200 p-8 shadow-xs text-center max-w-2xl mx-auto space-y-4">
            <div className="w-12 h-12 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center font-bold mx-auto">
              <span className="text-xl">✨</span>
            </div>
            <h2 className="text-lg font-bold text-slate-900">
              Leitor Inteligente de Cotações com IA
            </h2>
            <p className="text-xs text-slate-500 max-w-lg mx-auto">
              Tire uma foto do orçamento recebido, faça upload do PDF ou cole o texto do WhatsApp. O Gemini 3.8 Flash lê os itens e lança os preços automaticamente na coluna do fornecedor escolhido.
            </p>
            <button
              onClick={() => setActiveTab('ai')}
              className="px-5 py-2.5 text-xs font-semibold text-white bg-slate-900 rounded-lg hover:bg-slate-800 transition-colors shadow-xs"
            >
              Abrir Leitor de Cotação
            </button>
          </div>
        )}
      </main>

      {/* Floating Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 bg-slate-900 text-white px-4 py-2.5 rounded-xl text-xs font-medium shadow-xl flex items-center gap-2 border border-slate-800 animate-fade-in">
          <span className="w-2 h-2 rounded-full bg-emerald-400" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Modals */}
      <AIExtractorModal
        isOpen={activeTab === 'ai'}
        onClose={() => setActiveTab('table')}
        suppliers={suppliers}
        existingProducts={allAvailableProducts}
        onApplyExtractedPrices={handleApplyExtractedPrices}
      />

      <ImportExportModal
        isOpen={isImportExportOpen}
        onClose={() => setIsImportExportOpen(false)}
        suppliers={suppliers}
        calculatedItems={calculatedItems}
        grandTotalLowest={grandTotalLowest}
        onImportProducts={handleImportProducts}
      />

      <NewSupplierModal
        isOpen={isNewSupplierOpen}
        onClose={() => {
          setIsNewSupplierOpen(false);
          setSupplierToEdit(null);
        }}
        onSaveSupplier={handleSaveSupplier}
        supplierToEdit={supplierToEdit}
      />

      <PrintOrderModal
        order={printOrder}
        onClose={() => setPrintOrder(null)}
      />

      <MobileAccessModal
        isOpen={isMobileModalOpen}
        onClose={() => setIsMobileModalOpen(false)}
      />
    </div>
  );
}
