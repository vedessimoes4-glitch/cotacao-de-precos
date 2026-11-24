import React, { useState, useRef } from 'react';
import { 
  Sparkles, 
  Upload, 
  FileText, 
  Image as ImageIcon, 
  Check, 
  AlertCircle, 
  Loader2, 
  X,
  ArrowRight,
  Calculator,
  FileSpreadsheet,
  Trash2
} from 'lucide-react';
import { Supplier, ProductItem } from '../types/quotation';
import {
  compareAlphabetical,
  formatBRL,
  sortProductsAlphabetically,
  sortSuppliersAlphabetically,
} from '../utils/calculations';
import {
  resolveBestProductMatchWithMemory,
  memorizeCorrespondence,
  forgetCorrespondence,
  getMemorizedLinksCount,
} from '../utils/correspondenceMemory';
import { SearchableProductSelect } from './SearchableProductSelect';
import { extractProductBrand } from '../utils/productMatcher';

interface ExtractedQuotationItem {
  productName: string;
  brand?: string;
  unit?: string;
  quantity: number;
  packQuantity?: number;
  totalItemPrice: number;
  unitPrice: number;
  calculationNote?: string;
  matchedExistingId?: string;
  matchedFromMemory?: boolean;
  imageUrl?: string;
}

interface AIExtractorModalProps {
  isOpen: boolean;
  onClose: () => void;
  suppliers: Supplier[];
  existingProducts: ProductItem[];
  onApplyExtractedPrices: (
    supplierId: string,
    extractedItems: ExtractedQuotationItem[]
  ) => void;
}

export const AIExtractorModal: React.FC<AIExtractorModalProps> = ({
  isOpen,
  onClose,
  suppliers,
  existingProducts,
  onApplyExtractedPrices,
}) => {
  const sortedSuppliers = sortSuppliersAlphabetically(suppliers);
  const sortedExistingProducts = sortProductsAlphabetically(existingProducts);

  const [selectedSupplierId, setSelectedSupplierId] = useState<string>(
    sortedSuppliers[0]?.id || ''
  );
  const [activeInputType, setActiveInputType] = useState<'file' | 'text'>('file');
  const [rawText, setRawText] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewDataUrl, setPreviewDataUrl] = useState<string | null>(null);
  const [isPdf, setIsPdf] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [extractedData, setExtractedData] = useState<{
    supplierName?: string;
    otherExpenses?: number;
    documentTotal?: number;
    items: ExtractedQuotationItem[];
  } | null>(null);
  const [memorizedCount, setMemorizedCount] = useState<number>(() => getMemorizedLinksCount());
  const [hoveredThumb, setHoveredThumb] = useState<{
    url: string;
    name: string;
    brand?: string;
    price: number;
    rect: DOMRect;
  } | null>(null);
  const [zoomedThumb, setZoomedThumb] = useState<{
    url: string;
    name: string;
    brand?: string;
    price: number;
  } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    if (!zoomedThumb) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setZoomedThumb(null);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [zoomedThumb]);

  if (!isOpen) return null;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      setErrorMessage(null);
      const isPdfFile =
        file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
      setIsPdf(isPdfFile);

      if (isPdfFile && file.size > 8 * 1024 * 1024) {
        // Large PDFs (e.g. 28MB catalogs with photos) are streamed in binary chunks
        setPreviewDataUrl('pdf-chunked-ready');
        return;
      }

      const reader = new FileReader();
      reader.onload = () => {
        setPreviewDataUrl(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleExtract = async () => {
    if (!selectedSupplierId) {
      setErrorMessage('Por favor selecione um fornecedor para atribuir os preços.');
      return;
    }

    if (activeInputType === 'file' && !previewDataUrl && !selectedFile) {
      setErrorMessage('Por favor envie o arquivo (PDF ou imagem) do orçamento do fornecedor.');
      return;
    }

    if (activeInputType === 'text' && !rawText.trim()) {
      setErrorMessage('Por favor cole o texto da cotação enviada pelo fornecedor.');
      return;
    }

    setIsLoading(true);
    setErrorMessage(null);

    try {
      let base64Clean: string | undefined;
      let mimeType: string | undefined;
      let uploadId: string | undefined;

      if (activeInputType === 'file' && selectedFile) {
        mimeType = selectedFile.type || (isPdf ? 'application/pdf' : 'image/jpeg');

        if (selectedFile.size > 8 * 1024 * 1024) {
          const CHUNK_SIZE = 4 * 1024 * 1024;
          const totalChunks = Math.ceil(selectedFile.size / CHUNK_SIZE);
          uploadId = `up_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

          for (let i = 0; i < totalChunks; i++) {
            const slice = selectedFile.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE);
            const chunkRes = await fetch('/api/extract-quotation-chunk', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/octet-stream',
                'x-upload-id': uploadId,
                'x-chunk-index': String(i),
              },
              body: slice,
            });
            if (!chunkRes.ok) {
              throw new Error('Falha ao enviar partes do arquivo grande para o servidor.');
            }
          }
        } else if (previewDataUrl && previewDataUrl.includes(';base64,')) {
          const parts = previewDataUrl.split(';base64,');
          base64Clean = parts[1];
        }
      }

      const selectedSupplier = suppliers.find((s) => s.id === selectedSupplierId);

      const response = await fetch('/api/extract-quotation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          uploadId,
          imageBase64: base64Clean,
          mimeType,
          rawText: activeInputType === 'text' ? rawText : undefined,
          supplierName: selectedSupplier?.name,
          existingProducts: existingProducts.map((p) => ({
            id: p.id,
            name: p.description,
            quantity: p.quantity,
          })),
        }),
      });

      const rawTextResponse = await response.text();
      let resData: any;
      try {
        resData = JSON.parse(rawTextResponse);
      } catch {
        if (
          rawTextResponse.includes('504') ||
          rawTextResponse.includes('Gateway') ||
          rawTextResponse.includes('Time-out') ||
          response.status === 504
        ) {
          throw new Error(
            'O processamento do arquivo PDF excedeu o tempo limite da nuvem. O sistema foi reconfigurado com modelo ultra-rápido. Por favor, clique em Tentar Novamente.'
          );
        }
        throw new Error('O servidor respondeu de forma inesperada. Por favor, tente novamente.');
      }

      if (!response.ok || !resData.success) {
        throw new Error(resData.error || 'Erro ao comunicar com a IA');
      }

      // Ensure every item has calculated unitPrice = totalItemPrice / (quantity * packQuantity)
      // and brand-agnostic product match fallback against existingProducts
      const candidateList = existingProducts.map((p) => ({
        id: p.id,
        name: p.description,
        quantity: p.quantity,
      }));
      const itemsWithCalculatedUnits: ExtractedQuotationItem[] = (
        resData.data.items || []
      )
        .map((item: any) => {
          const qtd = item.quantity && item.quantity > 0 ? item.quantity : 1;
          const packQtd = item.packQuantity && item.packQuantity > 0 ? item.packQuantity : 1;
          const totalUnits = qtd * packQtd;
          const total =
            item.totalItemPrice !== undefined && item.totalItemPrice !== null
              ? item.totalItemPrice
              : item.unitPrice * totalUnits;
          const computedUnit = total / totalUnits;

          const serverMatch =
            item.matchedExistingId &&
            sortedExistingProducts.some((p) => p.id === item.matchedExistingId)
              ? item.matchedExistingId
              : '';
          const { matchedId, fromMemory } = resolveBestProductMatchWithMemory(
            item.productName || '',
            candidateList,
            serverMatch
          );

          return {
            productName: item.productName,
            brand: item.brand || extractProductBrand(item.productName || ''),
            unit: item.unit || 'UN',
            quantity: qtd,
            packQuantity: packQtd,
            totalItemPrice: total,
            unitPrice: Number(computedUnit.toFixed(2)),
            calculationNote:
              item.calculationNote ||
              (packQtd > 1
                ? `${formatBRL(total)} ÷ (${qtd} × ${packQtd} un) = ${formatBRL(computedUnit)}`
                : `${formatBRL(total)} ÷ ${qtd} = ${formatBRL(computedUnit)}`),
            matchedExistingId: matchedId,
            matchedFromMemory: fromMemory,
            imageUrl: item.imageUrl || undefined,
          };
        })
        .sort((a: ExtractedQuotationItem, b: ExtractedQuotationItem) =>
          compareAlphabetical(a.productName, b.productName)
        );

      // Auto-select supplier if the detected supplier name matches one of our columns
      const normalizeName = (str: string) =>
        str
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .toLowerCase()
          .trim();
      const detectedName = normalizeName(resData.data.supplierName || '');
      if (detectedName) {
        const matchedSupplier = suppliers.find((s) => {
          const sNorm = normalizeName(s.name);
          return detectedName.includes(sNorm) || sNorm.includes(detectedName);
        });
        if (matchedSupplier) {
          setSelectedSupplierId(matchedSupplier.id);
        }
      }

      setExtractedData({
        ...resData.data,
        items: itemsWithCalculatedUnits,
      });
    } catch (err: any) {
      console.error(err);
      let cleanMsg = err?.message || 'Ocorreu uma falha ao extrair os preços da cotação.';
      try {
        if (typeof cleanMsg === 'string' && cleanMsg.trim().startsWith('{')) {
          const parsed = JSON.parse(cleanMsg);
          if (parsed?.error?.message) {
            cleanMsg = parsed.error.message;
          }
        }
      } catch {
        // keep cleanMsg
      }

      if (
        cleanMsg.includes('503') ||
        cleanMsg.includes('high demand') ||
        cleanMsg.includes('UNAVAILABLE')
      ) {
        cleanMsg =
          'Os servidores de IA estão com pico de demanda momentâneo na nuvem do Google (Erro 503). O backend agora possui contingência automática para modelos alternativos. Por favor, clique em "Tentar Novamente" abaixo.';
      }

      setErrorMessage(cleanMsg);
    } finally {
      setIsLoading(false);
    }
  };

  // Demo simulator helper to allow immediate testing with packaging examples
  const handleLoadDemoQuotation = () => {
    setActiveInputType('text');
    setRawText(`ORÇAMENTO DISTRIBUIDORA VONDER / TAMBASA
Data: 12/11/2026 - Cotação de Materiais com Embalagens Múltiplas
Item 1: PARAFUSO AUTO BROCANTE 4,2X19 (CX C/ 500 UN) - Qtd: 2 CX - Valor Total: R$ 120,00
Item 2: FITA ISOLANTE 19MM X 20M (PCT C/ 10 UN) - Qtd: 4 PCT - Valor Total: R$ 180,00
Item 3: DISCO DE CORTE 4.1/2 INOX (LOTE C/ 25 PCS) - Qtd: 2 LOTES - Valor Total: R$ 175,00
Item 4: CANO PVC SOLDÁVEL 25MM 6M (FD C/ 10 BARRAS) - Qtd: 5 FD - Valor Total: R$ 740,00
Item 5: TORNEIRA ESFERA JARDIM 1/2 METAL - Qtd: 20 UN - Valor Total: R$ 330,00
Item 6: CAIXA D'ÁGUA 500L COM TAMPA - Qtd: 2 UN - Valor Total: R$ 490,00`);
    setErrorMessage(null);
  };

  const handleRemoveItem = (idxToRemove: number) => {
    setExtractedData((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        items: prev.items.filter((_, rIdx) => rIdx !== idxToRemove),
      };
    });
  };

  const handleApply = () => {
    if (!extractedData || !selectedSupplierId || extractedData.items.length === 0) return;
    onApplyExtractedPrices(selectedSupplierId, extractedData.items);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-5xl w-full overflow-hidden my-6 flex flex-col max-h-[92vh]">
        {/* Modal Header */}
        <div className="p-5 border-b border-slate-200 flex items-center justify-between bg-slate-50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center font-bold">
              <Calculator className="w-5 h-5 text-amber-600" />
            </div>
            <div>
              <h3 className="font-bold text-slate-900 text-base flex items-center gap-2">
                <span>Leitor de Cotação com IA</span>
                <span className="text-[10px] font-semibold bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full uppercase tracking-wider">
                  Total ÷ (Qtd × Embalagem)
                </span>
              </h3>
              <p className="text-xs text-slate-500">
                Extração inteligente: calcula o preço unitário individual considerando a quantidade faturada e a quantidade da embalagem na descrição (ex: CX C/ 100, PCT C/ 10)
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto flex-1 space-y-5">
          {/* Rule Notification Banner */}
          <div className="p-3.5 rounded-xl bg-blue-50/80 border border-blue-200 text-blue-900 text-xs flex items-start gap-2.5">
            <Calculator className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
            <div>
              <span className="font-bold block">Cálculo com Quantidade da Embalagem na Descrição:</span>
              <span>
                A IA analisa o documento, identifica a quantidade cotada e a <strong>quantidade por embalagem indicada na descrição</strong> (ex: "CX C/ 100", "PCT C/ 10", "FD C/ 10"), e calcula a divisão:
                <code className="ml-1 px-1 py-0.5 bg-blue-100/70 rounded-sm font-bold font-mono">
                  Preço Unitário = Valor Total ÷ (Quantidade × Quantidade da Embalagem)
                </code>
              </span>
            </div>
          </div>

          {/* Step 1: Choose Target Supplier */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider">
                1. Selecione o Fornecedor que enviou a cotação
              </label>
              <button
                type="button"
                onClick={handleLoadDemoQuotation}
                className="text-[11px] font-medium text-amber-700 hover:text-amber-800 hover:underline cursor-pointer"
              >
                Preencher com exemplo de orçamento
              </button>
            </div>
            <select
              value={selectedSupplierId}
              onChange={(e) => setSelectedSupplierId(e.target.value)}
              className="w-full text-sm bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-slate-900 font-medium"
            >
              {sortedSuppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>

          {/* Step 2: Choose input method (PDF/Image file or Text) */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider">
                2. Enviar arquivo PDF/Imagem ou colar texto
              </label>
              <div className="flex items-center gap-1 p-0.5 bg-slate-100 rounded-md">
                <button
                  type="button"
                  onClick={() => setActiveInputType('file')}
                  className={`px-3 py-1 text-xs font-medium rounded-sm transition-colors cursor-pointer ${
                    activeInputType === 'file'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-500 hover:text-slate-900'
                  }`}
                >
                  <FileSpreadsheet className="w-3.5 h-3.5 inline mr-1 text-rose-600" />
                  Arquivo PDF / Imagem
                </button>
                <button
                  type="button"
                  onClick={() => setActiveInputType('text')}
                  className={`px-3 py-1 text-xs font-medium rounded-sm transition-colors cursor-pointer ${
                    activeInputType === 'text'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-500 hover:text-slate-900'
                  }`}
                >
                  <FileText className="w-3.5 h-3.5 inline mr-1 text-blue-600" />
                  Colar Texto do Orçamento
                </button>
              </div>
            </div>

            {activeInputType === 'file' ? (
              <div
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-slate-300 hover:border-slate-400 rounded-xl p-6 text-center cursor-pointer transition-colors bg-slate-50/50"
              >
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileChange}
                  accept=".pdf,image/*"
                  className="hidden"
                />
                {previewDataUrl ? (
                  <div className="space-y-3">
                    {isPdf ? (
                      <div className="p-4 bg-white border border-slate-200 rounded-xl max-w-sm mx-auto shadow-xs flex items-center gap-3">
                        <div className="w-12 h-12 rounded-lg bg-rose-100 text-rose-700 flex items-center justify-center font-bold shrink-0">
                          <FileText className="w-6 h-6" />
                        </div>
                        <div className="text-left overflow-hidden">
                          <p className="text-xs font-bold text-slate-900 truncate">
                            {selectedFile?.name}
                          </p>
                          <p className="text-[11px] text-slate-500">
                            Documento PDF ({((selectedFile?.size || 0) / 1024).toFixed(1)} KB)
                          </p>
                          <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded-sm inline-block mt-1">
                            ✓ PDF pronto para extração
                          </span>
                        </div>
                      </div>
                    ) : (
                      <img
                        src={previewDataUrl}
                        alt="Prévia da cotação"
                        className="max-h-48 mx-auto rounded-lg shadow-sm object-contain"
                      />
                    )}
                    <p className="text-xs text-slate-600 font-medium">
                      Clique para trocar o arquivo enviado
                    </p>
                  </div>
                ) : (
                  <div>
                    <Upload className="w-8 h-8 text-slate-400 mx-auto mb-2" />
                    <p className="text-xs font-semibold text-slate-800">
                      Clique para selecionar o PDF ou foto do orçamento
                    </p>
                    <p className="text-[11px] text-slate-500 mt-1">
                      Suporta arquivos <strong>PDF</strong> de distribuidoras, pedidos em imagem, scans e tabelas de preços
                    </p>
                  </div>
                )}
              </div>
            ) : (
              <div>
                <textarea
                  rows={6}
                  value={rawText}
                  onChange={(e) => setRawText(e.target.value)}
                  placeholder="Cole aqui o texto do orçamento do fornecedor contendo os itens, quantidades e valores totais..."
                  className="w-full text-xs font-mono p-3 border border-slate-300 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-slate-900"
                />
              </div>
            )}
          </div>

          {/* Error notice */}
          {errorMessage && (
            <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs">
              <div className="flex items-start gap-2.5">
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                <span className="leading-relaxed">{errorMessage}</span>
              </div>
              <button
                type="button"
                onClick={handleExtract}
                disabled={isLoading}
                className="px-3 py-1.5 text-xs font-semibold bg-rose-600 hover:bg-rose-700 text-white rounded-lg transition-colors shrink-0 shadow-xs cursor-pointer self-end sm:self-auto"
              >
                Tentar Novamente
              </button>
            </div>
          )}

          {/* Action to trigger Extraction */}
          {!extractedData && (
            <button
              onClick={handleExtract}
              disabled={isLoading}
              className="w-full py-2.5 px-4 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 disabled:bg-slate-400 rounded-xl transition-colors flex items-center justify-center gap-2 shadow-sm cursor-pointer"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Extraindo valores totais e calculando divisão (Total ÷ Qtd)...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4 text-amber-400" />
                  <span>Analisar e Calcular Preços com IA</span>
                </>
              )}
            </button>
          )}

          {/* Preview of Extracted Results */}
          {extractedData && (
            <div className="space-y-4 pt-3 border-t border-slate-200">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="flex flex-wrap items-center gap-2 text-emerald-800 text-xs font-bold">
                    <Check className="w-4 h-4 text-emerald-600" />
                    <span>
                      {extractedData.items.length} itens extraídos
                    </span>
                    <span className="text-[11px] font-semibold bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-sm">
                      {extractedData.items.filter((it) => Boolean(it.matchedExistingId)).length} vinculados ao mapa
                    </span>
                    {extractedData.items.some((it) => it.matchedFromMemory) && (
                      <span className="text-[11px] font-semibold bg-amber-100 text-amber-800 px-2 py-0.5 rounded-sm">
                        {extractedData.items.filter((it) => it.matchedFromMemory).length} da memória
                      </span>
                    )}
                    <span className="text-[11px] font-medium bg-slate-100 text-slate-600 px-2 py-0.5 rounded-sm">
                      {extractedData.items.filter((it) => !it.matchedExistingId).length} novos
                    </span>
                    {extractedData.supplierName && (
                      <span className="text-[11px] font-medium text-slate-600">
                        · Fornecedor: <strong className="text-slate-900">{extractedData.supplierName}</strong>
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    As correspondências ficam memorizadas mesmo que os produtos sejam apagados{memorizedCount > 0 ? ` (${memorizedCount} vínculo(s) salvo(s))` : ''}. Ajuste se precisar antes de lançar em{' '}
                    <strong>{suppliers.find((s) => s.id === selectedSupplierId)?.name}</strong>.
                  </p>
                </div>
                <button
                  onClick={() => setExtractedData(null)}
                  className="text-xs text-slate-500 hover:text-slate-700 underline cursor-pointer"
                >
                  Enviar outro arquivo
                </button>
              </div>

              {/* Detailed Breakdown Table */}
              <div
                onScroll={() => hoveredThumb && setHoveredThumb(null)}
                className="max-h-72 overflow-y-auto border border-slate-200 rounded-xl shadow-xs"
              >
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="bg-slate-900 text-white font-semibold sticky top-0 text-[11px]">
                    <tr>
                      <th className="p-2.5 w-16 text-center border-r border-slate-800">Qtd</th>
                      <th className="p-2.5 border-r border-slate-800">Item no Arquivo</th>
                      <th className="p-2.5 w-24 text-center border-r border-slate-800 text-blue-300">
                        Embalagem
                      </th>
                      <th className="p-2.5 w-20 text-center border-r border-slate-800 text-slate-300">
                        Total Peças
                      </th>
                      <th className="p-2.5 w-28 text-right border-r border-slate-800 text-slate-300">
                        Total no Doc
                      </th>
                      <th className="p-2.5 text-center border-r border-slate-800 text-amber-300">
                        Fórmula da Divisão
                      </th>
                      <th className="p-2.5 text-right bg-emerald-950 text-emerald-300 border-r border-slate-800">
                        Preço Unit. Real
                      </th>
                      <th className="p-2.5 border-r border-slate-800">Correspondência no Mapa</th>
                      <th className="p-2.5 w-14 text-center">Excluir</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {extractedData.items.length === 0 ? (
                      <tr>
                        <td colSpan={9} className="p-6 text-center text-slate-500">
                          <p className="text-xs font-medium text-slate-600 mb-2">
                            Todos os itens extraídos foram excluídos desta visualização.
                          </p>
                          <button
                            type="button"
                            onClick={() => setExtractedData(null)}
                            className="text-xs font-semibold text-slate-800 underline hover:text-slate-950 cursor-pointer"
                          >
                            Enviar outro arquivo ou analisar novamente
                          </button>
                        </td>
                      </tr>
                    ) : (
                      extractedData.items.map((item, idx) => {
                      const matched = existingProducts.find(
                        (p) => p.id === item.matchedExistingId
                      );
                      const packQtd = item.packQuantity || 1;
                      const totalPieces = Number(((item.quantity || 1) * packQtd).toFixed(2));

                      const updateItemField = (
                        field: 'quantity' | 'packQuantity' | 'totalItemPrice',
                        val: number
                      ) => {
                        setExtractedData((prev) => {
                          if (!prev) return prev;
                          const nextItems = prev.items.map((row, rIdx) => {
                            if (rIdx !== idx) return row;
                            const nextRow = { ...row, [field]: val };
                            const q = nextRow.quantity > 0 ? nextRow.quantity : 1;
                            const pq =
                              nextRow.packQuantity && nextRow.packQuantity > 0
                                ? nextRow.packQuantity
                                : 1;
                            const tot = nextRow.totalItemPrice >= 0 ? nextRow.totalItemPrice : 0;
                            const unitP = Number((tot / (q * pq)).toFixed(2));
                            return {
                              ...nextRow,
                              unitPrice: unitP,
                              calculationNote:
                                pq > 1
                                  ? `${formatBRL(tot)} ÷ (${q} × ${pq} un) = ${formatBRL(unitP)}`
                                  : `${formatBRL(tot)} ÷ ${q} = ${formatBRL(unitP)}`,
                            };
                          });
                          return { ...prev, items: nextItems };
                        });
                      };

                      return (
                        <tr key={`${item.productName}-${idx}`} className="hover:bg-slate-50/70">
                          {/* Qtd editável */}
                          <td className="p-1.5 text-center border-r border-slate-200">
                            <input
                              type="number"
                              step="any"
                              min="0.01"
                              value={item.quantity}
                              onChange={(e) => {
                                const v = parseFloat(e.target.value);
                                updateItemField('quantity', v > 0 ? v : 1);
                              }}
                              className="w-14 text-center font-mono font-bold tabular-nums text-slate-900 border border-slate-200 rounded-sm py-0.5 focus:outline-hidden focus:border-slate-900"
                            />
                          </td>

                          {/* Item */}
                          <td className="p-2 font-medium text-slate-800 border-r border-slate-200">
                            <div className="flex items-center gap-2.5">
                              {item.imageUrl && (
                                <button
                                  type="button"
                                  onMouseEnter={(e) =>
                                    setHoveredThumb({
                                      url: item.imageUrl!,
                                      name: item.productName,
                                      brand: item.brand || extractProductBrand(item.productName || ''),
                                      price: item.unitPrice,
                                      rect: e.currentTarget.getBoundingClientRect(),
                                    })
                                  }
                                  onMouseLeave={() => setHoveredThumb(null)}
                                  onClick={() =>
                                    setZoomedThumb({
                                      url: item.imageUrl!,
                                      name: item.productName,
                                      brand: item.brand || extractProductBrand(item.productName || ''),
                                      price: item.unitPrice,
                                    })
                                  }
                                  className="w-9 h-9 rounded-md border border-slate-200 bg-white shrink-0 flex items-center justify-center overflow-hidden hover:border-slate-400 cursor-zoom-in shadow-2xs"
                                >
                                  <img
                                    src={item.imageUrl}
                                    alt={item.productName}
                                    loading="lazy"
                                    className="w-full h-full object-contain"
                                  />
                                </button>
                              )}
                              <div className="min-w-0">
                                <div>{item.productName}</div>
                                {item.unit && (
                                  <span className="text-[10px] font-mono text-slate-400">
                                    Unid: {item.unit}
                                  </span>
                                )}
                              </div>
                            </div>
                          </td>

                          {/* Embalagem editável */}
                          <td className="p-1.5 text-center border-r border-slate-200">
                            <input
                              type="number"
                              min="1"
                              value={packQtd}
                              onChange={(e) =>
                                updateItemField('packQuantity', Math.max(1, parseInt(e.target.value) || 1))
                              }
                              title="Peças por embalagem (use 1 se Qtd já for em unidades)"
                              className={`w-14 text-center font-mono text-xs tabular-nums border rounded-sm py-0.5 focus:outline-hidden focus:border-slate-900 ${
                                packQtd > 1
                                  ? 'bg-blue-50 text-blue-800 border-blue-200 font-bold'
                                  : 'text-slate-600 border-slate-200'
                              }`}
                            />
                          </td>

                          {/* Total de peças individuais */}
                          <td className="p-2 text-center font-mono tabular-nums font-semibold text-slate-700 border-r border-slate-200">
                            {totalPieces} {(item.unit || 'un').toLowerCase()}
                          </td>

                          {/* Total no Arquivo editável */}
                          <td className="p-1.5 text-right border-r border-slate-200">
                            <input
                              type="number"
                              step="0.01"
                              min="0"
                              value={item.totalItemPrice}
                              onChange={(e) =>
                                updateItemField('totalItemPrice', parseFloat(e.target.value) || 0)
                              }
                              className="w-22 text-right font-mono tabular-nums text-slate-800 border border-slate-200 rounded-sm py-0.5 px-1 focus:outline-hidden focus:border-slate-900"
                            />
                          </td>

                          {/* Memória da Divisão */}
                          <td className="p-2 text-center font-mono text-[11px] text-amber-800 bg-amber-50/50 border-r border-slate-200">
                            {packQtd > 1
                              ? `${formatBRL(item.totalItemPrice)} ÷ (${item.quantity} × ${packQtd}) = ${formatBRL(item.unitPrice)}`
                              : `${formatBRL(item.totalItemPrice)} ÷ ${item.quantity} = ${formatBRL(item.unitPrice)}`}
                          </td>

                          {/* Preço Unitário Resultante */}
                          <td className="p-2 text-right font-mono font-bold text-emerald-700 bg-emerald-50/60 border-r border-slate-200 tabular-nums">
                            {formatBRL(item.unitPrice)}
                          </td>

                          {/* Correspondência editável com pesquisa e memória persistente */}
                          <td className="p-1.5 text-slate-600">
                            <SearchableProductSelect
                              value={matched ? matched.id : ''}
                              options={sortedExistingProducts}
                              onChange={(newId) => {
                                const prevTarget = item.matchedExistingId
                                  ? sortedExistingProducts.find((p) => p.id === item.matchedExistingId)
                                  : null;
                                const nextTarget = newId
                                  ? sortedExistingProducts.find((p) => p.id === newId)
                                  : null;

                                if (prevTarget && prevTarget.id !== newId) {
                                  forgetCorrespondence(item.productName, prevTarget.description);
                                }
                                if (nextTarget) {
                                  memorizeCorrespondence(item.productName, nextTarget.description);
                                }
                                setMemorizedCount(getMemorizedLinksCount());

                                setExtractedData((prev) => {
                                  if (!prev) return prev;
                                  return {
                                    ...prev,
                                    items: prev.items.map((row, rIdx) =>
                                      rIdx === idx
                                        ? {
                                            ...row,
                                            matchedExistingId: newId,
                                            matchedFromMemory: false,
                                          }
                                        : row
                                    ),
                                  };
                                });
                              }}
                            />
                          </td>

                          {/* Excluir item */}
                          <td className="p-1.5 text-center border-l border-slate-200">
                            <button
                              type="button"
                              onClick={() => handleRemoveItem(idx)}
                              title="Excluir item desta cotação"
                              aria-label={`Excluir ${item.productName}`}
                              className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-md transition-colors cursor-pointer"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>
                      );
                    })
                    )}
                  </tbody>
                </table>
              </div>

              {(extractedData.items.length > 0 || extractedData.otherExpenses || extractedData.documentTotal) && (
                <div className="flex flex-wrap items-center justify-end gap-4 text-xs text-slate-600 bg-slate-50 px-3 py-2 rounded-lg border border-slate-200 font-mono tabular-nums">
                  {extractedData.otherExpenses !== undefined && extractedData.otherExpenses > 0 && (
                    <span>Outras Despesas / Frete: {formatBRL(extractedData.otherExpenses)}</span>
                  )}
                  <span>
                    Soma dos Itens: {formatBRL(extractedData.items.reduce((sum, it) => sum + (it.totalItemPrice || 0), 0))}
                  </span>
                  {extractedData.documentTotal !== undefined && extractedData.documentTotal > 0 && (
                    <span className="font-bold text-slate-900">
                      Total do Documento: {formatBRL(extractedData.documentTotal)}
                    </span>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Modal Footer */}
        {extractedData && (
          <div className="p-4 border-t border-slate-200 bg-slate-50 flex items-center justify-between gap-3">
            <span className="text-xs text-slate-500">
              Os preços unitários calculados serão lançados na coluna de{' '}
              <strong>
                {suppliers.find((s) => s.id === selectedSupplierId)?.name}
              </strong>
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={onClose}
                className="px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-200 rounded-lg transition-colors cursor-pointer"
              >
                Cancelar
              </button>
              <button
                onClick={handleApply}
                disabled={extractedData.items.length === 0}
                className="px-4 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 disabled:text-slate-500 disabled:cursor-not-allowed rounded-lg transition-colors flex items-center gap-1.5 shadow-xs cursor-pointer"
              >
                <span>Aplicar Preços Unitários no Mapa</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Floating Hover Preview */}
      {hoveredThumb && !zoomedThumb && (
        <div
          className="fixed z-[70] pointer-events-none bg-white border border-slate-200 rounded-2xl shadow-2xl overflow-hidden w-72"
          style={{
            left: Math.min(
              Math.max(12, hoveredThumb.rect.left),
              window.innerWidth - 300
            ),
            top:
              hoveredThumb.rect.bottom + 8 + 330 > window.innerHeight
                ? Math.max(12, hoveredThumb.rect.top - 334)
                : hoveredThumb.rect.bottom + 8,
          }}
        >
          <div className="relative w-full h-56 p-3 bg-white flex items-center justify-center overflow-hidden border-b border-slate-100">
            {hoveredThumb.brand && (
              <span className="absolute top-2 left-2 z-10 inline-flex items-center px-2 py-0.5 rounded-md bg-slate-900/85 backdrop-blur-xs text-white text-[10px] font-bold uppercase tracking-wider shadow-sm border border-white/15">
                Marca: {hoveredThumb.brand}
              </span>
            )}
            <img
              src={hoveredThumb.url}
              alt={hoveredThumb.name}
              className="w-full h-full object-contain"
            />
          </div>
          <div className="p-2.5 bg-slate-50/70">
            <p className="text-[11px] font-semibold text-slate-800 line-clamp-2 leading-snug">
              {hoveredThumb.name}
            </p>
            <p className="text-xs font-mono font-bold text-emerald-700 mt-1">
              {formatBRL(hoveredThumb.price)}
            </p>
          </div>
        </div>
      )}

      {/* Click Enlarged Lightbox */}
      {zoomedThumb && (
        <div
          onClick={() => setZoomedThumb(null)}
          className="fixed inset-0 z-[80] bg-slate-950/75 backdrop-blur-xs flex items-center justify-center p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-lg w-full overflow-hidden"
          >
            <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <span className="text-xs font-bold text-slate-900 truncate pr-4">
                {zoomedThumb.name}
              </span>
              <button
                type="button"
                onClick={() => setZoomedThumb(null)}
                className="p-1 text-slate-400 hover:text-slate-700 rounded-md hover:bg-slate-200 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="relative w-full h-80 sm:h-96 p-4 bg-white flex items-center justify-center overflow-hidden">
              {zoomedThumb.brand && (
                <span className="absolute top-3 left-3 z-10 inline-flex items-center px-2.5 py-1 rounded-md bg-slate-900/85 backdrop-blur-xs text-white text-[11px] font-bold uppercase tracking-wider shadow-md border border-white/15">
                  Marca: {zoomedThumb.brand}
                </span>
              )}
              <img
                src={zoomedThumb.url}
                alt={zoomedThumb.name}
                className="w-full h-full object-contain"
              />
            </div>
            <div className="px-4 py-3 border-t border-slate-200 flex items-center justify-between text-xs bg-white">
              <span className="text-slate-500">Preço unitário calculado</span>
              <span className="font-mono font-bold text-emerald-700 text-sm">
                {formatBRL(zoomedThumb.price)}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
