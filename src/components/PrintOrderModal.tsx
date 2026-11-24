import React from 'react';
import { Printer, X } from 'lucide-react';
import { SupplierOrderSummary } from '../types/quotation';
import { compareAlphabetical, formatBRL } from '../utils/calculations';

interface PrintOrderModalProps {
  order: SupplierOrderSummary | null;
  onClose: () => void;
}

export const PrintOrderModal: React.FC<PrintOrderModalProps> = ({ order, onClose }) => {
  if (!order) return null;

  const sortedItems = [...order.items].sort((a, b) =>
    compareAlphabetical(a.item.description, b.item.description)
  );

  const handlePrint = () => {
    window.print();
  };

  const currentDate = new Date().toLocaleDateString('pt-BR');

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-2xl w-full overflow-hidden my-8 flex flex-col">
        {/* Screen Controls Header (hidden in print) */}
        <div className="p-4 border-b border-slate-200 flex items-center justify-between bg-slate-50 print:hidden">
          <div className="flex items-center gap-2">
            <Printer className="w-5 h-5 text-slate-700" />
            <h3 className="font-bold text-slate-900 text-sm">
              Visualização de Impressão / PDF
            </h3>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handlePrint}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg shadow-xs"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Imprimir / Salvar PDF</span>
            </button>
            <button
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Printable Order Sheet */}
        <div className="p-8 space-y-6 text-slate-900 bg-white">
          {/* Header */}
          <div className="border-b-2 border-slate-900 pb-4 flex items-start justify-between">
            <div>
              <h1 className="text-xl font-bold tracking-tight uppercase">
                Ordem de Compra
              </h1>
              <p className="text-xs text-slate-500 mt-0.5">
                Emissão gerada via CotaFácil · Mapa Comparativo de Cotações
              </p>
            </div>
            <div className="text-right text-xs">
              <p className="font-bold">Data: {currentDate}</p>
              <p className="text-slate-500">Ref: COTA-{Date.now().toString().slice(-6)}</p>
            </div>
          </div>

          {/* Supplier Info */}
          <div className="bg-slate-50 p-4 rounded-lg border border-slate-200 text-xs">
            <h2 className="font-bold uppercase tracking-wider text-slate-500 text-[10px] mb-1">
              Fornecedor Destinatário
            </h2>
            <p className="text-base font-bold text-slate-900">{order.supplier.name}</p>
            {order.supplier.phone && (
              <p className="text-slate-600 mt-0.5">Contato / WhatsApp: {order.supplier.phone}</p>
            )}
          </div>

          {/* Table of Items */}
          <div>
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b-2 border-slate-300 font-bold text-slate-700">
                  <th className="py-2 w-10 text-center">#</th>
                  <th className="py-2 w-14 text-center">Qtd</th>
                  <th className="py-2 w-14 text-center">Unid</th>
                  <th className="py-2">Descrição do Produto / Material</th>
                  <th className="py-2 text-right">Preço Unit.</th>
                  <th className="py-2 text-right">Subtotal</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {sortedItems.map((entry, index) => (
                  <tr key={entry.item.id}>
                    <td className="py-2 text-center text-slate-400 font-mono">
                      {index + 1}
                    </td>
                    <td className="py-2 text-center font-bold font-mono">
                      {entry.item.quantity}
                    </td>
                    <td className="py-2 text-center text-slate-600 font-mono">
                      {entry.item.unit || 'UN'}
                    </td>
                    <td className="py-2 font-medium text-slate-800">
                      {entry.item.description}
                    </td>
                    <td className="py-2 text-right font-mono">
                      {formatBRL(entry.unitPrice)}
                    </td>
                    <td className="py-2 text-right font-mono font-bold">
                      {formatBRL(entry.subtotal)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-slate-900 font-bold text-sm">
                  <td colSpan={4} className="py-3 uppercase text-slate-800">
                    Total do Pedido ({order.totalItemsCount} itens)
                  </td>
                  <td colSpan={2} className="py-3 text-right font-mono text-base text-emerald-800">
                    {formatBRL(order.totalOrderAmount)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>

          {/* Terms / Signatures */}
          <div className="pt-8 border-t border-slate-200 grid grid-cols-2 gap-8 text-xs text-center text-slate-500">
            <div>
              <div className="border-b border-slate-400 h-12 mb-2" />
              <p className="font-semibold text-slate-800">Responsável por Compras</p>
            </div>
            <div>
              <div className="border-b border-slate-400 h-12 mb-2" />
              <p className="font-semibold text-slate-800">Aceite do Fornecedor / Data</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
