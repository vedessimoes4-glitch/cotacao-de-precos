import React from 'react';
import { 
  Table2, 
  ShoppingBag, 
  Sparkles, 
  FileSpreadsheet, 
  RotateCcw,
  FileDown,
  Power,
  Smartphone
} from 'lucide-react';

interface HeaderProps {
  activeTab: 'table' | 'orders' | 'ai';
  setActiveTab: (tab: 'table' | 'orders' | 'ai') => void;
  winningSuppliersCount: number;
  onOpenImportExport: () => void;
  onExportExcel: () => void;
  onResetToDefault: () => void;
  onStopAllProcesses: () => void;
  onOpenMobileModal: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  activeTab,
  setActiveTab,
  winningSuppliersCount,
  onOpenImportExport,
  onExportExcel,
  onResetToDefault,
  onStopAllProcesses,
  onOpenMobileModal,
}) => {
  return (
    <header className="sticky top-0 z-30 bg-white border-b border-slate-200 px-4 lg:px-8 py-3">
      <div className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        {/* Zone 1: Brand Wordmark */}
        <div className="flex items-center gap-3 shrink-0">
          <div className="w-10 h-10 rounded-lg bg-slate-900 text-white flex items-center justify-center font-bold text-lg shadow-sm">
            <span className="tracking-tight text-emerald-400">C</span>F
          </div>
          <div>
            <h1 className="text-lg font-bold tracking-tight text-slate-900 whitespace-nowrap">
              CotaFácil <span className="text-xs font-medium text-slate-500 font-normal">· Mapa de Cotação</span>
            </h1>
            <p className="text-xs text-slate-500 hidden sm:block">
              Comparativo de Preços & Pedidos por Fornecedor Vencedor
            </p>
          </div>
        </div>

        {/* Zone 2: Navigation Links / Views */}
        <nav className="flex items-center gap-1.5 p-1 bg-slate-100 rounded-lg shrink-0">
          <button
            onClick={() => setActiveTab('table')}
            className={`flex items-center gap-2 px-3.5 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap ${
              activeTab === 'table'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Table2 className="w-4 h-4 text-slate-500" />
            Mapa de Cotação
          </button>

          <button
            onClick={() => setActiveTab('orders')}
            className={`flex items-center gap-2 px-3.5 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap ${
              activeTab === 'orders'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <ShoppingBag className="w-4 h-4 text-emerald-600" />
            <span>Pedidos por Fornecedor</span>
            {winningSuppliersCount > 0 && (
              <span className="ml-1 px-1.5 py-0.2 text-[10px] font-bold rounded-full bg-emerald-100 text-emerald-800 tabular-nums">
                {winningSuppliersCount}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab('ai')}
            className={`flex items-center gap-2 px-3.5 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap ${
              activeTab === 'ai'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Sparkles className="w-4 h-4 text-amber-500" />
            Leitor de Cotação IA
          </button>
        </nav>

        {/* Zone 3: Quick Action Buttons */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={onOpenMobileModal}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-lg hover:bg-emerald-100 transition-colors whitespace-nowrap shadow-2xs"
            title="Conectar celular ou outros aparelhos na mesma rede Wi-Fi"
          >
            <Smartphone className="w-3.5 h-3.5 text-emerald-600" />
            <span className="hidden sm:inline">No Celular</span>
          </button>

          <button
            onClick={onOpenImportExport}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors whitespace-nowrap"
            title="Importar ou exportar planilhas Excel / CSV"
          >
            <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
            <span className="hidden sm:inline">Importar / Exportar</span>
          </button>

          <button
            onClick={onExportExcel}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-slate-900 rounded-lg hover:bg-slate-800 transition-colors whitespace-nowrap shadow-xs"
            title="Exportar mapa de cotação completo para Excel"
          >
            <FileDown className="w-3.5 h-3.5" />
            <span>Baixar Excel</span>
          </button>

          <button
            onClick={onResetToDefault}
            className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
            title="Restaurar dados de exemplo da planilha"
          >
            <RotateCcw className="w-4 h-4" />
          </button>

          <button
            onClick={onStopAllProcesses}
            className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-rose-700 bg-rose-50 border border-rose-200 rounded-lg hover:bg-rose-100 transition-colors whitespace-nowrap cursor-pointer"
            title="Encerrar servidor e parar todos os processos em segundo plano"
          >
            <Power className="w-3.5 h-3.5" />
            <span className="hidden md:inline">Parar Processos</span>
          </button>
        </div>
      </div>
    </header>
  );
};
