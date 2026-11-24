import React from 'react';
import { TrendingDown, CheckCircle2, Building2, ShoppingCart } from 'lucide-react';
import { formatBRL } from '../utils/calculations';

interface SummaryCardsProps {
  totalItems: number;
  itemsWithWinnerCount: number;
  grandTotalLowest: number;
  grandTotalHighest: number;
  totalSavings: number;
  savingsPercentage: number;
  winningSuppliersCount: number;
  onViewOrders: () => void;
}

export const SummaryCards: React.FC<SummaryCardsProps> = ({
  totalItems,
  itemsWithWinnerCount,
  grandTotalLowest,
  totalSavings,
  savingsPercentage,
  winningSuppliersCount,
  onViewOrders,
}) => {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
      {/* Total Compra Otimizada */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-xs">
        <div className="flex items-center justify-between text-slate-500 mb-1">
          <span className="text-xs font-medium uppercase tracking-wider">Compra Otimizada</span>
          <ShoppingCart className="w-4 h-4 text-emerald-600" />
        </div>
        <div className="text-2xl font-bold text-slate-900 font-mono tabular-nums">
          {formatBRL(grandTotalLowest)}
        </div>
        <div className="text-xs text-slate-500 mt-1 flex items-center gap-1">
          <span>Menor valor consolidado</span>
        </div>
      </div>

      {/* Economia Gerada */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-xs">
        <div className="flex items-center justify-between text-slate-500 mb-1">
          <span className="text-xs font-medium uppercase tracking-wider">Economia Total</span>
          <TrendingDown className="w-4 h-4 text-emerald-600" />
        </div>
        <div className="text-2xl font-bold text-emerald-600 font-mono tabular-nums">
          {formatBRL(totalSavings)}
        </div>
        <div className="text-xs text-emerald-700 font-medium mt-1 flex items-center gap-1">
          <span>Economia de {savingsPercentage.toFixed(1)}% comparado ao maior valor</span>
        </div>
      </div>

      {/* Itens Cotados */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-xs">
        <div className="flex items-center justify-between text-slate-500 mb-1">
          <span className="text-xs font-medium uppercase tracking-wider">Itens com Vencedor</span>
          <CheckCircle2 className="w-4 h-4 text-blue-600" />
        </div>
        <div className="text-2xl font-bold text-slate-900 font-mono tabular-nums">
          {itemsWithWinnerCount} <span className="text-sm font-normal text-slate-500">de {totalItems}</span>
        </div>
        <div className="text-xs text-slate-500 mt-1">
          {totalItems - itemsWithWinnerCount === 0
            ? '100% dos itens cotados com sucesso'
            : `${totalItems - itemsWithWinnerCount} item(ns) sem preço informado`}
        </div>
      </div>

      {/* Fornecedores Ganhadores */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-xs flex flex-col justify-between">
        <div>
          <div className="flex items-center justify-between text-slate-500 mb-1">
            <span className="text-xs font-medium uppercase tracking-wider">Fornecedores Ganhadores</span>
            <Building2 className="w-4 h-4 text-purple-600" />
          </div>
          <div className="text-2xl font-bold text-slate-900 font-mono tabular-nums">
            {winningSuppliersCount} <span className="text-sm font-normal text-slate-500">distribuidores</span>
          </div>
        </div>
        <button
          onClick={onViewOrders}
          className="mt-2 text-xs font-medium text-emerald-700 hover:text-emerald-800 flex items-center gap-1 hover:underline text-left cursor-pointer"
        >
          Ver pedidos separados por fornecedor →
        </button>
      </div>
    </div>
  );
};
