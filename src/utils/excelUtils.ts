import * as XLSX from 'xlsx';
import { Supplier, CalculatedItem, SupplierOrderSummary } from '../types/quotation';
import { compareAlphabetical, sortSuppliersAlphabetically } from './calculations';

export function exportFullQuotationToExcel(
  items: CalculatedItem[],
  suppliers: Supplier[],
  grandTotalLowest: number
) {
  const sortedSuppliers = sortSuppliersAlphabetically(suppliers);
  const sortedItems = [...items].sort((a, b) =>
    compareAlphabetical(a.description, b.description)
  );

  // Build headers
  const headers = [
    'Qtd',
    'Unidade',
    'Lista de Faltas / Produto',
    'Menor Valor (R$)',
    'Vencedor',
    ...sortedSuppliers.map((s) => s.name),
  ];

  const rows = sortedItems.map((item) => {
    const row: (string | number)[] = [
      item.quantity,
      item.unit || 'UN',
      item.description,
      item.lowestPrice !== null ? Number(item.lowestPrice.toFixed(2)) : '',
      item.winnerSupplierName || '-',
    ];

    sortedSuppliers.forEach((s) => {
      const price = item.prices[s.id];
      row.push(price !== null && price !== undefined ? Number(price.toFixed(2)) : '');
    });

    return row;
  });

  // Total summary row
  const totalRow: (string | number)[] = [
    '',
    '',
    'TOTAL GERAL OTIMIZADO:',
    Number(grandTotalLowest.toFixed(2)),
    '',
    ...sortedSuppliers.map(() => ''),
  ];
  rows.push(totalRow);

  const worksheet = XLSX.utils.aoa_to_sheet([headers, ...rows]);

  // Set column widths
  worksheet['!cols'] = [
    { wch: 8 },  // Qtd
    { wch: 10 }, // Unidade
    { wch: 40 }, // Produto
    { wch: 16 }, // Menor Valor
    { wch: 18 }, // Vencedor
    ...sortedSuppliers.map(() => ({ wch: 16 })),
  ];

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Mapa de Cotação');

  const fileName = `Cotacao_Fornecedores_${new Date().toISOString().slice(0, 10)}.xlsx`;
  XLSX.writeFile(workbook, fileName);
}

export function exportSupplierOrderToExcel(order: SupplierOrderSummary) {
  const headers = ['Item', 'Qtd', 'Unidade', 'Descrição do Produto', 'Preço Unitário (R$)', 'Subtotal (R$)'];

  const sortedEntries = [...order.items].sort((a, b) =>
    compareAlphabetical(a.item.description, b.item.description)
  );

  const rows = sortedEntries.map((entry, index) => [
    index + 1,
    entry.item.quantity,
    entry.item.unit || 'UN',
    entry.item.description,
    Number(entry.unitPrice.toFixed(2)),
    Number(entry.subtotal.toFixed(2)),
  ]);

  // Footer row
  rows.push([
    '',
    '',
    '',
    'TOTAL DO PEDIDO:',
    '',
    Number(order.totalOrderAmount.toFixed(2)),
  ]);

  const worksheet = XLSX.utils.aoa_to_sheet([headers, ...rows]);
  worksheet['!cols'] = [
    { wch: 6 },
    { wch: 8 },
    { wch: 10 },
    { wch: 42 },
    { wch: 18 },
    { wch: 18 },
  ];

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, `Pedido ${order.supplier.name.slice(0, 20)}`);

  const safeSupplierName = order.supplier.name.replace(/[^a-zA-Z0-9]/g, '_');
  const fileName = `Pedido_${safeSupplierName}_${new Date().toISOString().slice(0, 10)}.xlsx`;
  XLSX.writeFile(workbook, fileName);
}

export function downloadTemplateExcel(suppliers: Supplier[]) {
  const sortedSuppliers = sortSuppliersAlphabetically(suppliers);
  const headers = [
    'Qtd',
    'Unidade',
    'Produto / Descrição',
    ...sortedSuppliers.map((s) => s.name),
  ];

  const sampleRows = [
    [100, 'BR', 'Cano PVC Soldável 25mm 6m', 15.2, 14.8, 15.5, 14.5],
    [50, 'SC', 'Cimento CP II 50kg', 32.5, 34.0, 31.9, 33.2],
    [20, 'UN', 'Torneira Esfera Metal 1/2"', 18.9, 17.5, 19.0, 16.8],
  ];

  const worksheet = XLSX.utils.aoa_to_sheet([headers, ...sampleRows]);
  worksheet['!cols'] = [
    { wch: 8 },
    { wch: 10 },
    { wch: 35 },
    ...sortedSuppliers.map(() => ({ wch: 16 })),
  ];

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Modelo de Cotação');
  XLSX.writeFile(workbook, 'Modelo_Cotacao_Fornecedores.xlsx');
}

export async function parseExcelOrCsvFile(file: File): Promise<{
  importedProducts: Array<{
    quantity: number;
    description: string;
    unit: string;
    pricesBySupplierName: Record<string, number>;
  }>;
  detectedSupplierNames: string[];
}> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = (e) => {
      try {
        const data = e.target?.result;
        const workbook = XLSX.read(data, { type: 'binary' });
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];

        const jsonRows = XLSX.utils.sheet_to_json<(string | number)[]>(worksheet, {
          header: 1,
          defval: '',
        });

        if (jsonRows.length < 2) {
          throw new Error('A planilha precisa ter cabeçalho e ao menos uma linha de dados.');
        }

        const headerRow = jsonRows[0].map((h) => String(h).trim());

        // Find standard columns
        let qtdIndex = headerRow.findIndex((h) => /qtd|quant/i.test(h));
        let descIndex = headerRow.findIndex((h) => /produto|descri|falta/i.test(h));
        let unitIndex = headerRow.findIndex((h) => /unid|un/i.test(h));

        if (qtdIndex === -1) qtdIndex = 0;
        if (descIndex === -1) descIndex = qtdIndex === 0 ? 1 : 0;

        // Any columns that are not Qtd, Unit, Menor Valor, or Vencedor are treated as Supplier columns!
        const ignoredRegex = /qtd|quant|unid|un|menor|vencedor|total|subtotal/i;
        const detectedSupplierNames: string[] = [];
        const supplierColIndices: { name: string; colIndex: number }[] = [];

        headerRow.forEach((colName, idx) => {
          if (idx !== qtdIndex && idx !== descIndex && idx !== unitIndex && colName) {
            if (!ignoredRegex.test(colName)) {
              detectedSupplierNames.push(colName);
              supplierColIndices.push({ name: colName, colIndex: idx });
            }
          }
        });

        const importedProducts: Array<{
          quantity: number;
          description: string;
          unit: string;
          pricesBySupplierName: Record<string, number>;
        }> = [];

        for (let i = 1; i < jsonRows.length; i++) {
          const row = jsonRows[i];
          const rawDesc = String(row[descIndex] || '').trim();
          if (!rawDesc || /total/i.test(rawDesc)) continue;

          const rawQtd = Number(row[qtdIndex]);
          const quantity = !isNaN(rawQtd) && rawQtd > 0 ? rawQtd : 1;
          const unit = unitIndex !== -1 && row[unitIndex] ? String(row[unitIndex]).trim() : 'UN';

          const pricesBySupplierName: Record<string, number> = {};
          supplierColIndices.forEach(({ name, colIndex }) => {
            const val = row[colIndex];
            if (val !== undefined && val !== null && val !== '') {
              const num = typeof val === 'number' ? val : parseFloat(String(val).replace(',', '.'));
              if (!isNaN(num) && num > 0) {
                pricesBySupplierName[name] = num;
              }
            }
          });

          importedProducts.push({
            quantity,
            description: rawDesc,
            unit,
            pricesBySupplierName,
          });
        }

        importedProducts.sort((a, b) => compareAlphabetical(a.description, b.description));
        detectedSupplierNames.sort((a, b) => compareAlphabetical(a, b));

        resolve({ importedProducts, detectedSupplierNames });
      } catch (err) {
        reject(err);
      }
    };

    reader.onerror = (err) => reject(err);
    reader.readAsBinaryString(file);
  });
}
