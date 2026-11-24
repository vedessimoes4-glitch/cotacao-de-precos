import { SupplierOrderSummary } from '../types/quotation';
import { compareAlphabetical, formatBRL } from './calculations';

export function generateWhatsAppMessage(order: SupplierOrderSummary): string {
  const dateStr = new Date().toLocaleDateString('pt-BR');
  const sortedItems = [...order.items].sort((a, b) =>
    compareAlphabetical(a.item.description, b.item.description)
  );

  const itemsText = sortedItems
    .map((entry, index) => {
      const { item, unitPrice, subtotal } = entry;
      const unit = item.unit ? ` ${item.unit}` : '';
      return `${index + 1}. *${item.description.trim()}*\n   • Qtd: ${item.quantity}${unit} | Preço: ${formatBRL(unitPrice)} | Subtotal: ${formatBRL(subtotal)}`;
    })
    .join('\n\n');

  return `📋 *PEDIDO DE COMPRA - COTAFÁCIL*
🏢 *Fornecedor:* ${order.supplier.name.toUpperCase()}
📅 *Data:* ${dateStr}

*Itens Aprovados da Cotação:*
${itemsText}

━━━━━━━━━━━━━━━━━━━━━━━━
📦 *Total de Itens:* ${order.totalItemsCount}
💰 *VALOR TOTAL DO PEDIDO: ${formatBRL(order.totalOrderAmount)}*
━━━━━━━━━━━━━━━━━━━━━━━━

Favor confirmar o recebimento deste pedido e nos informar a previsão de entrega/faturamento.
Obrigado!`;
}

export function openWhatsAppWeb(order: SupplierOrderSummary) {
  const message = generateWhatsAppMessage(order);
  const encoded = encodeURIComponent(message);
  const cleanPhone = (order.supplier.phone || '').replace(/\D/g, '');
  
  const url = cleanPhone
    ? `https://wa.me/55${cleanPhone}?text=${encoded}`
    : `https://wa.me/?text=${encoded}`;
    
  window.open(url, '_blank');
}
