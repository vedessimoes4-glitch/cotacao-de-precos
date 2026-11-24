import React, { useState } from 'react';
import { 
  Building2, 
  MessageSquare, 
  FileSpreadsheet, 
  Printer, 
  Check, 
  Copy, 
  Share2,
  PackageCheck,
  Phone
} from 'lucide-react';
import { SupplierOrderSummary } from '../types/quotation';
import { formatBRL } from '../utils/calculations';
import { generateWhatsAppMessage, openWhatsAppWeb } from '../utils/whatsappFormatter';
import { exportSupplierOrderToExcel } from '../utils/excelUtils';

interface SupplierOrdersViewProps {
  supplierOrders: SupplierOrderSummary[];
  onPrintOrder: (order: SupplierOrderSummary) => void;
  onBackToTable: () => void;
}

export const SupplierOrdersView: React.FC<SupplierOrdersViewProps> = ({
  supplierOrders,
  onPrintOrder,
  onBackToTable,
}) => {
  const [copiedSupplierId, setCopiedSupplierId] = useState<string | null>(null);

  const handleCopyWhatsApp = (order: SupplierOrderSummary) => {
    const message = generateWhatsAppMessage(order);
    navigator.clipboard.writeText(message);
    setCopiedSupplierId(order.supplier.id);
    setTimeout(() => setCopiedSupplierId(null), 2500);
  };

  const grandTotal = supplierOrders.reduce((sum, order) => sum + order.totalOrderAmount, 0);
  const totalItemsCount = supplierOrders.reduce((sum, order) => sum + order.totalItemsCount, 0);

  if (supplierOrders.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-slate-200 p-12 text-center shadow-xs">
        <PackageCheck className="w-12 h-12 text-slate-300 mx-auto mb-3" />
        <h3 className="text-base font-bold text-slate-800">
          Nenhum item com preço vencedor ainda
        </h3>
        <p className="text-xs text-slate-500 max-w-md mx-auto mt-1 mb-4">
          Preencha os valores cotados pelos fornecedores na tabela do Mapa de Cotação. Os pedidos serão gerados e separados automaticamente por fornecedor ganhador aqui.
        </p>
        <button
          onClick={onBackToTable}
          className="px-4 py-2 text-xs font-semibold text-white bg-slate-900 rounded-lg hover:bg-slate-800 transition-colors"
        >
          Voltar para a Tabela de Cotação
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Top Banner with Total Purchase Summary */}
      <div className="bg-slate-900 text-white rounded-xl p-5 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-1.5 text-xs text-emerald-400 font-semibold mb-1">
            <PackageCheck className="w-4 h-4" />
            <span>Pedidos de Compra Prontos para Emissão</span>
          </div>
          <h2 className="text-xl font-bold tracking-tight">
            {supplierOrders.length} {supplierOrders.length === 1 ? 'Fornecedor Vencedor' : 'Fornecedores Vencedores'}
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Os itens foram divididos automaticamente com base no menor preço unitário de cada distribuidor.
          </p>
        </div>

        <div className="flex items-center gap-6 bg-slate-800/80 px-4 py-3 rounded-lg border border-slate-700">
          <div>
            <span className="text-[11px] text-slate-400 uppercase tracking-wider block">
              Total de Itens
            </span>
            <span className="text-lg font-bold font-mono tabular-nums text-white">
              {totalItemsCount} produtos
            </span>
          </div>
          <div className="w-px h-8 bg-slate-700" />
          <div>
            <span className="text-[11px] text-slate-400 uppercase tracking-wider block">
              Valor Total Geral
            </span>
            <span className="text-xl font-bold font-mono tabular-nums text-emerald-400">
              {formatBRL(grandTotal)}
            </span>
          </div>
        </div>
      </div>

      {/* Grid of Individual Supplier Orders */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {supplierOrders.map((order) => {
          const isCopied = copiedSupplierId === order.supplier.id;

          return (
            <div
              key={order.supplier.id}
              className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden flex flex-col justify-between"
            >
              {/* Card Header */}
              <div className="p-4 bg-slate-50 border-b border-slate-200">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-emerald-100 text-emerald-800 flex items-center justify-center font-bold text-base shrink-0">
                      <Building2 className="w-5 h-5 text-emerald-700" />
                    </div>
                    <div>
                      <h3 className="font-bold text-slate-900 text-base flex items-center gap-2">
                        {order.supplier.name}
                        <span className="text-[10px] font-semibold bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full font-mono tabular-nums">
                          {order.totalItemsCount} {order.totalItemsCount === 1 ? 'item' : 'itens'}
                        </span>
                      </h3>
                      {order.supplier.phone && (
                        <p className="text-xs text-slate-500 flex items-center gap-1 mt-0.5">
                          <Phone className="w-3 h-3 text-slate-400" />
                          <span>WhatsApp: {order.supplier.phone}</span>
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="text-right">
                    <span className="text-[10px] uppercase tracking-wider text-slate-500 block">
                      Subtotal Pedido
                    </span>
                    <span className="text-lg font-bold font-mono tabular-nums text-emerald-700">
                      {formatBRL(order.totalOrderAmount)}
                    </span>
                  </div>
                </div>
              </div>

              {/* Items Table for this supplier */}
              <div className="p-4 overflow-x-auto flex-1">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 text-slate-500 text-[11px] font-medium">
                      <th className="pb-2 w-12 text-center">Qtd</th>
                      <th className="pb-2 w-12 text-center">Unid</th>
                      <th className="pb-2">Produto</th>
                      <th className="pb-2 text-right">Preço Unit.</th>
                      <th className="pb-2 text-right">Subtotal</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {order.items.map((entry) => (
                      <tr key={entry.item.id} className="hover:bg-slate-50/70">
                        <td className="py-2 text-center font-mono font-medium text-slate-900 tabular-nums">
                          {entry.item.quantity}
                        </td>
                        <td className="py-2 text-center text-slate-500 font-mono text-[11px]">
                          {entry.item.unit || 'UN'}
                        </td>
                        <td className="py-2 font-medium text-slate-800 pr-2">
                          {entry.item.description}
                        </td>
                        <td className="py-2 text-right font-mono tabular-nums text-slate-700">
                          {formatBRL(entry.unitPrice)}
                        </td>
                        <td className="py-2 text-right font-mono tabular-nums font-semibold text-emerald-700">
                          {formatBRL(entry.subtotal)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Action Buttons for this Supplier's Order */}
              <div className="p-3 bg-slate-50/80 border-t border-slate-200 flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  {/* Copy WhatsApp */}
                  <button
                    onClick={() => handleCopyWhatsApp(order)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                      isCopied
                        ? 'bg-emerald-600 text-white'
                        : 'bg-emerald-50 text-emerald-800 border border-emerald-300 hover:bg-emerald-100'
                    }`}
                    title="Copiar texto pronto formatado para colar no WhatsApp"
                  >
                    {isCopied ? (
                      <>
                        <Check className="w-3.5 h-3.5" />
                        <span>Copiado!</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        <span>Copiar p/ WhatsApp</span>
                      </>
                    )}
                  </button>

                  {/* Open in WhatsApp Web directly */}
                  <button
                    onClick={() => openWhatsAppWeb(order)}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 transition-colors shadow-xs"
                    title="Abrir WhatsApp com o pedido preenchido"
                  >
                    <MessageSquare className="w-3.5 h-3.5" />
                    <span>Enviar WhatsApp</span>
                  </button>
                </div>

                <div className="flex items-center gap-1.5">
                  {/* Export Excel for this supplier */}
                  <button
                    onClick={() => exportSupplierOrderToExcel(order)}
                    className="p-1.5 text-slate-600 hover:text-slate-900 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg transition-colors"
                    title="Baixar planilha Excel do pedido deste fornecedor"
                  >
                    <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
                  </button>

                  {/* Print / PDF order */}
                  <button
                    onClick={() => onPrintOrder(order)}
                    className="p-1.5 text-slate-600 hover:text-slate-900 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg transition-colors"
                    title="Imprimir ou gerar PDF da ordem de compra"
                  >
                    <Printer className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
