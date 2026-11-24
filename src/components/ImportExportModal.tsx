import React, { useRef, useState } from 'react';
import { 
  FileSpreadsheet, 
  Upload, 
  Download, 
  FileDown, 
  X, 
  Check, 
  AlertCircle,
  FileCode
} from 'lucide-react';
import { Supplier, CalculatedItem } from '../types/quotation';
import { 
  exportFullQuotationToExcel, 
  downloadTemplateExcel, 
  parseExcelOrCsvFile 
} from '../utils/excelUtils';

interface ImportExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  suppliers: Supplier[];
  calculatedItems: CalculatedItem[];
  grandTotalLowest: number;
  onImportProducts: (
    importedProducts: Array<{
      quantity: number;
      description: string;
      unit: string;
      pricesBySupplierName: Record<string, number>;
    }>,
    detectedSupplierNames: string[]
  ) => void;
}

export const ImportExportModal: React.FC<ImportExportModalProps> = ({
  isOpen,
  onClose,
  suppliers,
  calculatedItems,
  grandTotalLowest,
  onImportProducts,
}) => {
  const [isUploading, setIsUploading] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      const { importedProducts, detectedSupplierNames } = await parseExcelOrCsvFile(file);
      onImportProducts(importedProducts, detectedSupplierNames);
      setSuccessMessage(
        `Importados com sucesso ${importedProducts.length} itens da planilha!`
      );
      setTimeout(() => {
        onClose();
      }, 1500);
    } catch (err: any) {
      console.error(err);
      setErrorMessage(
        err.message || 'Falha ao processar arquivo de planilha. Verifique o formato.'
      );
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-lg w-full overflow-hidden">
        {/* Header */}
        <div className="p-5 border-b border-slate-200 flex items-center justify-between bg-slate-50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-800 flex items-center justify-center font-bold">
              <FileSpreadsheet className="w-5 h-5 text-emerald-700" />
            </div>
            <div>
              <h3 className="font-bold text-slate-900 text-base">
                Importar e Exportar Planilhas
              </h3>
              <p className="text-xs text-slate-500">
                Integração compatível com Excel (.xlsx) e CSV
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-5">
          {/* Section 1: Import */}
          <div>
            <h4 className="text-xs font-semibold text-slate-700 uppercase tracking-wider mb-2">
              Importar Planilha de Cotação
            </h4>
            <div
              onClick={() => fileInputRef.current?.click()}
              className="border-2 border-dashed border-slate-300 hover:border-slate-400 rounded-xl p-6 text-center cursor-pointer transition-colors bg-slate-50/50"
            >
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileUpload}
                accept=".xlsx,.xls,.csv"
                className="hidden"
              />
              <Upload className="w-8 h-8 text-emerald-600 mx-auto mb-2" />
              <p className="text-xs font-semibold text-slate-800">
                {isUploading ? 'Processando planilha...' : 'Clique para selecionar arquivo Excel (.xlsx) ou CSV'}
              </p>
              <p className="text-[11px] text-slate-500 mt-1">
                As colunas de produtos e de cada fornecedor serão lidas e mapeadas automaticamente.
              </p>
            </div>
          </div>

          {/* Feedback */}
          {successMessage && (
            <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-center gap-2">
              <Check className="w-4 h-4 shrink-0" />
              <span>{successMessage}</span>
            </div>
          )}

          {errorMessage && (
            <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Section 2: Export Options */}
          <div className="pt-3 border-t border-slate-200 space-y-2">
            <h4 className="text-xs font-semibold text-slate-700 uppercase tracking-wider mb-2">
              Exportar ou Baixar Modelo
            </h4>

            <button
              onClick={() =>
                exportFullQuotationToExcel(calculatedItems, suppliers, grandTotalLowest)
              }
              className="w-full flex items-center justify-between p-3 text-xs bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-xl transition-colors text-left"
            >
              <div className="flex items-center gap-2.5">
                <FileDown className="w-4 h-4 text-emerald-700" />
                <div>
                  <span className="font-semibold text-slate-900 block">
                    Exportar Mapa Completo em Excel
                  </span>
                  <span className="text-[11px] text-slate-500">
                    Inclui todos os produtos, menor valor, vencedor e colunas dos distribuidores
                  </span>
                </div>
              </div>
              <Download className="w-4 h-4 text-slate-400" />
            </button>

            <button
              onClick={() => downloadTemplateExcel(suppliers)}
              className="w-full flex items-center justify-between p-3 text-xs bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-xl transition-colors text-left"
            >
              <div className="flex items-center gap-2.5">
                <FileCode className="w-4 h-4 text-blue-600" />
                <div>
                  <span className="font-semibold text-slate-900 block">
                    Baixar Modelo de Planilha (.xlsx)
                  </span>
                  <span className="text-[11px] text-slate-500">
                    Planilha modelo com as colunas já formatadas para você preencher ou enviar
                  </span>
                </div>
              </div>
              <Download className="w-4 h-4 text-slate-400" />
            </button>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-200 bg-slate-50 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-200 rounded-lg transition-colors"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
};
