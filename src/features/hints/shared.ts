export type HintIntel = {
  knownItemIds: string[];
  knownContours: string[];
  knownQualityCells: Array<{ x: number; y: number; itemPlacedId: string }>;
  knownTypeItemIds: string[];
  texts: string[];
};

export type HintScope =
  | { kind: "all" }
  | { kind: "random"; count: number }
  | { kind: "quality"; qualities: string[] }
  | { kind: "type"; types: string[] }
  | { kind: "highestQualityAll" }
  | { kind: "highestQualityOne" }
  | { kind: "maxSizeAll" }
  | { kind: "maxSizeOne" };

export type HintEffect =
  | { type: "revealItem"; scope: HintScope }
  | { type: "revealQuality"; scope: HintScope }
  | { type: "revealContour"; scope: HintScope }
  | { type: "summary"; metric: "count" | "totalPrice" | "avgPrice" | "totalSize" | "avgSize"; scope: HintScope };

export type HintTool = {
  id: string;
  name: string;
  short?: string;
  cost: number;
  desc: string;
  effect: HintEffect;
};

export function createEmptyIntel(): HintIntel {
  return {
    knownItemIds: [],
    knownContours: [],
    knownQualityCells: [],
    knownTypeItemIds: [],
    texts: [],
  };
}

export function cloneIntel(base?: Partial<HintIntel> | null): HintIntel {
  return {
    knownItemIds: [...(base?.knownItemIds || [])],
    knownContours: [...(base?.knownContours || [])],
    knownQualityCells: [...(base?.knownQualityCells || [])],
    knownTypeItemIds: [...(base?.knownTypeItemIds || [])],
    texts: [...(base?.texts || [])],
  };
}

export function hashSeed(input: string) {
  let h = 1779033703 ^ input.length;
  for (let i = 0; i < input.length; i += 1) {
    h = Math.imul(h ^ input.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return (h >>> 0) + 1;
}

export function createRng(seed: number) {
  let t = seed;
  return () => {
    t += 0x6d2b79f5;
    let x = Math.imul(t ^ (t >>> 15), 1 | t);
    x ^= x + Math.imul(x ^ (x >>> 7), 61 | x);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

export function uniquePush<T>(list: T[], value: T) {
  if (!list.includes(value)) list.push(value);
}

function uniqueQualityCellPush(list: HintIntel["knownQualityCells"], value: { x: number; y: number; itemPlacedId: string }) {
  const key = `${value.itemPlacedId}_${value.x}_${value.y}`;
  if (!list.some((cell) => `${cell.itemPlacedId}_${cell.x}_${cell.y}` === key)) {
    list.push(value);
  }
}

export function itemQualityRank(item: { quality: string }) {
  const QUALITY_ORDER = ["凡", "黄", "玄", "地", "天", "圣"];
  return QUALITY_ORDER.indexOf(item.quality);
}

export function pickRandom<T>(list: T[], rng: () => number) {
  if (!list.length) return null;
  return list[Math.floor(rng() * list.length)] || list[0] || null;
}

export function selectItemsByScope<T extends { quality: string; type: string; size: number }>(items: T[], scope: HintScope | undefined, rng: () => number) {
  if (!scope || scope.kind === "all") return [...items];
  if (scope.kind === "random") {
    return [...items].sort(() => rng() - 0.5).slice(0, Math.min(scope.count || 0, items.length));
  }
  if (scope.kind === "quality") {
    return items.filter((item) => (scope.qualities || []).includes(item.quality));
  }
  if (scope.kind === "type") {
    return items.filter((item) => (scope.types || []).includes(item.type));
  }
  if (scope.kind === "highestQualityAll" || scope.kind === "highestQualityOne") {
    const maxRank = Math.max(...items.map(itemQualityRank));
    const pool = items.filter((item) => itemQualityRank(item) === maxRank);
    return scope.kind === "highestQualityOne" ? (pool.length ? [pickRandom(pool, rng)!] : []) : pool;
  }
  if (scope.kind === "maxSizeAll" || scope.kind === "maxSizeOne") {
    const maxSize = Math.max(...items.map((item) => item.size));
    const pool = items.filter((item) => item.size === maxSize);
    return scope.kind === "maxSizeOne" ? (pool.length ? [pickRandom(pool, rng)!] : []) : pool;
  }
  return [...items];
}

function describeScope(scope: HintScope | undefined) {
  if (!scope || scope.kind === "all") return "所有物品";
  if (scope.kind === "quality") {
    const qualities = scope.qualities || [];
    return qualities.length === 1 ? `所有${qualities[0]}级物品` : `${qualities.join("、")}级物品`;
  }
  if (scope.kind === "type") {
    const types = scope.types || [];
    return types.length === 1 ? `所有${types[0]}物品` : `${types.join("、")}物品`;
  }
  if (scope.kind === "highestQualityAll") return "最高品质物品";
  if (scope.kind === "highestQualityOne") return "最高品质中的1个物品";
  if (scope.kind === "maxSizeAll") return "最大格子数物品";
  if (scope.kind === "maxSizeOne") return "最大格子数中的1个物品";
  if (scope.kind === "random") return `随机${scope.count || 0}件物品`;
  return "目标物品";
}

function formatAvg(value: number) {
  return (Math.floor(value * 100) / 100).toFixed(2);
}

function computeMetric(items: Array<{ price: number; size: number }>, metric: "count" | "totalPrice" | "avgPrice" | "totalSize" | "avgSize") {
  if (!items.length) return metric === "avgPrice" || metric === "avgSize" ? "0.00" : "0";
  if (metric === "count") return String(items.length);
  if (metric === "totalPrice") return String(items.reduce((sum, item) => sum + item.price, 0));
  if (metric === "avgPrice") return formatAvg(items.reduce((sum, item) => sum + item.price, 0) / items.length);
  if (metric === "totalSize") return String(items.reduce((sum, item) => sum + item.size, 0));
  if (metric === "avgSize") return formatAvg(items.reduce((sum, item) => sum + item.size, 0) / items.length);
  return "0";
}

function metricText(metric: "count" | "totalPrice" | "avgPrice" | "totalSize" | "avgSize") {
  if (metric === "count") return "数量";
  if (metric === "totalPrice") return "总价";
  if (metric === "avgPrice") return "均价";
  if (metric === "totalSize") return "总格数";
  if (metric === "avgSize") return "平均格数";
  return "结果";
}

function qualityCellsForItem(item: { placedId: string; x: number; y: number; width: number; height: number }) {
  const cells = [] as Array<{ x: number; y: number; itemPlacedId: string }>;
  for (let dy = 0; dy < item.height; dy += 1) {
    for (let dx = 0; dx < item.width; dx += 1) {
      cells.push({ x: item.x + dx, y: item.y + dy, itemPlacedId: item.placedId });
    }
  }
  return cells;
}

function revealItemQuality(intel: HintIntel, item: { placedId: string; x: number; y: number; width: number; height: number }, rng: () => number) {
  const cells = qualityCellsForItem(item);
  if (!cells.length) return;
  const pick = cells[Math.floor(rng() * cells.length)] || cells[0];
  uniqueQualityCellPush(intel.knownQualityCells, pick);
}

function revealItemContour(intel: HintIntel, item: { placedId: string }) {
  uniquePush(intel.knownContours, item.placedId);
}

function revealItemFull(intel: HintIntel, item: { placedId: string }) {
  uniquePush(intel.knownItemIds, item.placedId);
  uniquePush(intel.knownTypeItemIds, item.placedId);
}

function revealItemType(intel: HintIntel, item: { placedId: string }) {
  uniquePush(intel.knownTypeItemIds, item.placedId);
}

export function applyHintEffect(
  effect: HintEffect,
  intel: HintIntel,
  items: Array<{ placedId: string; x: number; y: number; width: number; height: number; quality: string; type: string; size: number; price: number }>,
  rng: () => number,
  source: string
) {
  const targetItems = selectItemsByScope(items, effect.scope, rng).filter(Boolean);
  const scopeLabel = describeScope(effect.scope);

  if (effect.scope?.kind === "type") {
    targetItems.forEach((item) => revealItemType(intel, item));
  }

  if (effect.type === "revealItem") {
    targetItems.forEach((item) => revealItemFull(intel, item));
    return `${source}提示：显露${scopeLabel}。`;
  }

  if (effect.type === "revealQuality") {
    targetItems.forEach((item) => revealItemQuality(intel, item, rng));
    return `${source}提示：显露${scopeLabel}的品质。`;
  }

  if (effect.type === "revealContour") {
    targetItems.forEach((item) => revealItemContour(intel, item));
    return `${source}提示：显露${scopeLabel}的轮廓。`;
  }

  const value = computeMetric(targetItems, effect.metric);
  return `${source}提示：${scopeLabel}${metricText(effect.metric)} = ${value}`;
}
