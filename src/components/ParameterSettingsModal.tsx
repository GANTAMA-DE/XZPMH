import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

type RealmOrder = "炼气" | "筑基" | "结丹" | "元婴" | "化神" | "炼虚" | "合体" | "大乘";

type RealmCellSetting = { min: number; max: number; peak: number; spread: number };
type PricePreference = { mode: "amount" | "rank"; amountMidpoint: number; amountDecay: number; rankMidpoint: number; rankDecay: number };
type ShapeSimulationStats = {
  counts: Record<string, number>;
  probabilities: Record<string, number>;
  totalPlaced: number;
  orientationSummary: { horizontal: number; vertical: number; square: number };
  qualityPriceMap?: Record<string, number[]>;
  allPrices?: number[];
  itemCountMap?: Record<string, number>;
  priceCountMap?: Record<number, number>;
};

type ParameterSettingsForm = {
  roomName: string;
  totalRounds: number;
  initialSpiritStone: number;
  entryFee: number;
  maxPlayers: number;
  hintRounds: number[];
  multipliers: number[];
  realmProbability: Record<string, number>;
  realmCellSettings: Record<string, RealmCellSetting>;
  qualityProbability: Record<string, number>;
  pricePreference: PricePreference;
  shapeWeights: Record<string, number>;
  allowDuplicateRoles: boolean;
  showOtherSpiritStone: boolean;
  revealBidDisplay: "amount" | "rank";
};

type ParameterSettingsModalProps = {
  open: boolean;
  hasRoom: boolean;
  isHost: boolean;
  game: any;
  initialSettings: Partial<ParameterSettingsForm>;
  defaultSettings?: Partial<ParameterSettingsForm>;
  catalog: any[];
  onClose: () => void;
  onSave: (nextSettings: ParameterSettingsForm) => void;
};

function cn(...arr: Array<string | false | null | undefined>) {
  return arr.filter(Boolean).join(" ");
}

const REALM_ORDER = ["炼气", "筑基", "结丹", "元婴", "化神", "炼虚", "合体", "大乘"] as const;
const REALM_COLORS: Record<string, string> = {
  炼气: "#22c55e",
  筑基: "#84cc16",
  结丹: "#f59e0b",
  元婴: "#f97316",
  化神: "#a855f7",
  炼虚: "#6366f1",
  合体: "#06b6d4",
  大乘: "#ef4444",
};

const DEFAULT_REALM_CELL_SETTINGS: Record<string, RealmCellSetting> = {
  炼气: { min: 10, max: 60, peak: 40, spread: 1.5 },
  筑基: { min: 20, max: 80, peak: 50, spread: 1.5 },
  结丹: { min: 30, max: 100, peak: 60, spread: 1.5 },
  元婴: { min: 40, max: 120, peak: 80, spread: 1.5 },
  化神: { min: 50, max: 150, peak: 100, spread: 1.5 },
  炼虚: { min: 60, max: 200, peak: 120, spread: 1.5 },
  合体: { min: 70, max: 250, peak: 140, spread: 1.5 },
  大乘: { min: 80, max: 300, peak: 150, spread: 1.5 },
};

const DEFAULT_QUALITY_PROBABILITY: Record<string, number> = {
  凡: 20,
  黄: 20,
  玄: 20,
  地: 15,
  天: 15,
  圣: 10,
};

const DEFAULT_SHAPE_WEIGHTS = Object.fromEntries(
  Array.from({ length: 10 }, (_, h) => Array.from({ length: 10 }, (_, w) => [`${w + 1}x${h + 1}`, 1.0])).flat()
) as Record<string, number>;

const DEFAULT_REALM_PROBABILITY: Record<RealmOrder, number> = {
  炼气: 5,
  筑基: 10,
  结丹: 15,
  元婴: 20,
  化神: 20,
  炼虚: 15,
  合体: 10,
  大乘: 5,
};

const DEFAULT_PRICE_PREFERENCE: PricePreference = {
  mode: "amount",
  amountMidpoint: 200000,
  amountDecay: 0.5,
  rankMidpoint: 320,
  rankDecay: 10,
};

const DEFAULT_PARAMETER_SETTINGS: ParameterSettingsForm = {
  roomName: "",
  totalRounds: 10,
  initialSpiritStone: 500000,
  entryFee: 10000,
  maxPlayers: 6,
  hintRounds: [1, 3],
  multipliers: [2, 1.6, 1.4, 1.2, 1],
  realmProbability: { ...DEFAULT_REALM_PROBABILITY },
  realmCellSettings: cloneRealmCellSettings(DEFAULT_REALM_CELL_SETTINGS, DEFAULT_REALM_CELL_SETTINGS),
  qualityProbability: { ...DEFAULT_QUALITY_PROBABILITY },
  pricePreference: { ...DEFAULT_PRICE_PREFERENCE },
  shapeWeights: { ...DEFAULT_SHAPE_WEIGHTS },
  allowDuplicateRoles: true,
  showOtherSpiritStone: true,
  revealBidDisplay: "amount",
};

export const SHAPE_SIMULATION_RUNS = 500;

function cloneRealmCellSettings(source: Record<string, RealmCellSetting>, fallback: Record<string, RealmCellSetting>) {
  const next: Record<string, RealmCellSetting> = {};
  Object.keys(fallback).forEach((realm) => {
    const current = source?.[realm] || fallback[realm];
    next[realm] = { ...current };
  });
  return next;
}

function buildSettingsForm(
  initialSettings: Partial<ParameterSettingsForm> | undefined,
  runtimeDefaults: Partial<ParameterSettingsForm> | undefined,
  defaultRealmCellSettings: Record<string, RealmCellSetting>,
  defaultQualityProbability: Record<string, number>,
  defaultShapeWeights: Record<string, number>
): ParameterSettingsForm {
  const mergedDefaults: ParameterSettingsForm = {
    ...DEFAULT_PARAMETER_SETTINGS,
    ...(runtimeDefaults || {}),
    realmProbability: { ...DEFAULT_PARAMETER_SETTINGS.realmProbability, ...((runtimeDefaults?.realmProbability as Record<string, number> | undefined) || {}) },
    realmCellSettings: cloneRealmCellSettings((runtimeDefaults?.realmCellSettings as Record<string, RealmCellSetting> | undefined) || {}, defaultRealmCellSettings),
    qualityProbability: { ...defaultQualityProbability, ...((runtimeDefaults?.qualityProbability as Record<string, number> | undefined) || {}) },
    pricePreference: { ...DEFAULT_PARAMETER_SETTINGS.pricePreference, ...((runtimeDefaults?.pricePreference as Partial<PricePreference> | undefined) || {}) },
    shapeWeights: { ...defaultShapeWeights, ...((runtimeDefaults?.shapeWeights as Record<string, number> | undefined) || {}) },
    hintRounds: Array.isArray(runtimeDefaults?.hintRounds) ? [...runtimeDefaults.hintRounds] : [...DEFAULT_PARAMETER_SETTINGS.hintRounds],
    multipliers: Array.isArray(runtimeDefaults?.multipliers) ? [...runtimeDefaults.multipliers] : [...DEFAULT_PARAMETER_SETTINGS.multipliers],
  };

  return {
    ...mergedDefaults,
    roomName: initialSettings?.roomName ?? mergedDefaults.roomName,
    totalRounds: Number(initialSettings?.totalRounds ?? mergedDefaults.totalRounds),
    initialSpiritStone: Number(initialSettings?.initialSpiritStone ?? mergedDefaults.initialSpiritStone),
    entryFee: Number(initialSettings?.entryFee ?? mergedDefaults.entryFee),
    maxPlayers: Number(initialSettings?.maxPlayers ?? mergedDefaults.maxPlayers),
    hintRounds: Array.isArray(initialSettings?.hintRounds) ? [...initialSettings.hintRounds] : [...mergedDefaults.hintRounds],
    multipliers: Array.isArray(initialSettings?.multipliers) ? [...initialSettings.multipliers] : [...mergedDefaults.multipliers],
    realmProbability: { ...mergedDefaults.realmProbability, ...(initialSettings?.realmProbability || {}) },
    realmCellSettings: cloneRealmCellSettings(initialSettings?.realmCellSettings || {}, mergedDefaults.realmCellSettings),
    qualityProbability: { ...mergedDefaults.qualityProbability, ...(initialSettings?.qualityProbability || {}) },
    pricePreference: { ...mergedDefaults.pricePreference, ...(initialSettings?.pricePreference || {}) },
    shapeWeights: { ...mergedDefaults.shapeWeights, ...(initialSettings?.shapeWeights || {}) },
    allowDuplicateRoles: initialSettings?.allowDuplicateRoles ?? mergedDefaults.allowDuplicateRoles,
    showOtherSpiritStone: initialSettings?.showOtherSpiritStone ?? mergedDefaults.showOtherSpiritStone,
    revealBidDisplay: initialSettings?.revealBidDisplay === "rank" ? "rank" : (initialSettings?.revealBidDisplay === "amount" ? "amount" : mergedDefaults.revealBidDisplay),
  };
}

function normalizeQualityProbabilityLocally(values: Record<string, number>) {
  const total = QUALITIES.reduce((sum, quality) => sum + Math.max(0, Math.round(values[quality] ?? 0)), 0);
  if (total === 100) return values;
  const next = { ...values };
  const diff = 100 - total;
  next[QUALITIES[QUALITIES.length - 1]] = Math.max(0, Math.round(next[QUALITIES[QUALITIES.length - 1]] ?? 0) + diff);
  return next;
}

function HoverTip({
  label,
  content,
  className = "",
  side = "top",
  style,
}: {
  label: ReactNode;
  content: ReactNode;
  className?: string;
  side?: "bottom" | "top";
  style?: React.CSSProperties;
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ left: 0, top: 0, width: 320, transform: "translate(-50%, 0)" as string, ready: false });
  const anchorRef = useRef<HTMLDivElement | null>(null);
  const tipRef = useRef<HTMLDivElement | null>(null);
  const holdTimerRef = useRef<number | null>(null);
  const canHover = typeof window !== "undefined" && !!window.matchMedia?.("(hover: hover) and (pointer: fine)")?.matches;

  useEffect(() => {
    if (open) setPos((prev) => ({ ...prev, ready: false }));
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const updatePosition = () => {
      const rect = anchorRef.current?.getBoundingClientRect();
      if (!rect) return;
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      const maxWidth = Math.min(320, viewportWidth - 24);
      const centerX = rect.left + rect.width / 2;
      const left = Math.min(Math.max(centerX, maxWidth / 2 + 12), viewportWidth - maxWidth / 2 - 12);
      const tipHeight = tipRef.current?.offsetHeight || 120;
      const preferTop = side === "top";
      const topSpace = rect.top;
      const bottomSpace = viewportHeight - rect.bottom;
      const useTop = preferTop ? topSpace > tipHeight + 18 || bottomSpace < tipHeight + 18 : !(bottomSpace > tipHeight + 18) && topSpace > tipHeight + 18;
      const rawTop = useTop ? rect.top - 10 : rect.bottom + 10;
      const safeTop = useTop ? Math.max(tipHeight + 12, rawTop) : Math.min(viewportHeight - tipHeight - 12, rawTop);
      setPos({ left, top: safeTop, width: maxWidth, transform: useTop ? "translate(-50%, -100%)" : "translate(-50%, 0)", ready: true });
    };
    const closeByOutside = (event: PointerEvent) => {
      if (!anchorRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const raf = window.requestAnimationFrame(updatePosition);
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    document.addEventListener("pointerdown", closeByOutside);
    return () => {
      window.cancelAnimationFrame(raf);
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
      document.removeEventListener("pointerdown", closeByOutside);
    };
  }, [open, side, content]);

  function clearHoldTimer() {
    if (holdTimerRef.current) {
      window.clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }
  }

  function startHoldOpen() {
    if (canHover) return;
    clearHoldTimer();
    holdTimerRef.current = window.setTimeout(() => setOpen(true), 420);
  }

  return (
    <div
      ref={anchorRef}
      className={cn("relative", className)}
      style={style}
      onMouseEnter={() => canHover && setOpen(true)}
      onMouseLeave={() => canHover && setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
      onTouchStart={startHoldOpen}
      onTouchEnd={clearHoldTimer}
      onTouchCancel={clearHoldTimer}
    >
      {label}
      {open && typeof document !== "undefined" && createPortal(
        <div className="pointer-events-none fixed inset-0 z-[2147483647]">
          <div
            ref={tipRef}
            className="absolute rounded-2xl border border-white/10 bg-[#0a0f1b]/98 p-3 text-xs text-zinc-200 shadow-2xl backdrop-blur-xl"
            style={{ left: pos.left, top: pos.top, width: pos.width, maxWidth: pos.width, transform: pos.transform, opacity: pos.ready ? 1 : 0 }}
          >
            {content}
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}

const AMOUNT_AXIS_MIN = 1;
const AMOUNT_AXIS_MAX = 10000000;
const RANK_AXIS_MIN = 1;
const RANK_AXIS_MAX = 400;
const CHART_Y_TICKS = [0.2, 0.4, 0.6, 0.8, 1.0];
const PRICE_CHART_WIDTH = 400;
const PRICE_CHART_HEIGHT = 340;

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value));
}

function amountToChartRatio(price: number) {
  const minLog = Math.log10(AMOUNT_AXIS_MIN);
  const maxLog = Math.log10(AMOUNT_AXIS_MAX);
  const safe = Math.max(AMOUNT_AXIS_MIN, Math.min(AMOUNT_AXIS_MAX, price));
  return clamp01((Math.log10(safe) - minLog) / (maxLog - minLog));
}

function rankToChartRatio(rank: number) {
  const safe = Math.max(RANK_AXIS_MIN, Math.min(RANK_AXIS_MAX, rank));
  return clamp01((safe - RANK_AXIS_MIN) / (RANK_AXIS_MAX - RANK_AXIS_MIN));
}

function weightToChartY(weight: number) {
  return 100 - clamp01(weight) * 100;
}

function buildAmountPreferenceCurvePoints(midpoint: number, decay: number) {
  const points: string[] = [];
  for (let i = 0; i <= 120; i += 1) {
    const ratio = i / 120;
    const price = Math.pow(10, Math.log10(AMOUNT_AXIS_MIN) + (Math.log10(AMOUNT_AXIS_MAX) - Math.log10(AMOUNT_AXIS_MIN)) * ratio);
    const weight = 1 / (1 + Math.pow(price / Math.max(1, midpoint), Math.max(0.1, decay)));
    const x = amountToChartRatio(price) * 100;
    const y = weightToChartY(weight);
    points.push(`${x},${y}`);
  }
  return points.join(" ");
}

function buildRankPreferenceCurvePoints(midpoint: number, decay: number) {
  const points: string[] = [];
  for (let i = 0; i <= 120; i += 1) {
    const rank = RANK_AXIS_MIN + ((RANK_AXIS_MAX - RANK_AXIS_MIN) / 120) * i;
    const weight = 1 / (1 + Math.pow(rank / Math.max(1, midpoint), Math.max(0.1, decay)));
    const x = rankToChartRatio(rank) * 100;
    const y = weightToChartY(weight);
    points.push(`${x},${y}`);
  }
  return points.join(" ");
}

function buildAmountAxisTicks() {
  const labels = [1, 10, 100, 1000, 10000, 100000, 1000000, 10000000];
  return labels.map((value) => ({ value, ratio: amountToChartRatio(value), label: value >= 10000 ? `${value / 10000}万` : String(value) }));
}

function buildRankAxisTicks() {
  const labels = [0, 50, 100, 150, 200, 250, 300, 350, 400];
  return labels.map((value) => ({ value, ratio: clamp01(value / 400), label: String(value) }));
}

const SHAPE_WEIGHT_COLOR_STEPS = Array.from({ length: 100 }, (_, index) => {
  const ratio = index / 99;
  const hue = 220 - 205 * ratio;
  const saturation = 86;
  const lightness = 20 + ratio * 46;
  return `hsl(${hue} ${saturation}% ${lightness}%)`;
});

const QUALITIES = ["凡", "黄", "玄", "地", "天", "圣"] as const;
const QUALITY_TEXT_COLOR: Record<string, string> = {
  圣: "text-red-300",
  天: "text-orange-300",
  地: "text-fuchsia-300",
  玄: "text-sky-300",
  黄: "text-emerald-300",
  凡: "text-slate-300",
};
const QUALITY_BAR_BG: Record<string, string> = {
  凡: "rgba(100,116,139,0.22)",
  黄: "rgba(16,185,129,0.22)",
  玄: "rgba(14,165,233,0.22)",
  地: "rgba(217,70,239,0.22)",
  天: "rgba(249,115,22,0.22)",
  圣: "rgba(239,68,68,0.22)",
};
const QUALITY_HEX: Record<string, string> = {
  凡: "#94a3b8",
  黄: "#34d399",
  玄: "#38bdf8",
  地: "#d946ef",
  天: "#fb923c",
  圣: "#f87171",
};

function getShapeWeightStepIndex(value: number) {
  return Math.max(0, Math.min(99, Math.round(Math.max(0, Math.min(9.9, value)) * 10)));
}

function getShapeWeightColor(value: number) {
  return SHAPE_WEIGHT_COLOR_STEPS[getShapeWeightStepIndex(value)];
}

function getShapeWeightTextColor(value: number) {
  return getShapeWeightStepIndex(value) >= 56 ? "#07121c" : "#eff6ff";
}

function buildRealmHistogramData(config: { min: number; max: number; peak: number; spread: number }) {
  const bins = 30;
  const step = 10;
  const nearestBoundaryDistance = Math.min(Math.max(1, config.peak - config.min), Math.max(1, config.max - config.peak));
  const stdDev = Math.max(1, nearestBoundaryDistance / Math.max(0.1, config.spread));
  const values = Array.from({ length: bins }, (_, i) => {
    const binEnd = (i + 1) * step;
    const x = binEnd - 5;
    const z = (x - config.peak) / stdDev;
    const y = Math.exp(-0.5 * z * z);
    return { x, y, label: `${binEnd - 9}-${binEnd}`, binEnd };
  });
  const maxY = Math.max(...values.map((v) => v.y), 1);
  return values.map((v) => ({ label: v.label, value: v.y / maxY, binEnd: v.binEnd }));
}

const GRID_W = 10;
const GRID_H = 30;

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
            className={cn(
              "px-3 py-1.5 text-sm text-cyan-100 hover:bg-cyan-500/10 hover:text-cyan-50",
              index !== counts.length - 1 ? "border-r border-white/10" : ""
            )}
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

function QualityProbabilityEditor({
  values,
  locks,
  onBoundaryShift,
  onLockedSegmentShift,
  onToggleLock,
  cn,
}: {
  values: Record<string, number>;
  locks: Record<string, boolean>;
  onBoundaryShift: (leftQuality: string, rightQuality: string, delta: number) => void;
  onLockedSegmentShift: (prevQuality: string, nextQuality: string, delta: number) => void;
  onToggleLock: (quality: string) => void;
  cn: (...arr: Array<string | false | null | undefined>) => string;
}) {
  const barRef = useRef<HTMLDivElement | null>(null);
  const dragMovedRef = useRef(false);
  const dragResetTimerRef = useRef<number | null>(null);
  const [segmentTip, setSegmentTip] = useState<null | {
    quality: string;
    width: number;
    locked: boolean;
    x: number;
    y: number;
    draggable?: boolean;
  }>(null);
  const dragRef = useRef<
    | null
    | { mode: "boundary"; left: string; right: string; lastPercent: number }
    | { mode: "segment"; prev: string; lockedQuality: string; next: string; lastPercent: number }
  >(null);

  let accumulated = 0;
  const segments = QUALITIES.map((quality) => {
    const width = Math.max(0, Math.round(values[quality] ?? 0));
    const start = accumulated;
    accumulated += width;
    return { quality, width, start, end: accumulated };
  });

  function findUnlockedToLeft(index: number) {
    for (let i = index; i >= 0; i -= 1) {
      if (!locks[QUALITIES[i]]) return QUALITIES[i];
    }
    return null;
  }

  function findUnlockedToRight(index: number) {
    for (let i = index; i < QUALITIES.length; i += 1) {
      if (!locks[QUALITIES[i]]) return QUALITIES[i];
    }
    return null;
  }

  function findPrevUnlockedIndex(startIndex: number) {
    const len = QUALITIES.length;
    for (let step = 0; step < len; step += 1) {
      const i = (startIndex - step + len) % len;
      if (!locks[QUALITIES[i]]) return i;
    }
    return -1;
  }

  function findNextUnlockedIndex(startIndex: number) {
    const len = QUALITIES.length;
    for (let step = 0; step < len; step += 1) {
      const i = (startIndex + step) % len;
      if (!locks[QUALITIES[i]]) return i;
    }
    return -1;
  }

  useEffect(() => {
    const onMove = (event: PointerEvent) => {
      const drag = dragRef.current;
      const bar = barRef.current;
      if (!drag || !bar) return;
      const rect = bar.getBoundingClientRect();
      const raw = ((event.clientX - rect.left) / rect.width) * 100;
      const percent = Math.max(0, Math.min(100, raw));
      const sensitivity = 1.6;
      const rawDelta = Math.round((drag.lastPercent - percent) / sensitivity);
      const delta = rawDelta === 0 ? 0 : rawDelta > 0 ? 1 : -1;
      if (delta === 0) return;
      dragMovedRef.current = true;
      if (drag.mode === "boundary") onBoundaryShift(drag.left, drag.right, delta);
      else onLockedSegmentShift(drag.prev, drag.next, delta);
      drag.lastPercent = percent;
    };
    const onUp = () => {
      dragRef.current = null;
      if (dragResetTimerRef.current) window.clearTimeout(dragResetTimerRef.current);
      dragResetTimerRef.current = window.setTimeout(() => {
        dragMovedRef.current = false;
        dragResetTimerRef.current = null;
      }, 80);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [onBoundaryShift, onLockedSegmentShift]);

  return (
    <div className="rounded-2xl border border-white/10 bg-black/20 p-4 select-none" style={{ userSelect: "none", WebkitUserSelect: "none" }}>
      <p className="inline-flex text-cyan-100">品质权重</p>
      <div ref={barRef} className="relative mt-4 overflow-hidden rounded-2xl border border-white/10 bg-slate-950/70">
        <div className="relative flex h-16 w-full overflow-hidden">
          {segments.map((segment, index) => {
            const locked = Boolean(locks[segment.quality]);
            const prevUnlockedIndex = findPrevUnlockedIndex(index - 1);
            const nextUnlockedIndex = findNextUnlockedIndex(index + 1);
            const canDragLocked = locked && prevUnlockedIndex >= 0 && nextUnlockedIndex >= 0;
            const showName = segment.width >= 9;
            const showValue = segment.width >= 5;
            const leftNeighborLocked = index > 0 ? Boolean(locks[QUALITIES[index - 1]]) : false;
            const rightNeighborLocked = index < QUALITIES.length - 1 ? Boolean(locks[QUALITIES[index + 1]]) : false;
            return (
              <div
                key={`quality-segment-${segment.quality}`}
                className={cn(
                  "relative mx-[1px] my-[1px] flex h-[calc(100%-2px)] items-center justify-center rounded-2xl text-center transition",
                  QUALITY_TEXT_COLOR[segment.quality],
                  index !== QUALITIES.length - 1 && !(locked || rightNeighborLocked || leftNeighborLocked) ? "border-r border-white/10" : "",
                  locked ? "ring-2 ring-inset ring-amber-300/70" : ""
                )}
                style={{ width: `${segment.width}%`, background: QUALITY_BAR_BG[segment.quality], minWidth: segment.width > 0 ? 10 : 0, cursor: canDragLocked ? "grab" : "pointer" }}
                onPointerDown={() => {
                  dragMovedRef.current = false;
                  if (!canDragLocked) return;
                  dragRef.current = {
                    mode: "segment",
                    prev: QUALITIES[prevUnlockedIndex],
                    lockedQuality: segment.quality,
                    next: QUALITIES[nextUnlockedIndex],
                    lastPercent: segment.start + segment.width / 2,
                  };
                }}
                onClick={() => {
                  if (dragMovedRef.current) return;
                  onToggleLock(segment.quality);
                }}
                onMouseEnter={(e) => {
                  const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
                  setSegmentTip({ quality: segment.quality, width: segment.width, locked, x: rect.left + rect.width / 2, y: rect.top, draggable: canDragLocked });
                }}
                onMouseMove={(e) => {
                  const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
                  setSegmentTip({ quality: segment.quality, width: segment.width, locked, x: rect.left + rect.width / 2, y: rect.top, draggable: canDragLocked });
                }}
                onMouseLeave={() => setSegmentTip(null)}
              >
                <div className="pointer-events-none px-1 leading-tight">
                  {showName ? <div className="truncate text-[11px] font-semibold">{segment.quality}</div> : null}
                  {showValue ? <div className="text-[11px] font-semibold">{segment.width}</div> : null}
                </div>
              </div>
            );
          })}
        </div>

        {QUALITIES.map((quality, index) => {
          const boundary = segments[index].end;
          const rightIndex = index + 1;
          const rightQuality = QUALITIES[rightIndex];
          if (!rightQuality) return null;
          const leftAffected = findUnlockedToLeft(index);
          const rightAffected = findUnlockedToRight(rightIndex);
          const disabled = !leftAffected || !rightAffected || leftAffected === rightAffected;
          const left = `${boundary}%`;
          const hideLeftArrow = locks[quality];
          const hideRightArrow = locks[rightQuality];
          if (hideLeftArrow && hideRightArrow) return null;
          return (
            <div
              key={`quality-boundary-${quality}`}
              className={cn("absolute top-0 bottom-0 z-20 w-10 -translate-x-1/2", disabled ? "cursor-not-allowed opacity-30" : "cursor-col-resize")}
              style={{ left }}
              onPointerDown={() => {
                if (disabled || !leftAffected || !rightAffected) return;
                dragRef.current = { mode: "boundary", left: leftAffected, right: rightAffected, lastPercent: boundary };
              }}
            >
              <div className="absolute inset-0 flex items-center justify-center gap-1">
                {!hideLeftArrow ? (
                  <button
                    type="button"
                    className="select-none text-sm leading-none"
                    style={{ color: QUALITY_HEX[rightAffected || rightQuality], userSelect: "none", WebkitUserSelect: "none" }}
                    title={leftAffected && rightAffected ? `点击调整 ${leftAffected}-1 / ${rightAffected}+1` : "不可调整"}
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (!leftAffected || !rightAffected) return;
                      onBoundaryShift(leftAffected, rightAffected, 1);
                    }}
                  >
                    ◀
                  </button>
                ) : <span className="w-3" />}
                {!hideRightArrow ? (
                  <button
                    type="button"
                    className="select-none text-sm leading-none"
                    style={{ color: QUALITY_HEX[leftAffected || quality], userSelect: "none", WebkitUserSelect: "none" }}
                    title={leftAffected && rightAffected ? `点击调整 ${leftAffected}+1 / ${rightAffected}-1` : "不可调整"}
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (!leftAffected || !rightAffected) return;
                      onBoundaryShift(leftAffected, rightAffected, -1);
                    }}
                  >
                    ▶
                  </button>
                ) : <span className="w-3" />}
              </div>
            </div>
          );
        })}
      </div>

      {segmentTip && (
        <div className="pointer-events-none fixed inset-0 z-[2147483647]">
          <div
            className="absolute rounded-2xl border border-white/10 bg-[#0a0f1b]/98 p-3 text-xs text-zinc-200 shadow-2xl backdrop-blur-xl"
            style={{
              width: Math.min(320, window.innerWidth - 24),
              left: Math.min(Math.max(segmentTip.x, Math.min(320, window.innerWidth - 24) / 2 + 12), window.innerWidth - Math.min(320, window.innerWidth - 24) / 2 - 12),
              top: segmentTip.y > 140 ? segmentTip.y - 10 : segmentTip.y + 24,
              transform: segmentTip.y > 140 ? "translate(-50%, -100%)" : "translate(-50%, 0)",
            }}
          >
            <p className={cn("font-semibold", QUALITY_TEXT_COLOR[segmentTip.quality])}>{segmentTip.quality}</p>
            <p className="mt-1 text-zinc-300">权重：{Math.round(segmentTip.width || 0)}</p>
            <p className="mt-1 text-zinc-300">状态：{segmentTip.locked ? "已锁定" : "未锁定"}</p>
            <p className="mt-1 text-zinc-400">点击可{segmentTip.locked ? "解锁" : "锁定"}{segmentTip.locked && segmentTip.draggable ? "；可整体拖动" : ""}</p>
          </div>
        </div>
      )}
    </div>
  );
}

function RealmProbabilityEditor({
  values,
  locks,
  onBoundaryShift,
  onLockedSegmentShift,
  onToggleLock,
  realmOrder,
  realmColors,
}: {
  values: Record<string, number>;
  locks: Record<string, boolean>;
  onBoundaryShift: (leftRealm: RealmOrder, rightRealm: RealmOrder, delta: number) => void;
  onLockedSegmentShift: (prevRealm: RealmOrder, nextRealm: RealmOrder, delta: number) => void;
  onToggleLock: (realm: string) => void;
  realmOrder: readonly RealmOrder[];
  realmColors: Record<string, string>;
}) {
  const donutRef = useRef<HTMLDivElement | null>(null);
  const [segmentTip, setSegmentTip] = useState<null | {
    realm: string;
    width: number;
    locked: boolean;
    x: number;
    y: number;
    draggable?: boolean;
  }>(null);
  const dragMovedRef = useRef(false);
  const dragResetTimerRef = useRef<number | null>(null);
  const dragRef = useRef<
    | null
    | {
        mode: "boundary";
        left: RealmOrder;
        right: RealmOrder;
        leftStart: number;
        total: number;
        lastPercent: number;
      }
    | {
        mode: "segment";
        prev: RealmOrder;
        lockedRealm: RealmOrder;
        next: RealmOrder;
        groupStart: number;
        lockedWidth: number;
        movableTotal: number;
        lastPercent: number;
      }
  >(null);
  const size = 460;
  const radius = 176;
  const strokeWidth = 66;
  const center = size / 2;

  let accumulated = 0;
  const segments = realmOrder.map((realm) => {
    const width = values[realm] || 0;
    const start = accumulated;
    accumulated += width;
    return { realm, width, start, end: accumulated };
  });

  function findUnlockedToLeft(index: number) {
    for (let i = index; i >= 0; i -= 1) {
      if (!locks[realmOrder[i]]) return realmOrder[i];
    }
    return null;
  }

  function findUnlockedToRight(index: number) {
    for (let i = index; i < realmOrder.length; i += 1) {
      if (!locks[realmOrder[i]]) return realmOrder[i];
    }
    return null;
  }

  function findPrevUnlockedIndex(startIndex: number) {
    const len = realmOrder.length;
    for (let step = 0; step < len; step += 1) {
      const i = (startIndex - step + len) % len;
      if (!locks[realmOrder[i]]) return i;
    }
    return -1;
  }

  function findNextUnlockedIndex(startIndex: number) {
    const len = realmOrder.length;
    for (let step = 0; step < len; step += 1) {
      const i = (startIndex + step) % len;
      if (!locks[realmOrder[i]]) return i;
    }
    return -1;
  }

  function percentToAngle(percent: number) {
    return (percent / 100) * Math.PI * 2 - Math.PI / 2;
  }

  function pointOnCircle(percent: number, r = radius) {
    const angle = percentToAngle(percent);
    return { x: center + Math.cos(angle) * r, y: center + Math.sin(angle) * r };
  }

  function arcPath(startPercent: number, endPercent: number) {
    const start = pointOnCircle(startPercent);
    const end = pointOnCircle(endPercent);
    const largeArc = endPercent - startPercent > 50 ? 1 : 0;
    return `M ${start.x} ${start.y} A ${radius} ${radius} 0 ${largeArc} 1 ${end.x} ${end.y}`;
  }

  function buildBoundaryCursor(angleDeg: number) {
    const normalized = ((Math.round(angleDeg) % 360) + 360) % 360;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32"><g transform="translate(16 16) rotate(${normalized})"><line x1="-9" y1="0" x2="9" y2="0" stroke="rgba(226,232,240,0.95)" stroke-width="1.8" stroke-linecap="round"/><path d="M -12 0 L -7 -4 L -7 4 Z" fill="rgba(226,232,240,0.95)"/><path d="M 12 0 L 7 -4 L 7 4 Z" fill="rgba(226,232,240,0.95)"/></g></svg>`;
    return `url("data:image/svg+xml;utf8,${encodeURIComponent(svg)}") 16 16, col-resize`;
  }

  useEffect(() => {
    const onMove = (event: PointerEvent) => {
      const drag = dragRef.current;
      const donut = donutRef.current;
      if (!drag || !donut) return;
      const rect = donut.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const dx = event.clientX - cx;
      const dy = event.clientY - cy;
      let angle = Math.atan2(dy, dx) + Math.PI / 2;
      if (angle < 0) angle += Math.PI * 2;
      const percent = (angle / (Math.PI * 2)) * 100;

      const dragSensitivity = 2.5;
      if (drag.mode === "boundary") {
        let normalizedPercent = percent;
        const diff = normalizedPercent - drag.lastPercent;
        if (diff > 50) normalizedPercent -= 100;
        if (diff < -50) normalizedPercent += 100;
        const rawDelta = Math.round((drag.lastPercent - normalizedPercent) / dragSensitivity);
        const delta = rawDelta === 0 ? 0 : rawDelta > 0 ? 1 : -1;
        if (delta !== 0) {
          dragMovedRef.current = true;
          onBoundaryShift(drag.left, drag.right, delta);
          drag.lastPercent = normalizedPercent;
        }
        return;
      }

      let normalizedPercent = percent;
      const diff = normalizedPercent - drag.lastPercent;
      if (diff > 50) normalizedPercent -= 100;
      if (diff < -50) normalizedPercent += 100;
      const rawDelta = Math.round((drag.lastPercent - normalizedPercent) / dragSensitivity);
      const delta = rawDelta === 0 ? 0 : rawDelta > 0 ? 1 : -1;
      if (delta !== 0) {
        dragMovedRef.current = true;
        onLockedSegmentShift(drag.prev, drag.next, delta);
        drag.lastPercent = normalizedPercent;
      }
    };
    const onUp = () => {
      dragRef.current = null;
      if (dragResetTimerRef.current) window.clearTimeout(dragResetTimerRef.current);
      dragResetTimerRef.current = window.setTimeout(() => {
        dragMovedRef.current = false;
        dragResetTimerRef.current = null;
      }, 80);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [onBoundaryShift, onLockedSegmentShift, values]);

  return (
    <div className="h-full rounded-2xl border border-white/10 bg-slate-950/50 p-4 text-sm text-zinc-300">
      <p className="mb-4 text-amber-100">境界权重</p>
      <div className="flex flex-col items-center gap-3">
        <div ref={donutRef} className="relative mx-auto flex h-[460px] w-full max-w-[460px] items-center justify-center rounded-full">
          <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="overflow-visible">
            <circle cx={center} cy={center} r={radius} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={strokeWidth} />
            {segments.map((segment) => {
              const locked = Boolean(locks[segment.realm]);
              const showRealmText = (segment.width || 0) >= 10;
              const midPercent = segment.start + segment.width / 2;
              const labelPos = pointOnCircle(midPercent, radius);
              const interactiveStrokeWidth = strokeWidth + 18;
              return (
                <g key={`realm-segment-${segment.realm}`}>
                  <path d={arcPath(segment.start, segment.end)} fill="none" stroke={realmColors[segment.realm]} strokeWidth={strokeWidth} strokeLinecap="butt" />
                  <path
                    d={arcPath(segment.start, segment.end)}
                    fill="none"
                    stroke="transparent"
                    strokeWidth={interactiveStrokeWidth}
                    strokeLinecap="butt"
                    style={{ cursor: "pointer" }}
                    onClick={() => onToggleLock(segment.realm)}
                    onMouseEnter={(e) => {
                      const rect = (e.currentTarget as SVGPathElement).getBoundingClientRect();
                      setSegmentTip({ realm: segment.realm, width: segment.width || 0, locked, x: rect.left + rect.width / 2, y: rect.top, draggable: Boolean(locks[segment.realm]) });
                    }}
                    onMouseMove={(e) => {
                      const rect = (e.currentTarget as SVGPathElement).getBoundingClientRect();
                      setSegmentTip({ realm: segment.realm, width: segment.width || 0, locked, x: rect.left + rect.width / 2, y: rect.top, draggable: Boolean(locks[segment.realm]) });
                    }}
                    onMouseLeave={() => setSegmentTip(null)}
                  />
                  <foreignObject x={labelPos.x - 28} y={labelPos.y - 22} width={56} height={44} style={{ pointerEvents: "none", overflow: "visible" }}>
                    <div className="flex h-full w-full flex-col items-center justify-center text-center leading-tight text-white">
                      {showRealmText ? <span className="max-w-full truncate text-[10px] font-semibold">{segment.realm}</span> : null}
                      {Math.round(segment.width || 0) > 0 ? <span className="text-[12px] font-semibold">{Math.round(segment.width || 0)}</span> : null}
                    </div>
                  </foreignObject>
                </g>
              );
            })}

            {realmOrder.map((realm, index) => {
              if (!locks[realm]) return null;
              const prevIndex = findPrevUnlockedIndex(index - 1);
              const nextIndex = findNextUnlockedIndex(index + 1);
              const segment = segments[index];
              const canDrag = prevIndex >= 0 && nextIndex >= 0;
              return (
                <g key={`locked-highlight-${realm}`}>
                  <path d={arcPath(segment.start, segment.end)} fill="none" stroke="rgba(250,204,21,0.18)" strokeWidth={strokeWidth + 14} strokeLinecap="butt" />
                  <path d={arcPath(segment.start, segment.end)} fill="none" stroke="rgba(250,204,21,0.95)" strokeWidth={5} strokeDasharray="8 7" strokeLinecap="butt" />
                  <path
                    d={arcPath(segment.start, segment.end)}
                    fill="none"
                    stroke="transparent"
                    strokeWidth={strokeWidth + 22}
                    strokeLinecap="butt"
                    style={{ cursor: canDrag ? "grab" : "pointer" }}
                    onPointerDown={() => {
                      dragMovedRef.current = false;
                      if (!canDrag) return;
                      dragRef.current = {
                        mode: "segment",
                        prev: realmOrder[prevIndex],
                        lockedRealm: realm,
                        next: realmOrder[nextIndex],
                        groupStart: segments[prevIndex].start,
                        lockedWidth: values[realm] || 0,
                        movableTotal: (values[realmOrder[prevIndex]] || 0) + (values[realmOrder[nextIndex]] || 0),
                        lastPercent: segment.start + segment.width / 2,
                      };
                    }}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (dragMovedRef.current) return;
                      onToggleLock(realm);
                    }}
                    onMouseEnter={(e) => {
                      const rect = (e.currentTarget as SVGPathElement).getBoundingClientRect();
                      setSegmentTip({ realm: segment.realm, width: segment.width || 0, locked: true, x: rect.left + rect.width / 2, y: rect.top, draggable: canDrag });
                    }}
                    onMouseMove={(e) => {
                      const rect = (e.currentTarget as SVGPathElement).getBoundingClientRect();
                      setSegmentTip({ realm: segment.realm, width: segment.width || 0, locked: true, x: rect.left + rect.width / 2, y: rect.top, draggable: canDrag });
                    }}
                    onMouseLeave={() => setSegmentTip(null)}
                  />
                </g>
              );
            })}
          {realmOrder.map((realm, index) => {
            const boundary = segments[index].end;
            const rightIndex = (index + 1) % realmOrder.length;
            const rightRealm = realmOrder[rightIndex];
            const leftAffected = findUnlockedToLeft(index);
            const rightAffected = findUnlockedToRight(rightIndex);
            const disabled = !leftAffected || !rightAffected || leftAffected === rightAffected;
            const angle = percentToAngle(boundary);
            const pos = pointOnCircle(boundary, radius);
            const hideLeftArrow = locks[realm];
            const hideRightArrow = locks[rightRealm];
            if (hideLeftArrow && hideRightArrow) return null;
            const tangentX = -Math.sin(angle);
            const tangentY = Math.cos(angle);
            const radialX = Math.cos(angle);
            const radialY = Math.sin(angle);
            const rotationDeg = (angle * 180) / Math.PI + 90;
            const arrowOffset = 11;
            const leftArrow = { x: pos.x - tangentX * arrowOffset, y: pos.y - tangentY * arrowOffset };
            const rightArrow = { x: pos.x + tangentX * arrowOffset, y: pos.y + tangentY * arrowOffset };
            const lineHalf = strokeWidth / 2 + 20;
            const dragLineStart = { x: pos.x - radialX * lineHalf, y: pos.y - radialY * lineHalf };
            const dragLineEnd = { x: pos.x + radialX * lineHalf, y: pos.y + radialY * lineHalf };
            const trianglePath = "M -5 -4 L -5 4 L 5 0 Z";
            return (
              <g key={`ring-divider-${realm}`}>
                <line
                  x1={dragLineStart.x}
                  y1={dragLineStart.y}
                  x2={dragLineEnd.x}
                  y2={dragLineEnd.y}
                  stroke="transparent"
                  strokeWidth={28}
                  strokeLinecap="round"
                  style={{ cursor: disabled ? "not-allowed" : buildBoundaryCursor(rotationDeg), opacity: disabled ? 0.3 : 1 }}
                  onPointerDown={() => {
                    if (disabled || !leftAffected || !rightAffected) return;
                    dragRef.current = {
                      mode: "boundary",
                      left: leftAffected as RealmOrder,
                      right: rightAffected as RealmOrder,
                      leftStart: segments.find((s) => s.realm === leftAffected)?.start || 0,
                      total: (values[leftAffected] || 0) + (values[rightAffected] || 0),
                      lastPercent: boundary,
                    };
                  }}
                />
                {!hideLeftArrow ? (
                  <g
                    transform={`translate(${leftArrow.x} ${leftArrow.y}) rotate(${rotationDeg + 180})`}
                    style={{ cursor: disabled ? "not-allowed" : buildBoundaryCursor(rotationDeg), opacity: disabled ? 0.3 : 1 }}
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (disabled || !leftAffected || !rightAffected) return;
                      onBoundaryShift(leftAffected, rightAffected, 1);
                    }}
                  >
                    <circle cx="0" cy="0" r="10" fill="transparent" />
                    <path d={trianglePath} fill={realmColors[rightAffected || rightRealm]} />
                  </g>
                ) : null}
                {!hideRightArrow ? (
                  <g
                    transform={`translate(${rightArrow.x} ${rightArrow.y}) rotate(${rotationDeg})`}
                    style={{ cursor: disabled ? "not-allowed" : buildBoundaryCursor(rotationDeg), opacity: disabled ? 0.3 : 1 }}
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (disabled || !leftAffected || !rightAffected) return;
                      onBoundaryShift(leftAffected, rightAffected, -1);
                    }}
                  >
                    <circle cx="0" cy="0" r="10" fill="transparent" />
                    <path d={trianglePath} fill={realmColors[leftAffected || realm]} />
                  </g>
                ) : null}
              </g>
            );
          })}
          </svg>

          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
            <p className="text-5xl font-semibold text-amber-100">100</p>
          </div>
        </div>

        {segmentTip && (
          <div className="pointer-events-none fixed inset-0 z-[2147483647]">
            <div
              className="absolute rounded-2xl border border-white/10 bg-[#0a0f1b]/98 p-3 text-xs text-zinc-200 shadow-2xl backdrop-blur-xl"
              style={{
                width: Math.min(320, window.innerWidth - 24),
                left: Math.min(
                  Math.max(segmentTip.x, Math.min(320, window.innerWidth - 24) / 2 + 12),
                  window.innerWidth - Math.min(320, window.innerWidth - 24) / 2 - 12
                ),
                top: segmentTip.y > 140 ? segmentTip.y - 10 : segmentTip.y + 24,
                transform: segmentTip.y > 140 ? "translate(-50%, -100%)" : "translate(-50%, 0)",
              }}
            >
              <p className="text-amber-100">{segmentTip.realm}</p>
              <p className="mt-1 text-zinc-300">权重：{Math.round(segmentTip.width || 0)}</p>
              <p className="mt-1 text-zinc-300">状态：{segmentTip.locked ? "已锁定" : "未锁定"}</p>
              <p className="mt-1 text-zinc-400">点击可{segmentTip.locked ? "解锁" : "锁定"}该境界{segmentTip.locked ? (segmentTip.draggable ? "；可整体拖动" : "") : ""}</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function ShapeWeightEditor({
  value,
  catalog,
  onChange,
}: {
  value: Record<string, number>;
  catalog: any[];
  onChange: (shape: string, next: number) => void;
}) {
  const availableShapes = useMemo(() => new Set((catalog || []).map((item: any) => `${item.width}x${item.height}`)), [catalog]);

  return (
    <div className="h-full rounded-2xl border border-white/10 bg-black/20 p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <HoverTip
          side="top"
          content={<><p className="text-cyan-100">形状权重</p><p className="mt-1 text-zinc-300">控制不同形状物品在模拟储物袋中被抽中的倾向。</p><p className="mt-1 text-zinc-400">范围 0.0 - 9.9</p></>}
          label={<p className="cursor-help text-cyan-100">形状权重</p>}
        />
      </div>
      <div>
        <div className="grid grid-cols-[36px_repeat(10,minmax(0,1fr))] gap-1 text-center text-[10px] text-zinc-400">
          <div />
          {Array.from({ length: 10 }, (_, index) => (
            <div key={`shape-weight-col-${index + 1}`} className="py-1">{index + 1}</div>
          ))}
        </div>
        <div className="mt-1 grid gap-1">
          {Array.from({ length: 10 }, (_, rowIndex) => {
            const h = rowIndex + 1;
            return (
              <div key={`shape-weight-row-${h}`} className="grid grid-cols-[36px_repeat(10,minmax(0,1fr))] gap-1">
                <div className="flex items-center justify-center text-[10px] text-zinc-400">{h}</div>
                {Array.from({ length: 10 }, (_, colIndex) => {
                  const w = colIndex + 1;
                  const key = `${w}x${h}`;
                  const hasCatalogItem = availableShapes.has(key);
                  const cellValue = Math.max(0, Math.min(9.9, Number(value[key] ?? 1) || 0));
                  const cellColor = getShapeWeightColor(cellValue);
                  const cellTextColor = getShapeWeightTextColor(cellValue);
                  return hasCatalogItem ? (
                    <input
                      key={`shape-weight-cell-${key}`}
                      type="number"
                      min={0}
                      max={9.9}
                      step={0.1}
                      value={cellValue.toFixed(1)}
                      onChange={(e) => onChange(key, Number(e.target.value) || 0)}
                      className="h-9 w-full appearance-none rounded-lg border px-0 text-center text-[11px] font-medium [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                      style={{
                        color: cellTextColor,
                        background: cellColor,
                        borderColor: "rgba(255,255,255,0.14)",
                        boxShadow: `inset 0 0 0 1px ${cellColor}, 0 0 0 1px rgba(255,255,255,0.04)`,
                      }}
                    />
                  ) : (
                    <div key={`shape-weight-cell-${key}`} className="flex h-9 w-full items-center justify-center rounded-lg border border-rose-400/35 bg-rose-500/10 text-sm font-semibold text-rose-300">×</div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
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
  cn,
}: {
  simulation?: ShapeSimulationStats | null;
  catalog: any[];
  actions?: ReactNode;
  cn: (...arr: Array<string | false | null | undefined>) => string;
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
        <HoverTip
          side="top"
          content={simulation ? <><p className="text-amber-100">品质预览</p><p className="mt-1 text-zinc-300">按图鉴固定物品顺序绘制：同品质内按价格从低到高排列，每个小格对应一个图鉴物品，颜色表示该物品在模拟中出现的次数。</p><p className="mt-1 text-zinc-400">左侧数值为当前品质在模拟中出现总数 / 模拟中出现物品总数 的占比，不带 %。</p></> : <><p className="text-amber-100">品质预览</p><p className="mt-1 text-zinc-400">请先点击模拟次数生成结果。</p></>}
          label={<p className="cursor-help text-amber-100">品质预览</p>}
        />
        <div className="mt-3 rounded-xl border border-white/10 bg-slate-950/35 p-3">
          <div className="space-y-3">
            {qualityOrder.map((quality) => {
              const items = qualityBands[quality] || [];
              const qualityTotalCount = items.reduce((sum, item) => sum + item.count, 0);
              const qualityProbability = simulatedTotalCount > 0 ? ((qualityTotalCount / simulatedTotalCount) * 100).toFixed(1) : "0.0";
              const catalogQualityCount = catalogCountByQuality[quality] || 0;
              return (
                <div key={`quality-band-${quality}`} className="grid grid-cols-[44px_minmax(0,1fr)] items-start gap-2">
                  <HoverTip
                    side="top"
                    content={<><p className={cn("font-semibold", QUALITY_TEXT_COLOR[quality])}>品质：{quality}</p><p className="mt-1 text-zinc-300">概率：{qualityProbability}%</p><p className="mt-1 text-zinc-300">样本：{qualityTotalCount} / {simulatedTotalCount}</p><p className="mt-1 text-zinc-400">图鉴物品：{catalogQualityCount} / {catalogTotal}</p></>}
                    label={
                      <div className="pt-1 text-right cursor-help">
                        <div className={cn("text-xs font-medium", QUALITY_TEXT_COLOR[quality])}>{quality}</div>
                        <div className="mt-1 text-[11px] text-zinc-500">{qualityProbability}</div>
                      </div>
                    }
                  />
                  <div>
                    <div className="relative h-8 overflow-hidden rounded-md border border-white/10 bg-[rgba(15,23,42,0.18)]" style={{ width: `${(items.length / domainMax) * 100}%`, background: buildQualityBandGradient(items, bandMaxCount) }}>
                      {items.map((item, index) => (
                        <HoverTip
                          key={`quality-band-cell-${quality}-${item.id}`}
                          side="top"
                          content={<><p className="text-amber-100">{item.name}</p><p className="mt-1 text-zinc-300">品质：{quality}</p><p className="mt-1 text-zinc-300">价格：{item.price}</p><p className="mt-1 text-zinc-300">模拟数量：{item.count}</p><p className="mt-1 text-zinc-400">当前品质总数：{qualityTotalCount} / {simulatedTotalCount}</p></>}
                          className="absolute top-0 bottom-0"
                          style={{ left: `${items.length ? (index / items.length) * 100 : 0}%`, width: `${items.length ? 100 / items.length : 100}%` }}
                          label={<div className="h-full w-full" />}
                        />
                      ))}
                    </div>
                    <div className="relative h-4 border-t border-white/10">
                      {qualityTicks.map((tick) => {
                        const isMajor = tick % 20 === 0;
                        const showLabel = quality === "凡" && isMajor;
                        return (
                          <div key={`quality-axis-${quality}-${tick}`} className="absolute top-0" style={{ left: `${(tick / domainMax) * 100}%` }}>
                            <div className={cn("w-px", isMajor ? "h-2 bg-white/35" : "h-1.5 bg-white/22")} />
                            {showLabel ? <div className="mt-0.5 -translate-x-1/2 text-[10px] text-zinc-500">{tick}</div> : null}
                          </div>
                        );
                      })}
                    </div>
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
                <div className={cn("w-px", tick.major ? "h-2 bg-white/35" : "h-1.5 bg-white/22")} />
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
            <HoverTip
              side="top"
              content={simulation ? <><p className="text-cyan-100">形状预览</p><p className="mt-1 text-zinc-300">模拟放置样本：{simulation.totalPlaced}</p><p className="mt-1 text-zinc-300">横向：{simulation.orientationSummary.horizontal}</p><p className="mt-1 text-zinc-300">纵向：{simulation.orientationSummary.vertical}</p><p className="mt-1 text-zinc-300">方形：{simulation.orientationSummary.square}</p></> : <><p className="text-cyan-100">形状预览</p><p className="mt-1 text-zinc-400">尚未模拟</p></>}
              label={<p className="cursor-help text-cyan-100">形状预览</p>}
            />
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
                        <HoverTip
                          key={`shape-cell-${key}`}
                          side="top"
                          content={<><p className="text-cyan-100">形状 {key}</p><p className="mt-1 text-zinc-300">概率：{simulation ? simProb.toFixed(1) : "未模拟"}</p><p className="mt-1 text-zinc-300">样本：{simCounts[key] || 0} / {simulation?.totalPlaced || 0}</p><p className="mt-1 text-zinc-400">图鉴物品：{catalogCountByShape[key] || 0} / {catalogTotal}</p></>}
                          label={
                            <div
                              className="relative min-h-8 rounded-lg border border-white/6"
                              style={{
                                background: active ? getHeatColorByCount(shapeCount, maxShapeCount) : "rgba(15,23,42,0.18)",
                                boxShadow: active ? `inset 0 0 0 1px rgba(255,237,160,0.22), inset 0 0 14px rgba(220,38,38,0.18)` : "inset 0 0 0 1px rgba(255,255,255,0.03)",
                              }}
                            >
                              <span className="absolute inset-0 flex items-center justify-center text-[10px] font-medium" style={{ color: active ? "#07121c" : "#d4d4d8" }}>
                                {simulation && simProb > 0 ? simProb.toFixed(1) : ""}
                              </span>
                            </div>
                          }
                        />
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

function PricePreferenceEditor({
  pricePreference,
  onUpdate,
  cn,
}: {
  pricePreference: PricePreference;
  onUpdate: (key: "mode" | "amountMidpoint" | "amountDecay" | "rankMidpoint" | "rankDecay", rawValue: string | number) => void;
  cn: (...arr: Array<string | false | null | undefined>) => string;
}) {
  const amountTicks = buildAmountAxisTicks();
  const rankTicks = buildRankAxisTicks();
  const amountMidX = amountToChartRatio(pricePreference.amountMidpoint) * PRICE_CHART_WIDTH;
  const rankMidX = rankToChartRatio(pricePreference.rankMidpoint) * PRICE_CHART_WIDTH;
  const amountActive = pricePreference.mode === "amount";
  const rankActive = pricePreference.mode === "rank";
  const chartY = (weight: number) => (weightToChartY(weight) / 100) * PRICE_CHART_HEIGHT;
  const scaleCurvePoints = (points: string) =>
    points
      .split(" ")
      .map((pair) => {
        const [x, y] = pair.split(",").map(Number);
        return `${(x / 100) * PRICE_CHART_WIDTH},${(y / 100) * PRICE_CHART_HEIGHT}`;
      })
      .join(" ");

  function renderYGuides() {
    return (
      <>
        {CHART_Y_TICKS.map((tick) => {
          const y = chartY(tick);
          return (
            <g key={`y-${tick}`}>
              <line x1="0" y1={y} x2={PRICE_CHART_WIDTH} y2={y} stroke="rgba(255,255,255,0.08)" strokeWidth="0.8" />
              <text x="-4" y={y + 3} textAnchor="end" fontSize="11" fill="rgba(255,255,255,0.45)">{tick.toFixed(1)}</text>
            </g>
          );
        })}
              <line x1="0" y1={chartY(0.5)} x2={PRICE_CHART_WIDTH} y2={chartY(0.5)} stroke="rgba(148,163,184,0.55)" strokeWidth="1" strokeDasharray="4 4" />
        </>
      );
    }

  function bindCurveDrag(mode: "amount" | "rank", event: React.PointerEvent<SVGElement>) {
    const svg = event.currentTarget.ownerSVGElement || (event.currentTarget as SVGElement);
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const startX = event.clientX;
    const startY = event.clientY;
    const startAmountMid = pricePreference.amountMidpoint;
    const startAmountDecay = pricePreference.amountDecay;
    const startRankMid = pricePreference.rankMidpoint;
    const startRankDecay = pricePreference.rankDecay;

    const onMove = (moveEvent: PointerEvent) => {
      const dx = moveEvent.clientX - startX;
      const dy = moveEvent.clientY - startY;
      const ratioDx = dx / Math.max(1, rect.width);
      const ratioDy = dy / Math.max(1, rect.height);

      if (mode === "amount") {
        const logRange = Math.log10(AMOUNT_AXIS_MAX) - Math.log10(AMOUNT_AXIS_MIN);
        const startRatio = amountToChartRatio(startAmountMid);
        const nextRatio = clamp01(startRatio + ratioDx);
        const nextMid = Math.round(Math.pow(10, Math.log10(AMOUNT_AXIS_MIN) + logRange * nextRatio));
        const nextDecay = Math.max(0.1, Math.min(20, Math.round((startAmountDecay - ratioDy * 12) * 10) / 10));
        onUpdate("amountMidpoint", nextMid);
        onUpdate("amountDecay", nextDecay);
      } else {
        const startRatio = rankToChartRatio(startRankMid);
        const nextRatio = clamp01(startRatio + ratioDx);
        const nextMid = Math.max(1, Math.round(nextRatio * RANK_AXIS_MAX));
        const nextDecay = Math.max(0.1, Math.min(20, Math.round((startRankDecay - ratioDy * 12) * 10) / 10));
        onUpdate("rankMidpoint", nextMid);
        onUpdate("rankDecay", nextDecay);
      }
    };

    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }

  return (
    <div className="mt-5 rounded-2xl border border-white/10 bg-black/20 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="inline-flex text-cyan-100">价格权重</p>
        <div className="inline-flex overflow-hidden rounded-xl border border-white/10 bg-slate-950/60">
          <button type="button" className={cn("px-4 py-2 text-sm", amountActive ? "bg-cyan-500/15 text-cyan-100" : "text-zinc-400")} onClick={() => onUpdate("mode", "amount")}>价格金额</button>
          <button type="button" className={cn("px-4 py-2 text-sm", rankActive ? "bg-cyan-500/15 text-cyan-100" : "text-zinc-400")} onClick={() => onUpdate("mode", "rank")}>价格排名</button>
        </div>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        <div className={cn("rounded-xl border bg-slate-950/60 p-2 cursor-pointer", amountActive ? "border-cyan-300/50 shadow-[0_0_0_1px_rgba(34,211,238,0.2)]" : "border-white/10")} onClick={() => onUpdate("mode", "amount")}>
          <div className="mb-2 flex items-center justify-between gap-3">
            <p className="inline-flex text-sm text-cyan-100">价格金额</p>
            <p className="text-[12px] text-zinc-400">中值 {pricePreference.amountMidpoint.toLocaleString()} | 衰减 {pricePreference.amountDecay}</p>
          </div>
          <div className="rounded-xl border border-white/10 bg-black/20 p-1">
            <svg viewBox={`-2 -6 ${PRICE_CHART_WIDTH + 4} ${PRICE_CHART_HEIGHT + 24}`} className="h-80 w-full overflow-visible">
              {renderYGuides()}
              <line x1="0" y1={PRICE_CHART_HEIGHT} x2={PRICE_CHART_WIDTH} y2={PRICE_CHART_HEIGHT} stroke="rgba(255,255,255,0.18)" strokeWidth="1.1" />
              <line x1="0" y1="0" x2="0" y2={PRICE_CHART_HEIGHT} stroke="rgba(255,255,255,0.18)" strokeWidth="1.1" />
              {amountTicks.map((tick) => (
                <g key={`amount-tick-${tick.value}`}>
                  <line x1={tick.ratio * PRICE_CHART_WIDTH} y1={PRICE_CHART_HEIGHT} x2={tick.ratio * PRICE_CHART_WIDTH} y2={PRICE_CHART_HEIGHT + 5} stroke="rgba(255,255,255,0.22)" strokeWidth="0.8" />
                  <text x={tick.ratio * PRICE_CHART_WIDTH} y={PRICE_CHART_HEIGHT + 16} textAnchor="middle" fontSize="11" fill="rgba(255,255,255,0.45)">{tick.label}</text>
                </g>
              ))}
              <polyline fill="none" stroke="#38bdf8" strokeWidth={amountActive ? 1.8 : 1.2} strokeDasharray={amountActive ? undefined : "4 3"} points={scaleCurvePoints(buildAmountPreferenceCurvePoints(pricePreference.amountMidpoint, pricePreference.amountDecay))} onPointerDown={(e) => bindCurveDrag("amount", e)} style={{ cursor: "move" }} />
              <polyline fill="none" stroke="transparent" strokeWidth="18" points={scaleCurvePoints(buildAmountPreferenceCurvePoints(pricePreference.amountMidpoint, pricePreference.amountDecay))} onPointerDown={(e) => bindCurveDrag("amount", e)} style={{ cursor: "move" }} />
              <line x1={amountMidX} y1="0" x2={amountMidX} y2={PRICE_CHART_HEIGHT} stroke="#38bdf8" strokeWidth="1.4" strokeDasharray="5 4" onPointerDown={(e) => bindCurveDrag("amount", e)} style={{ cursor: "move" }} />
            </svg>
          </div>
        </div>

        <div className={cn("rounded-xl border bg-slate-950/60 p-2 cursor-pointer", rankActive ? "border-amber-300/50 shadow-[0_0_0_1px_rgba(251,191,36,0.2)]" : "border-white/10")} onClick={() => onUpdate("mode", "rank")}>
          <div className="mb-2 flex items-center justify-between gap-3">
            <p className="inline-flex text-sm text-amber-100">价格排名</p>
            <p className="text-[12px] text-zinc-400">中值 {pricePreference.rankMidpoint} | 衰减 {pricePreference.rankDecay}</p>
          </div>
          <div className="rounded-xl border border-white/10 bg-black/20 p-1">
            <svg viewBox={`-2 -6 ${PRICE_CHART_WIDTH + 4} ${PRICE_CHART_HEIGHT + 24}`} className="h-80 w-full overflow-visible">
              {renderYGuides()}
              <line x1="0" y1={PRICE_CHART_HEIGHT} x2={PRICE_CHART_WIDTH} y2={PRICE_CHART_HEIGHT} stroke="rgba(255,255,255,0.18)" strokeWidth="1.1" />
              <line x1="0" y1="0" x2="0" y2={PRICE_CHART_HEIGHT} stroke="rgba(255,255,255,0.18)" strokeWidth="1.1" />
              {rankTicks.map((tick) => (
                <g key={`rank-tick-${tick.value}`}>
                  <line x1={tick.ratio * PRICE_CHART_WIDTH} y1={PRICE_CHART_HEIGHT} x2={tick.ratio * PRICE_CHART_WIDTH} y2={PRICE_CHART_HEIGHT + 5} stroke="rgba(255,255,255,0.22)" strokeWidth="0.8" />
                  <text x={tick.ratio * PRICE_CHART_WIDTH} y={PRICE_CHART_HEIGHT + 16} textAnchor="middle" fontSize="11" fill="rgba(255,255,255,0.45)">{tick.label}</text>
                </g>
              ))}
              <polyline fill="none" stroke="#f59e0b" strokeWidth={rankActive ? 1.8 : 1.2} strokeDasharray={rankActive ? undefined : "4 3"} points={scaleCurvePoints(buildRankPreferenceCurvePoints(pricePreference.rankMidpoint, pricePreference.rankDecay))} onPointerDown={(e) => bindCurveDrag("rank", e)} style={{ cursor: "move" }} />
              <polyline fill="none" stroke="transparent" strokeWidth="18" points={scaleCurvePoints(buildRankPreferenceCurvePoints(pricePreference.rankMidpoint, pricePreference.rankDecay))} onPointerDown={(e) => bindCurveDrag("rank", e)} style={{ cursor: "move" }} />
              <line x1={rankMidX} y1="0" x2={rankMidX} y2={PRICE_CHART_HEIGHT} stroke="rgba(250,204,21,0.9)" strokeWidth="1.4" strokeDasharray="5 4" onPointerDown={(e) => bindCurveDrag("rank", e)} style={{ cursor: "move" }} />
            </svg>
          </div>
        </div>
      </div>
    </div>
  );
}

function RealmCellSettingsEditor({
  activeRealmTab,
  onChangeActiveRealmTab,
  realmCellSettings,
  realmChartWidth,
  realmChartRef,
  onUpdateRealmCellSetting,
  onDragHandle,
  cn,
  realmOrder,
  realmColors,
  defaultRealmCellSettings,
}: {
  activeRealmTab: RealmOrder;
  onChangeActiveRealmTab: (realm: RealmOrder) => void;
  realmCellSettings: Record<string, RealmCellSetting>;
  realmChartWidth: number;
  realmChartRef: React.RefObject<HTMLDivElement | null>;
  onUpdateRealmCellSetting: (realm: string, key: "min" | "max" | "peak" | "spread", rawValue: number) => void;
  onDragHandle: (handle: "min" | "peak" | "max") => void;
  cn: (...arr: Array<string | false | null | undefined>) => string;
  realmOrder: readonly RealmOrder[];
  realmColors: Record<string, string>;
  defaultRealmCellSettings: Record<string, RealmCellSetting>;
}) {
  const config = realmCellSettings[activeRealmTab] || defaultRealmCellSettings[activeRealmTab];
  const histogram = buildRealmHistogramData(config);
  const gapPx = 4;
  const boxCount = 30;
  const totalGap = gapPx * (boxCount - 1);
  const safeWidth = Math.max(0, realmChartWidth - totalGap);
  const boxWidth = safeWidth / boxCount;
  const boundaryLeftPx = (value: number) => {
    const k = Math.max(1, Math.min(30, Math.round(value / 10)));
    if (k >= 30) return realmChartWidth;
    return k * boxWidth + (k - 0.5) * gapPx;
  };
  const clampedMinLeft = `${Math.max(0, Math.min(realmChartWidth, boundaryLeftPx(config.min)))}px`;
  const clampedPeakLeft = `${Math.max(0, Math.min(realmChartWidth, boundaryLeftPx(config.peak)))}px`;
  const clampedMaxLeft = `${Math.max(0, Math.min(realmChartWidth, boundaryLeftPx(config.max)))}px`;

  return (
    <div className="mt-4 rounded-2xl border border-white/10 bg-slate-950/50 px-3 py-3 text-sm text-zinc-300">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <p className="text-cyan-100">格数权重</p>
      </div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          {realmOrder.map((realm) => {
            const active = activeRealmTab === realm;
            return (
              <button
                key={`realm-tab-${realm}`}
                type="button"
                className={cn("rounded-xl border px-3 py-1.5 text-sm", active ? "border-cyan-300 bg-cyan-500/10 text-cyan-100" : "border-white/10 bg-black/20 text-zinc-300")}
                onClick={() => onChangeActiveRealmTab(realm)}
              >
                <span className="inline-flex items-center gap-2">
                  <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: realmColors[realm] }} />
                  <span>{realm}</span>
                </span>
              </button>
            );
          })}
        </div>
        <div className="flex items-center gap-2 text-xs text-zinc-300 whitespace-nowrap">
          <span>扩散系数</span>
          <button type="button" className="rounded-lg border border-white/10 bg-slate-950/80 px-2 py-1 text-sm text-zinc-200" onClick={() => onUpdateRealmCellSetting(activeRealmTab, "spread", Number((config.spread - 0.1).toFixed(1)))}>−</button>
          <input type="number" step="0.1" min="0.1" max="3.0" className="w-16 rounded-xl border border-white/10 bg-slate-950/80 px-2 py-1.5 text-center text-sm [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none" value={config.spread} onChange={(e) => onUpdateRealmCellSetting(activeRealmTab, "spread", Number(e.target.value) || config.spread)} />
          <button type="button" className="rounded-lg border border-white/10 bg-slate-950/80 px-2 py-1 text-sm text-zinc-200" onClick={() => onUpdateRealmCellSetting(activeRealmTab, "spread", Number((config.spread + 0.1).toFixed(1)))}>+</button>
        </div>
      </div>
      <div className="mb-3 rounded-2xl border border-white/10 bg-black/20 p-3">
        <div className="relative overflow-x-auto pb-2 pr-3">
          <div ref={realmChartRef} className="relative min-w-[620px] pr-0">
            <div className="flex h-48 items-end gap-1 pb-5">
              {histogram.map((bin, index) => {
                const selected = bin.binEnd > config.min && bin.binEnd <= config.max;
                return (
                  <div key={`${activeRealmTab}-bin-${index}`} className="flex min-w-0 flex-1 flex-col items-center gap-1">
                    <div className="flex w-full items-end justify-center" style={{ height: "150px" }}>
                      <div className="w-full" style={{ height: `${Math.max(1, Math.round(bin.value * 135))}px`, background: selected ? realmColors[activeRealmTab] : "rgba(113,113,122,0.45)" }} title={bin.label} />
                    </div>
                    <span className="text-[10px] text-zinc-500">{bin.binEnd}</span>
                  </div>
                );
              })}
            </div>
            <div className="pointer-events-none absolute inset-x-0 top-0 bottom-5">
              <div className="absolute inset-y-0 left-0 bg-zinc-500/15" style={{ width: clampedMinLeft }} />
              <div className="absolute inset-y-0 right-0 bg-zinc-500/15" style={{ width: `${Math.max(0, realmChartWidth - Math.max(0, Math.min(realmChartWidth, boundaryLeftPx(config.max))))}px` }} />
            </div>
            <button type="button" className="absolute top-0 bottom-5 w-4 cursor-ew-resize bg-transparent" style={{ left: clampedMinLeft, transform: "translateX(-50%)" }} onPointerDown={() => onDragHandle("min")} title={`下限 ${config.min}`}>
              <span className="pointer-events-none absolute inset-y-0 left-1/2 w-0.5 -translate-x-1/2 border-l-2 border-amber-300" />
            </button>
            <button type="button" className="absolute top-0 bottom-5 w-4 cursor-ew-resize bg-transparent" style={{ left: clampedPeakLeft, transform: "translateX(-50%)" }} onPointerDown={() => onDragHandle("peak")} title={`峰值中心 ${config.peak}`}>
              <span className="pointer-events-none absolute inset-y-0 left-1/2 w-0.5 -translate-x-1/2 border-l-2 border-cyan-300" />
            </button>
            <button type="button" className="absolute top-0 bottom-5 w-4 cursor-ew-resize bg-transparent" style={{ left: clampedMaxLeft, transform: "translateX(-50%)" }} onPointerDown={() => onDragHandle("max")} title={`上限 ${config.max}`}>
              <span className="pointer-events-none absolute inset-y-0 left-1/2 w-0.5 -translate-x-1/2 border-l-2 border-rose-300" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function ParameterSettingsModal({
  open,
  hasRoom,
  isHost,
  game,
  initialSettings,
  defaultSettings,
  catalog,
  onClose,
  onSave,
}: ParameterSettingsModalProps) {
  const [settingsForm, setSettingsForm] = useState<ParameterSettingsForm>(() =>
    buildSettingsForm(initialSettings, defaultSettings, DEFAULT_REALM_CELL_SETTINGS, DEFAULT_QUALITY_PROBABILITY, DEFAULT_SHAPE_WEIGHTS)
  );
  const [realmLocks, setRealmLocks] = useState<Record<string, boolean>>({});
  const [qualityLocks, setQualityLocks] = useState<Record<string, boolean>>({});
  const [activeRealmTab, setActiveRealmTab] = useState<RealmOrder>("炼气");
  const [dragRealmHandle, setDragRealmHandle] = useState<null | "min" | "peak" | "max">(null);
  const [realmChartWidth, setRealmChartWidth] = useState(0);
  const realmChartRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    setSettingsForm(buildSettingsForm(initialSettings, defaultSettings, DEFAULT_REALM_CELL_SETTINGS, DEFAULT_QUALITY_PROBABILITY, DEFAULT_SHAPE_WEIGHTS));
    setRealmLocks({});
    setQualityLocks({});
    setActiveRealmTab("炼气");
    setDragRealmHandle(null);
  }, [open, initialSettings]);

  useEffect(() => {
    if (!open) return;
    const update = () => setRealmChartWidth(realmChartRef.current?.clientWidth || 0);
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, [open, activeRealmTab]);

  useEffect(() => {
    if (!dragRealmHandle) return;
    const handleMove = (event: PointerEvent) => {
      const rect = realmChartRef.current?.getBoundingClientRect();
      if (!rect) return;
      const ratio = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
      const snapped = Math.max(10, Math.min(300, Math.round((10 + ratio * 290) / 10) * 10));
      updateRealmCellSetting(activeRealmTab, dragRealmHandle, snapped);
    };
    const handleUp = () => setDragRealmHandle(null);
    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp);
    return () => {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
    };
  }, [dragRealmHandle, activeRealmTab]);

  function adjustRealmProbabilityBoundary(leftRealm: RealmOrder, rightRealm: RealmOrder, delta: number) {
    if (!delta) return;
    setSettingsForm((s) => {
      const next = { ...s.realmProbability };
      const len = REALM_ORDER.length;
      const leftIndex = REALM_ORDER.indexOf(leftRealm);
      const rightIndex = REALM_ORDER.indexOf(rightRealm);
      if (leftIndex === -1 || rightIndex === -1) return s;

      const decreaseFrom = (startIndex: number, direction: -1 | 1) => {
        for (let step = 0; step < len; step += 1) {
          const idx = (startIndex + direction * step + len) % len;
          const realm = REALM_ORDER[idx];
          if (realmLocks[realm]) continue;
          const current = Math.round(next[realm] || 0);
          if (current > 0) {
            next[realm] = current - 1;
            return true;
          }
        }
        return false;
      };

      const applyOneStep = (stepDelta: 1 | -1) => {
        if (stepDelta > 0) {
          const ok = decreaseFrom(leftIndex, -1);
          if (!ok) return false;
          next[rightRealm] = Math.round(next[rightRealm] || 0) + 1;
          return true;
        }
        const ok = decreaseFrom(rightIndex, 1);
        if (!ok) return false;
        next[leftRealm] = Math.round(next[leftRealm] || 0) + 1;
        return true;
      };

      const steps = Math.abs(delta);
      for (let i = 0; i < steps; i += 1) {
        const ok = applyOneStep(delta > 0 ? 1 : -1);
        if (!ok) break;
      }

      return { ...s, realmProbability: next };
    });
  }

  function adjustLockedRealmSegmentShift(prevRealm: RealmOrder, nextRealm: RealmOrder, delta: number) {
    if (!delta) return;
    setSettingsForm((s) => {
      const next = { ...s.realmProbability };
      const steps = Math.abs(delta);
      const direction = delta > 0 ? 1 : -1;

      for (let i = 0; i < steps; i += 1) {
        const prevValue = Math.round(next[prevRealm] || 0);
        const nextValue = Math.round(next[nextRealm] || 0);
        if (direction > 0) {
          if (prevValue <= 0) break;
          next[prevRealm] = prevValue - 1;
          next[nextRealm] = nextValue + 1;
        } else {
          if (nextValue <= 0) break;
          next[nextRealm] = nextValue - 1;
          next[prevRealm] = prevValue + 1;
        }
      }

      return { ...s, realmProbability: next };
    });
  }

  function adjustQualityProbabilityBoundary(leftQuality: string, rightQuality: string, delta: number) {
    if (!delta) return;
    setSettingsForm((s) => {
      const next = { ...s.qualityProbability };
      const len = QUALITIES.length;
      const leftIndex = QUALITIES.indexOf(leftQuality as typeof QUALITIES[number]);
      const rightIndex = QUALITIES.indexOf(rightQuality as typeof QUALITIES[number]);
      if (leftIndex === -1 || rightIndex === -1) return s;

      const decreaseFrom = (startIndex: number, direction: -1 | 1) => {
        for (let step = 0; step < len; step += 1) {
          const idx = (startIndex + direction * step + len) % len;
          const quality = QUALITIES[idx];
          if (qualityLocks[quality]) continue;
          const current = Math.round(next[quality] || 0);
          if (current > 0) {
            next[quality] = current - 1;
            return true;
          }
        }
        return false;
      };

      const applyOneStep = (stepDelta: 1 | -1) => {
        if (stepDelta > 0) {
          const ok = decreaseFrom(leftIndex, -1);
          if (!ok) return false;
          next[rightQuality] = Math.round(next[rightQuality] || 0) + 1;
          return true;
        }
        const ok = decreaseFrom(rightIndex, 1);
        if (!ok) return false;
        next[leftQuality] = Math.round(next[leftQuality] || 0) + 1;
        return true;
      };

      const steps = Math.abs(delta);
      for (let i = 0; i < steps; i += 1) {
        const ok = applyOneStep(delta > 0 ? 1 : -1);
        if (!ok) break;
      }

      return { ...s, qualityProbability: normalizeQualityProbabilityLocally(next) };
    });
  }

  function adjustLockedQualitySegmentShift(prevQuality: string, nextQuality: string, delta: number) {
    if (!delta) return;
    setSettingsForm((s) => {
      const next = { ...s.qualityProbability };
      const steps = Math.abs(delta);
      const direction = delta > 0 ? 1 : -1;

      for (let i = 0; i < steps; i += 1) {
        const prevValue = Math.round(next[prevQuality] || 0);
        const nextValue = Math.round(next[nextQuality] || 0);
        if (direction > 0) {
          if (prevValue <= 0) break;
          next[prevQuality] = prevValue - 1;
          next[nextQuality] = nextValue + 1;
        } else {
          if (nextValue <= 0) break;
          next[nextQuality] = nextValue - 1;
          next[prevQuality] = prevValue + 1;
        }
      }

      return { ...s, qualityProbability: normalizeQualityProbabilityLocally(next) };
    });
  }

  function updatePricePreference(key: "mode" | "amountMidpoint" | "amountDecay" | "rankMidpoint" | "rankDecay", rawValue: string | number) {
    setSettingsForm((s) => ({
      ...s,
      pricePreference: {
        ...s.pricePreference,
        [key]: key === "mode"
          ? (rawValue === "rank" ? "rank" : "amount")
          : key === "amountMidpoint"
            ? Math.max(1, Math.min(10000000, Math.round(Number(rawValue) || 1)))
            : key === "rankMidpoint"
              ? Math.max(1, Math.min(400, Math.round(Number(rawValue) || 1)))
              : Math.max(0.1, Math.min(10, Math.round((Number(rawValue) || 0.1) * 10) / 10)),
      },
    }));
  }

  function updateShapeWeight(shape: string, rawValue: number) {
    const safe = Math.max(0, Math.min(9.9, Math.round(rawValue * 10) / 10));
    setSettingsForm((s) => ({
      ...s,
      shapeWeights: {
        ...s.shapeWeights,
        [shape]: safe,
      },
    }));
  }

  function updateRealmCellSetting(realm: string, key: "min" | "max" | "peak" | "spread", rawValue: number) {
    setSettingsForm((s) => {
      const current = s.realmCellSettings[realm] || DEFAULT_REALM_CELL_SETTINGS[realm];
      const next = { ...current };
      if (key === "spread") {
        next.spread = Math.max(0.1, Math.min(3.0, Math.round(rawValue * 10) / 10));
      } else {
        const snap = Math.max(10, Math.min(300, Math.round(rawValue / 10) * 10));
        if (key === "min") next.min = Math.min(snap, current.peak - 10, current.max - 20);
        if (key === "max") next.max = Math.max(snap, current.peak + 10, current.min + 20);
        if (key === "peak") next.peak = Math.max(current.min + 10, Math.min(current.max - 10, snap));
      }
      next.min = Math.max(1, Math.min(next.min, next.peak - 1, next.max - 2));
      next.max = Math.min(300, Math.max(next.peak + 1, next.min + 2, next.max));
      next.peak = Math.max(next.min + 1, Math.min(next.max - 1, next.peak));
      return {
        ...s,
        realmCellSettings: {
          ...s.realmCellSettings,
          [realm]: next,
        },
      };
    });
  }

  function resetParameterSettingsToDefault() {
    setSettingsForm((prev) => ({
      ...prev,
      realmProbability: { ...DEFAULT_PARAMETER_SETTINGS.realmProbability },
      realmCellSettings: cloneRealmCellSettings(DEFAULT_REALM_CELL_SETTINGS, DEFAULT_REALM_CELL_SETTINGS),
      qualityProbability: { ...DEFAULT_PARAMETER_SETTINGS.qualityProbability },
      pricePreference: { ...DEFAULT_PARAMETER_SETTINGS.pricePreference },
      shapeWeights: { ...DEFAULT_PARAMETER_SETTINGS.shapeWeights },
    }));
    setRealmLocks({});
    setQualityLocks({});
    setActiveRealmTab("炼气");
    setDragRealmHandle(null);
  }

  if (!open || !hasRoom || !isHost || game) return null;

  return (
    <div className="fixed inset-0 z-40 bg-black/70 p-4">
      <div className="mx-auto max-h-[92vh] max-w-5xl overflow-y-auto rounded-3xl border border-white/10 bg-[#0b1020] p-5 shadow-2xl">
        <div className="mb-4 flex items-center justify-between gap-3">
          <p className="text-lg text-cyan-100">参数设置</p>
          <div className="flex items-center gap-2">
            <button className="rounded-xl border border-amber-400/30 bg-amber-500/10 px-3 py-1 text-amber-100" onClick={resetParameterSettingsToDefault}>重置</button>
            <button className="rounded-xl border border-white/10 px-3 py-1" onClick={onClose}>关闭</button>
          </div>
        </div>

        <div className="mt-1">
          <QualityProbabilityEditor
            values={settingsForm.qualityProbability}
            locks={qualityLocks}
            onBoundaryShift={adjustQualityProbabilityBoundary}
            onLockedSegmentShift={adjustLockedQualitySegmentShift}
            onToggleLock={(quality) => setQualityLocks((prev) => ({ ...prev, [quality]: !prev[quality] }))}
            cn={cn}
          />
        </div>
        <PricePreferenceEditor pricePreference={settingsForm.pricePreference} onUpdate={updatePricePreference} cn={cn} />
        <div className="mt-5 grid gap-5 xl:grid-cols-2 xl:items-stretch">
          <div className="h-full">
            <ShapeWeightEditor value={settingsForm.shapeWeights} catalog={catalog} onChange={updateShapeWeight} />
          </div>
          <div className="h-full">
            <RealmProbabilityEditor
              values={settingsForm.realmProbability}
              locks={realmLocks}
              onBoundaryShift={adjustRealmProbabilityBoundary}
              onLockedSegmentShift={adjustLockedRealmSegmentShift}
              onToggleLock={(realm) => setRealmLocks((prev) => ({ ...prev, [realm]: !prev[realm] }))}
              realmOrder={REALM_ORDER}
              realmColors={REALM_COLORS}
            />
          </div>
        </div>
        <RealmCellSettingsEditor
          activeRealmTab={activeRealmTab}
          onChangeActiveRealmTab={setActiveRealmTab}
          realmCellSettings={settingsForm.realmCellSettings}
          realmChartWidth={realmChartWidth}
          realmChartRef={realmChartRef}
          onUpdateRealmCellSetting={updateRealmCellSetting}
          onDragHandle={setDragRealmHandle}
          cn={cn}
          realmOrder={REALM_ORDER}
          realmColors={REALM_COLORS}
          defaultRealmCellSettings={DEFAULT_REALM_CELL_SETTINGS}
        />
        <button className="mt-4 w-full rounded-xl border border-cyan-400/30 bg-cyan-500/10 py-2 text-cyan-100" onClick={() => onSave(settingsForm)}>
          保存参数设置
        </button>
      </div>
    </div>
  );
}

export default ParameterSettingsModal;
