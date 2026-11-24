import { findBestProductMatch, MatchCandidate } from './productMatcher';

const STORAGE_KEY_MEMORY = 'cotafacil_correspondence_memory_v1';

export interface CorrespondenceGroup {
  id: string;
  keys: string[];
  labels: string[];
  updatedAt: number;
}

export interface CorrespondenceMemoryState {
  groups: CorrespondenceGroup[];
  rejectedPairs: string[]; // "keyA||keyB" sorted alphabetically
}

export function normalizeMemoryKey(desc: string): string {
  return (desc || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function makePairKey(keyA: string, keyB: string): string {
  return keyA < keyB ? `${keyA}||${keyB}` : `${keyB}||${keyA}`;
}

export function loadCorrespondenceMemory(): CorrespondenceMemoryState {
  try {
    if (typeof localStorage === 'undefined') {
      return { groups: [], rejectedPairs: [] };
    }
    const raw = localStorage.getItem(STORAGE_KEY_MEMORY);
    if (!raw) return { groups: [], rejectedPairs: [] };
    const parsed = JSON.parse(raw);
    return {
      groups: Array.isArray(parsed?.groups) ? parsed.groups : [],
      rejectedPairs: Array.isArray(parsed?.rejectedPairs) ? parsed.rejectedPairs : [],
    };
  } catch {
    return { groups: [], rejectedPairs: [] };
  }
}

export function saveCorrespondenceMemory(state: CorrespondenceMemoryState): void {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(STORAGE_KEY_MEMORY, JSON.stringify(state));
  } catch (e) {
    console.error('Erro ao salvar memória de correspondências:', e);
  }
}

export function getMemorizedLinksCount(): number {
  const state = loadCorrespondenceMemory();
  return state.groups.reduce((sum, g) => sum + Math.max(0, g.keys.length - 1), 0);
}

export function isCorrespondenceRejected(descA: string, descB: string): boolean {
  const keyA = normalizeMemoryKey(descA);
  const keyB = normalizeMemoryKey(descB);
  if (!keyA || !keyB || keyA === keyB) return false;
  const state = loadCorrespondenceMemory();
  return state.rejectedPairs.includes(makePairKey(keyA, keyB));
}

export function memorizeCorrespondence(sourceDesc: string, targetDesc: string): void {
  const keyA = normalizeMemoryKey(sourceDesc);
  const keyB = normalizeMemoryKey(targetDesc);
  if (!keyA || !keyB || keyA === keyB) return;

  const labelA = sourceDesc.trim();
  const labelB = targetDesc.trim();
  const state = loadCorrespondenceMemory();
  const now = Date.now();

  // Clear any previous rejection for this pair since user confirmed/applied it
  const pairKey = makePairKey(keyA, keyB);
  state.rejectedPairs = state.rejectedPairs.filter((p) => p !== pairKey);

  const idxA = state.groups.findIndex((g) => g.keys.includes(keyA));
  const idxB = state.groups.findIndex((g) => g.keys.includes(keyB));

  if (idxA !== -1 && idxB !== -1) {
    if (idxA === idxB) {
      state.groups[idxA].updatedAt = now;
    } else {
      // Merge two equivalence groups
      const keepIdx = Math.min(idxA, idxB);
      const dropIdx = Math.max(idxA, idxB);
      const keepGroup = state.groups[keepIdx];
      const dropGroup = state.groups[dropIdx];

      dropGroup.keys.forEach((k, i) => {
        if (!keepGroup.keys.includes(k)) {
          keepGroup.keys.push(k);
          keepGroup.labels.push(dropGroup.labels[i] || k);
        }
      });
      keepGroup.updatedAt = now;
      state.groups.splice(dropIdx, 1);
    }
  } else if (idxA !== -1) {
    state.groups[idxA].keys.push(keyB);
    state.groups[idxA].labels.push(labelB);
    state.groups[idxA].updatedAt = now;
  } else if (idxB !== -1) {
    state.groups[idxB].keys.push(keyA);
    state.groups[idxB].labels.push(labelA);
    state.groups[idxB].updatedAt = now;
  } else {
    state.groups.push({
      id: `grp_${now}_${Math.random().toString(36).slice(2, 7)}`,
      keys: [keyA, keyB],
      labels: [labelA, labelB],
      updatedAt: now,
    });
  }

  saveCorrespondenceMemory(state);
}

export function forgetCorrespondence(sourceDesc: string, targetDesc: string): void {
  const keyA = normalizeMemoryKey(sourceDesc);
  const keyB = normalizeMemoryKey(targetDesc);
  if (!keyA || !keyB || keyA === keyB) return;

  const state = loadCorrespondenceMemory();
  const pairKey = makePairKey(keyA, keyB);
  if (!state.rejectedPairs.includes(pairKey)) {
    state.rejectedPairs.push(pairKey);
  }

  // If both belonged to the same memorized group, detach source keyA from that group
  const idx = state.groups.findIndex((g) => g.keys.includes(keyA) && g.keys.includes(keyB));
  if (idx !== -1) {
    const group = state.groups[idx];
    const posA = group.keys.indexOf(keyA);
    if (posA !== -1) {
      group.keys.splice(posA, 1);
      group.labels.splice(posA, 1);
    }
    if (group.keys.length < 2) {
      state.groups.splice(idx, 1);
    }
  }

  saveCorrespondenceMemory(state);
}

export function findMemorizedProductMatch(
  candidateDesc: string,
  existingProducts: MatchCandidate[]
): string {
  const keyA = normalizeMemoryKey(candidateDesc);
  if (!keyA || existingProducts.length === 0) return '';

  const state = loadCorrespondenceMemory();
  const group = state.groups.find((g) => g.keys.includes(keyA));
  if (!group) return '';

  // 1. Direct match against any memorized equivalent description currently in the map
  for (const p of existingProducts) {
    const keyP = normalizeMemoryKey(p.name);
    if (keyP && group.keys.includes(keyP) && !state.rejectedPairs.includes(makePairKey(keyA, keyP))) {
      return p.id;
    }
  }

  // 2. Transitive alias bridge: if memorized alias B matches a renamed/other-brand product C currently in map
  const allowedCandidates = existingProducts.filter(
    (p) => !state.rejectedPairs.includes(makePairKey(keyA, normalizeMemoryKey(p.name)))
  );
  for (const aliasLabel of group.labels) {
    if (normalizeMemoryKey(aliasLabel) === keyA) continue;
    const bridgedId = findBestProductMatch(aliasLabel, allowedCandidates);
    if (bridgedId) return bridgedId;
  }

  return '';
}

export function resolveBestProductMatchWithMemory(
  candidateDesc: string,
  existingProducts: MatchCandidate[],
  serverSuggestedId?: string
): { matchedId: string; fromMemory: boolean } {
  if (!candidateDesc.trim() || existingProducts.length === 0) {
    return { matchedId: '', fromMemory: false };
  }

  // 1. User-memorized correspondences ALWAYS win first
  const memId = findMemorizedProductMatch(candidateDesc, existingProducts);
  if (memId) {
    return { matchedId: memId, fromMemory: true };
  }

  // 2. Respect server suggestion unless explicitly rejected by user
  if (serverSuggestedId) {
    const target = existingProducts.find((p) => p.id === serverSuggestedId);
    if (target && !isCorrespondenceRejected(candidateDesc, target.name)) {
      return { matchedId: target.id, fromMemory: false };
    }
  }

  // 3. Brand-agnostic intelligent matcher (filtering out explicitly rejected pairs)
  const allowedCandidates = existingProducts.filter(
    (p) => !isCorrespondenceRejected(candidateDesc, p.name)
  );
  const autoId = findBestProductMatch(candidateDesc, allowedCandidates);
  return { matchedId: autoId, fromMemory: false };
}
