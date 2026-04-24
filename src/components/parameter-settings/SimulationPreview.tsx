import { useMemo } from "react";

type RealmOrder = "炼气" | "筑基" | "结丹" | "元婴" | "化神" | "炼虚" | "合体" | "大乘";
export type RealmCellSetting = { min: number; max: number; peak: number; spread: number };
export type PricePreference = { mode: "amount" | "rank"; amountMidpoint: number; amountDecay: number; rankMidpoint: number; rankDecay: number };
export type ShapeSimulationStats = {
  counts: Record<string, number>;
  probabilities: Record<string, number>;
  totalPlaced: number;
  orientationSummary: { horizontal: number; vertical: number; square: number };
  qualityPriceMap?: Record<string, number[]>;
  allPrices?: number[];
  itemCountMap?: Record<string, number>;
  priceCountMap?: Record<number, number>;
};

const QUALITIES = ["凡", "黄", "玄", "地", "天", "圣"] as const;
const QUALITY_TEXT_COLOR: Record<string, string> = {
  圣: "text-red-300",
  天: "text-orange-300",
  地: "text-fuchsia-300",
  玄: "text-sky-300",
  黄: "text-emerald-300",
  凡: "text-slate-300",
};

const GRID_W = 10;
const GRID_H = 30;

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value));
}

function simHashSeed(input: string) {
  let h = 1779033703 ^ input.length;
  for (let i = 0; i < input.length; i += 1) {
    h = Math.imul(h ^ input.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return (h >>> 0) + 1;
}

function simCreateRng(seed: number) {
  let t = seed;
  return () => {
    t += 0x6d2b79f5;
    let x = Math.imul(t ^ (t >>> 15), 1 | t);
    x ^= x + Math.imul(x ^ (x >>> 7), 61 | x);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

function simPickWeighted<T>(arr: Array<{ value: T; weight: number }>, rng: () => number) {
  const total = arr.reduce((sum, item) => sum + item.weight, 0);
  if (total <= 0) return arr[0]?.value;
  let roll = rng() * total;
  for (const item of arr) {
    roll -= item.weight;
    if (roll <= 0) return item.value;
  }
  return arr[arr.length - 1]?.value;
}

function simSampleGaussian(rng: () => number) {
  let u = 0;
  let v = 0;
  while (u === 0) u = rng();
  while (v === 0) v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

function simSampleTruncatedNormalInt(min: number, max: number, mean: number, spread: number, rng: () => number) {
  const nearestBoundaryDistance = Math.min(Math.max(1, mean - min), Math.max(1, max - mean));
  const stdDev = Math.max(1, nearestBoundaryDistance / Math.max(0.1, spread || 1));
  for (let i = 0; i < 24; i += 1) {
    const sample = mean + simSampleGaussian(rng) * stdDev;
    if (sample >= min && sample <= max) return Math.round(sample);
  }
  return Math.max(min, Math.min(max, Math.round(mean)));
}

function simChooseRealm(prob: Record<string, number>, rng: () => number, realmOrder: readonly RealmOrder[]) {
  return simPickWeighted(
    realmOrder.map((realm) => ({ value: realm, weight: prob[realm] || 0 })),
    rng
  ) as RealmOrder;
}

function simGenerateTargetCells(
  realm: RealmOrder,
  rng: () => number,
  realmCellSettings: Record<string, RealmCellSetting>,
  defaultRealmCellSettings: Record<string, RealmCellSetting>
) {
  const setting = realmCellSettings?.[realm] || defaultRealmCellSettings[realm];
  return simSampleTruncatedNormalInt(setting.min, setting.max, setting.peak, setting.spread, rng);
}

function simPlaceOnGrid(grid: (string | null)[][], id: string, x: number, y: number, w: number, h: number) {
  for (let dy = 0; dy < h; dy += 1) {
    for (let dx = 0; dx < w; dx += 1) {
      grid[y + dy][x + dx] = id;
    }
  }
}

function simIsCellWithinTarget(x: number, y: number, target: number) {
  return y * GRID_W + x < target;
}

function simFindFirstEmpty(grid: (string | null)[][], target: number) {
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

function simCanPlaceWithinTarget(grid: (string | null)[][], x: number, y: number, w: number, h: number, target: number) {
  if (x + w > GRID_W || y + h > GRID_H) return false;
  for (let dy = 0; dy < h; dy += 1) {
    for (let dx = 0; dx < w; dx += 1) {
      const cx = x + dx;
      const cy = y + dy;
      if (!simIsCellWithinTarget(cx, cy, target)) return false;
      if (grid[cy][cx]) return false;
    }
  }
  return true;
}

function getFrontPricePreferenceWeight(
  item: { id: string; price: number },
  pricePreference: PricePreference,
  priceRankById: Record<string, number>
) {
  if (pricePreference.mode === "rank") {
    const rank = Math.max(1, Math.min(400, priceRankById[item.id] || 1));
    return 1 / (1 + Math.pow(rank / Math.max(1, pricePreference.rankMidpoint), Math.max(0.1, pricePreference.rankDecay)));
  }
  return 1 / (1 + Math.pow(Math.max(0, item.price) / Math.max(1, pricePreference.amountMidpoint), Math.max(0.1, pricePreference.amountDecay)));
}

function simPickCatalogCandidate(
  catalog: any[],
  remain: number,
  rng: () => number,
  qualityProbability: Record<string, number>,
  pricePreference: PricePreference,
  priceRankById: Record<string, number>,
  shapeWeights: Record<string, number>,
  defaultQualityProbability: Record<string, number>,
  defaultShapeWeights: Record<string, number>
) {
  const candidates = catalog.filter((item) => item.size <= remain);
  if (!candidates.length) return null;
  return simPickWeighted(
    candidates.map((item) => ({
      value: item,
      weight:
        Math.max(0.01, qualityProbability[item.quality] ?? defaultQualityProbability[item.quality] ?? 1) *
        getFrontPricePreferenceWeight(item, pricePreference, priceRankById) *
        Math.max(0.0001, shapeWeights[`${item.width}x${item.height}`] ?? defaultShapeWeights[`${item.width}x${item.height}`] ?? 1),
    })),
    rng
  );
}

export function simulateShapeMatrixStats({
  catalog,
  realmProbability,
  realmCellSettings,
  qualityProbability,
  pricePreference,
  shapeWeights,
  samples = 100,
  randomSeed,
  realmOrder,
  defaultRealmCellSettings,
  defaultQualityProbability,
  defaultShapeWeights,
}: {
  catalog: any[];
  realmProbability: Record<string, number>;
  realmCellSettings: Record<string, RealmCellSetting>;
  qualityProbability: Record<string, number>;
  pricePreference: PricePreference;
  shapeWeights: Record<string, number>;
  samples?: number;
  randomSeed?: string;
  realmOrder: readonly RealmOrder[];
  defaultRealmCellSettings: Record<string, RealmCellSetting>;
  defaultQualityProbability: Record<string, number>;
  defaultShapeWeights: Record<string, number>;
}): ShapeSimulationStats {
  if (!catalog?.length) {
    return {
      counts: {},
      probabilities: {},
      totalPlaced: 0,
      orientationSummary: { horizontal: 0, vertical: 0, square: 0 },
      qualityPriceMap: Object.fromEntries(QUALITIES.map((quality) => [quality, []])) as Record<string, number[]>,
      allPrices: [],
      itemCountMap: {},
      priceCountMap: {},
    };
  }

  const reducedCatalog = catalog.map((item: any) => ({
    id: item.id,
    width: item.width,
    height: item.height,
    size: item.size,
    quality: item.quality,
    price: item.price,
  }));
  const sortedByPrice = [...reducedCatalog].sort((a, b) => a.price - b.price || String(a.id).localeCompare(String(b.id)));
  const priceRankById = Object.fromEntries(sortedByPrice.map((item, index) => [item.id, index + 1]));
  const counts: Record<string, number> = {};
  const orientationSummary = { horizontal: 0, vertical: 0, square: 0 };
  const qualityPriceMap = Object.fromEntries(QUALITIES.map((quality) => [quality, [] as number[]])) as Record<string, number[]>;
  const allPrices: number[] = [];
  const itemCountMap: Record<string, number> = {};
  const priceCountMap: Record<number, number> = {};
  let totalPlaced = 0;
  const signature = JSON.stringify({ realmProbability, realmCellSettings, qualityProbability, pricePreference, samples, randomSeed: randomSeed || "fixed" });

  for (let run = 0; run < samples; run += 1) {
    const rng = simCreateRng(simHashSeed(`${signature}_${run}`));
    const realm = simChooseRealm(realmProbability, rng, realmOrder);
    const target = simGenerateTargetCells(realm, rng, realmCellSettings, defaultRealmCellSettings);
    const grid = Array.from({ length: GRID_H }, () => Array.from({ length: GRID_W }, () => null as string | null));
    const waitingPool: any[] = [];
    let usedCells = 0;
    let guard = 0;

    while (usedCells < target && guard < 5000) {
      guard += 1;
      const remain = target - usedCells;
      const firstEmpty = simFindFirstEmpty(grid, target);
      if (!firstEmpty) break;

      let picked: any = null;
      let poolIndex = -1;
      for (let i = 0; i < waitingPool.length; i += 1) {
        const candidate = waitingPool[i];
        if (candidate.size <= remain && simCanPlaceWithinTarget(grid, firstEmpty.x, firstEmpty.y, candidate.width, candidate.height, target)) {
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
          const sampled = simPickCatalogCandidate(
            reducedCatalog,
            remain,
            rng,
            qualityProbability,
            pricePreference,
            priceRankById,
            shapeWeights,
            defaultQualityProbability,
            defaultShapeWeights
          );
          if (!sampled) break;
          if (simCanPlaceWithinTarget(grid, firstEmpty.x, firstEmpty.y, sampled.width, sampled.height, target)) {
            picked = sampled;
            break;
          }
          waitingPool.push(sampled);
        }
      }

      if (!picked) {
        const fallbackCandidates = reducedCatalog.filter((item) => item.width === 1 && item.height === 1);
        const fallback = fallbackCandidates.length
          ? simPickWeighted(
              fallbackCandidates.map((item) => ({
                value: item,
                weight:
                  Math.max(0.01, qualityProbability[item.quality] ?? defaultQualityProbability[item.quality] ?? 1) *
                  getFrontPricePreferenceWeight(item, pricePreference, priceRankById),
              })),
              rng
            )
          : null;
        if (!fallback || !simCanPlaceWithinTarget(grid, firstEmpty.x, firstEmpty.y, 1, 1, target)) break;
        picked = fallback;
      }

      simPlaceOnGrid(grid, `sim_${run}_${guard}`, firstEmpty.x, firstEmpty.y, picked.width, picked.height);
      usedCells += picked.size;
      const shapeKey = `${picked.width}x${picked.height}`;
      counts[shapeKey] = (counts[shapeKey] || 0) + 1;
      totalPlaced += 1;
      itemCountMap[picked.id] = (itemCountMap[picked.id] || 0) + 1;
      priceCountMap[picked.price] = (priceCountMap[picked.price] || 0) + 1;
      if (!qualityPriceMap[picked.quality]) qualityPriceMap[picked.quality] = [];
      qualityPriceMap[picked.quality].push(picked.price);
      allPrices.push(picked.price);
      if (picked.width > picked.height) orientationSummary.horizontal += 1;
      else if (picked.height > picked.width) orientationSummary.vertical += 1;
      else orientationSummary.square += 1;
    }
  }

  const probabilities = Object.fromEntries(Object.entries(counts).map(([shape, count]) => [shape, totalPlaced > 0 ? (count / totalPlaced) * 100 : 0]));
  Object.keys(qualityPriceMap).forEach((quality) => {
    qualityPriceMap[quality] = [...qualityPriceMap[quality]].sort((a, b) => a - b);
  });
  allPrices.sort((a, b) => a - b);

  return { counts, probabilities, totalPlaced, orientationSummary, qualityPriceMap, allPrices, itemCountMap, priceCountMap };
}

export function ShapeSimulationActions({
  onRun,
}: {
  onRun: (samples?: number) => void;
}) {
  const counts = [50, 100, 200, 300, 400, 500, 1000];
  return (
    <div className="flex flex-wrap items-center justify-end gap-2 text-sm text-zinc-300">
      <span className="text-zinc-400">模拟：</span>
      <div className="inline-flex flex-wrap items-center overflow-hidden rounded-xl border border-white/10 bg-slate-950/45">
        {counts.map((count, index) => (
          <button
            key={`shape-sim-${count}`}
            type="button"
            className={[
              "px-3 py-1.5 text-sm text-cyan-100 hover:bg-cyan-500/10 hover:text-cyan-50",
              index !== counts.length - 1 ? "border-r border-white/10" : "",
            ].filter(Boolean).join(" ")}
            onClick={() => onRun(count)}
          >
            {count}
          </button>
        ))}
      </div>
      <span className="text-zinc-400">次</span>
    </div>
  );
}

function getHeatColorByCount(count: number, maxCount: number) {
  if (count <= 0 || maxCount <= 0) return "rgba(15,23,42,0.18)";
  const t = clamp01(count / maxCount);
  const hue = 54 - t * 54;
  const sat = 100;
  const light = 98 - t * 48;
  return `hsl(${hue}, ${sat}%, ${light}%)`;
}

export function ShapeWeightMatrix({
  simulation,
  catalog,
  actions,
}: {
  simulation?: ShapeSimulationStats | null;
  catalog: any[];
  actions?: React.ReactNode;
}) {
  const simProbabilities = simulation?.probabilities || {};
  const simCounts = simulation?.counts || {};
  const availableShapes = useMemo(() => new Set((catalog || []).map((item: any) => `${item.width}x${item.height}`)), [catalog]);
  const catalogCountByShape = useMemo(() => {
    const map: Record<string, number> = {};
    (catalog || []).forEach((item: any) => {
      const key = `${item.width}x${item.height}`;
      map[key] = (map[key] || 0) + 1;
    });
    return map;
  }, [catalog]);
  const catalogCountByQuality = useMemo(() => {
    const map: Record<string, number> = {};
    (catalog || []).forEach((item: any) => {
      map[item.quality] = (map[item.quality] || 0) + 1;
    });
    return map;
  }, [catalog]);
  const catalogTotal = catalog?.length || 0;

  function buildQualityBandGradient(items: Array<{ id: string; name: string; price: number; count: number }>, maxCount: number) {
    if (!items.length) return "#ffffff";
    const segment = 100 / items.length;
    const stops: string[] = [];
    items.forEach((item, index) => {
      const start = Number((index * segment).toFixed(6));
      const end = Number(((index + 1) * segment).toFixed(6));
      const color = getHeatColorByCount(item.count, maxCount);
      stops.push(`${color} ${start}%`, `${color} ${end}%`);
    });
    return `linear-gradient(90deg, ${stops.join(", ")})`;
  }

  function buildQualityCatalogBands() {
    const itemCountMap = simulation?.itemCountMap || {};
    const orderedByQuality: Record<string, Array<{ id: string; name: string; price: number; count: number }>> = Object.fromEntries(
      QUALITIES.map((quality) => [quality, []])
    ) as Record<string, Array<{ id: string; name: string; price: number; count: number }>>;

    (catalog || []).forEach((item: any) => {
      if (!orderedByQuality[item.quality]) orderedByQuality[item.quality] = [];
      orderedByQuality[item.quality].push({ id: item.id, name: item.name, price: item.price, count: Number(itemCountMap[item.id] || 0) });
    });

    Object.keys(orderedByQuality).forEach((quality) => {
      orderedByQuality[quality].sort((a, b) => a.price - b.price || String(a.id).localeCompare(String(b.id)));
    });

    return orderedByQuality;
  }

  function buildQualityDomainMax(qualityBands: Record<string, Array<{ id: string; name: string; price: number; count: number }>>) {
    const maxCount = Math.max(...QUALITIES.map((quality) => qualityBands?.[quality]?.length || 0), 0);
    if (maxCount <= 0) return 20;
    return Math.ceil(maxCount / 20) * 20;
  }

  function buildLogHeatSegments() {
    const priceCountMap = simulation?.priceCountMap || {};
    const minValue = 100;
    const maxValue = 10000000;
    const logStart = Math.log10(minValue);
    const logEnd = Math.log10(maxValue);
    const maxCount = Math.max(...Object.values(priceCountMap).map((value) => Number(value) || 0), 0, 1);
    const prices = Object.keys(priceCountMap)
      .map((key) => Number(key))
      .filter((value) => Number.isFinite(value) && value >= minValue)
      .sort((a, b) => a - b);

    const segments = prices.map((price, index) => {
      const count = Number(priceCountMap[price] || 0);
      const startLog = Math.log10(Math.max(minValue, price));
      const nextPrice = prices[index + 1] ?? maxValue;
      const nextLog = Math.log10(Math.max(minValue, nextPrice));
      const left = ((startLog - logStart) / (logEnd - logStart)) * 100;
      const width = Math.max(0.18, ((Math.max(startLog, nextLog) - startLog) / (logEnd - logStart)) * 100);
      return { left, width, count, color: getHeatColorByCount(count, maxCount) };
    });

    const ticks: Array<{ left: number; major: boolean; label?: string }> = [];
    for (let exp = 2; exp <= 7; exp += 1) {
      const base = Math.pow(10, exp);
      if (base > maxValue) break;
      ticks.push({ left: ((Math.log10(base) - logStart) / (logEnd - logStart)) * 100, major: true, label: base >= 10000 ? `${base / 10000}万` : String(base) });
      if (exp < 7) {
        for (let i = 2; i <= 9; i += 1) {
          const value = base * i;
          if (value > maxValue) break;
          ticks.push({ left: ((Math.log10(value) - logStart) / (logEnd - logStart)) * 100, major: false });
        }
      }
    }

    return { segments, ticks };
  }

  function renderQualityPreview() {
    const qualityBands = buildQualityCatalogBands();
    const domainMax = buildQualityDomainMax(qualityBands);
    const bandMaxCount = Math.max(...QUALITIES.flatMap((quality) => (qualityBands[quality] || []).map((item) => item.count)), 0, 1);
    const qualityOrder = ["圣", "天", "地", "玄", "黄", "凡"];
    const qualityTicks = Array.from({ length: Math.max(1, domainMax / 10) + 1 }, (_, i) => i * 10);
    const simulatedTotalCount = Math.max(1, simulation?.totalPlaced || 0);

    return (
      <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
        <p className="text-amber-100">品质预览</p>
        <div className="mt-3 rounded-xl border border-white/10 bg-slate-950/35 p-3">
          <div className="space-y-3">
            {qualityOrder.map((quality) => {
              const items = qualityBands[quality] || [];
              const qualityTotalCount = items.reduce((sum, item) => sum + item.count, 0);
              const qualityProbability = simulatedTotalCount > 0 ? ((qualityTotalCount / simulatedTotalCount) * 100).toFixed(1) : "0.0";
              const catalogQualityCount = catalogCountByQuality[quality] || 0;
              return (
                <div key={`quality-band-${quality}`} className="grid grid-cols-[44px_minmax(0,1fr)] items-start gap-2">
                  <div className="pt-1 text-right cursor-default">
                    <div className={["text-xs font-medium", QUALITY_TEXT_COLOR[quality]].join(" ")}>{quality}</div>
                    <div className="mt-1 text-[11px] text-zinc-500">{qualityProbability}</div>
                  </div>
                  <div>
                    <div className="relative h-8 overflow-hidden rounded-md border border-white/10 bg-[rgba(15,23,42,0.18)]" style={{ width: `${(items.length / domainMax) * 100}%`, background: buildQualityBandGradient(items, bandMaxCount) }} />
                    <div className="relative h-4 border-t border-white/10">
                      {qualityTicks.map((tick) => {
                        const isMajor = tick % 20 === 0;
                        const showLabel = quality === "凡" && isMajor;
                        return (
                          <div key={`quality-axis-${quality}-${tick}`} className="absolute top-0" style={{ left: `${(tick / domainMax) * 100}%` }}>
                            <div className={["w-px", isMajor ? "h-2 bg-white/35" : "h-1.5 bg-white/22"].join(" ")} />
                            {showLabel ? <div className="mt-0.5 -translate-x-1/2 text-[10px] text-zinc-500">{tick}</div> : null}
                          </div>
                        );
                      })}
                    </div>
                    <div className="mt-1 text-[10px] text-zinc-500">图鉴物品：{catalogQualityCount} / {catalogTotal}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  function renderPricePreview() {
    const logHeat = buildLogHeatSegments();
    return (
      <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
        <p className="text-cyan-100">价格预览</p>
        <div className="mt-3 rounded-xl border border-white/10 bg-slate-950/35 p-3">
          <div className="relative h-4 overflow-hidden bg-[rgba(15,23,42,0.18)]">
            {logHeat.segments.map((segment, index) => (
              <div key={`log-heat-segment-${index}`} className="absolute top-0 bottom-0" style={{ left: `${segment.left}%`, width: `${segment.width}%`, background: segment.color }} />
            ))}
          </div>
          <div className="relative h-5 border-t border-white/10">
            {logHeat.ticks.map((tick, index) => (
              <div key={`log-axis-${index}`} className="absolute top-0" style={{ left: `${tick.left}%` }}>
                <div className={["w-px", tick.major ? "h-2 bg-white/35" : "h-1.5 bg-white/22"].join(" ")} />
                {tick.major && tick.label ? <div className="mt-0.5 -translate-x-1/2 whitespace-nowrap text-[10px] text-zinc-500">{tick.label}</div> : null}
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-5 rounded-2xl border border-white/10 bg-black/20 p-4">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-cyan-100">模拟预览</p>
        {actions ? <div className="flex flex-wrap items-center justify-end gap-2">{actions}</div> : null}
      </div>
      <div className="grid gap-4 xl:grid-cols-[1fr_1fr]">
        <div className="rounded-2xl border border-white/10 bg-slate-950/35 p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <p className="text-cyan-100">形状预览</p>
          </div>
          <div>
            <div className="grid grid-cols-[40px_repeat(10,minmax(0,1fr))] gap-1 text-center text-[10px] text-zinc-400">
              <div />
              {Array.from({ length: 10 }, (_, index) => (<div key={`shape-col-${index + 1}`} className="py-1">{index + 1}</div>))}
            </div>
            <div className="mt-1 grid gap-1">
              {Array.from({ length: 10 }, (_, rowIndex) => {
                const h = rowIndex + 1;
                return (
                  <div key={`shape-row-${h}`} className="grid grid-cols-[40px_repeat(10,minmax(0,1fr))] gap-1">
                    <div className="flex items-center justify-center text-[10px] text-zinc-400">{h}</div>
                    {Array.from({ length: 10 }, (_, colIndex) => {
                      const w = colIndex + 1;
                      const key = `${w}x${h}`;
                      const hasCatalogItem = availableShapes.has(key);
                      const simProb = simProbabilities[key] || 0;
                      const shapeCount = simCounts[key] || 0;
                      const maxShapeCount = Math.max(...Object.values(simCounts || {}), 0, 1);
                      const active = shapeCount > 0;
                      return hasCatalogItem ? (
                        <div
                          key={`shape-cell-${key}`}
                          className="relative min-h-8 rounded-lg border border-white/6"
                          style={{
                            background: active ? getHeatColorByCount(shapeCount, maxShapeCount) : "rgba(15,23,42,0.18)",
                            boxShadow: active ? `inset 0 0 0 1px rgba(255,237,160,0.22), inset 0 0 14px rgba(220,38,38,0.18)` : "inset 0 0 0 1px rgba(255,255,255,0.03)",
                          }}
                          title={`形状 ${key}｜概率：${simulation ? simProb.toFixed(1) : "未模拟"}｜图鉴：${catalogCountByShape[key] || 0} / ${catalogTotal}`}
                        >
                          <span className="absolute inset-0 flex items-center justify-center text-[10px] font-medium" style={{ color: active ? "#07121c" : "#d4d4d8" }}>
                            {simulation && simProb > 0 ? simProb.toFixed(1) : ""}
                          </span>
                        </div>
                      ) : <div key={`shape-cell-${key}`} className="min-h-8 rounded-lg bg-transparent" />;
                    })}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
        {renderQualityPreview()}
      </div>
      <div className="mt-4">{renderPricePreview()}</div>
    </div>
  );
}
