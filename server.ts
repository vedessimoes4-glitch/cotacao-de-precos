import express from 'express';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { GoogleGenAI, Type, ThinkingLevel } from '@google/genai';
import { findBestProductMatch, extractProductBrand } from './src/utils/productMatcher';
import {
  IMAGE_CACHE_DIR,
  ensurePdfCanvasPolyfills,
  attachPdfProductImages,
} from './server/pdfImageExtractor';

const customDotenvPath = process.env.DOTENV_PATH;
if (customDotenvPath && fs.existsSync(customDotenvPath)) {
  dotenv.config({ path: customDotenvPath });
} else {
  dotenv.config();
}

async function getPdfParserClass() {
  ensurePdfCanvasPolyfills();
  const mod = await import('pdf-parse');
  return mod.PDFParse;
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const portArgIdx = process.argv.indexOf('--port');
const cliPort =
  portArgIdx !== -1 && process.argv[portArgIdx + 1]
    ? Number(process.argv[portArgIdx + 1])
    : undefined;
const PORT =
  cliPort ||
  (process.env.NODE_ENV === 'production' ? Number(process.env.PORT) || 3000 : 3000);

// Body parsing with generous limit for base64 images/documents
app.use(express.json({ limit: '100mb' }));
app.use(express.urlencoded({ extended: true, limit: '100mb' }));

// Serve cached product thumbnails extracted from supplier PDFs
app.get('/api/product-images/:filename', (req, res) => {
  const filename = String(req.params.filename || '');
  if (!/^[a-f0-9]{16}\.png$/i.test(filename)) {
    return res.status(400).end();
  }
  const fullPath = path.join(IMAGE_CACHE_DIR, filename);
  if (!fs.existsSync(fullPath)) {
    return res.status(404).end();
  }
  res.setHeader('Content-Type', 'image/png');
  res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
  return res.sendFile(fullPath);
});

// Temporary chunk store for large PDF uploads (> 8 MB) so Cloud Run 32MB proxy limit is never hit
const uploadChunkStore = new Map<string, { chunks: Buffer[]; createdAt: number }>();

app.post(
  '/api/extract-quotation-chunk',
  express.raw({ type: 'application/octet-stream', limit: '10mb' }),
  (req, res) => {
    const uploadId = String(req.headers['x-upload-id'] || '');
    const chunkIndex = parseInt(String(req.headers['x-chunk-index'] || '0'));

    if (!uploadId || !Buffer.isBuffer(req.body)) {
      return res.status(400).json({ error: 'Chunk de upload inválido.' });
    }

    // Prune stale uploads older than 10 minutes
    const now = Date.now();
    for (const [key, val] of uploadChunkStore.entries()) {
      if (now - val.createdAt > 10 * 60 * 1000) {
        uploadChunkStore.delete(key);
      }
    }

    let entry = uploadChunkStore.get(uploadId);
    if (!entry) {
      entry = { chunks: [], createdAt: now };
      uploadChunkStore.set(uploadId, entry);
    }
    entry.chunks[chunkIndex] = req.body;

    return res.json({ ok: true, received: req.body.length });
  }
);

// Initialize GoogleGenAI client if API key is present
const ai = process.env.GEMINI_API_KEY
  ? new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    })
  : null;

function parseMoneyValue(raw: string): number {
  const cleaned = raw.replace(/[R$\s]/g, '').trim();
  if (!cleaned) return 0;

  const lastComma = cleaned.lastIndexOf(',');
  const lastDot = cleaned.lastIndexOf('.');

  if (lastComma !== -1 && lastDot !== -1) {
    // Both present: whichever comes last is the decimal separator
    if (lastDot > lastComma) {
      // e.g. 1,077.10
      return parseFloat(cleaned.replace(/,/g, '')) || 0;
    } else {
      // e.g. 1.077,10
      return parseFloat(cleaned.replace(/\./g, '').replace(',', '.')) || 0;
    }
  }

  if (lastComma !== -1) {
    // Only comma: e.g. 6,90 or 150,00
    return parseFloat(cleaned.replace(',', '.')) || 0;
  }

  if (lastDot !== -1) {
    // Only dot: treat as thousand separator ONLY if exactly 3 digits after dot (e.g. 1.200)
    // Otherwise (1, 2, 4, 5, 6 digits after dot like 9.32 or 110.871720) it's a decimal dot
    const afterDot = cleaned.slice(lastDot + 1);
    if (afterDot.length !== 3) {
      return parseFloat(cleaned) || 0;
    }
    return parseFloat(cleaned.replace(/\./g, '')) || 0;
  }

  return parseFloat(cleaned) || 0;
}

export function extractPackQuantityFromDesc(
  desc: string,
  billingUnit?: string,
  billedQty?: number
): number {
  const unitUpper = (billingUnit || '').trim().toUpperCase();

  // "CT" = Cento (100 units) in Brazilian hardware quotes (even if description mentions inner box like "embalagem com 25 peças")
  if (unitUpper === 'CT') {
    return 100;
  }

  // "DZ" = Dúzia (12 units)
  if (unitUpper === 'DZ') {
    return 12;
  }

  // Ignore pure individual/length/set/weight units (UN, JG, RL, BD, LA, KG, MT, M, BR, LT)
  if (unitUpper && /^(UN|JG|RL|BD|LA|KG|MT|M|BR|LT|L)$/i.test(unitUpper)) {
    return 1;
  }

  // Notice: when billingUnit is "PC" in distributor catalogs like Dismatal/OVD:
  // - "pacote com 50 peças" IS sold as a pack of 50 (packQuantity = 50)
  // - "embalagem com 12 peças" or "display com 6 peças" when quantity is a multiple of N is just master-box info (packQuantity = 1)
  if (unitUpper === 'PC') {
    const packMatch =
      desc.match(/(?:cx|caixa|pct|pacote|fd|fardo|lote)\s*(?:c\/|com|:)?\s*(\d+)\s*(?:un|pc|pcs|pç|pçs|pecas|peças|itens|und|br)?/i) ||
      desc.match(/\(\s*(?:cx|pct|fd|lote)\s*(?:c\/|com)?\s*(\d+)\s*(?:un|pc|pcs|pç|pçs|pecas|peças|itens|und|br)\s*\)/i);
    if (packMatch && packMatch[1]) {
      const num = parseInt(packMatch[1]);
      if (num > 1 && num <= 50000) return num;
    }

    // Only divide "embalagem/display com X" when billedQty is NOT a multiple of X (or billedQty === 1)
    const masterMatch = desc.match(/(?:embalagem|display)\s*(?:c\/|com|:)?\s*(\d+)\s*(?:un|pc|pcs|pç|pçs|pecas|peças|itens|und)?/i);
    if (masterMatch && masterMatch[1]) {
      const num = parseInt(masterMatch[1]);
      if (num > 1 && billedQty === 1) return num;
    }
    return 1;
  }

  const candidates = [
    desc.match(/\bc\/\s*(\d+)\s*(?:un|pc|pcs|pç|pçs|pecas|peças|itens|und|br)?\b/i),
    desc.match(/(?:cx|caixa|pct|pacote|fd|fardo|emb|embalagem|lote|pt)\s*(?:c\/|com|:)\s*(\d+)\s*(?:un|pc|pcs|pç|pçs|pecas|peças|itens|und|br)?/i),
    desc.match(/\(\s*(?:cx|pct|fd|emb|lote|pt)?\s*(?:c\/|com)?\s*(\d+)\s*(?:un|pc|pcs|pç|pçs|pecas|peças|itens|und|br)\s*\)/i),
    desc.match(/(?:cx|caixa|pct|pacote|fd|fardo|emb|embalagem|lote|pt)\s+(\d+)\s*(?:un|pc|pcs|pç|pçs|pecas|peças|itens|und|br)?\b/i),
    // For multi-pack billing units (PT, FD, SC, CX, PCT, EMB, LOTE, PO), also match "100PC", "(12PC)", "20X1KG", "(200X1)", "C6", "C50"
    ...(unitUpper && /^(PT|PCT|FD|SC|CX|EMB|LOTE|PO)$/i.test(unitUpper)
      ? [
          desc.match(/\b(\d+)\s*(?:pc|pcs|pç|pçs|un|und)\b/i),
          desc.match(/\(?\s*(\d+)\s*[xX]\s*1\s*(?:kg|l|lt|un|pc)?\s*\)?/i),
          desc.match(/\bc(\d{1,4})\b/i),
        ]
      : []),
  ];

  for (const m of candidates) {
    if (m && m[1]) {
      const num = parseInt(m[1], 10);
      if (num > 1 && num <= 50000) return num;
    }
  }
  return 1;
}

function extractUnitFromCode(emb: string): string {
  const upper = emb.trim().toUpperCase();
  const prefix = upper.split(/[-/\s]/)[0];
  if (/^(UN|PC|CT|CX|PT|PCT|FD|KG|MT|M|BR|RL|SC|LT|LA|BD|JG)$/.test(prefix)) {
    return prefix;
  }
  return 'UN';
}

// Helper: Local parser for quotation text (supports ION Sistemas / Mercante PDFs and general quotes)
export function parseQuotationTextLocally(
  text: string,
  existingProducts: Array<{ id: string; name: string; quantity: number }> = []
) {
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
  const items: Array<{
    productName: string;
    brand?: string;
    quantity: number;
    packQuantity: number;
    unit: string;
    totalItemPrice: number;
    unitPrice: number;
    calculationNote: string;
    matchedExistingId: string;
    imageAnchor?: string;
  }> = [];

  let detectedSupplierName = '';
  let otherExpenses: number | undefined;
  let documentTotal: number | undefined;

  // Detect supplier from SAP / header lines (e.g. "FORTLEV - BA CNPJ: 10.921.911/0001-05")
  const cnpjHeaderMatch = text.match(/^([A-Z0-9À-Ú\s.,/-]{3,60}?)\s+CNPJ\s*:/im);
  if (cnpjHeaderMatch && !/CAMPOS MATERIAL/i.test(cnpjHeaderMatch[1])) {
    detectedSupplierName = cnpjHeaderMatch[1].trim();
  }

  // Capture Total NF from SAP footer
  const totalNfMatch = text.match(/Total\s+NF\s+R\$\s*([\d.,]+)/i);
  if (totalNfMatch) {
    documentTotal = parseMoneyValue(totalNfMatch[1]);
  }

  // Pattern 0: SAP / Fortlev "Espelho da Ordem" multi-line table layout
  if (/\b\d{6}\s+\d{6,10}\b/.test(text) && (/Preço Total/i.test(text) || /Ordem SAP/i.test(text))) {
    const cleanedSap = text
      .replace(/--\s*\d+\s+of\s+\d+\s*--/gi, '\n')
      .replace(/Item\s+Produto\s+Descri[çc][ãa]o[\s\S]*?Pre[çc]o\s+Total/gi, '\n')
      .split(/Obs\s+Transporte|Total\s+L[íi]quido/i)[0];

    const chunks = cleanedSap
      .split(/(?=\b\d{6}\s+\d{6,10}\b)/)
      .filter((c) => /^\d{6}\s+\d{6,10}\b/.test(c.trim()));

    for (const chunk of chunks) {
      const sapMatch = chunk
        .trim()
        .match(
          /^\d{6}\s+\d{6,10}\s+([\s\S]+?)\s+(UN|PC|CX|PCT|FD|KG|MT|M|BR|RL|SC|LT)\s+(\d+)\s+(?:\d+\s*\/\s*)?(\d+)\s+(?:UN|PC|CX|PCT|FD|KG|MT|M|BR|RL|SC|LT)\s+R\$\s*([\d.,]+)\s+[\d.,]+\s*%\s+[\d.,]+\s*%(?:\s*\(R\$\s*[\d.,]+\))?\s+[\d.,]+\s*%\s+R\$\s*([\d.,]+)([\s\S]*)$/i
        );

      if (sapMatch) {
        const descMain = sapMatch[1].replace(/\s+/g, ' ').trim();
        const descTail = (sapMatch[7] || '').replace(/\s+/g, ' ').trim();
        const desc = descTail ? `${descMain} ${descTail}` : descMain;
        const unit = sapMatch[2].toUpperCase();
        const embCol = parseInt(sapMatch[3]) || 0;
        const quantity = parseInt(sapMatch[4]) || 1;
        const totalItemPrice = parseMoneyValue(sapMatch[6]);

        const packQuantity =
          embCol > 1 && /^(CX|PCT|FD|EMB|LOTE)$/i.test(unit)
            ? embCol
            : extractPackQuantityFromDesc(desc, unit);

        const totalUnits = quantity * packQuantity;
        const unitPrice = Number((totalItemPrice / totalUnits).toFixed(2));
        const calculationNote =
          packQuantity > 1
            ? `R$ ${totalItemPrice.toFixed(2)} ÷ (${quantity} × ${packQuantity} un) = R$ ${unitPrice.toFixed(2)}/un`
            : `R$ ${totalItemPrice.toFixed(2)} ÷ ${quantity} ${unit.toLowerCase()} = R$ ${unitPrice.toFixed(2)}/un`;

        items.push({
          productName: desc,
          brand: extractProductBrand(desc, 'FORTLEV'),
          quantity,
          packQuantity,
          unit,
          totalItemPrice,
          unitPrice,
          calculationNote,
          matchedExistingId: findBestProductMatch(desc, existingProducts),
        });
      }
    }

    if (items.length > 0) {
      const qtdeItensMatch = text.match(/Qtde\s+Itens\s+(\d+)/i);
      const expectedCount = qtdeItensMatch ? parseInt(qtdeItensMatch[1]) : 0;
      const sumTotal = items.reduce((s, it) => s + it.totalItemPrice, 0);
      const isCompleteSap =
        (expectedCount > 0 && items.length === expectedCount) ||
        (documentTotal !== undefined && Math.abs(sumTotal - documentTotal) < 1);

      return {
        items,
        supplierName: detectedSupplierName,
        otherExpenses,
        documentTotal,
        isVerifiedStructured: isCompleteSap,
      };
    }
  }

  // Pattern 0B: Opção Comércio Atacadista / ERP 6-decimal layout
  // Header: ITEM FOTO COD. DESCRIÇÃO MARCA EMB. UN QTDE VLR.UNIT. TOTAL COD. BARRAS
  if (/ITEM\s+FOTO\s+COD\.\s+DESCRI[ÇC][ÃA]O/i.test(text) && /\d+\.\d{6}\s+\d+\.\d{6}\s+\d+\.\d{6}/.test(text)) {
    const codHeaderMatch = text.match(/^COD\.\s*\d+\s*-\s*([^\n]+?)(?:\s+Or[çc]amento\s+no\.|$)/im);
    if (codHeaderMatch && !/CAMPOS MATERIAL/i.test(codHeaderMatch[1])) {
      detectedSupplierName = codHeaderMatch[1].trim();
    }

    const freteMatch = text.match(/TOTAL\s+FRETE:\s*([\d.,]+)/i);
    if (freteMatch) {
      otherExpenses = parseMoneyValue(freteMatch[1]);
    }
    const totalGeralMatch = text.match(/TOTAL\s+GERAL:\s*([\d.,]+)/i);
    if (totalGeralMatch) {
      documentTotal = parseMoneyValue(totalGeralMatch[1]);
    }

    const startSplit = text.split(/COD\.\s*BARRAS/i);
    const afterHeader = startSplit.length > 1 ? startSplit.slice(1).join(' ') : text;
    let tableBody = afterHeader
      .split(/FORM\.\s*PAGTO\.|TOTAL\s+PRODUTOS:/i)[0]
      .replace(/--\s*\d+\s+of\s+\d+\s*--/gi, ' ')
      .replace(/ITEM\s+FOTO\s+COD\.\s+DESCRI[ÇC][ÃA]O[\s\S]*?COD\.\s*BARRAS/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    let itemIdx = 1;
    while (tableBody.length > 0) {
      const nextIdxStr = String(itemIdx + 1);
      const hasNext = new RegExp(`${nextIdxStr}\\s+\\d{3,7}\\s+`).test(tableBody);
      const rowRegex = new RegExp(
        `^${itemIdx}\\s+\\d{3,7}\\s+(.+?)\\s+(PC|UN|PT|PCT|FD|RL|BD|SC|JG|CX|LA|KG|MT|BR)\\s+(\\d+\\.\\d{4,6})\\s+(\\d+\\.\\d{4,6})\\s+(\\d+\\.\\d{4,6})\\s+\\d+?\\s*${
          hasNext ? `(?=${nextIdxStr}\\s+\\d{3,7}\\s+)` : '$'
        }`,
        'i'
      );

      const m = tableBody.match(rowRegex);
      if (!m) break;

      let descClean = m[1].replace(/\s+/g, ' ').trim();
      let opcaoBrand = '';
      // Strip trailing MARCA + EMB. columns (e.g. "FOXLUX *FOX LUX" or "MULTILIT MULTILIT" or "MUNDIALPRIME MUNDIALPRIM")
      const starBrandMatch = descClean.match(/\s+([^\s*]+)\s+\*[A-Z0-9\s/.-]{2,20}$/i);
      if (starBrandMatch) {
        opcaoBrand = starBrandMatch[1];
        descClean = descClean.replace(/\s+\S+\s+\*[A-Z0-9\s/.-]{2,20}$/i, '').trim();
      } else {
        const words = descClean.split(' ');
        if (words.length >= 3) {
          const w1 = words[words.length - 2].toUpperCase();
          const w2 = words[words.length - 1].toUpperCase();
          if (w2.length >= 3 && (w1 === w2 || w1.startsWith(w2) || w2.startsWith(w1))) {
            opcaoBrand = words[words.length - 2];
            descClean = words.slice(0, -2).join(' ').trim();
          }
        }
      }

      const unit = m[2].toUpperCase();
      const quantity = Math.round(parseFloat(m[3])) || 1;
      const totalItemPrice = Number((parseFloat(m[5]) || 0).toFixed(2));
      const packQuantity = extractPackQuantityFromDesc(descClean, unit);
      const totalUnits = quantity * packQuantity;
      const unitPrice = Number((totalItemPrice / totalUnits).toFixed(2));

      const calculationNote =
        packQuantity > 1
          ? `R$ ${totalItemPrice.toFixed(2)} ÷ (${quantity} × ${packQuantity} un) = R$ ${unitPrice.toFixed(2)}/un`
          : `R$ ${totalItemPrice.toFixed(2)} ÷ ${quantity} ${unit.toLowerCase()} = R$ ${unitPrice.toFixed(2)}/un`;

      const skuAnchor = m[0].match(/^\d+\s+(\d{3,7})\b/)?.[1];

      items.push({
        productName: descClean,
        brand: extractProductBrand(descClean, opcaoBrand),
        quantity,
        packQuantity,
        unit,
        totalItemPrice,
        unitPrice,
        calculationNote,
        matchedExistingId: findBestProductMatch(descClean, existingProducts),
        imageAnchor: skuAnchor,
      });

      tableBody = tableBody.slice(m[0].length).trim();
      itemIdx++;
    }

    if (items.length > 0) {
      const sumTotal = items.reduce((s, it) => s + it.totalItemPrice, 0);
      const isVerifiedOpcao =
        documentTotal !== undefined && Math.abs(sumTotal + (otherExpenses || 0) - documentTotal) < 1;

      return {
        items,
        supplierName: detectedSupplierName,
        otherExpenses,
        documentTotal,
        isVerifiedStructured: isVerifiedOpcao,
      };
    }
  }

  // Pattern 0C: Dismatal / O.V.D. Importadora (Grupo Vonder) layout
  // Header: It. Código Descrição Marca NCM/Orig UN Quantid. ... Valor total R$
  if (/NCM\/Orig/i.test(text) && /Valor total\s+mercad\./i.test(text)) {
    const ovdMatch = text.match(/^(O\.?V\.?D\.?[^\n]+|DISMATAL[^\n]*)/im);
    if (ovdMatch) {
      detectedSupplierName = `${ovdMatch[1].trim()} (Dismatal/Vonder)`;
    }

    const footerSection = text.split(/OBSERVA[ÇC][ÕO]ES:/i)[1] || '';
    const footerMoney = [...footerSection.split(/Sujeito à aprovação/i)[0].matchAll(/\b(\d{1,3}(?:\.\d{3})*,\d{2})\b/g)].map(
      (m) => parseMoneyValue(m[1])
    );
    if (footerMoney.length > 0) {
      documentTotal = Math.max(...footerMoney);
    }

    const cleanedDismatal = text
      .split(/OBSERVA[ÇC][ÕO]ES:/i)[0]
      .replace(/--\s*\d+\s+of\s+\d+\s*--/gi, '\n')
      .replace(/O\.?V\.?D\.?\s+IMPORTADORA[\s\S]*?Valor\s+total\s*R\$/gi, '\n')
      .replace(/\s+/g, ' ')
      .trim();

    const chunks = cleanedDismatal
      .split(/(?=\b\d{1,3}\s+\d{10}\s+)/)
      .filter((c) => /^\d{1,3}\s+\d{10}\s+/.test(c.trim()));

    for (const chunk of chunks) {
      const m = chunk
        .trim()
        .match(
          /^\d{1,3}\s+\d{10}\s+([\s\S]+?)\s+\d{8}\/\d\s+(ct|pc|kg|m|jg|un|cx|pt|pct|fd|rl)\s+([\d.,]+)\s+[\d.,]+\s+[\d.,]+\s+[\d.,]+\s+[\d.,]+\s+[\d.,]+\s+[\d.,]+\s+[\d.,]+\s+[\d.,]+\s+[\d.,]+\s+([\d.,]+)\s*$/i
        );

      if (m) {
        let descClean = m[1].replace(/\s+/g, ' ').trim();
        let dismatalBrand = '';
        // Remove duplicated Marca at end (e.g. "VONDER VONDER", "CABOS PARANA CABOS PARANA", "VONDER PLUS VONDER PLUS")
        const words = descClean.split(' ');
        if (words.length >= 4) {
          const tail2A = words.slice(-4, -2).join(' ').toUpperCase();
          const tail2B = words.slice(-2).join(' ').toUpperCase();
          if (tail2A === tail2B) {
            dismatalBrand = words.slice(-2).join(' ');
            descClean = words.slice(0, -2).join(' ').trim();
          }
        }
        const words2 = descClean.split(' ');
        if (words2.length >= 2) {
          const w1 = words2[words2.length - 2].replace(/,+$/, '').toUpperCase();
          const w2 = words2[words2.length - 1].toUpperCase();
          if (w1 === w2) {
            if (!dismatalBrand) dismatalBrand = w1;
            descClean = words2.slice(0, -1).join(' ').trim();
          }
        }

        const unit = m[2].toUpperCase();
        const quantity = parseMoneyValue(m[3]) || 1;
        const totalItemPrice = parseMoneyValue(m[4]);
        const packQuantity = extractPackQuantityFromDesc(descClean, unit, quantity);
        const totalUnits = quantity * packQuantity;
        const unitPrice = Number((totalItemPrice / totalUnits).toFixed(2));

        const calculationNote =
          packQuantity > 1
            ? `R$ ${totalItemPrice.toFixed(2)} ÷ (${quantity} ${unit.toLowerCase()} × ${packQuantity}) = R$ ${unitPrice.toFixed(2)}/un`
            : `R$ ${totalItemPrice.toFixed(2)} ÷ ${quantity} ${unit.toLowerCase()} = R$ ${unitPrice.toFixed(2)}/un`;

        items.push({
          productName: descClean,
          brand: extractProductBrand(descClean, dismatalBrand),
          quantity,
          packQuantity,
          unit,
          totalItemPrice,
          unitPrice,
          calculationNote,
          matchedExistingId: findBestProductMatch(descClean, existingProducts),
        });
      }
    }

    if (items.length > 0) {
      const sumTotal = items.reduce((s, it) => s + it.totalItemPrice, 0);
      const isVerifiedDismatal =
        chunks.length === items.length &&
        (documentTotal === undefined || Math.abs(sumTotal - documentTotal) < 1);

      return {
        items,
        supplierName: detectedSupplierName,
        otherExpenses,
        documentTotal,
        isVerifiedStructured: isVerifiedDismatal,
      };
    }
  }

  // Pattern 0D: Bartofil Distribuidora multi-line block layout
  if (/www\.bartofil\.com\.br/i.test(text) || /C[óo]d\.\s*Produto:\s*\d+\s*\|\s*Embalagem:/i.test(text)) {
    detectedSupplierName = 'BARTOFIL';
    const totalMatch = text.match(/Total\s+\d+\s+R\$\s*([\d.,]+)/i);
    if (totalMatch) {
      documentTotal = parseMoneyValue(totalMatch[1]);
    }

    const bodyBartofil = text
      .split(/\nTotal\s+\d+\s+R\$/i)[0]
      .replace(/www\.bartofil\.com\.br[\s\S]*?PREÇO\s+PRODUTO/gi, '')
      .replace(/--\s*\d+\s+of\s+\d+\s*--/gi, '');

    const blocks = bodyBartofil
      .split(/(?=C[óo]d\.\s*Produto:)/i)
      .filter((b) => /^C[óo]d\.\s*Produto:/i.test(b.trim()));

    for (const block of blocks) {
      const m = block
        .trim()
        .match(
          /^C[óo]d\.\s*Produto:\s*\d+\s*\|\s*Embalagem:\s*([A-Z]+)\s*\n([\s\S]+?)\nC[óo]d\.\s*Barra:\s*(\d+)(?:\s*\n(\d+)|\s*)\s*R\$\s*([\d.,]+)\s+R\$\s*([\d.,]+)/i
        );
      if (!m) continue;

      const unit = m[1].toUpperCase();
      const descLines = m[2]
        .split('\n')
        .map((s) => s.trim())
        .filter(Boolean);
      let desc = '';
      for (const dl of descLines) {
        if (!desc) desc = dl;
        else if (/^[x×]\d/i.test(dl)) desc += dl;
        else desc += ' ' + dl;
      }
      desc = desc.replace(/\s+#N\b/gi, '').replace(/\s+/g, ' ').trim();

      const docUnitPrice = parseMoneyValue(m[5]);
      const totalItemPrice = parseMoneyValue(m[6]);
      // Handle cases where pdf-parse glues QTDE directly onto EAN/DUN barcode (no newline/space)
      const quantity = m[4]
        ? parseInt(m[4], 10) || 1
        : docUnitPrice > 0
          ? Math.max(1, Math.round(totalItemPrice / docUnitPrice))
          : 1;
      const hasUnidBarcode = /C[óo]d\.\s*Barras\s*Unid:\s*[1-9]\d*/i.test(block);
      const detectedPack = /\b(?:espac|lixa)\b/i.test(desc)
        ? 1
        : extractPackQuantityFromDesc(desc, unit, quantity);
      const packQuantity =
        hasUnidBarcode && detectedPack > 1 && quantity >= detectedPack && quantity % detectedPack === 0
          ? 1
          : detectedPack;

      const totalUnits = quantity * packQuantity;
      const unitPrice = Number((totalItemPrice / totalUnits).toFixed(2));
      const calculationNote =
        packQuantity > 1
          ? `R$ ${totalItemPrice.toFixed(2)} ÷ (${quantity} × ${packQuantity} un) = R$ ${unitPrice.toFixed(2)}/un`
          : `R$ ${totalItemPrice.toFixed(2)} ÷ ${quantity} ${unit.toLowerCase()} = R$ ${unitPrice.toFixed(2)}/un`;

      const bartofilCode = block.match(/^C[óo]d\.\s*Produto:\s*(\d+)/i)?.[1];

      items.push({
        productName: desc,
        brand: extractProductBrand(desc),
        quantity,
        packQuantity,
        unit,
        totalItemPrice,
        unitPrice,
        calculationNote,
        matchedExistingId: findBestProductMatch(desc, existingProducts),
        imageAnchor: bartofilCode,
      });
    }

    if (items.length > 0) {
      const sumTotal = items.reduce((s, it) => s + it.totalItemPrice, 0);
      const isVerifiedBartofil =
        blocks.length === items.length &&
        (documentTotal === undefined || Math.abs(sumTotal - documentTotal) < 1);

      return {
        items,
        supplierName: detectedSupplierName,
        otherExpenses,
        documentTotal,
        isVerifiedStructured: isVerifiedBartofil,
      };
    }
  }

  // Pattern 0E: Evoluir Atacadistas ("ORÇAMENTO Nº: ... COD. PRODUTO I/S UN QTD. DESC. LIQUIDO UNIT. TOTAL")
  if (/OR[ÇC]AMENTO\s+N[º°]:/i.test(text) && /COD\.\s*PRODUTO\s+I\/S\s+UN\s+QTD\./i.test(text)) {
    detectedSupplierName = 'EVOLUIR ATACADISTAS';
    const valorTotalMatch = text.match(/Valor\s+Total:\s*([\d.,]+)/i);
    if (valorTotalMatch) {
      documentTotal = parseMoneyValue(valorTotalMatch[1]);
    }

    const afterHeader = text.split(/COD\.\s*PRODUTO\s+I\/S\s+UN\s+QTD\.\s+DESC\.\s+LIQUIDO\s+UNIT\.\s+TOTAL/i)[1] || '';
    const bodyEvoluir = afterHeader
      .split(/Qtd\.\s*Total:/i)[0]
      .replace(/--\s*\d+\s+of\s+\d+\s*--/gi, '')
      .replace(/ORCAMENTO\s+SUJEITO\s+A\s+CONFIRMACAO[\s\S]*?RECLAMA[ÇC][ÕO]ES\s+POSTERIORES\.?/gi, '')
      .trim();

    const blocks = bodyEvoluir
      .split(/\n(?=\d{5,7}-\d\s+)/)
      .map((b) => b.trim())
      .filter((b) => /^\d{5,7}-\d\s+/.test(b));

    for (const block of blocks) {
      const m = block.match(
        /^\d{5,7}-\d\s+([\s\S]+?)\s*\nMARCA:\s*(.+?)\s+(?:[IS]\s+)?(UN|PC|CX|PT|PCT|FD|KG|MT|M|BR|RL|SC|LA|LT|DZ)\s+(\d+(?:[.,]\d+)?)\s+[\d.,]+\s*%\s+([\d.,]+)\s+([\d.,]+)\s+([\d.,]+)\s*$/i
      );
      if (!m) continue;

      let desc = m[1].replace(/\s+/g, ' ').trim();
      const brand = m[2].replace(/\s+/g, ' ').trim();
      if (brand && !desc.toUpperCase().includes(brand.toUpperCase())) {
        desc = `${desc} ${brand}`;
      }

      const unit = m[3].toUpperCase();
      const quantity = parseMoneyValue(m[4]) || 1;
      const docUnitPrice = parseMoneyValue(m[6]);
      const totalItemPrice = parseMoneyValue(m[7]);

      // Evoluir explicitly lists individual piece UNIT. column alongside box/dozen TOTAL (e.g. C20, DZ=12, C48, C60, C30, C24, C6)
      let packQuantity = 1;
      if (docUnitPrice > 0 && Math.abs(totalItemPrice / quantity - docUnitPrice) > 0.05) {
        const derived = Math.round(totalItemPrice / (quantity * docUnitPrice));
        if (derived > 1 && derived <= 50000) {
          packQuantity = derived;
        }
      }

      const totalUnits = quantity * packQuantity;
      const unitPrice = Number((totalItemPrice / totalUnits).toFixed(2));
      const calculationNote =
        packQuantity > 1
          ? `R$ ${totalItemPrice.toFixed(2)} ÷ (${quantity} ${unit.toLowerCase()} × ${packQuantity}) = R$ ${unitPrice.toFixed(2)}/un`
          : `R$ ${totalItemPrice.toFixed(2)} ÷ ${quantity} ${unit.toLowerCase()} = R$ ${unitPrice.toFixed(2)}/un`;

      const evoluirCode = block.match(/^(\d{5,7}-\d)\s+/)?.[1];

      items.push({
        productName: desc,
        brand: extractProductBrand(desc, brand),
        quantity,
        packQuantity,
        unit,
        totalItemPrice,
        unitPrice,
        calculationNote,
        matchedExistingId: findBestProductMatch(desc, existingProducts),
        imageAnchor: evoluirCode,
      });
    }

    if (items.length > 0) {
      const sumTotal = items.reduce((s, it) => s + it.totalItemPrice, 0);
      const isVerifiedEvoluir =
        blocks.length === items.length &&
        (documentTotal === undefined || Math.abs(sumTotal - documentTotal) < 1);

      return {
        items,
        supplierName: detectedSupplierName,
        otherExpenses,
        documentTotal,
        isVerifiedStructured: isVerifiedEvoluir,
      };
    }
  }

  // Pattern 0F: ION Sistemas ($) Multi-line layout (Nova Casa Distribuidora variant using "$" and separated PREÇO/EMBALAGEM lines)
  const looksLikeIonUsdRow =
    /^\d+\s+\d{3,7}\s+.+\s+(?:UN|PC|CX|PT|PCT|FD|KG|MT|M|BR|RL|SC|LA|LT|BD|GL|JG|DZ|CR)\s+(?:(?:\d+(?:[.,]\d+)?\s+\$\s*[\d.,]+\s+(?:\d{8,14}|0))|(?:(?:\d{8,14}|0)\s+\d+(?:[.,]\d+)?\s+\$\s*[\d.,]+))/im.test(
      text
    );
  if ((/Processado por ION Sistemas/i.test(text) || looksLikeIonUsdRow) && /\$\s*\d/.test(text) && !/R\$\s*\d/.test(text)) {
    const filialExplicit = text.match(/^Filial:[ \t]*([^\n\t]+?)[ \t]*(?:ENDERE[ÇC]O|$)/im);
    const rawFilial = filialExplicit ? filialExplicit[1].trim() : '';
    detectedSupplierName =
      rawFilial && !/^(?:ENDERE[ÇC]O|VENDEDOR)/i.test(rawFilial)
        ? rawFilial
        : 'NOVA CASA DISTRIBUIDORA';

    const footerTotalMatch = text.match(/^Total\s+[\d.,]+\s+\$\s*([\d.,]+)/im);
    if (footerTotalMatch) {
      documentTotal = parseMoneyValue(footerTotalMatch[1]);
    }

    let expectedRows = 0;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const streamMatch = line.match(
        /^(\d+)\s+(\d{3,7})\s+(.+?)\s+(UN|PC|CX|PT|PCT|FD|KG|MT|M|BR|RL|SC|LA|LT|BD|GL|JG|DZ|CR)\s+(\d+(?:[.,]\d+)?)\s+\$\s*([\d.,]+)\s+(\d{8,14}|0)(?:\s+\$\s*([\d.,]+))?$/i
      );
      const visualMatch = !streamMatch
        ? line.match(
            /^(\d+)\s+(\d{3,7})\s+(.+?)\s+(UN|PC|CX|PT|PCT|FD|KG|MT|M|BR|RL|SC|LA|LT|BD|GL|JG|DZ|CR)\s+(\d{8,14}|0)\s+(\d+(?:[.,]\d+)?)\s+\$\s*([\d.,]+)(?:\s+\$\s*([\d.,]+))?$/i
          )
        : null;

      if (streamMatch || visualMatch) {
        expectedRows++;
        const m = (streamMatch || visualMatch)!;
        const desc = m[3].replace(/\s+/g, ' ').trim();
        const unit = m[4].toUpperCase();
        const quantity = streamMatch ? parseMoneyValue(m[5]) || 1 : parseMoneyValue(m[6]) || 1;
        const docPriceUnit = streamMatch ? parseMoneyValue(m[6]) : parseMoneyValue(m[7]);
        const inlineTotalRaw = m[8];
        const imageAnchor = m[2];

        const nextLine = lines[i + 1] || '';
        const totMatch = nextLine.match(/^\$\s*([\d.,]+)$/);
        const totalItemPrice = inlineTotalRaw
          ? parseMoneyValue(inlineTotalRaw)
          : totMatch
            ? parseMoneyValue(totMatch[1])
            : Number((docPriceUnit * quantity).toFixed(2));

        const packQuantity = /\b(?:espac|lixa)\b/i.test(desc)
          ? 1
          : extractPackQuantityFromDesc(desc, unit, quantity);
        const totalUnits = quantity * packQuantity;
        const unitPrice = Number((totalItemPrice / totalUnits).toFixed(2));
        const calculationNote =
          packQuantity > 1
            ? `R$ ${totalItemPrice.toFixed(2)} ÷ (${quantity} ${unit.toLowerCase()} × ${packQuantity}) = R$ ${unitPrice.toFixed(2)}/un`
            : `R$ ${totalItemPrice.toFixed(2)} ÷ ${quantity} ${unit.toLowerCase()} = R$ ${unitPrice.toFixed(2)}/un`;

        items.push({
          productName: desc,
          brand: extractProductBrand(desc),
          quantity,
          packQuantity,
          unit,
          totalItemPrice,
          unitPrice,
          calculationNote,
          matchedExistingId: findBestProductMatch(desc, existingProducts),
          imageAnchor,
        });
      }
    }

    if (items.length > 0) {
      const sumTotal = items.reduce((s, it) => s + it.totalItemPrice, 0);
      const isVerifiedIonUsd =
        items.length === expectedRows &&
        (documentTotal === undefined || Math.abs(sumTotal - documentTotal) < 2);

      return {
        items,
        supplierName: detectedSupplierName,
        otherExpenses,
        documentTotal,
        isVerifiedStructured: isVerifiedIonUsd,
      };
    }
  }

  for (const line of lines) {
    // Capture supplier from ION Sistemas header (e.g. "1 - MERCANTE DIST.DE MAT.ELE E DE CONST.LTDA")
    const filialMatch = line.match(/^\d+\s*-\s*([A-Z0-9\s.,/-]+(?:LTDA|EIRELI|ME|EPP|S\.A\.|SA|DIST|COMERCIAL)[A-Z0-9\s.,/-]*)$/i);
    if (filialMatch && !detectedSupplierName && !/CAMPOS MATERIAL/i.test(line)) {
      detectedSupplierName = filialMatch[1].trim();
    }

    // Capture footer expenses & document total (e.g. "Total 186 \t**Outras Despesas R$ 6,90\tR$1,077.10")
    const expensesMatch = line.match(/(?:\*\*?\s*)?Outras Despesas\s*R\$\s*([\d.,]+)/i);
    if (expensesMatch) {
      otherExpenses = parseMoneyValue(expensesMatch[1]);
    }
    if (/^(total\b|valor total)/i.test(line)) {
      const footerPrices = [...line.matchAll(/R\$\s*([\d.,]+)/gi)].map((m) => parseMoneyValue(m[1]));
      if (footerPrices.length > 0) {
        documentTotal = Math.max(...footerPrices);
      }
    }

    // Skip non-product header/footer lines
    if (
      /^(total\b|subtotal|valor total|outras despesas|\*\*outras|frete|impostos|vencimento|plano de pagamento|cobran[cç]a|endere[cç]o|vendedor|filial|chave de autentica|processado por|n[uú]mero do pedido|pedido feito|pedido de venda|assinatura|\(assinatura|#\s*cod|-- \d+ of \d+ --|cep:|fone:|rua |obs\s+transporte|obs\s+nota|obs\s+comercial|tipo de frete|peso bruto|peso l[íi]quido|cubagem|qtde itens)/i.test(
        line
      )
    ) {
      continue;
    }

    // Pattern 1: ION Sistemas PDFParse layout:
    // "2 ADESI COLA TUBO 175G C PINCEL AMANCO UN-12UN 7891960823401 R$111.81\t4628 12 R$9.32\tR$9.32"
    const ionMatch = line.match(
      /^\d+\s+(.+?)\s+((?:UN|PC|CX|PT|PCT|FD|KG|MT|M|BR|RL|SC|LA|LT|BD|GL|JG|DZ)(?:-\d+[A-Z]*)?)\s+(\d{8,14}|0)\s+R\$\s*([\d.,]+)\s+\d+\s+(\d+)\s+R\$\s*([\d.,]+)\s+R\$\s*([\d.,]+)/i
    );

    if (ionMatch) {
      const desc = ionMatch[1].trim();
      const embalagemStr = ionMatch[2].trim();
      const unit = extractUnitFromCode(embalagemStr);
      const totalItemPrice = parseMoneyValue(ionMatch[4]);
      const quantity = parseInt(ionMatch[5]) || 1;
      const docPriceEmb = parseMoneyValue(ionMatch[6]);
      const docPriceUnit = parseMoneyValue(ionMatch[7]);

      // Check whether QTDE is already in individual units (PREÇO ÷ QTDE ≈ docPriceUnit)
      // or in multi-unit boxes (PREÇO ÷ (QTDE * embCount) ≈ docPriceUnit)
      let packQuantity = 1;
      const embCountMatch = embalagemStr.match(/-(\d+)/);
      const embCount = embCountMatch ? parseInt(embCountMatch[1]) : 1;

      const directDiv = totalItemPrice / quantity;
      const packDiv = embCount > 1 ? totalItemPrice / (quantity * embCount) : directDiv;

      if (embCount > 1 && Math.abs(packDiv - docPriceUnit) < Math.abs(directDiv - docPriceUnit) - 0.01) {
        packQuantity = embCount;
      } else if (docPriceEmb > docPriceUnit * 1.5 && embCount > 1) {
        packQuantity = embCount;
      } else if (
        quantity === 1 &&
        embCount > 1 &&
        Math.abs(docPriceEmb - totalItemPrice) < 0.05 &&
        ((unit === 'PT' && !/\b(?:espac|lixa|terminal)\b/i.test(desc)) ||
          (unit === 'PC' && /\b(?:abrac|bico)\b/i.test(desc)))
      ) {
        // Items billed as 1 pot/pack where competitors quote by piece (e.g. PINO MACHO PT-120UN, ABRAC PC-100UN, BICO PC-12UN)
        packQuantity = embCount;
      }

      const totalUnits = quantity * packQuantity;
      const unitPrice = Number((totalItemPrice / totalUnits).toFixed(2));
      const calculationNote =
        packQuantity > 1
          ? `R$ ${totalItemPrice.toFixed(2)} ÷ (${quantity} × ${packQuantity} un) = R$ ${unitPrice.toFixed(2)}/un`
          : `R$ ${totalItemPrice.toFixed(2)} ÷ ${quantity} ${unit.toLowerCase()} = R$ ${unitPrice.toFixed(2)}/un`;

      const ionBarcode = ionMatch[3] && ionMatch[3] !== '0' ? ionMatch[3] : undefined;

      items.push({
        productName: desc,
        brand: extractProductBrand(desc),
        quantity,
        packQuantity,
        unit,
        totalItemPrice,
        unitPrice,
        calculationNote,
        matchedExistingId: findBestProductMatch(desc, existingProducts),
        imageAnchor: ionBarcode,
      });
      continue;
    }

    // Pattern 2: General quotation text line (WhatsApp, custom PDFs, pasted lists)
    const priceMatches = [
      ...line.matchAll(/(?:R\$\s*)(\d{1,3}(?:[.,]\d{3})*[.,]\d{2}|\d+[.,]\d{2})|(\b\d{1,3}(?:[.,]\d{3})*[.,]\d{2}\b|\b\d+[.,]\d{2}\b)/g),
    ];

    if (priceMatches.length > 0) {
      const parsedPrices = priceMatches
        .map((m) => parseMoneyValue(m[1] || m[2]))
        .filter((n) => n > 0);

      if (parsedPrices.length === 0) continue;

      // In lines that show both unit price and total price, the total price is the largest figure
      const totalItemPrice = Math.max(...parsedPrices);

      // Look for explicit quantity (e.g. "Qtd: 2 CX", "20 UN", "50 barras")
      let quantity = 1;
      let billingUnit = '';
      const qtdExplicit =
        line.match(/(?:qtd|qtde|quant|quantidade)\s*[:\-]?\s*(\d+)\s*(cx|caixa|pct|pacote|fd|fardo|emb|lote|un|pc|kg|sc|br|mt|rl)?/i) ||
        line.match(/\b(\d+)\s+(cx|caixas|pct|pacotes|fd|fardos|lotes|barras|unidades|rolos|sacos|un|pc|kg|sc|br)\b/i);

      if (qtdExplicit && qtdExplicit[1]) {
        const parsedQtd = parseInt(qtdExplicit[1]);
        if (parsedQtd > 0 && parsedQtd < 50000) {
          quantity = parsedQtd;
          billingUnit = (qtdExplicit[2] || '').toUpperCase().replace(/S$/, '');
        }
      }

      // Clean description
      let desc = line
        .replace(/(?:R\$\s*)?\d{1,3}(?:[.,]\d{3})*[.,]\d{2}/g, '')
        .replace(/^\s*(?:item\s*)?\d+\s*[:.\-]\s*/i, '')
        .replace(/(?:qtd|qtde|quant|quantidade)\s*[:\-]?\s*\d+\s*[a-zA-Z]*/i, '')
        .replace(/(?:valor\s*)?total\s*[:\-]?/i, '')
        .replace(/[-|•]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

      if (desc.length >= 3 && totalItemPrice > 0) {
        const packQuantity = extractPackQuantityFromDesc(desc, billingUnit);
        const totalUnits = quantity * packQuantity;
        const unitPrice = Number((totalItemPrice / totalUnits).toFixed(2));
        const unit = extractUnitFromCode(billingUnit || 'UN');

        const calculationNote =
          packQuantity > 1
            ? `R$ ${totalItemPrice.toFixed(2)} ÷ (${quantity} × ${packQuantity} un) = R$ ${unitPrice.toFixed(2)}/un`
            : `R$ ${totalItemPrice.toFixed(2)} ÷ ${quantity} = R$ ${unitPrice.toFixed(2)}/un`;

        items.push({
          productName: desc,
          brand: extractProductBrand(desc),
          quantity,
          packQuantity,
          unit,
          totalItemPrice,
          unitPrice,
          calculationNote,
          matchedExistingId: findBestProductMatch(desc, existingProducts),
        });
      }
    }
  }

  const sumTotal = items.reduce((s, it) => s + it.totalItemPrice, 0);
  const isVerifiedIon =
    items.length > 0 &&
    documentTotal !== undefined &&
    Math.abs(sumTotal + (otherExpenses || 0) - documentTotal) < 1;

  return {
    items,
    supplierName: detectedSupplierName,
    otherExpenses,
    documentTotal,
    isVerifiedStructured: isVerifiedIon,
  };
}

// Endpoint: Extract items and prices from quotation documents / images / text
app.post('/api/extract-quotation', async (req, res) => {
  try {
    let { imageBase64, mimeType, rawText, supplierName, existingProducts, uploadId } = req.body;

    let uploadedBuffer: Buffer | null = null;
    if (uploadId) {
      const entry = uploadChunkStore.get(String(uploadId));
      uploadChunkStore.delete(String(uploadId));
      if (!entry || entry.chunks.length === 0) {
        return res.status(400).json({
          error: 'Sessão de upload expirada ou vazia. Por favor, envie o arquivo novamente.',
        });
      }
      uploadedBuffer = Buffer.concat(entry.chunks.filter(Boolean));
    }

    if (!imageBase64 && !rawText && !uploadedBuffer) {
      return res.status(400).json({
        error: 'Nenhum arquivo ou texto foi fornecido para análise.',
      });
    }

    // Step 1: If input is a PDF, extract its textual content directly using PDFParse
    const isPdfFile =
      mimeType === 'application/pdf' ||
      (imageBase64 && imageBase64.includes('JVBERi0'));

    let extractedPdfBuffer: Buffer | null = null;

    if (isPdfFile && (uploadedBuffer || imageBase64)) {
      try {
        const pdfBuffer =
          uploadedBuffer ||
          Buffer.from(imageBase64.replace(/^data:[^;]+;base64,/, '').replace(/\s/g, ''), 'base64');
        extractedPdfBuffer = pdfBuffer;
        const PDFParseClass = await getPdfParserClass();
        const parser = new PDFParseClass({ data: pdfBuffer });
        const extracted = await parser.getText();
        const pdfText = extracted?.text?.trim() || '';

        if (pdfText.length > 10) {
          console.log(`PDF parseado com sucesso: ${pdfText.length} caracteres de texto extraídos.`);
          rawText = (rawText ? rawText + '\n\n' : '') + pdfText;
          imageBase64 = null;
          uploadedBuffer = null;
          mimeType = null;
        }
      } catch (pdfErr) {
        console.warn('Extração direta de texto do PDF não teve sucesso:', pdfErr);
      }
    }

    // Step 1.5: Fast-path for verified structured ERP documents (SAP Espelho da Ordem / ION Sistemas)
    // When 100% of items and document total reconcile mathematically, return immediately without risking API timeouts.
    let result: any = null;

    if (rawText) {
      const structuredPreview = parseQuotationTextLocally(rawText, existingProducts);
      if (structuredPreview.isVerifiedStructured && structuredPreview.items.length > 0) {
        console.log(
          `Documento ERP estruturado validado (${structuredPreview.items.length} itens, soma reconciliada). Retorno imediato!`
        );
        result = {
          supplierName: structuredPreview.supplierName || supplierName || 'Fornecedor',
          otherExpenses: structuredPreview.otherExpenses,
          documentTotal: structuredPreview.documentTotal,
          items: structuredPreview.items,
        };
      }
    }

    // Step 2: Try Gemini API for images, WhatsApp text, or general/unrecognized PDF layouts
    if (!result && ai) {
      const promptText = `
Você é um especialista em auditoria de pedidos de venda, notas fiscais e cotações de distribuidores no Brasil.
Analise com extrema precisão este documento enviado pelo fornecedor (${supplierName || 'Fornecedor'}).

Lista de produtos já cadastrados no mapa de cotação para correspondência (matchedExistingId):
${JSON.stringify(existingProducts || [], null, 2)}

REGRAS CRÍTICAS DE EXTRAÇÃO (LEIA COM ATENÇÃO):
1. NÃO inclua linhas de cabeçalho, rodapé, "Total", "Total Líquido", "Total ST", "Total NF", "Outras Despesas", "Frete", "Chave de autenticação" ou "Impostos" como produtos. Extraia TODOS os produtos/itens reais de TODAS as páginas da tabela (não omita itens quando houver dezenas de linhas; se houver quebra de página no meio da descrição, junte a continuação na descrição do item).
2. Para cada produto real:
   - "productName": Descrição limpa do produto (SEM incluir o número sequencial "#", número do item SAP como "000010", código do produto como "10022017", código de barras de 13 dígitos ou código da embalagem como "UN-12UN" se estiver em coluna separada).
   - "unit": Unidade de venda (ex: "UN", "PC", "CX", "PCT", "KG", "BR", "RL"). Em códigos como "UN-12UN" ou "PC-12UN", a unidade é "UN" ou "PC".
   - "quantity": Quantidade faturada/cotada daquele item no documento (ex: coluna QTDE./Quantid., podendo ser decimal como 0,5 ou 0,25).
     ATENÇÃO PARA ESPELHO DA ORDEM / SAP (ex: FORTLEV com "0 / 50 UN"): quando a quantidade vier no formato "A / B UN" (atendido / solicitado), a quantidade cotada do item é B (o número após a barra, ex: 50), NUNCA 0! Não confunda o número da linha (# / 000010) ou código do produto com a quantidade.
   - "totalItemPrice": Valor TOTAL FINAL da linha daquele item (coluna PREÇO TOTAL / VALOR TOTAL, já incluindo IPI/ST quando houver, e NUNCA a coluna de imposto ST isolada nem o Preço Unitário sem impostos).
   - "packQuantity": Quantidade de peças dentro de cada embalagem:
     - Se a unidade de cobrança for "ct" (cento), "packQuantity" DEVE SER 100 (ex: 0,5 ct = 50 peças).
     - Se "quantity" estiver contando caixas/pacotes fechados (ex: "2 CX" de "PARAFUSO CX C/ 100 UN", "1 PT" de "PORCA ... C/200", ou "12 PC" de "pacote com 50 peças"), use o múltiplo do pacote (ex: 100, 200 ou 50).
     - Em pedidos tipo ION SISTEMAS / MERCANTE ("UN-12UN", "PC-12UN"), FORTLEV / SAP ("Emb. 0", "U.M. UN"), ou itens vendidos individualmente com indicação apenas de caixa master ("embalagem com 12 peças", "display com 6 peças" quando quantity é múltiplo), "packQuantity" DEVE SER 1.
   - "unitPrice": Preço unitário por unidade individual já com impostos incluídos, calculado obrigatoriamente por:
     unitPrice = totalItemPrice / (quantity * packQuantity).
   - "calculationNote": Memória clara do cálculo (ex: "R$ 23,86 ÷ 50 un = R$ 0,48/un" ou "R$ 200,00 ÷ (2 cx × 100 un) = R$ 1,00/un").
   - "matchedExistingId": ID do item correspondente em existingProducts, ou "" se for produto novo. IGNORE diferenças de marca/fabricante (FORTLEV, AMANCO, KRONA, TIGRE, MULTILIT, PLASTILIT, VONDER, BRASCOLA, etc.), códigos de catálogo e zeros à esquerda (DN 50 = 050MM = 50MM). Produtos equivalentes de marcas diferentes SÃO O MESMO PRODUTO (ex: "TE ESG SN DN 50 FORTLEV" corresponde a "TE ESGOTO 050MM AMANCO" e "Tê para esgoto, DN 50, KRONA"; "ADAPTADOR SOLD CURTO 20X1/2 FORTLEV" corresponde a "Adaptador soldável curto, 20 x 1/2, KRONA"). Só NÃO associe se mudar bitola/medida/ângulo/tipo (20mm ≠ 25mm, Joelho 90° ≠ 45°, Normal ≠ Redução, Esgoto ≠ Soldável).
3. Identifique "supplierName" (o nome da distribuidora/fornecedor emissor no documento, ex: "FORTLEV - BA" ou "MERCANTE...", e não o nome do cliente comprador!).
4. Preencha "documentTotal" com o Total Geral / Total NF se informado, e "otherExpenses" apenas se houver frete/despesas extras fora do total dos itens (se ST já estiver somado em cada Preço Total, não coloque Total ST em otherExpenses).
${rawText ? `\nTexto extraído do documento:\n${rawText}` : ''}
`;

      const contents: any[] = [];

      if (imageBase64) {
        const cleanB64 = imageBase64.replace(/^data:[^;]+;base64,/, '').replace(/\s/g, '');
        contents.push({
          inlineData: {
            mimeType: mimeType || 'image/jpeg',
            data: cleanB64,
          },
        });
      }

      contents.push({ text: promptText });

      const candidateModels = ['gemini-3.8-flash', 'gemini-3.1-flash-lite'];

      for (const model of candidateModels) {
        try {
          console.log(`Enviando para Gemini com modelo: ${model}...`);

          const timeoutPromise = new Promise((_, reject) =>
            setTimeout(() => reject(new Error(`Timeout no modelo ${model}`)), 25000)
          );

          const apiCall = ai.models.generateContent({
            model,
            contents: { parts: contents },
            config: {
              systemInstruction:
                'Você é um auditor de cotações e pedidos comerciais. Nunca divida duas vezes por embalagens quando a coluna QTDE. já está em unidades individuais (como em EMBALAGEM UN-12UN onde PREÇO/EMBALAGEM = PREÇO UN.).',
              responseMimeType: 'application/json',
              ...(model === 'gemini-3.8-flash'
                ? { thinkingConfig: { thinkingLevel: ThinkingLevel.LOW } }
                : {}),
              responseSchema: {
                type: Type.OBJECT,
                properties: {
                  supplierName: {
                    type: Type.STRING,
                    description: 'Nome do fornecedor/distribuidora identificado no documento',
                  },
                  otherExpenses: {
                    type: Type.NUMBER,
                    description: 'Valor de frete ou outras despesas extras do pedido, se houver',
                  },
                  documentTotal: {
                    type: Type.NUMBER,
                    description: 'Valor total geral do documento, se informado',
                  },
                  items: {
                    type: Type.ARRAY,
                    description: 'Lista de itens reais do orçamento/pedido',
                    items: {
                      type: Type.OBJECT,
                      properties: {
                        productName: { type: Type.STRING },
                        unit: { type: Type.STRING, description: 'Unidade (UN, PC, CX, etc.)' },
                        quantity: { type: Type.NUMBER, description: 'Quantidade cotada' },
                        packQuantity: {
                          type: Type.NUMBER,
                          description: '1 quando quantity já está em unidades individuais; >1 apenas quando quantity conta caixas/pacotes fechados',
                        },
                        totalItemPrice: { type: Type.NUMBER, description: 'Valor total da linha do item' },
                        unitPrice: {
                          type: Type.NUMBER,
                          description: 'Preço unitário = totalItemPrice / (quantity * packQuantity)',
                        },
                        calculationNote: { type: Type.STRING },
                        matchedExistingId: { type: Type.STRING },
                        brand: {
                          type: Type.STRING,
                          description: 'Marca ou fabricante do produto (ex: TIGRE, AMANCO, FORTLEV, VONDER), se informada',
                        },
                      },
                      required: ['productName', 'quantity', 'packQuantity', 'totalItemPrice', 'unitPrice'],
                    },
                  },
                },
                required: ['items'],
              },
            },
          });

          const response: any = await Promise.race([apiCall, timeoutPromise]);
          const jsonStr = (response.text ?? '{}').trim();
          const parsed = JSON.parse(jsonStr);

          if (parsed && Array.isArray(parsed.items) && parsed.items.length > 0) {
            // Re-enforce clean math and brand-agnostic fallback matching on every item returned
            const existingList = Array.isArray(existingProducts) ? existingProducts : [];
            const validIds = new Set(existingList.map((p: any) => p.id));
            parsed.items = parsed.items.map((item: any) => {
              const qty = item.quantity && item.quantity > 0 ? item.quantity : 1;
              const packQty = item.packQuantity && item.packQuantity > 0 ? item.packQuantity : 1;
              const total = item.totalItemPrice || 0;
              const computedUnit = Number((total / (qty * packQty)).toFixed(2));
              const validGeminiMatch =
                item.matchedExistingId && validIds.has(item.matchedExistingId)
                  ? item.matchedExistingId
                  : '';
              const matchedExistingId =
                validGeminiMatch || findBestProductMatch(item.productName || '', existingList);
              return {
                ...item,
                brand: extractProductBrand(item.productName || '', item.brand),
                unit: item.unit || 'UN',
                quantity: qty,
                packQuantity: packQty,
                totalItemPrice: total,
                unitPrice: computedUnit,
                matchedExistingId,
              };
            });
            console.log(`Gemini ${model} extraiu com sucesso ${parsed.items.length} itens!`);
            result = parsed;
            break;
          }
        } catch (modelErr: any) {
          console.warn(`Tentativa Gemini ${model} falhou:`, modelErr?.message || modelErr);
        }
      }
    }

    // Step 3: Local deterministic fallback if Gemini is unavailable
    if (!result && rawText) {
      console.log('Utilizando parser local para extrair cotação...');
      const localResult = parseQuotationTextLocally(rawText, existingProducts);

      if (localResult.items.length > 0) {
        result = {
          supplierName: localResult.supplierName || supplierName || 'Fornecedor',
          otherExpenses: localResult.otherExpenses,
          documentTotal: localResult.documentTotal,
          items: localResult.items,
        };
        console.log(`Parser local extraiu com sucesso ${localResult.items.length} itens!`);
      }
    }

    if (!result || !result.items || result.items.length === 0) {
      return res.status(500).json({
        error:
          'Não foi possível identificar itens com preços no arquivo. Verifique se o documento contém descrição, quantidade e valores, ou use a aba Colar Texto.',
      });
    }

    if (extractedPdfBuffer && Array.isArray(result.items) && result.items.length > 0) {
      try {
        result.items = await attachPdfProductImages(extractedPdfBuffer, result.items);
      } catch (imgErr) {
        console.warn('Aviso ao extrair imagens dos itens do PDF:', imgErr);
      }
    }

    result.items = [...result.items]
      .map(({ imageAnchor, ...rest }: any) => rest)
      .sort((a: any, b: any) =>
        String(a.productName || '')
          .trim()
          .localeCompare(String(b.productName || '').trim(), 'pt-BR', {
            sensitivity: 'base',
            numeric: true,
          })
      );

    return res.json({
      success: true,
      data: result,
    });
  } catch (error: any) {
    console.error('Erro geral ao processar cotação:', error);
    return res.status(500).json({
      error: error.message || 'Falha ao processar orçamento.',
    });
  }
});

let activeHttpServer: import('http').Server | null = null;

// Network Info Endpoint for Mobile & Local Access
app.get('/api/network-info', (req, res) => {
  // Identifica se estamos rodando na nuvem (ex: Render, Railway, etc.)
  const isCloud = Boolean(
    process.env.RENDER ||
    process.env.RENDER_EXTERNAL_URL ||
    process.env.RAILWAY_STATIC_URL ||
    process.env.FLY_APP_NAME ||
    process.env.VERCEL ||
    process.env.IS_CLOUD === 'true'
  );

  // Se estiver na nuvem (como no Render), usa a URL pública da aplicação
  const cloudUrl = process.env.RENDER_EXTERNAL_URL || (req.get('host') ? `${req.protocol}://${req.get('host')}` : null);

  const interfaces = os.networkInterfaces();
  const addresses: string[] = [];
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name] || []) {
      if (iface.family === 'IPv4' && !iface.internal) {
        addresses.push(iface.address);
      }
    }
  }
  const address = activeHttpServer?.address();
  const port = typeof address === 'object' && address ? address.port : PORT;
  const localUrl = `http://localhost:${port}`;
  const networkUrls = addresses.map((ip) => `http://${ip}:${port}`);

  // Se estiver na nuvem ou acessado por domínio público/externo, prioriza a URL pública
  const hostHeader = req.get('host');
  const isPublicAccess = hostHeader && !hostHeader.includes('localhost') && !hostHeader.includes('127.0.0.1');
  const primaryUrl = (isCloud && cloudUrl) || (isPublicAccess ? `${req.protocol}://${hostHeader}` : (networkUrls[0] || localUrl));

  res.json({
    port,
    localUrl,
    networkUrls,
    isCloud: isCloud || Boolean(isPublicAccess),
    primaryNetworkUrl: primaryUrl,
  });
});

// Auto-shutdown configuration
const isCloudEnv = Boolean(
  process.env.RENDER ||
  process.env.RAILWAY_STATIC_URL ||
  process.env.FLY_APP_NAME ||
  process.env.VERCEL ||
  process.env.IS_CLOUD === 'true'
);
const enableAutoShutdown = !isCloudEnv && process.env.COTAFACIL_NO_AUTOSHUTDOWN !== '1';

let lastClientPing = Date.now();
let pendingShutdownTimer: NodeJS.Timeout | null = null;

function cancelPendingShutdown() {
  if (pendingShutdownTimer) {
    clearTimeout(pendingShutdownTimer);
    pendingShutdownTimer = null;
  }
}

function performGracefulShutdown() {
  console.log('Encerrando servidor e finalizando processos...');
  const metaFile = path.resolve(process.cwd(), '.cotafacil-cache', 'server.json');
  try {
    if (fs.existsSync(metaFile)) fs.unlinkSync(metaFile);
  } catch {}
  setTimeout(() => {
    try {
      activeHttpServer?.close();
    } catch {}
    process.exit(0);
  }, 100);
}

function scheduleShutdown(delayMs = 5000) {
  if (!enableAutoShutdown) return;
  cancelPendingShutdown();
  pendingShutdownTimer = setTimeout(() => {
    performGracefulShutdown();
  }, delayMs);
}

// Heartbeat ping from open tabs
app.post('/api/heartbeat', (_req, res) => {
  lastClientPing = Date.now();
  cancelPendingShutdown();
  res.json({ ok: true });
});

// Window closed notification (sent via navigator.sendBeacon)
app.post('/api/window-closed', (_req, res) => {
  // Give 5s grace period so page refreshes (F5) or switching tabs don't terminate server
  scheduleShutdown(5000);
  res.json({ ok: true });
});

// Explicit shutdown button in UI
app.post('/api/shutdown', (_req, res) => {
  res.json({ ok: true, message: 'Encerrando servidor...' });
  performGracefulShutdown();
});

// Inactivity monitor: if no tab pings for 14 seconds, schedule shutdown
if (enableAutoShutdown) {
  const startupGracePeriod = Date.now() + 45000; // 45s grace period for slow initial browser launch
  setInterval(() => {
    if (Date.now() < startupGracePeriod) return;
    if (Date.now() - lastClientPing > 14000) {
      scheduleShutdown(2000);
    }
  }, 5000);
}

// Setup Vite or static serving
export async function startServer(overridePort?: number): Promise<{ port: number }> {
  const defaultDistDir = fs.existsSync(path.join(__dirname, 'dist'))
    ? path.join(__dirname, 'dist')
    : path.resolve(__dirname, '..', 'dist');
  const distDir = process.env.COTAFACIL_DIST_DIR
    ? path.resolve(process.env.COTAFACIL_DIST_DIR)
    : defaultDistDir;

  if (process.env.NODE_ENV !== 'production') {
    const { createServer } = await import('vite');
    const vite = await createServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  const targetPort = overridePort !== undefined ? overridePort : PORT;
  return new Promise((resolve, reject) => {
    // Listen on 0.0.0.0 so both localhost and mobile devices on local network can connect
    const server = app.listen(targetPort, '0.0.0.0', () => {
      activeHttpServer = server;
      const address = server.address();
      const actualPort =
        typeof address === 'object' && address ? address.port : targetPort;
      console.log(`Servidor rodando em http://localhost:${actualPort} e na rede local http://0.0.0.0:${actualPort}`);
      resolve({ port: actualPort });
    });
    server.on('error', reject);
  });
}

if (process.env.COTAFACIL_NO_AUTOSTART !== '1') {
  startServer();
}
