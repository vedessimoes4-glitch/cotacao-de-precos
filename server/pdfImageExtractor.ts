import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import crypto from 'crypto';

const CACHE_BASE_DIR = process.env.COTAFACIL_CACHE_DIR
  ? path.resolve(process.env.COTAFACIL_CACHE_DIR)
  : path.resolve(process.cwd(), '.cotafacil-cache');

export const IMAGE_CACHE_DIR = path.join(CACHE_BASE_DIR, 'product-images');

function ensureImageCacheDir() {
  if (!fs.existsSync(IMAGE_CACHE_DIR)) {
    fs.mkdirSync(IMAGE_CACHE_DIR, { recursive: true });
  }
}

export function ensurePdfCanvasPolyfills() {
  if (typeof (globalThis as any).DOMMatrix === 'undefined') {
    (globalThis as any).DOMMatrix = class DOMMatrix {
      a = 1;
      b = 0;
      c = 0;
      d = 1;
      e = 0;
      f = 0;
      constructor(init?: number[] | string) {
        if (Array.isArray(init) && init.length >= 6) {
          [this.a, this.b, this.c, this.d, this.e, this.f] = init;
        }
      }
      multiply() {
        return new (globalThis as any).DOMMatrix();
      }
      translate(tx = 0, ty = 0) {
        return new (globalThis as any).DOMMatrix([
          this.a,
          this.b,
          this.c,
          this.d,
          this.e + tx,
          this.f + ty,
        ]);
      }
      scale(sx = 1, sy = sx) {
        return new (globalThis as any).DOMMatrix([
          this.a * sx,
          this.b,
          this.c,
          this.d * sy,
          this.e,
          this.f,
        ]);
      }
      inverse() {
        return new (globalThis as any).DOMMatrix();
      }
    };
  }
  if (typeof (globalThis as any).Path2D === 'undefined') {
    (globalThis as any).Path2D = class Path2D {};
  }
  if (typeof (globalThis as any).ImageData === 'undefined') {
    (globalThis as any).ImageData = class ImageData {
      width: number;
      height: number;
      constructor(width = 0, height = 0) {
        this.width = width;
        this.height = height;
      }
    };
  }
}

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) {
      c = (c >>> 1) ^ (c & 1 ? 0xedb88320 : 0);
    }
  }
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Buffer): Buffer {
  const typeBuf = Buffer.from(type, 'ascii');
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const crcInput = Buffer.concat([typeBuf, data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(crcInput), 0);
  return Buffer.concat([len, typeBuf, data, crc]);
}

function clampByte(n: number): number {
  return n < 0 ? 0 : n > 255 ? 255 : Math.round(n);
}

function encodeRawImageToPng(
  src: Uint8Array,
  w: number,
  h: number,
  kind: number,
  maxDim = 720
): Buffer | null {
  if (!src || w < 16 || h < 16) return null;
  let channels = 0;
  if (kind === 3 || src.length === w * h * 4) channels = 4;
  else if (kind === 2 || src.length === w * h * 3) channels = 3;
  else if (src.length === w * h) channels = 1;
  else return null;

  // 1. Detect tight non-white/non-transparent bounding box to strip catalog padding
  let minX = w;
  let minY = h;
  let maxX = -1;
  let maxY = -1;
  let nonWhiteCount = 0;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const si = (y * w + x) * channels;
      let r: number;
      let g: number;
      let b: number;
      let a = 255;
      if (channels === 1) {
        r = g = b = src[si];
      } else if (channels === 3) {
        r = src[si];
        g = src[si + 1];
        b = src[si + 2];
      } else {
        r = src[si];
        g = src[si + 1];
        b = src[si + 2];
        a = src[si + 3];
      }

      if (a > 16 && (r < 244 || g < 244 || b < 244)) {
        nonWhiteCount++;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }

  if (nonWhiteCount < Math.max(8, Math.floor(w * h * 0.003)) || maxX < minX || maxY < minY) {
    return null;
  }

  // Keep a small clean ~3% margin around trimmed subject
  const trimW = maxX - minX + 1;
  const trimH = maxY - minY + 1;
  const padX = Math.max(1, Math.round(trimW * 0.03));
  const padY = Math.max(1, Math.round(trimH * 0.03));
  const cropX0 = Math.max(0, minX - padX);
  const cropY0 = Math.max(0, minY - padY);
  const cropX1 = Math.min(w, maxX + 1 + padX);
  const cropY1 = Math.min(h, maxY + 1 + padY);
  const cw = Math.max(4, cropX1 - cropX0);
  const ch = Math.max(4, cropY1 - cropY0);

  // 2. Target dimensions: preserve high-res up to 720px, cleanly upscale small PDF thumbnails up to 440px
  const longest = Math.max(cw, ch);
  let scale = 1;
  if (longest > maxDim) {
    scale = maxDim / longest;
  } else if (longest < 440) {
    scale = Math.min(4, 440 / longest);
  }

  const dw = Math.max(1, Math.round(cw * scale));
  const dh = Math.max(1, Math.round(ch * scale));
  const outChannels = channels === 4 ? 4 : 3;

  // Build RGBA/RGB float work buffer first so we can apply clean sharpening on upscaled thumbnails
  const buf = new Float32Array(dw * dh * outChannels);
  const stepX = cw / dw;
  const stepY = ch / dh;

  const sampleSrc = (sx: number, sy: number): [number, number, number, number] => {
    const cx = Math.max(cropX0, Math.min(cropX1 - 1, sx));
    const cy = Math.max(cropY0, Math.min(cropY1 - 1, sy));
    const si = (cy * w + cx) * channels;
    if (channels === 1) {
      const v = src[si];
      return [v, v, v, 255];
    }
    if (channels === 3) {
      return [src[si], src[si + 1], src[si + 2], 255];
    }
    // Composite semi-transparent pixels cleanly against white canvas when needed
    const a = src[si + 3];
    if (a < 250) {
      return [src[si], src[si + 1], src[si + 2], a];
    }
    return [src[si], src[si + 1], src[si + 2], a];
  };

  // Catmull-Rom bicubic kernel for crisp upscaling
  const cubicWeight = (t: number): number => {
    const a = Math.abs(t);
    if (a <= 1) return 1.5 * a * a * a - 2.5 * a * a + 1;
    if (a < 2) return -0.5 * a * a * a + 2.5 * a * a - 4 * a + 2;
    return 0;
  };

  for (let y = 0; y < dh; y++) {
    for (let x = 0; x < dw; x++) {
      const di = (y * dw + x) * outChannels;

      if (stepX < 1 || stepY < 1) {
        // Bicubic (Catmull-Rom) interpolation for sharper product edges
        const fx = cropX0 + (x + 0.5) * stepX - 0.5;
        const fy = cropY0 + (y + 0.5) * stepY - 0.5;
        const ix = Math.floor(fx);
        const iy = Math.floor(fy);
        const tx = fx - ix;
        const ty = fy - iy;

        const wx = [
          cubicWeight(tx + 1),
          cubicWeight(tx),
          cubicWeight(tx - 1),
          cubicWeight(tx - 2),
        ];
        const wy = [
          cubicWeight(ty + 1),
          cubicWeight(ty),
          cubicWeight(ty - 1),
          cubicWeight(ty - 2),
        ];

        let c0 = 0;
        let c1 = 0;
        let c2 = 0;
        let c3 = 0;
        for (let m = 0; m < 4; m++) {
          const wym = wy[m];
          const sy = iy + m - 1;
          for (let n = 0; n < 4; n++) {
            const wmn = wym * wx[n];
            const px = sampleSrc(ix + n - 1, sy);
            c0 += px[0] * wmn;
            c1 += px[1] * wmn;
            c2 += px[2] * wmn;
            if (outChannels === 4) c3 += px[3] * wmn;
          }
        }
        buf[di] = Math.max(0, Math.min(255, c0));
        buf[di + 1] = Math.max(0, Math.min(255, c1));
        buf[di + 2] = Math.max(0, Math.min(255, c2));
        if (outChannels === 4) {
          buf[di + 3] = Math.max(0, Math.min(255, c3));
        }
      } else {
        // Area box downsampling for crisp large images
        const sy0 = cropY0 + Math.floor(y * stepY);
        const sy1 = Math.max(sy0 + 1, Math.min(cropY1, cropY0 + Math.ceil((y + 1) * stepY)));
        const sx0 = cropX0 + Math.floor(x * stepX);
        const sx1 = Math.max(sx0 + 1, Math.min(cropX1, cropX0 + Math.ceil((x + 1) * stepX)));
        const yInc = Math.max(1, Math.floor((sy1 - sy0) / 4));
        const xInc = Math.max(1, Math.floor((sx1 - sx0) / 4));

        let r = 0;
        let g = 0;
        let b = 0;
        let a = 0;
        let count = 0;
        for (let sy = sy0; sy < sy1; sy += yInc) {
          for (let sx = sx0; sx < sx1; sx += xInc) {
            const px = sampleSrc(sx, sy);
            r += px[0];
            g += px[1];
            b += px[2];
            a += px[3];
            count++;
          }
        }
        buf[di] = r / count;
        buf[di + 1] = g / count;
        buf[di + 2] = b / count;
        if (outChannels === 4) {
          buf[di + 3] = a / count;
        }
      }
    }
  }

  // Unsharp pass when upscaled to recover crisp packaging text & edges
  const applySharpen = scale > 1.2;
  const sharpenAmount = scale > 2 ? 0.65 : 0.42;

  const rowStride = 1 + dw * outChannels;
  const raw = Buffer.alloc(dh * rowStride);

  for (let y = 0; y < dh; y++) {
    const rowOff = y * rowStride;
    raw[rowOff] = 0;
    for (let x = 0; x < dw; x++) {
      const si = (y * dw + x) * outChannels;
      const di = rowOff + 1 + x * outChannels;

      if (applySharpen && x > 0 && x < dw - 1 && y > 0 && y < dh - 1) {
        const up = ((y - 1) * dw + x) * outChannels;
        const dn = ((y + 1) * dw + x) * outChannels;
        const lf = (y * dw + (x - 1)) * outChannels;
        const rt = (y * dw + (x + 1)) * outChannels;

        for (let c = 0; c < 3; c++) {
          const avg = (buf[up + c] + buf[dn + c] + buf[lf + c] + buf[rt + c]) * 0.25;
          raw[di + c] = clampByte(buf[si + c] + (buf[si + c] - avg) * sharpenAmount);
        }
        if (outChannels === 4) {
          raw[di + 3] = clampByte(buf[si + 3]);
        }
      } else {
        raw[di] = clampByte(buf[si]);
        raw[di + 1] = clampByte(buf[si + 1]);
        raw[di + 2] = clampByte(buf[si + 2]);
        if (outChannels === 4) {
          raw[di + 3] = clampByte(buf[si + 3]);
        }
      }
    }
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(dw, 0);
  ihdr.writeUInt32BE(dh, 4);
  ihdr[8] = 8;
  ihdr[9] = outChannels === 4 ? 6 : 2;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const idat = zlib.deflateSync(raw, { level: 6 });
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', idat),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

function mulMatrix(m1: number[], m2: number[]): number[] {
  return [
    m1[0] * m2[0] + m1[2] * m2[1],
    m1[1] * m2[0] + m1[3] * m2[1],
    m1[0] * m2[2] + m1[2] * m2[3],
    m1[1] * m2[2] + m1[3] * m2[3],
    m1[0] * m2[4] + m1[2] * m2[5] + m1[4],
    m1[1] * m2[4] + m1[3] * m2[5] + m1[5],
  ];
}

function applyPoint(m: number[], x: number, y: number): [number, number] {
  return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
}

async function resolvePdfObj(page: any, id: string): Promise<any> {
  try {
    if (page.objs.has(id)) return page.objs.get(id);
  } catch {
    // Wait via callback below
  }
  return await new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), 600);
    try {
      page.objs.get(id, (obj: any) => {
        clearTimeout(timer);
        resolve(obj);
      });
    } catch {
      clearTimeout(timer);
      resolve(null);
    }
  });
}

function normText(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

interface RawPlacement {
  placementKey: string;
  id: string | any;
  objKey: string;
  cx: number;
  cy: number;
  wPts: number;
  hPts: number;
}

interface TextRow {
  axisPos: number;
  rawText: string;
  rawLower: string;
  norm: string;
}

interface PageLayout {
  pageNum: number;
  page: any;
  placements: RawPlacement[];
  rows: TextRow[];
  isRotatedAxisX: boolean;
}

export interface AttachableQuotationItem {
  productName: string;
  imageAnchor?: string;
  imageUrl?: string;
}

function findDominantBand(values: number[], tolerance = 10): { mode: number; count: number } {
  let bestVal = values[0] || 0;
  let bestCount = 0;
  for (const v of values) {
    let count = 0;
    for (const other of values) {
      if (Math.abs(other - v) <= tolerance) count++;
    }
    if (count > bestCount) {
      bestCount = count;
      bestVal = v;
    }
  }
  return { mode: bestVal, count: bestCount };
}

export async function attachPdfProductImages<T extends AttachableQuotationItem>(
  pdfBuffer: Buffer,
  items: T[]
): Promise<T[]> {
  if (!items || items.length === 0) return items;

  ensurePdfCanvasPolyfills();
  ensureImageCacheDir();

  // @ts-ignore pdfjs-dist legacy mjs module does not ship TS declarations
  const pdfjs: any = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const OPS = pdfjs.OPS;

  const doc = await pdfjs.getDocument({
    data: new Uint8Array(pdfBuffer),
    verbosity: 0,
  }).promise;

  const urlCache = new Map<string, string | null>();
  const pages: PageLayout[] = [];

  for (let pageNum = 1; pageNum <= doc.numPages; pageNum++) {
    const page = await doc.getPage(pageNum);
    const ops = await page.getOperatorList();

    let ctm = [1, 0, 0, 1, 0, 0];
    const stack: number[][] = [];
    const rawPlacements: RawPlacement[] = [];

    for (let i = 0; i < ops.fnArray.length; i++) {
      const fn = ops.fnArray[i];
      const args = ops.argsArray[i];
      if (fn === OPS.save) {
        stack.push([...ctm]);
      } else if (fn === OPS.restore) {
        ctm = stack.pop() || [1, 0, 0, 1, 0, 0];
      } else if (fn === OPS.transform && Array.isArray(args)) {
        ctm = mulMatrix(ctm, args);
      } else if (
        fn === OPS.paintImageXObject ||
        fn === OPS.paintInlineImageXObject
      ) {
        const p0 = applyPoint(ctm, 0, 0);
        const p1 = applyPoint(ctm, 1, 0);
        const p2 = applyPoint(ctm, 0, 1);
        const p3 = applyPoint(ctm, 1, 1);
        const xs = [p0[0], p1[0], p2[0], p3[0]];
        const ys = [p0[1], p1[1], p2[1], p3[1]];
        const wPts = Math.max(...xs) - Math.min(...xs);
        const hPts = Math.max(...ys) - Math.min(...ys);
        const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
        const cy = (Math.min(...ys) + Math.max(...ys)) / 2;

        // Filter wide/tall banners, company logos, and hairline rules
        if (
          wPts >= 10 &&
          hPts >= 5 &&
          wPts <= 125 &&
          hPts <= 95 &&
          !(wPts > 100 && hPts > 60)
        ) {
          const id = args[0];
          const objKey =
            typeof id === 'string'
              ? `p${pageNum}:${id}`
              : `p${pageNum}:inline:${Math.round(cx)}:${Math.round(cy)}`;
          rawPlacements.push({
            placementKey: `p${pageNum}#${rawPlacements.length}`,
            id,
            objKey,
            cx,
            cy,
            wPts,
            hPts,
          });
        }
      }
    }

    if (rawPlacements.length === 0) continue;

    // Detect whether product thumbnails advance horizontally (rotated table like Opção) or vertically
    const yBand = findDominantBand(
      rawPlacements.map((p) => p.cy),
      8
    );
    const xBand = findDominantBand(
      rawPlacements.map((p) => p.cx),
      10
    );
    const distinctXInYBand = new Set(
      rawPlacements
        .filter((p) => Math.abs(p.cy - yBand.mode) <= 8)
        .map((p) => Math.round(p.cx / 10))
    ).size;

    const isRotatedAxisX =
      distinctXInYBand >= 2 && yBand.count > xBand.count;

    // Filter out isolated corner logos that sit outside the product photo strip/column
    const placements = rawPlacements.filter((p) => {
      if (isRotatedAxisX) {
        return Math.abs(p.cy - yBand.mode) <= 20;
      }
      if (xBand.count >= 2) {
        return Math.abs(p.cx - xBand.mode) <= 40;
      }
      return true;
    });

    if (placements.length === 0) continue;

    // Group text spans into logical table rows along the progression axis
    const tc = await page.getTextContent();
    const rowBuckets = new Map<number, { sumAxis: number; count: number; parts: string[] }>();
    for (const ti of tc.items as any[]) {
      const str = String(ti?.str || '').trim();
      if (!str) continue;
      const axisCoord = isRotatedAxisX ? ti.transform[4] : ti.transform[5];
      const bucketKey = Math.round(axisCoord / 4);
      let bucket = rowBuckets.get(bucketKey);
      if (!bucket) {
        bucket = { sumAxis: 0, count: 0, parts: [] };
        rowBuckets.set(bucketKey, bucket);
      }
      bucket.sumAxis += axisCoord;
      bucket.count++;
      bucket.parts.push(str);
    }

    const rows: TextRow[] = [];
    for (const bucket of rowBuckets.values()) {
      const rawText = bucket.parts.join(' ');
      rows.push({
        axisPos: bucket.sumAxis / bucket.count,
        rawText,
        rawLower: rawText.toLowerCase(),
        norm: normText(rawText),
      });
    }

    pages.push({
      pageNum,
      page,
      placements,
      rows,
      isRotatedAxisX,
    });
  }

  if (pages.length === 0) return items;

  // Global minimum-distance 1-to-1 matching so an item missing a photo can never steal an adjacent row's photo
  interface CandidateMatch {
    itemIdx: number;
    page: PageLayout;
    placement: RawPlacement;
    dist: number;
    isAnchorMatch: boolean;
  }

  const candidates: CandidateMatch[] = [];

  items.forEach((item, itemIdx) => {
    const anchor = (item.imageAnchor || '').trim();
    const anchorLower = anchor.toLowerCase();
    const nameNorm = normText(item.productName);
    const nameWords = nameNorm.split(/\s+/).filter((w) => w.length >= 3);

    for (const page of pages) {
      let matchedRow: TextRow | null = null;
      let isAnchorMatch = false;

      if (anchorLower.length >= 3) {
        const anchorBoundaryRegex = new RegExp(
          `(?:^|\\D|\\s)${anchorLower.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:$|\\D|\\s)`
        );
        matchedRow =
          page.rows.find(
            (r) => r.rawLower.includes(anchorLower) && anchorBoundaryRegex.test(r.rawLower)
          ) ||
          page.rows.find((r) => r.rawLower.includes(anchorLower)) ||
          null;
        if (matchedRow) isAnchorMatch = true;
      }

      if (!matchedRow && nameWords.length > 0) {
        const slice3 = nameWords.slice(0, 3).join(' ');
        if (slice3.length >= 5) {
          matchedRow = page.rows.find((r) => r.norm.includes(slice3)) || null;
        }
        if (!matchedRow) {
          let bestScore = 0;
          const minRequiredHits = Math.min(2, nameWords.length);
          for (const r of page.rows) {
            if (r.norm.length < 5) continue;
            let hits = 0;
            for (const w of nameWords) {
              if (r.norm.includes(w)) hits++;
            }
            if (hits >= minRequiredHits) {
              const score = hits / Math.max(1, nameWords.length);
              if (score > bestScore) {
                bestScore = score;
                matchedRow = r;
              }
            }
          }
        }
      }

      if (!matchedRow) continue;

      for (const pl of page.placements) {
        const plAxis = page.isRotatedAxisX ? pl.cx : pl.cy;
        const maxTolerance = page.isRotatedAxisX
          ? Math.max(12, pl.wPts * 0.65)
          : Math.min(26, Math.max(18, pl.hPts * 0.45));
        const dist = Math.abs(plAxis - matchedRow.axisPos);
        if (dist <= maxTolerance) {
          candidates.push({
            itemIdx,
            page,
            placement: pl,
            dist,
            isAnchorMatch,
          });
        }
      }
    }
  });

  // Sort globally: exact anchor matches and smallest coordinate distances win first
  candidates.sort((a, b) => {
    if (a.isAnchorMatch !== b.isAnchorMatch) {
      return a.isAnchorMatch ? -1 : 1;
    }
    return a.dist - b.dist;
  });

  const assignedByItem = new Map<number, { page: PageLayout; placement: RawPlacement }>();
  const claimedPlacements = new Set<string>();

  for (const cand of candidates) {
    if (assignedByItem.has(cand.itemIdx)) continue;
    if (claimedPlacements.has(cand.placement.placementKey)) continue;
    assignedByItem.set(cand.itemIdx, {
      page: cand.page,
      placement: cand.placement,
    });
    claimedPlacements.add(cand.placement.placementKey);
  }

  const results: T[] = [];

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const match = assignedByItem.get(i);
    if (!match) {
      results.push(item);
      continue;
    }

    const { page, placement } = match;
    let url = urlCache.get(placement.objKey);

    if (url === undefined) {
      url = null;
      const imgObj =
        typeof placement.id === 'string'
          ? await resolvePdfObj(page.page, placement.id)
          : placement.id;

      if (imgObj?.data && imgObj.width >= 16 && imgObj.height >= 16) {
        const pngBuf = encodeRawImageToPng(
          imgObj.data,
          imgObj.width,
          imgObj.height,
          imgObj.kind,
          720
        );
        if (pngBuf) {
          const hash = crypto
            .createHash('sha1')
            .update(pngBuf)
            .digest('hex')
            .slice(0, 16);
          const filename = `${hash}.png`;
          const fullPath = path.join(IMAGE_CACHE_DIR, filename);
          if (!fs.existsSync(fullPath)) {
            fs.writeFileSync(fullPath, pngBuf);
          }
          url = `/api/product-images/${filename}`;
        }
      }
      urlCache.set(placement.objKey, url);
    }

    if (url) {
      results.push({ ...item, imageUrl: url });
    } else {
      results.push(item);
    }
  }

  return results;
}
