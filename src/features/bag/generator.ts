const GRID_W = 10;
const GRID_H = 30;

function hashSeed(input: string) {
  let h = 1779033703 ^ input.length;
  for (let i = 0; i < input.length; i += 1) {
    h = Math.imul(h ^ input.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return (h >>> 0) + 1;
}

function createRng(seed: number) {
  let t = seed;
  return () => {
    t += 0x6d2b79f5;
    let x = Math.imul(t ^ (t >>> 15), 1 | t);
    x ^= x + Math.imul(x ^ (x >>> 7), 61 | x);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

function pickWeighted<T>(arr: Array<{ value: T; weight: number }>, rng: () => number) {
  const total = arr.reduce((acc, cur) => acc + cur.weight, 0);
  if (total <= 0) return arr[0]?.value;
  let roll = rng() * total;
  for (const item of arr) {
    roll -= item.weight;
    if (roll <= 0) return item.value;
  }
  return arr[arr.length - 1]?.value;
}

function sampleGaussian(rng: () => number) {
  let u = 0;
  let v = 0;
  while (u === 0) u = rng();
  while (v === 0) v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

function sampleTruncatedNormalInt(min: number, max: number, mean: number, spread: number, rng: () => number) {
  const nearestBoundaryDistance = Math.min(Math.max(1, mean - min), Math.max(1, max - mean));
  const stdDev = Math.max(1, nearestBoundaryDistance / Math.max(0.1, spread || 1));
  for (let i = 0; i < 24; i += 1) {
    const sample = mean + sampleGaussian(rng) * stdDev;
    if (sample >= min && sample <= max) return Math.round(sample);
  }
  return Math.max(min, Math.min(max, Math.round(mean)));
}

function chooseRealm(prob: Record<string, number>, rng: () => number) {
  const list = Object.keys(prob).map((realm) => ({ value: realm, weight: prob[realm] }));
  return pickWeighted(list, rng);
}

function generateTargetCells(
  realm: string,
  rng: () => number,
  realmCellSettings: Record<string, { min: number; max: number; peak: number; spread: number }>
) {
  const setting = realmCellSettings?.[realm] || { min: 10, max: 60, peak: 40, spread: 1.5 };
  return sampleTruncatedNormalInt(setting.min, setting.max, setting.peak, setting.spread, rng);
}

function isCellWithinTarget(x: number, y: number, target: number) {
  const index = y * GRID_W + x;
  return index < target;
}

function canPlaceWithinTarget(grid: (string | null)[][], x: number, y: number, w: number, h: number, target: number) {
  if (x + w > GRID_W || y + h > GRID_H) return false;
  for (let dy = 0; dy < h; dy += 1) {
    for (let dx = 0; dx < w; dx += 1) {
      const cx = x + dx;
      const cy = y + dy;
      if (!isCellWithinTarget(cx, cy, target)) return false;
      if (grid[cy][cx]) return false;
    }
  }
  return true;
}

function placeOnGrid(grid: (string | null)[][], itemId: string, x: number, y: number, w: number, h: number) {
  for (let dy = 0; dy < h; dy += 1) {
    for (let dx = 0; dx < w; dx += 1) {
      grid[y + dy][x + dx] = itemId;
    }
  }
}

function findFirstEmptyWithinTarget(grid: (string | null)[][], target: number) {
  const fullRows = Math.floor(target / GRID_W);
  const tail = target % GRID_W;
  for (let y = 0; y < fullRows; y += 1) {
    for (let x = 0; x < GRID_W; x += 1) {
      if (!grid[y][x]) return { x, y };
    }
  }
  if (tail > 0) {
    for (let x = 0; x < tail; x += 1) {
      if (!grid[fullRows][x]) return { x, y: fullRows };
    }
  }
  return null;
}

const DEFAULT_QUALITY_PROBABILITY = {
  凡: 20,
  黄: 20,
  玄: 20,
  地: 15,
  天: 15,
  圣: 10,
};

const DEFAULT_PRICE_PREFERENCE = {
  mode: "amount",
  amountMidpoint: 200000,
  amountDecay: 0.5,
  rankMidpoint: 320,
  rankDecay: 10,
};

const DEFAULT_SHAPE_WEIGHTS = Object.fromEntries(
  Array.from({ length: 10 }, (_, h) =>
    Array.from({ length: 10 }, (_, w) => [`${w + 1}x${h + 1}`, 1.0])
  ).flat()
) as Record<string, number>;

function getQualityProbabilityWeight(item: any, settings: any) {
  const prob = settings?.qualityProbability?.[item.quality];
  return Math.max(0.01, Number.isFinite(prob) ? prob : DEFAULT_QUALITY_PROBABILITY[item.quality as keyof typeof DEFAULT_QUALITY_PROBABILITY] || 1);
}

function normalizePricePreference(value: any, fallback = DEFAULT_PRICE_PREFERENCE) {
  if (!value || typeof value !== "object") return { ...fallback };
  const mode = value.mode === "rank" ? "rank" : "amount";
  return {
    mode,
    amountMidpoint: Number.isFinite(Number(value.amountMidpoint)) ? Math.max(1, Math.min(10000000, Math.round(Number(value.amountMidpoint)))) : fallback.amountMidpoint,
    amountDecay: Number.isFinite(Number(value.amountDecay)) ? Math.max(0.1, Math.min(10, Math.round(Number(value.amountDecay) * 10) / 10)) : fallback.amountDecay,
    rankMidpoint: Number.isFinite(Number(value.rankMidpoint)) ? Math.max(1, Math.min(400, Math.round(Number(value.rankMidpoint)))) : fallback.rankMidpoint,
    rankDecay: Number.isFinite(Number(value.rankDecay)) ? Math.max(0.1, Math.min(10, Math.round(Number(value.rankDecay) * 10) / 10)) : fallback.rankDecay,
  };
}

function getPricePreferenceWeight(item: any, settings: any, priceRankById: Record<string, number>) {
  const pref = normalizePricePreference(settings?.pricePreference, DEFAULT_PRICE_PREFERENCE);
  if (pref.mode === "rank") {
    const rank = Math.max(1, Math.min(400, priceRankById[item.id] || 1));
    return 1 / (1 + Math.pow(rank / Math.max(1, pref.rankMidpoint), Math.max(0.1, pref.rankDecay)));
  }
  return 1 / (1 + Math.pow(Math.max(0, item.price || 0) / Math.max(1, pref.amountMidpoint), Math.max(0.1, pref.amountDecay)));
}

function getShapeWeight(item: any, settings: any) {
  const shape = `${item.width}x${item.height}`;
  const raw = settings?.shapeWeights?.[shape];
  return Number.isFinite(raw) ? Math.max(0, raw) : DEFAULT_SHAPE_WEIGHTS[shape] || 1;
}

function pickCatalogCandidate(catalog: any[], remain: number, rng: () => number, settings: any, priceRankById: Record<string, number>) {
  const candidates = catalog.filter((item) => item.size <= remain);
  if (!candidates.length) return null;
  return pickWeighted(
    candidates.map((item) => ({
      value: item,
      weight:
        Math.max(0.01, getQualityProbabilityWeight(item, settings)) *
        Math.max(0.0001, getPricePreferenceWeight(item, settings, priceRankById)) *
        Math.max(0.0001, getShapeWeight(item, settings)),
    })),
    rng
  );
}

export type FrontGeneratedPlacedItem = {
  id: string;
  placedId: string;
  x: number;
  y: number;
  width: number;
  height: number;
  size: number;
  shape: string;
  quality: string;
  type: string;
  price: number;
  name: string;
  desc: string;
};

export function generateFrontRoundBag({
  gameId,
  roundNo,
  settings,
  catalog,
}: {
  gameId: string;
  roundNo: number;
  settings: any;
  catalog: any[];
}) {
  const seed = hashSeed(`${gameId}_round_${roundNo}`);
  const rng = createRng(seed);
  const realm = chooseRealm(settings?.realmProbability || {}, rng) as string;
  const target = generateTargetCells(realm, rng, settings?.realmCellSettings || {});
  const sortedByPrice = [...catalog].sort((a, b) => a.price - b.price || String(a.id).localeCompare(String(b.id)));
  const priceRankById = Object.fromEntries(sortedByPrice.map((item, index) => [item.id, index + 1]));
  const grid = Array.from({ length: GRID_H }, () => Array.from({ length: GRID_W }, () => null as string | null));
  const placedItems: FrontGeneratedPlacedItem[] = [];
  const waitingPool: any[] = [];
  let usedCells = 0;
  let guard = 0;

  while (usedCells < target && guard < 5000) {
    guard += 1;
    const remain = target - usedCells;
    const firstEmpty = findFirstEmptyWithinTarget(grid, target);
    if (!firstEmpty) break;

    let picked: any = null;
    let poolIndex = -1;

    for (let i = 0; i < waitingPool.length; i += 1) {
      const candidate = waitingPool[i];
      if (candidate.size <= remain && canPlaceWithinTarget(grid, firstEmpty.x, firstEmpty.y, candidate.width, candidate.height, target)) {
        picked = candidate;
        poolIndex = i;
        break;
      }
    }

    if (picked) {
      waitingPool.splice(poolIndex, 1);
    } else {
      let attempts = 0;
      while (attempts < 12 && !picked) {
        attempts += 1;
        const sampled = pickCatalogCandidate(catalog, remain, rng, settings, priceRankById);
        if (!sampled) break;
        if (canPlaceWithinTarget(grid, firstEmpty.x, firstEmpty.y, sampled.width, sampled.height, target)) {
          picked = sampled;
          break;
        }
        waitingPool.push(sampled);
      }
    }

    if (!picked) {
      const fallbackCandidates = catalog.filter((item) => item.width === 1 && item.height === 1);
      const fallback = fallbackCandidates.length ? pickCatalogCandidate(fallbackCandidates, remain, rng, settings, priceRankById) : null;
      if (!fallback || !canPlaceWithinTarget(grid, firstEmpty.x, firstEmpty.y, 1, 1, target)) break;
      picked = fallback;
    }

    const placedId = `ri_${roundNo}_${placedItems.length}_${picked.id}`;
    placeOnGrid(grid, placedId, firstEmpty.x, firstEmpty.y, picked.width, picked.height);
    placedItems.push({ ...picked, placedId, x: firstEmpty.x, y: firstEmpty.y });
    usedCells += picked.size;
  }

  return {
    seed,
    realm,
    targetCells: usedCells,
    placedItems,
    revealOrder: [...placedItems].sort((a, b) => a.y - b.y || a.x - b.x || a.size - b.size),
  };
}