import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { io, type Socket } from "socket.io-client";
import { ITEM_QUALITIES, ITEM_TYPES } from "../shared/itemCatalog.js";

function resolveWsUrl() {
  const search = new URLSearchParams(window.location.search);
  const queryWs = search.get("ws") || search.get("wsUrl");
  const runtimeWs = (window as any).__WS_URL__;
  const envWs = (import.meta as any).env?.VITE_WS_URL;
  if (queryWs) return String(queryWs);
  if (runtimeWs) return String(runtimeWs);
  if (envWs) return String(envWs);

  const { hostname, origin } = window.location;
  const isLocal = hostname === "localhost" || hostname === "127.0.0.1";
  if (isLocal) return "http://localhost:3001";
  return origin;
}

function resolveWsPath() {
  const search = new URLSearchParams(window.location.search);
  const queryPath = search.get("wspath") || search.get("wsPath");
  const runtimePath = (window as any).__WS_PATH__;
  const envPath = (import.meta as any).env?.VITE_WS_PATH;
  if (queryPath) return String(queryPath);
  if (runtimePath) return String(runtimePath);
  if (envPath) return String(envPath);
  return "/socket.io";
}

const WS_URL = resolveWsUrl();
const WS_PATH = resolveWsPath();
const GRID_W = 10;
const GRID_H = 30;
const TYPES = ITEM_TYPES;
const QUALITIES = ITEM_QUALITIES;
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
const DEFAULT_REALM_CELL_SETTINGS: Record<string, { min: number; max: number; peak: number; spread: number }> = {
  炼气: { min: 10, max: 60, peak: 40, spread: 1.5 },
  筑基: { min: 20, max: 80, peak: 50, spread: 1.5 },
  结丹: { min: 30, max: 100, peak: 60, spread: 1.5 },
  元婴: { min: 40, max: 120, peak: 80, spread: 1.5 },
  化神: { min: 50, max: 150, peak: 100, spread: 1.5 },
  炼虚: { min: 60, max: 200, peak: 120, spread: 1.5 },
  合体: { min: 70, max: 250, peak: 140, spread: 1.5 },
  大乘: { min: 80, max: 300, peak: 150, spread: 1.5 },
};

type ServerState = any;

const QUALITY_COLOR: Record<string, string> = {
  圣: "bg-red-500/90 border-red-300/60",
  天: "bg-orange-500/90 border-orange-300/60",
  地: "bg-fuchsia-500/90 border-fuchsia-300/60",
  玄: "bg-sky-500/90 border-sky-300/60",
  黄: "bg-emerald-500/90 border-emerald-300/60",
  凡: "bg-slate-500/90 border-slate-300/60",
};

const QUALITY_GLOW: Record<string, string> = {
  圣: "shadow-[0_0_18px_rgba(239,68,68,0.35)]",
  天: "shadow-[0_0_18px_rgba(249,115,22,0.3)]",
  地: "shadow-[0_0_18px_rgba(217,70,239,0.3)]",
  玄: "shadow-[0_0_18px_rgba(14,165,233,0.3)]",
  黄: "shadow-[0_0_18px_rgba(16,185,129,0.28)]",
  凡: "shadow-[0_0_12px_rgba(100,116,139,0.24)]",
};

const QUALITY_TEXT_COLOR: Record<string, string> = {
  圣: "text-red-300",
  天: "text-orange-300",
  地: "text-fuchsia-300",
  玄: "text-sky-300",
  黄: "text-emerald-300",
  凡: "text-slate-300",
};

const DEFAULT_QUALITY_PROBABILITY = {
  凡: 20,
  黄: 20,
  玄: 20,
  地: 15,
  天: 15,
  圣: 10,
} as Record<string, number>;

const DEFAULT_SHAPE_WEIGHTS = Object.fromEntries(
  Array.from({ length: 10 }, (_, h) =>
    Array.from({ length: 10 }, (_, w) => [`${w + 1}x${h + 1}`, 1.0])
  ).flat()
) as Record<string, number>;

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

const SHAPE_WEIGHT_COLOR_STEPS = Array.from({ length: 100 }, (_, index) => {
  const ratio = index / 99;
  const hue = 220 - 205 * ratio;
  const saturation = 86;
  const lightness = 20 + ratio * 46;
  return `hsl(${hue} ${saturation}% ${lightness}%)`;
});

function getShapeWeightStepIndex(value: number) {
  return Math.max(0, Math.min(99, Math.round(Math.max(0, Math.min(9.9, value)) * 10)));
}

function getShapeWeightColor(value: number) {
  return SHAPE_WEIGHT_COLOR_STEPS[getShapeWeightStepIndex(value)];
}

function getShapeWeightTextColor(value: number) {
  return getShapeWeightStepIndex(value) >= 56 ? "#07121c" : "#eff6ff";
}

function cn(...arr: Array<string | false | null | undefined>) {
  return arr.filter(Boolean).join(" ");
}

function normalizeQualityProbabilityLocally(values: Record<string, number>) {
  const total = QUALITIES.reduce((sum, quality) => sum + Math.max(0, Math.round(values[quality] ?? 0)), 0);
  if (total === 100) return values;
  const next = { ...values };
  const diff = 100 - total;
  next[QUALITIES[QUALITIES.length - 1]] = Math.max(0, Math.round(next[QUALITIES[QUALITIES.length - 1]] ?? 0) + diff);
  return next;
}

const AMOUNT_AXIS_MIN = 1;
const AMOUNT_AXIS_MAX = 10000000;
const RANK_AXIS_MIN = 1;
const RANK_AXIS_MAX = 400;
const CHART_Y_TICKS = [0.2, 0.4, 0.6, 0.8, 1.0];
const PRICE_CHART_WIDTH = 340;
const PRICE_CHART_HEIGHT = 300;
const SHAPE_SIMULATION_RUNS = 500;

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

function simChooseRealm(prob: Record<string, number>, rng: () => number) {
  return simPickWeighted(
    REALM_ORDER.map((realm) => ({ value: realm, weight: prob[realm] || 0 })),
    rng
  ) as (typeof REALM_ORDER)[number];
}

function simGenerateTargetCells(
  realm: (typeof REALM_ORDER)[number],
  rng: () => number,
  realmCellSettings: Record<string, { min: number; max: number; peak: number; spread: number }>
) {
  const setting = realmCellSettings?.[realm] || DEFAULT_REALM_CELL_SETTINGS[realm];
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

function simPickCatalogCandidate(catalog: any[], remain: number, rng: () => number, qualityProbability: Record<string, number>, pricePreference: { mode: "amount" | "rank"; amountMidpoint: number; amountDecay: number; rankMidpoint: number; rankDecay: number }, priceRankById: Record<string, number>, shapeWeights: Record<string, number>) {
  const candidates = catalog.filter((item) => item.size <= remain);
  if (!candidates.length) return null;
  return simPickWeighted(
    candidates.map((item) => ({
      value: item,
      weight:
        Math.max(0.01, qualityProbability[item.quality] ?? DEFAULT_QUALITY_PROBABILITY[item.quality] ?? 1) *
        getFrontPricePreferenceWeight(item, pricePreference, priceRankById) *
        Math.max(0.0001, shapeWeights[`${item.width}x${item.height}`] ?? DEFAULT_SHAPE_WEIGHTS[`${item.width}x${item.height}`] ?? 1),
    })),
    rng
  );
}

function getFrontPricePreferenceWeight(
  item: { id: string; price: number },
  pricePreference: { mode: "amount" | "rank"; amountMidpoint: number; amountDecay: number; rankMidpoint: number; rankDecay: number },
  priceRankById: Record<string, number>
) {
  if (pricePreference.mode === "rank") {
    const rank = Math.max(1, Math.min(400, priceRankById[item.id] || 1));
    return 1 / (1 + Math.pow(rank / Math.max(1, pricePreference.rankMidpoint), Math.max(0.1, pricePreference.rankDecay)));
  }
  return 1 / (1 + Math.pow(Math.max(0, item.price) / Math.max(1, pricePreference.amountMidpoint), Math.max(0.1, pricePreference.amountDecay)));
}

function simulateShapeMatrixStats({
  catalog,
  realmProbability,
  realmCellSettings,
  qualityProbability,
  pricePreference,
  shapeWeights,
  samples = 100,
  randomSeed,
}: {
  catalog: any[];
  realmProbability: Record<string, number>;
  realmCellSettings: Record<string, { min: number; max: number; peak: number; spread: number }>;
  qualityProbability: Record<string, number>;
  pricePreference: { mode: "amount" | "rank"; amountMidpoint: number; amountDecay: number; rankMidpoint: number; rankDecay: number };
  shapeWeights: Record<string, number>;
  samples?: number;
  randomSeed?: string;
}) {
  if (!catalog?.length) {
    return {
      counts: {} as Record<string, number>,
      probabilities: {} as Record<string, number>,
      totalPlaced: 0,
      orientationSummary: { horizontal: 0, vertical: 0, square: 0 },
      qualityPriceMap: Object.fromEntries(QUALITIES.map((quality) => [quality, []])) as Record<string, number[]>,
      allPrices: [] as number[],
      itemCountMap: {} as Record<string, number>,
      priceCountMap: {} as Record<number, number>,
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
    const realm = simChooseRealm(realmProbability, rng);
    const target = simGenerateTargetCells(realm, rng, realmCellSettings);
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
          const sampled = simPickCatalogCandidate(reducedCatalog, remain, rng, qualityProbability, pricePreference, priceRankById, shapeWeights);
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
                  Math.max(0.01, qualityProbability[item.quality] ?? DEFAULT_QUALITY_PROBABILITY[item.quality] ?? 1) *
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

  const probabilities = Object.fromEntries(
    Object.entries(counts).map(([shape, count]) => [shape, totalPlaced > 0 ? (count / totalPlaced) * 100 : 0])
  );

  Object.keys(qualityPriceMap).forEach((quality) => {
    qualityPriceMap[quality] = [...qualityPriceMap[quality]].sort((a, b) => a - b);
  });
  allPrices.sort((a, b) => a - b);

  return { counts, probabilities, totalPlaced, orientationSummary, qualityPriceMap, allPrices, itemCountMap, priceCountMap };
}

const QUALITY_TONE: Record<string, OscillatorType> = {
  凡: "sine",
  黄: "triangle",
  玄: "triangle",
  地: "square",
  天: "square",
  圣: "sawtooth",
};

function useGameAudio() {
  const audioCtxRef = useRef<AudioContext | null>(null);
  const enabledRef = useRef(true);

  function getCtx() {
    const AudioContextCtor = (window as any).AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextCtor) return null;
    if (!audioCtxRef.current) audioCtxRef.current = new AudioContextCtor();
    const ctx = audioCtxRef.current;
    if (!ctx) return null;
    if (ctx.state === "suspended") {
      ctx.resume().catch(() => undefined);
    }
    return ctx;
  }

  function beep({
    type = "sine",
    frequency = 440,
    duration = 0.08,
    volume = 0.04,
    attack = 0.005,
    release = 0.04,
  }: {
    type?: OscillatorType;
    frequency?: number;
    duration?: number;
    volume?: number;
    attack?: number;
    release?: number;
  }) {
    if (!enabledRef.current) return;
    const ctx = getCtx();
    if (!ctx) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(frequency, now);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(volume, now + attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration + release);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + duration + release + 0.01);
  }

  function click() {
    beep({ type: "triangle", frequency: 920, duration: 0.03, volume: 0.035, attack: 0.002, release: 0.03 });
    window.setTimeout(() => {
      beep({ type: "sine", frequency: 1280, duration: 0.025, volume: 0.025, attack: 0.002, release: 0.02 });
    }, 18);
  }

  function submit() {
    beep({ type: "triangle", frequency: 660, duration: 0.05, volume: 0.05, attack: 0.002, release: 0.03 });
    window.setTimeout(() => beep({ type: "square", frequency: 990, duration: 0.05, volume: 0.04 }), 50);
  }

  function tick() {
    beep({ type: "square", frequency: 1200, duration: 0.018, volume: 0.022, attack: 0.001, release: 0.02 });
  }

  function revealByQuality(quality?: string) {
    const tone = QUALITY_TONE[quality || "凡"] || "sine";
    const freq = quality === "圣" ? 1080 : quality === "天" ? 920 : quality === "地" ? 820 : quality === "玄" ? 700 : quality === "黄" ? 620 : 500;
    beep({ type: tone, frequency: freq, duration: 0.06, volume: 0.045, attack: 0.003, release: 0.05 });
  }

  function speak(text: string, rate = 1) {
    if (!enabledRef.current) return;
    if (!("speechSynthesis" in window) || !text) return;
    try {
      const utter = new SpeechSynthesisUtterance(text);
      utter.lang = "zh-CN";
      utter.rate = rate;
      utter.pitch = 1;
      utter.volume = 0.85;
      window.speechSynthesis.speak(utter);
    } catch {
      // noop
    }
  }

  return { click, submit, tick, revealByQuality, speak };
}

function useNowTicker(active: boolean) {
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!active) return;
    const timer = window.setInterval(() => setTick((v) => v + 1), 300);
    return () => window.clearInterval(timer);
  }, [active]);
}

function HoverTip({
  label,
  content,
  className = "",
  side = "bottom",
  style,
}: {
  label: React.ReactNode;
  content: React.ReactNode;
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
    if (open) {
      setPos((prev) => ({ ...prev, ready: false }));
    }
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
      const safeTop = useTop
        ? Math.max(tipHeight + 12, rawTop)
        : Math.min(viewportHeight - tipHeight - 12, rawTop);
      setPos({
        left,
        top: safeTop,
        width: maxWidth,
        transform: useTop ? "translate(-50%, -100%)" : "translate(-50%, 0)",
        ready: true,
      });
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
  }, [open, side]);

  useEffect(() => {
    if (!open || !tipRef.current) return;
    const raf = window.requestAnimationFrame(() => {
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
      const safeTop = useTop
        ? Math.max(tipHeight + 12, rawTop)
        : Math.min(viewportHeight - tipHeight - 12, rawTop);
      setPos({
        left,
        top: safeTop,
        width: maxWidth,
        transform: useTop ? "translate(-50%, -100%)" : "translate(-50%, 0)",
        ready: true,
      });
    });
    return () => window.cancelAnimationFrame(raf);
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
      {open &&
        typeof document !== "undefined" &&
        createPortal(
          <div className="pointer-events-none fixed inset-0 z-[2147483647]">
            <div
              ref={tipRef}
              className="absolute rounded-2xl border border-white/10 bg-[#0a0f1b]/98 p-3 text-xs text-zinc-200 shadow-2xl backdrop-blur-xl"
              style={{
                left: pos.left,
                top: pos.top,
                width: pos.width,
                maxWidth: pos.width,
                transform: pos.transform,
                opacity: pos.ready ? 1 : 0,
              }}
            >
              {content}
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}

function KeypadPopover({
  open,
  anchorRef,
  value,
  onClose,
  onAppend,
  onDelete,
  onClear,
}: {
  open: boolean;
  anchorRef: React.RefObject<HTMLElement | null>;
  value: string;
  onClose: () => void;
  onAppend: (digit: string) => void;
  onDelete: () => void;
  onClear: () => void;
}) {
  const [pos, setPos] = useState({ left: 0, top: 0, width: 280 });

  useEffect(() => {
    if (!open) return;
    const updatePosition = () => {
      const rect = anchorRef.current?.getBoundingClientRect();
      if (!rect) return;
      const width = Math.min(280, window.innerWidth - 24);
      const left = Math.min(Math.max(rect.left + rect.width / 2, width / 2 + 12), window.innerWidth - width / 2 - 12);
      const top = Math.max(12, rect.top - 12);
      setPos({ left, top, width });
    };
    const closeByOutside = (event: PointerEvent) => {
      if (!anchorRef.current?.contains(event.target as Node)) {
        const target = event.target as HTMLElement;
        if (!target.closest?.("[data-keypad-panel='1']")) onClose();
      }
    };
    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    document.addEventListener("pointerdown", closeByOutside);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
      document.removeEventListener("pointerdown", closeByOutside);
    };
  }, [open, anchorRef, onClose]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div
      data-keypad-panel="1"
      className="fixed z-[130] rounded-3xl border border-white/10 bg-[#0b1020]/96 p-3 shadow-2xl backdrop-blur-xl"
      style={{
        left: pos.left,
        top: pos.top,
        width: pos.width,
        transform: "translate(-50%, -100%)",
      }}
    >
      <div className="mb-2 rounded-2xl border border-white/10 bg-slate-950/80 px-3 py-2 text-right text-lg text-cyan-100">{value || "放弃本轮"}</div>
      <div className="grid grid-cols-3 gap-2">
        {["1", "2", "3", "4", "5", "6", "7", "8", "9", "C", "0", "←"].map((key) => (
          <button
            key={key}
            className="rounded-2xl border border-white/10 bg-slate-950/80 py-2 text-sm"
            onClick={() => {
              if (key === "C") return onClear();
              if (key === "←") return onDelete();
              onAppend(key);
            }}
          >
            {key}
          </button>
        ))}
      </div>
      <button className="mt-2 w-full rounded-2xl border border-white/10 py-2 text-sm text-zinc-300" onClick={onClose}>
        关闭数字盘
      </button>
    </div>,
    document.body
  );
}

function ShapePopover({
  open,
  anchorRef,
  value,
  onClose,
  onSelect,
  onClear,
}: {
  open: boolean;
  anchorRef: React.RefObject<HTMLElement | null>;
  value: string;
  onClose: () => void;
  onSelect: (shape: string) => void;
  onClear: () => void;
}) {
  const [pos, setPos] = useState({ left: 0, top: 0, width: 720 });

  useEffect(() => {
    if (!open) return;
      const updatePosition = () => {
        const rect = anchorRef.current?.getBoundingClientRect();
        if (!rect) return;
        const width = Math.min(720, window.innerWidth - 16);
        const left = Math.min(Math.max(rect.left + rect.width / 2, width / 2 + 8), window.innerWidth - width / 2 - 8);
        const top = Math.min(rect.bottom + 8, window.innerHeight - 720);
        setPos({ left, top, width });
      };
    const closeByOutside = (event: PointerEvent) => {
      if (!anchorRef.current?.contains(event.target as Node)) {
        const target = event.target as HTMLElement;
        if (!target.closest?.("[data-shape-panel='1']")) onClose();
      }
    };
    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    document.addEventListener("pointerdown", closeByOutside);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
      document.removeEventListener("pointerdown", closeByOutside);
    };
  }, [open, anchorRef, onClose]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div
      data-shape-panel="1"
      className="fixed z-[130] rounded-3xl border border-white/10 bg-[#0b1020]/96 p-2 shadow-2xl backdrop-blur-xl"
      style={{
        left: pos.left,
        top: pos.top,
        width: pos.width,
        transform: "translate(-50%, 0)",
      }}
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <div>
          <p className="text-xs text-fuchsia-100">形状筛选</p>
          <p className="text-[10px] text-zinc-400">当前：{value === "全部" ? "全部形状" : value}</p>
        </div>
        <div className="flex items-center gap-1.5">
          <button className="rounded-lg border border-white/10 px-2 py-1 text-[10px] text-zinc-300" onClick={onClear}>清空</button>
          <button className="rounded-lg border border-white/10 px-2 py-1 text-[10px] text-zinc-300" onClick={onClose}>关闭</button>
        </div>
      </div>
      <div className="grid max-h-[70vh] grid-cols-10 gap-2 overflow-y-auto pr-1">
        {Array.from({ length: 10 }, (_, h) => h + 1).flatMap((h) =>
          Array.from({ length: 10 }, (_, w) => {
            const shape = `${w + 1}x${h}`;
            const active = value === shape;
            return (
              <button
                key={shape}
                onClick={() => {
                  onSelect(shape);
                  onClose();
                }}
                className={cn(
                  "aspect-square min-h-10 rounded-lg border px-0 text-[11px] leading-none transition sm:min-h-12 sm:text-xs",
                  active ? "border-cyan-300 bg-cyan-500/15 text-cyan-50" : "border-white/10 bg-slate-950/60 text-zinc-300 hover:border-white/25"
                )}
                title={shape}
              >
                {w + 1}×{h}
              </button>
            );
          })
        )}
      </div>
    </div>,
    document.body
  );
}

function QualityPopover({
  open,
  anchorRef,
  value,
  onClose,
  onSelect,
  onClear,
}: {
  open: boolean;
  anchorRef: React.RefObject<HTMLElement | null>;
  value: string;
  onClose: () => void;
  onSelect: (quality: string) => void;
  onClear: () => void;
}) {
  const [pos, setPos] = useState({ left: 0, top: 0, width: 320 });

  useEffect(() => {
    if (!open) return;
    const updatePosition = () => {
      const rect = anchorRef.current?.getBoundingClientRect();
      if (!rect) return;
      const width = Math.min(320, window.innerWidth - 16);
      const left = Math.min(Math.max(rect.left + rect.width / 2, width / 2 + 8), window.innerWidth - width / 2 - 8);
      const top = Math.min(rect.bottom + 8, window.innerHeight - 420);
      setPos({ left, top, width });
    };
    const closeByOutside = (event: PointerEvent) => {
      if (!anchorRef.current?.contains(event.target as Node)) {
        const target = event.target as HTMLElement;
        if (!target.closest?.("[data-quality-panel='1']")) onClose();
      }
    };
    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    document.addEventListener("pointerdown", closeByOutside);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
      document.removeEventListener("pointerdown", closeByOutside);
    };
  }, [open, anchorRef, onClose]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div
      data-quality-panel="1"
      className="fixed z-[130] rounded-3xl border border-white/10 bg-[#0b1020]/96 p-2 shadow-2xl backdrop-blur-xl"
      style={{ left: pos.left, top: pos.top, width: pos.width, transform: "translate(-50%, 0)" }}
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <div>
          <p className="text-xs text-amber-100">品级筛选</p>
          <p className="text-[10px] text-zinc-400">当前：{value === "全部" ? "全部品级" : value}</p>
        </div>
        <div className="flex items-center gap-1.5">
          <button className="rounded-lg border border-white/10 px-2 py-1 text-[10px] text-zinc-300" onClick={onClear}>清空</button>
          <button className="rounded-lg border border-white/10 px-2 py-1 text-[10px] text-zinc-300" onClick={onClose}>关闭</button>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-2">
        {QUALITIES.map((quality) => {
          const active = value === quality;
          return (
            <button
              key={quality}
              onClick={() => {
                onSelect(quality);
                onClose();
              }}
              className={cn(
                "rounded-xl border px-3 py-2 text-sm font-medium",
                active ? "border-cyan-300 bg-cyan-500/10 text-cyan-100" : "border-white/10 bg-slate-950/60",
                QUALITY_TEXT_COLOR[quality]
              )}
            >
              {quality}
            </button>
          );
        })}
      </div>
    </div>,
    document.body
  );
}

function ToolPopover({
  open,
  anchorRef,
  tools,
  disabledToolIds,
  unaffordableToolIds,
  onClose,
  onSelect,
}: {
  open: boolean;
  anchorRef: React.RefObject<HTMLElement | null>;
  tools: any[];
  disabledToolIds: Set<string>;
  unaffordableToolIds: Set<string>;
  onClose: () => void;
  onSelect: (tool: any) => void;
}) {
  const [pos, setPos] = useState({ left: 0, top: 0, width: 720 });

  useEffect(() => {
    if (!open) return;
    const updatePosition = () => {
      const rect = anchorRef.current?.getBoundingClientRect();
      if (!rect) return;
      const width = Math.min(720, window.innerWidth - 16);
      const left = Math.min(Math.max(rect.left + rect.width / 2, width / 2 + 8), window.innerWidth - width / 2 - 8);
      const top = Math.max(8, rect.top - 8);
      setPos({ left, top, width });
    };
    const closeByOutside = (event: PointerEvent) => {
      if (!anchorRef.current?.contains(event.target as Node)) {
        const target = event.target as HTMLElement;
        if (!target.closest?.("[data-tool-panel='1']")) onClose();
      }
    };
    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    document.addEventListener("pointerdown", closeByOutside);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
      document.removeEventListener("pointerdown", closeByOutside);
    };
  }, [open, anchorRef, onClose]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div
      data-tool-panel="1"
      className="fixed z-[130] rounded-3xl border border-white/10 bg-[#0b1020]/96 p-2 shadow-2xl backdrop-blur-xl"
      style={{ left: pos.left, top: pos.top, width: pos.width, transform: "translate(-50%, -100%)" }}
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <div>
          <p className="text-xs text-cyan-100">选择推演</p>
          <p className="text-[10px] text-zinc-400">同一推演每回合仅可施展一次</p>
        </div>
        <button className="rounded-lg border border-white/10 px-2 py-1 text-[10px] text-zinc-300" onClick={onClose}>关闭</button>
      </div>
      <div className="grid max-h-[72vh] grid-cols-8 gap-2 overflow-y-auto pr-1">
        {tools.map((tool) => {
          const used = disabledToolIds.has(tool.id);
          const noMoney = unaffordableToolIds.has(tool.id);
          const disabled = used || noMoney;
          return (
            <HoverTip
              key={tool.id}
              side="top"
              content={<><p className="text-cyan-100">{tool.name}</p><p className="mt-1 text-zinc-300">{tool.desc}</p><p className="mt-1 text-amber-200">价格：{tool.cost} 灵石/次</p></>}
              label={
                <button
                  disabled={disabled}
                  onClick={() => !disabled && onSelect(tool)}
                  className={cn(
                    "relative h-16 w-16 rounded-xl border p-1 text-center sm:h-18 sm:w-18",
                    disabled ? "border-slate-700/60 bg-slate-800/50 text-zinc-600" : "border-white/10 bg-slate-950/60 text-zinc-100 hover:border-cyan-300/40"
                  )}
                >
                  <div className="flex h-full items-center justify-center">
                    <span className="text-sm font-semibold leading-tight text-cyan-50 sm:text-base">{tool.short || tool.name}</span>
                  </div>
                  {used && <span className="absolute right-1 top-1 text-xs text-emerald-200">✓</span>}
                  {!used && noMoney && <span className="absolute right-1 top-1 text-xs text-rose-300">×</span>}
                </button>
              }
            />
          );
        })}
      </div>
    </div>,
    document.body
  );
}

function RealmProbabilityEditor({
  values,
  locks,
  onBoundaryShift,
  onLockedSegmentShift,
  onToggleLock,
}: {
  values: Record<string, number>;
  locks: Record<string, boolean>;
  onBoundaryShift: (leftRealm: (typeof REALM_ORDER)[number], rightRealm: (typeof REALM_ORDER)[number], delta: number) => void;
  onLockedSegmentShift: (prevRealm: (typeof REALM_ORDER)[number], nextRealm: (typeof REALM_ORDER)[number], delta: number) => void;
  onToggleLock: (realm: string) => void;
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
        left: (typeof REALM_ORDER)[number];
        right: (typeof REALM_ORDER)[number];
        leftStart: number;
        total: number;
        lastPercent: number;
      }
    | {
        mode: "segment";
        prev: (typeof REALM_ORDER)[number];
        lockedRealm: (typeof REALM_ORDER)[number];
        next: (typeof REALM_ORDER)[number];
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
  const segments = REALM_ORDER.map((realm) => {
    const width = values[realm] || 0;
    const start = accumulated;
    accumulated += width;
    return { realm, width, start, end: accumulated };
  });

  function findUnlockedToLeft(index: number) {
    for (let i = index; i >= 0; i -= 1) {
      if (!locks[REALM_ORDER[i]]) return REALM_ORDER[i];
    }
    return null;
  }

  function findUnlockedToRight(index: number) {
    for (let i = index; i < REALM_ORDER.length; i += 1) {
      if (!locks[REALM_ORDER[i]]) return REALM_ORDER[i];
    }
    return null;
  }

  function findPrevUnlockedIndex(startIndex: number) {
    const len = REALM_ORDER.length;
    for (let step = 0; step < len; step += 1) {
      const i = (startIndex - step + len) % len;
      if (!locks[REALM_ORDER[i]]) return i;
    }
    return -1;
  }

  function findNextUnlockedIndex(startIndex: number) {
    const len = REALM_ORDER.length;
    for (let step = 0; step < len; step += 1) {
      const i = (startIndex + step) % len;
      if (!locks[REALM_ORDER[i]]) return i;
    }
    return -1;
  }

  function percentToAngle(percent: number) {
    return (percent / 100) * Math.PI * 2 - Math.PI / 2;
  }

  function pointOnCircle(percent: number, r = radius) {
    const angle = percentToAngle(percent);
    return {
      x: center + Math.cos(angle) * r,
      y: center + Math.sin(angle) * r,
    };
  }

  function arcPath(startPercent: number, endPercent: number) {
    const start = pointOnCircle(startPercent);
    const end = pointOnCircle(endPercent);
    const largeArc = endPercent - startPercent > 50 ? 1 : 0;
    return `M ${start.x} ${start.y} A ${radius} ${radius} 0 ${largeArc} 1 ${end.x} ${end.y}`;
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
      let percent = (angle / (Math.PI * 2)) * 100;

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
    <div className="h-full select-none rounded-2xl border border-white/10 bg-slate-950/50 p-4 text-sm text-zinc-300" style={{ userSelect: "none", WebkitUserSelect: "none" }}>
      <p className="mb-4 text-amber-100">境界权重</p>
      <div className="flex flex-col items-center gap-3">
        <div
          ref={donutRef}
          className="relative mx-auto flex h-[460px] w-full max-w-[460px] items-center justify-center rounded-full select-none"
          style={{ userSelect: "none", WebkitUserSelect: "none" }}
        >
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
                  <path
                    d={arcPath(segment.start, segment.end)}
                    fill="none"
                    stroke={REALM_COLORS[segment.realm]}
                    strokeWidth={strokeWidth}
                    strokeLinecap="butt"
                  />
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
                  <foreignObject
                    x={labelPos.x - 28}
                    y={labelPos.y - 22}
                    width={56}
                    height={44}
                    style={{ pointerEvents: "none", overflow: "visible" }}
                  >
                    <div
                      className="flex h-full w-full flex-col items-center justify-center text-center leading-tight text-white"
                      style={{ userSelect: "none", WebkitUserSelect: "none" }}
                    >
                      {showRealmText ? <span className="max-w-full truncate text-[10px] font-semibold">{segment.realm}</span> : null}
                      <span className="text-[12px] font-semibold">{Math.round(segment.width || 0)}</span>
                    </div>
                  </foreignObject>
                </g>
              );
            })}

            {REALM_ORDER.map((realm, index) => {
              if (!locks[realm]) return null;
              const prevIndex = findPrevUnlockedIndex(index - 1);
              const nextIndex = findNextUnlockedIndex(index + 1);
              const segment = segments[index];
              const canDrag = prevIndex >= 0 && nextIndex >= 0;
              return (
                <g key={`locked-highlight-${realm}`}>
                  <path
                    d={arcPath(segment.start, segment.end)}
                    fill="none"
                    stroke="rgba(250,204,21,0.18)"
                    strokeWidth={strokeWidth + 14}
                    strokeLinecap="butt"
                  />
                  <path
                    d={arcPath(segment.start, segment.end)}
                    fill="none"
                    stroke="rgba(250,204,21,0.95)"
                    strokeWidth={5}
                    strokeDasharray="8 7"
                    strokeLinecap="butt"
                  />
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
                        prev: REALM_ORDER[prevIndex],
                        lockedRealm: realm,
                        next: REALM_ORDER[nextIndex],
                        groupStart: segments[prevIndex].start,
                        lockedWidth: values[realm] || 0,
                        movableTotal: (values[REALM_ORDER[prevIndex]] || 0) + (values[REALM_ORDER[nextIndex]] || 0),
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
          </svg>

          <div className="pointer-events-none absolute inset-0 flex select-none flex-col items-center justify-center text-center" style={{ userSelect: "none", WebkitUserSelect: "none" }}>
            <p className="text-5xl font-semibold text-amber-100">100</p>
          </div>

          {REALM_ORDER.map((realm, index) => {
            const boundary = segments[index].end;
            const rightIndex = (index + 1) % REALM_ORDER.length;
            const rightRealm = REALM_ORDER[rightIndex];
            const leftAffected = findUnlockedToLeft(index);
            const rightAffected = findUnlockedToRight(rightIndex);
            const disabled = !leftAffected || !rightAffected || leftAffected === rightAffected;
            const pos = pointOnCircle(boundary, radius);
            const angleDeg = ((boundary / 100) * 360);
            const hideLeftArrow = locks[realm];
            const hideRightArrow = locks[rightRealm];
            if (hideLeftArrow && hideRightArrow) return null;
            return (
              <div
                key={`ring-divider-${realm}`}
                onPointerDown={() => {
                  if (disabled || !leftAffected || !rightAffected) return;
                  dragRef.current = {
                    mode: "boundary",
                    left: leftAffected as (typeof REALM_ORDER)[number],
                    right: rightAffected as (typeof REALM_ORDER)[number],
                    leftStart: segments.find((s) => s.realm === leftAffected)?.start || 0,
                    total: (values[leftAffected] || 0) + (values[rightAffected] || 0),
                    lastPercent: boundary,
                  };
                }}
                className={cn(
                  "absolute h-10 w-10 rounded-full bg-transparent",
                  disabled ? "cursor-not-allowed opacity-30" : "cursor-grab"
                )}
                style={{ left: pos.x, top: pos.y, transform: `translate(-50%, -50%) rotate(${angleDeg}deg)` }}
                title={disabled ? "两侧无可调整境界" : `拖动调整 ${leftAffected}/${rightAffected}`}
              >
                <div className="absolute inset-0 flex items-center justify-center gap-1">
                  {!hideLeftArrow ? (
                    <button
                      type="button"
                      className="select-none text-sm leading-none"
                      style={{ color: REALM_COLORS[rightAffected || rightRealm], userSelect: "none", WebkitUserSelect: "none" }}
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
                  ) : (
                    <span className="w-3" />
                  )}
                  {!hideRightArrow ? (
                    <button
                      type="button"
                      className="select-none text-sm leading-none"
                      style={{ color: REALM_COLORS[leftAffected || realm], userSelect: "none", WebkitUserSelect: "none" }}
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
                  ) : (
                    <span className="w-3" />
                  )}
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
        <p className="text-cyan-100">形状权重</p>
        <p className="text-[11px] text-zinc-500">范围 0.0 - 9.9</p>
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
                    <div
                      key={`shape-weight-cell-${key}`}
                      className="flex h-9 w-full items-center justify-center rounded-lg border border-rose-400/35 bg-rose-500/10 text-sm font-semibold text-rose-300"
                    >
                      ×
                    </div>
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

function ShapeWeightMatrix({
  simulation,
  catalog,
  actions,
}: {
  simulation?: {
    counts: Record<string, number>;
    probabilities: Record<string, number>;
    totalPlaced: number;
    orientationSummary: { horizontal: number; vertical: number; square: number };
    qualityPriceMap?: Record<string, number[]>;
    allPrices?: number[];
    itemCountMap?: Record<string, number>;
    priceCountMap?: Record<number, number>;
  };
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
  const catalogTotal = catalog?.length || 0;

  function getHeatColorByCount(count: number, maxCount: number) {
    if (count <= 0 || maxCount <= 0) return "#ffffff";
    const t = clamp01(count / maxCount);
    const hue = 54 - t * 54;
    const sat = 100;
    const light = 98 - t * 48;
    return `hsl(${hue}, ${sat}%, ${light}%)`;
  }

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
      orderedByQuality[item.quality].push({
        id: item.id,
        name: item.name,
        price: item.price,
        count: Number(itemCountMap[item.id] || 0),
      });
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
      return {
        left,
        width,
        count,
        color: getHeatColorByCount(count, maxCount),
      };
    });

    const ticks: Array<{ left: number; major: boolean; label?: string }> = [];
    for (let exp = 2; exp <= 7; exp += 1) {
      const base = Math.pow(10, exp);
      if (base > maxValue) break;
      ticks.push({
        left: ((Math.log10(base) - logStart) / (logEnd - logStart)) * 100,
        major: true,
        label: base >= 10000 ? `${base / 10000}万` : String(base),
      });
      if (exp < 7) {
        for (let i = 2; i <= 9; i += 1) {
          const value = base * i;
          if (value > maxValue) break;
          ticks.push({
            left: ((Math.log10(value) - logStart) / (logEnd - logStart)) * 100,
            major: false,
          });
        }
      }
    }

    return { segments, ticks };
  }

  function renderSimulationPreview() {
    const qualityBands = buildQualityCatalogBands();
    const domainMax = buildQualityDomainMax(qualityBands);
    const bandMaxCount = Math.max(
      ...QUALITIES.flatMap((quality) => (qualityBands[quality] || []).map((item) => item.count)),
      0,
      1
    );
    const qualityOrder = ["圣", "天", "地", "玄", "黄", "凡"];
    const qualityTicks = Array.from({ length: Math.max(1, domainMax / 10) + 1 }, (_, i) => i * 10);
    const logHeat = buildLogHeatSegments();

    return (
      <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
        <HoverTip
          side="top"
          content={simulation ? <><p className="text-amber-100">品质预览</p><p className="mt-1 text-zinc-300">按图鉴固定物品顺序绘制：同品质内按价格从低到高排列，每个小格对应一个图鉴物品，颜色表示该物品在模拟中出现的次数。</p></> : <><p className="text-amber-100">品质预览</p><p className="mt-1 text-zinc-400">请先点击模拟次数生成结果。</p></>}
          label={<p className="cursor-help text-amber-100">品质预览</p>}
        />

        <div className="mt-3 rounded-xl border border-white/10 bg-slate-950/35 p-3">
          <div className="space-y-3">
            {qualityOrder.map((quality) => {
              const items = qualityBands[quality] || [];
              return (
                <div key={`quality-band-${quality}`} className="grid grid-cols-[28px_minmax(0,1fr)] items-start gap-2">
                  <div className={cn("pt-2 text-right text-xs font-medium", QUALITY_TEXT_COLOR[quality])}>{quality}</div>
                  <div>
                    <div
                      className="relative h-9 overflow-hidden rounded-md border border-white/10 bg-white"
                      style={{
                        width: `${(items.length / domainMax) * 100}%`,
                        background: buildQualityBandGradient(items, bandMaxCount),
                      }}
                    >
                      {items.map((item, index) => (
                        <HoverTip
                          key={`quality-band-cell-${quality}-${item.id}`}
                          side="top"
                          content={<><p className="text-amber-100">{item.name}</p><p className="mt-1 text-zinc-300">品质：{quality}</p><p className="mt-1 text-zinc-300">价格：{item.price}</p><p className="mt-1 text-zinc-300">模拟数量：{item.count}</p></>}
                          className="absolute top-0 bottom-0"
                          style={{
                            left: `${(index / items.length) * 100}%`,
                            width: `${100 / items.length}%`,
                          }}
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

          <div className="mt-4">
            <p className="mb-2 text-xs text-zinc-400">价格预览</p>
            <div className="relative h-4 overflow-hidden bg-white/95">
              {logHeat.segments.map((segment, index) => (
                <div
                  key={`log-heat-segment-${index}`}
                  className="absolute top-0 bottom-0"
                  style={{ left: `${segment.left}%`, width: `${segment.width}%`, background: segment.color }}
                />
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
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
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
              {Array.from({ length: 10 }, (_, index) => (
                <div key={`shape-col-${index + 1}`} className="py-1">{index + 1}</div>
              ))}
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
                          content={
                            <>
                              <p className="text-amber-100">形状 {key}</p>
                              <p className="mt-1 text-zinc-300">模拟概率：{simProb ? `${simProb.toFixed(2)}%` : "0.00%"}</p>
                              <p className="mt-1 text-zinc-300">当前格子样本：{simCounts[key] || 0} / {simulation?.totalPlaced || 0}</p>
                              <p className="mt-1 text-zinc-400">图鉴物品：{catalogCountByShape[key] || 0} / {catalogTotal}</p>
                            </>
                          }
                          label={
                            <div
                              className="min-h-8 rounded-lg border border-white/6"
                              style={{
                                background: active ? getHeatColorByCount(shapeCount, maxShapeCount) : "rgba(15,23,42,0.18)",
                                boxShadow: active
                                  ? `inset 0 0 0 1px rgba(255,237,160,0.22), inset 0 0 14px rgba(220,38,38,0.18)`
                                  : "inset 0 0 0 1px rgba(255,255,255,0.03)",
                              }}
                            />
                          }
                        />
                      ) : (
                        <div key={`shape-cell-${key}`} className="min-h-8 rounded-lg bg-transparent" />
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
        {renderSimulationPreview()}
      </div>
    </div>
  );
}

function QualityProbabilityEditor({
  values,
  locks,
  onBoundaryShift,
  onLockedSegmentShift,
  onToggleLock,
}: {
  values: Record<string, number>;
  locks: Record<string, boolean>;
  onBoundaryShift: (leftQuality: string, rightQuality: string, delta: number) => void;
  onLockedSegmentShift: (prevQuality: string, nextQuality: string, delta: number) => void;
  onToggleLock: (quality: string) => void;
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
      if (drag.mode === "boundary") {
        onBoundaryShift(drag.left, drag.right, delta);
      } else {
        onLockedSegmentShift(drag.prev, drag.next, delta);
      }
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
      <HoverTip
        side="top"
        content={<><p className="text-cyan-100">品质权重</p><p className="mt-1 text-zinc-300">控制凡、黄、玄、地、天、圣六个品质在储物袋中出现的数量倾向，总和固定为100。</p></>}
        label={<p className="inline-flex cursor-help text-cyan-100">品质权重</p>}
      />
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
            const roundLeft = index === 0 || locked || leftNeighborLocked;
            const roundRight = index === QUALITIES.length - 1 || locked || rightNeighborLocked;
            return (
              <div
                key={`quality-segment-${segment.quality}`}
                className={cn(
                  "relative flex h-full items-center justify-center text-center transition",
                  QUALITY_TEXT_COLOR[segment.quality],
                  index !== QUALITIES.length - 1 && !(locked || rightNeighborLocked) ? "border-r border-white/10" : "",
                  roundLeft ? "rounded-l-2xl" : "",
                  roundRight ? "rounded-r-2xl" : "",
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
                title=""
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
                ) : (
                  <span className="w-3" />
                )}
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
                ) : (
                  <span className="w-3" />
                )}
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

export function App() {
  const [connected, setConnected] = useState(false);
  const [state, setState] = useState<ServerState | null>(null);
  const [staticMeta, setStaticMeta] = useState<any>(null);
  const [chatMessages, setChatMessages] = useState<any[]>([]);
  const [roomList, setRoomList] = useState<any[]>([]);
  const [globalOnlineCount, setGlobalOnlineCount] = useState(0);
  const [playerName, setPlayerName] = useState(localStorage.getItem("player_name") || "");
  const [joinRoomId, setJoinRoomId] = useState(localStorage.getItem("room_id") || "");
  const [password, setPassword] = useState("");
  const [chatInput, setChatInput] = useState("");
  const [bidInput, setBidInput] = useState("");
  const [selectedTool, setSelectedTool] = useState<any | null>(null);
  const [showToolPicker, setShowToolPicker] = useState(false);
  const [showToolConfirm, setShowToolConfirm] = useState(false);
  const [showKeypad, setShowKeypad] = useState(false);
  const [showCodex, setShowCodex] = useState(false);
  const [codexViewMode, setCodexViewMode] = useState<"list" | "card">("card");
  const [catalogSort, setCatalogSort] = useState<{ key: "type" | "name" | "quality" | "shape" | "size" | "price"; direction: "asc" | "desc" }>({
    key: "type",
    direction: "asc",
  });
  const [showStatsModal, setShowStatsModal] = useState(false);
  const [statsRoundTab, setStatsRoundTab] = useState(1);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [showParameterSettings, setShowParameterSettings] = useState(false);
  const [realmLocks, setRealmLocks] = useState<Record<string, boolean>>({});
  const [qualityLocks, setQualityLocks] = useState<Record<string, boolean>>({});
  const [activeRealmTab, setActiveRealmTab] = useState<(typeof REALM_ORDER)[number]>("炼气");
  const [dragRealmHandle, setDragRealmHandle] = useState<null | "min" | "peak" | "max">(null);
  const [realmChartWidth, setRealmChartWidth] = useState(0);
  const [showShapePicker, setShowShapePicker] = useState(false);
  const [showQualityPicker, setShowQualityPicker] = useState(false);
  const [catalogFilter, setCatalogFilter] = useState({ type: "全部", quality: "全部", shape: "全部", min: 0, max: 99999999 });
  const [catalogFocusItemId, setCatalogFocusItemId] = useState<string | null>(null);
  const [shapeSimulationStats, setShapeSimulationStats] = useState<any>(null);
  const [localRevealIndex, setLocalRevealIndex] = useState(0);
  const [statsAutoOpenedKey, setStatsAutoOpenedKey] = useState<string | null>(null);
  const [uiDialog, setUiDialog] = useState<{ title: string; message: string } | null>(null);
  const [settingsForm, setSettingsForm] = useState({
    roomName: "",
    password: "",
    totalRounds: 10,
    initialSpiritStone: 500000,
    entryFee: 10000,
    maxPlayers: 6,
    hintRounds: [1, 3] as number[],
    multipliers: [2, 1.6, 1.4, 1.2, 1] as number[],
    realmProbability: {
      炼气: 5,
      筑基: 10,
      结丹: 15,
      元婴: 20,
      化神: 20,
      炼虚: 15,
      合体: 10,
      大乘: 5,
    } as Record<string, number>,
    realmCellSettings: DEFAULT_REALM_CELL_SETTINGS as Record<string, { min: number; max: number; peak: number; spread: number }>,
    qualityProbability: DEFAULT_QUALITY_PROBABILITY,
    pricePreference: {
      mode: "amount" as "amount" | "rank",
      amountMidpoint: 200000,
      amountDecay: 0.5,
      rankMidpoint: 320,
      rankDecay: 10,
    },
    shapeWeights: { ...DEFAULT_SHAPE_WEIGHTS },
    allowDuplicateRoles: true,
    showOtherSpiritStone: true,
    revealBidDisplay: "amount" as "amount" | "rank",
  });

  const chatListRef = useRef<HTMLDivElement | null>(null);
  const toolAnchorRef = useRef<HTMLButtonElement | null>(null);
  const bidAnchorRef = useRef<HTMLButtonElement | null>(null);
  const shapeAnchorRef = useRef<HTMLButtonElement | null>(null);
  const qualityAnchorRef = useRef<HTMLButtonElement | null>(null);
  const warehouseTipHoldRef = useRef<number | null>(null);
  const localRevealIndexRef = useRef(0);
  const realmChartRef = useRef<HTMLDivElement | null>(null);
  const [warehouseTip, setWarehouseTip] = useState<null | { item: any; rect: DOMRect }>(null);
  const audio = useGameAudio();
  const lastChatMessageIdRef = useRef<string>("");
  const lastRoundAnnounceKeyRef = useRef<string>("");
  const lastCountdownSecondRef = useRef<number | null>(null);
  const lastRevealedItemIdsRef = useRef<Set<string>>(new Set());
  const syncedChatRoomIdRef = useRef<string>("");

  const socket = useMemo<Socket>(() => {
    const token = localStorage.getItem("player_token") || "";
    return io(WS_URL, {
      autoConnect: false,
      path: WS_PATH,
      transports: ["websocket", "polling"],
      auth: { token },
    });
  }, []);

  useEffect(() => {
    socket.connect();
    socket.on("connect", () => {
      setConnected(true);
      socket.emit("room:list", (res: any) => {
        if (res?.ok) {
          setRoomList(res.rooms || []);
          setGlobalOnlineCount(Number(res.onlineCount || 0));
        }
      });
      socket.emit("chat:sync", (res: any) => {
        if (res?.ok) setChatMessages(Array.isArray(res.messages) ? res.messages : []);
      });
    });
    socket.on("disconnect", () => setConnected(false));
    socket.on("connect_error", (err: Error) => {
      console.error("Socket连接失败:", err.message);
    });
    socket.on("meta:static", (payload: any) => {
      setStaticMeta(payload);
    });
    socket.on("chat:full", (payload: any[]) => {
      setChatMessages(Array.isArray(payload) ? payload : []);
    });
    socket.on("chat:new", (payload: any) => {
      setChatMessages((prev) => {
        if (!payload?.id) return prev;
        if (prev.some((msg) => msg.id === payload.id)) return prev;
        return [...prev, payload].slice(-80);
      });
    });
    socket.on("state:update", (payload: any) => {
      setState(payload);
      const nextRoomId = payload?.room?.roomId || "";
      if (nextRoomId) {
        localStorage.setItem("room_id", nextRoomId);
        if (syncedChatRoomIdRef.current !== nextRoomId) {
          syncedChatRoomIdRef.current = nextRoomId;
          socket.emit("chat:sync", (res: any) => {
            if (res?.ok) setChatMessages(Array.isArray(res.messages) ? res.messages : []);
          });
        }
      } else {
        syncedChatRoomIdRef.current = "";
      }
      if (payload?.room?.settings) {
        setSettingsForm({
          roomName: payload.room.settings.roomName || "",
          password: payload.room.settings.password || "",
          totalRounds: payload.room.settings.totalRounds,
          initialSpiritStone: payload.room.settings.initialSpiritStone,
          entryFee: payload.room.settings.entryFee,
          maxPlayers: payload.room.settings.maxPlayers,
          hintRounds: Array.isArray(payload.room.settings.hintRounds) ? payload.room.settings.hintRounds : [1, 3],
          multipliers: Array.isArray(payload.room.settings.multipliers) ? payload.room.settings.multipliers : [2, 1.6, 1.4, 1.2, 1],
          realmProbability: payload.room.settings.realmProbability || {
            炼气: 5,
            筑基: 10,
            结丹: 15,
            元婴: 20,
            化神: 20,
            炼虚: 15,
            合体: 10,
            大乘: 5,
          },
          realmCellSettings: payload.room.settings.realmCellSettings || DEFAULT_REALM_CELL_SETTINGS,
          qualityProbability: payload.room.settings.qualityProbability || DEFAULT_QUALITY_PROBABILITY,
          pricePreference: payload.room.settings.pricePreference || {
            mode: "amount",
            amountMidpoint: 200000,
            amountDecay: 0.5,
            rankMidpoint: 320,
            rankDecay: 10,
          },
          shapeWeights: payload.room.settings.shapeWeights || { ...DEFAULT_SHAPE_WEIGHTS },
          allowDuplicateRoles: Boolean(payload.room.settings.allowDuplicateRoles),
          showOtherSpiritStone: payload.room.settings.showOtherSpiritStone !== false,
          revealBidDisplay: payload.room.settings.revealBidDisplay === "rank" ? "rank" : "amount",
        });
      }
    });
    socket.on("room:kicked", () => {
      clearIdentityAndRoom();
      setUiDialog({ title: "已被请离房间", message: "你已被房主请离房间。" });
    });
    return () => {
      socket.removeAllListeners();
      socket.close();
    };
  }, [socket]);

  useEffect(() => {
    if (!chatListRef.current) return;
    chatListRef.current.scrollTop = chatListRef.current.scrollHeight;
  }, [chatMessages]);

  useEffect(() => {
    if (settingsOpen || showParameterSettings) {
      setRealmLocks({});
      setQualityLocks({});
    }
  }, [settingsOpen, showParameterSettings]);

  useEffect(() => {
    if (!showParameterSettings) return;
    const update = () => setRealmChartWidth(realmChartRef.current?.clientWidth || 0);
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, [showParameterSettings, activeRealmTab]);

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

  useEffect(() => {
    const result = state?.room?.latestResult;
    if (!result) {
      setStatsAutoOpenedKey(null);
      return;
    }
    const canOpenStatsNow = Boolean(state?.game?.status === "已完成" && state?.game?.currentRoundState?.settlement?.viewer?.completed);
    const resultKey = `${result.gameId}_${state?.selfId || "unknown"}`;
    if (canOpenStatsNow && statsAutoOpenedKey !== resultKey) {
      setShowCodex(false);
      setShowStatsModal(true);
      setStatsAutoOpenedKey(resultKey);
    }
  }, [state?.room?.latestResult, state?.game, state?.selfId, statsAutoOpenedKey]);

  useEffect(() => {
    if (showCodex) resetCatalogSort();
  }, [showCodex]);

  useEffect(() => {
    if (showCodex && codexViewMode === "list") resetCatalogSort();
  }, [showCodex, codexViewMode]);


  const room = state?.room;
  const game = state?.game;
  const currentRound = game?.currentRoundState;
  const selfId = state?.selfId;
  const me = room?.players?.find((p: any) => p.id === selfId);
  const isHost = room?.ownerId === selfId;
  const roleList = staticMeta?.roles || [];
  const toolList = staticMeta?.tools || [];
  const catalog = staticMeta?.catalog || [];
  const roleSelections = room?.roleSelections || {};
  const currentBidRound = currentRound?.auction?.bidRound || 1;
  const isActionPhase = currentRound?.auction?.phase === "行动中";
  const isSubmitted = currentRound?.auction?.submittedIds?.includes(selfId);
  const settlement = currentRound?.settlement;
  const viewer = settlement?.viewer || null;
  const isFinalRound = Boolean(game && game.currentRound >= game.totalRounds);
  const canViewStats = Boolean(game?.status === "已完成" && viewer?.completed);
  const isBankrupt = Boolean(me?.bankrupt || state?.self?.bankrupt || ((me?.spiritStone ?? 0) < 0));
  const currentRoundStatus =
    currentRound?.auction?.statusByPlayer?.[selfId] ||
    (currentRound?.auction?.forfeitedThisRound?.[selfId]
      ? "放弃"
      : isBankrupt
        ? "破产"
        : !me?.connected
          ? "离线"
          : me?.managed
            ? (me as any)?.managedReason === "托管"
              ? "托管"
              : "离线"
            : "");
  const cannotBidThisRound = Boolean(["放弃", "超时", "破产", "离线", "托管"].includes(currentRoundStatus));
  const usedToolId = currentRound?.auction?.usedTools?.[selfId] || "";
  const usedToolHistory = new Set<string>(currentRound?.auction?.usedToolHistoryByPlayer?.[selfId] || []);
  const unaffordableToolIds = new Set<string>((toolList || []).filter((t: any) => (me?.spiritStone ?? 0) < t.cost).map((t: any) => t.id));
  const sortedPlayers = [...(room?.players || [])].sort((a: any, b: any) => b.spiritStone - a.spiritStone);
  const activeLobbyPlayers = room ? room.players.filter((p: any) => !p.bankrupt) : [];
  const canStartGame = Boolean(
    room &&
      activeLobbyPlayers.length >= 2 &&
      activeLobbyPlayers.every((p: any) => p.ready)
  );

  useNowTicker(Boolean(currentRound?.auction?.deadlineAt || settlement?.allReadyCountdownAt || settlement?.forceNextAt));

  const actionCountdown = currentRound?.auction?.deadlineAt ? Math.max(0, Math.ceil((currentRound.auction.deadlineAt - Date.now()) / 1000)) : 0;
  const allReadyCountdown = settlement?.allReadyCountdownAt ? Math.max(0, Math.ceil((settlement.allReadyCountdownAt - Date.now()) / 1000)) : 0;
  const forceCountdown = settlement?.forceNextAt ? Math.max(0, Math.ceil((settlement.forceNextAt - Date.now()) / 1000)) : 0;

  const catalogById = useMemo(() => {
    const map = new Map<string, any>();
    (catalog || []).forEach((item: any) => map.set(item.id, item));
    return map;
  }, [catalog]);

  const resolvedPlacedItems = useMemo(() => {
    return (currentRound?.placedItems || []).map((item: any) => ({
      ...catalogById.get(item.id),
      ...item,
    }));
  }, [currentRound?.placedItems, catalogById]);

  const settlementVisibleItems = useMemo(() => {
    if (!settlement || !viewer) return [] as any[];
    const revealIndex = Math.max(0, Math.min(localRevealIndex, (settlement.revealOrder || []).length));
    const ids = new Set((settlement.revealOrder || []).slice(0, revealIndex).map((it: any) => it.placedId));
    return resolvedPlacedItems.filter((it: any) => ids.has(it.placedId));
  }, [settlement, viewer, localRevealIndex, resolvedPlacedItems]);

  const settlementRunningValue = useMemo(() => {
    return settlementVisibleItems.reduce((sum: number, it: any) => sum + (it.price || 0), 0);
  }, [settlementVisibleItems]);

  const settlementRunningProfit = useMemo(() => {
    if (!settlement) return 0;
    return settlementRunningValue - (settlement.winningBid || 0);
  }, [settlementRunningValue, settlement]);

  const lowestEstimatedBagValue = useMemo(() => {
    if (!currentRound || settlement) return 0;
    const allItems = resolvedPlacedItems;
    const intel = currentRound.intel || {};
    const knownItemIds = new Set(intel.knownItemIds || []);
    const knownContours = new Set(intel.knownContours || []);
    const knownTypeIds = new Set(intel.knownTypeItemIds || []);
    const qualityByItemId = new Map<string, string>();
    (intel.knownQualityCells || []).forEach((cell: any) => {
      const matchedItem = allItems.find((it: any) => it.placedId === cell.itemPlacedId);
      if (!matchedItem?.quality) return;
      qualityByItemId.set(cell.itemPlacedId, matchedItem.quality);
    });

    return allItems.reduce((sum: number, item: any) => {
      if (knownItemIds.has(item.placedId)) return sum + (item.price || 0);
      const hasContour = knownContours.has(item.placedId);
      const knownType = knownTypeIds.has(item.placedId) ? item.type : null;
      const knownQuality = qualityByItemId.get(item.placedId) || null;
      if (!hasContour && !knownType && !knownQuality) return sum;
      const candidates = catalog.filter((catalogItem: any) => {
        if (hasContour && catalogItem.shape !== item.shape) return false;
        if (knownType && catalogItem.type !== knownType) return false;
        if (knownQuality && catalogItem.quality !== knownQuality) return false;
        return true;
      });
      if (!candidates.length) return sum;
      return sum + Math.min(...candidates.map((candidate: any) => candidate.price || 0));
    }, 0);
  }, [currentRound, settlement, catalog, resolvedPlacedItems]);

  const bagSummaryText = settlement ? `总价值：${settlementRunningValue}` : `最低预估：${lowestEstimatedBagValue}`;



  const filteredCatalog = useMemo(() => {
    if (!showCodex) return [] as any[];
    const result = catalog.filter((item: any) => {
      if (catalogFocusItemId) return item.id === catalogFocusItemId;
      if (catalogFilter.type !== "全部" && item.type !== catalogFilter.type) return false;
      if (catalogFilter.quality !== "全部" && item.quality !== catalogFilter.quality) return false;
      if (catalogFilter.shape !== "全部" && item.shape !== catalogFilter.shape) return false;
      if (item.price < catalogFilter.min || item.price > catalogFilter.max) return false;
      return true;
    });
    const qualityIndex = new Map(QUALITIES.map((q, idx) => [q, idx]));
    const directionFactor = catalogSort.direction === "asc" ? 1 : -1;
    return [...result].sort((a: any, b: any) => {
      let primary = 0;
      if (catalogSort.key === "type") {
        primary = String(a.type).localeCompare(String(b.type), "zh-Hans-CN");
      } else if (catalogSort.key === "name") {
        primary = String(a.name).localeCompare(String(b.name), "zh-Hans-CN");
      } else if (catalogSort.key === "quality") {
        primary = (qualityIndex.get(a.quality) ?? 999) - (qualityIndex.get(b.quality) ?? 999);
      } else if (catalogSort.key === "shape") {
        primary = String(a.shape).localeCompare(String(b.shape), "zh-Hans-CN");
      } else if (catalogSort.key === "size") {
        primary = (a.size || 0) - (b.size || 0);
      } else if (catalogSort.key === "price") {
        primary = (a.price || 0) - (b.price || 0);
      }
      if (primary !== 0) return primary * directionFactor;

      const typeCompare = String(a.type).localeCompare(String(b.type), "zh-Hans-CN");
      if (typeCompare !== 0) return typeCompare;
      const qualityCompare = (qualityIndex.get(a.quality) ?? 999) - (qualityIndex.get(b.quality) ?? 999);
      if (qualityCompare !== 0) return qualityCompare;
      const sizeCompare = (a.size || 0) - (b.size || 0);
      if (sizeCompare !== 0) return sizeCompare;
      const priceCompare = (a.price || 0) - (b.price || 0);
      if (priceCompare !== 0) return priceCompare;
      return String(a.name).localeCompare(String(b.name), "zh-Hans-CN");
    });
  }, [showCodex, catalog, catalogFocusItemId, catalogFilter.type, catalogFilter.quality, catalogFilter.shape, catalogFilter.min, catalogFilter.max, catalogSort]);

  const revealedPlacedIds = useMemo(() => {
    if (!settlement || !viewer) return new Set<string>();
    return new Set((settlement.revealOrder || []).slice(0, localRevealIndex).map((it: any) => it.placedId));
  }, [settlement, viewer, localRevealIndex]);

  const qualityCellMap = useMemo(() => {
    const map = new Map<string, any>();
    if (!currentRound?.intel?.knownQualityCells) return map;
    currentRound.intel.knownQualityCells.forEach((cell: any) => {
      map.set(cell.itemPlacedId, cell);
    });
    return map;
  }, [currentRound?.intel?.knownQualityCells]);

  const visiblePlacedItems = useMemo(() => {
    if (!currentRound) return [] as any[];
    if (settlement) {
      return settlementVisibleItems.map((item: any) => ({ ...item, viewMode: "item", knownQuality: true, knownType: true, qualityCell: null }));
    }
    const intel = currentRound.intel || { knownItemIds: [], knownContours: [], knownTypeItemIds: [] };
    return resolvedPlacedItems.flatMap((item: any) => {
      const knownItem = revealedPlacedIds.has(item.placedId) || intel.knownItemIds.includes(item.placedId);
      const knownContour = intel.knownContours.includes(item.placedId);
      const qualityCell = qualityCellMap.get(item.placedId) || null;
      const knownQuality = Boolean(qualityCell);
      const knownType = intel.knownTypeItemIds?.includes(item.placedId);
      if (knownItem) return [{ ...item, viewMode: "item", knownQuality: true, knownType: true, qualityCell }];
      if (knownContour) return [{ ...item, viewMode: "contour", knownQuality, knownType, qualityCell }];
      return [];
    });
  }, [currentRound, revealedPlacedIds, settlement, settlementVisibleItems, qualityCellMap]);

  const visibleItemIds = useMemo(() => new Set(visiblePlacedItems.filter((it: any) => it.viewMode === "item").map((it: any) => it.placedId)), [visiblePlacedItems]);

  const contourItemIds = useMemo(() => new Set(visiblePlacedItems.filter((it: any) => it.viewMode === "contour").map((it: any) => it.placedId)), [visiblePlacedItems]);

  const visibleQualityCells = useMemo(() => {
    if (settlement) return [] as any[];
    if (!currentRound?.intel?.knownQualityCells) return [] as any[];
    const knownTypeIds = new Set(currentRound?.intel?.knownTypeItemIds || []);
    return currentRound.intel.knownQualityCells
      .filter((cell: any) => !visibleItemIds.has(cell.itemPlacedId) && !contourItemIds.has(cell.itemPlacedId))
      .map((cell: any) => {
        const matchedItem = resolvedPlacedItems.find((it: any) => it.placedId === cell.itemPlacedId);
        return {
          ...cell,
          quality: matchedItem?.quality,
          type: knownTypeIds.has(cell.itemPlacedId) ? matchedItem?.type : null,
        };
      })
      .filter((cell: any) => cell.quality);
  }, [currentRound, visibleItemIds, contourItemIds, settlement, resolvedPlacedItems]);

  useEffect(() => {
    if (usedToolId) setSelectedTool(toolList.find((t: any) => t.id === usedToolId) || null);
    else setSelectedTool(null);
  }, [usedToolId, toolList]);

  useEffect(() => {
    localRevealIndexRef.current = localRevealIndex;
  }, [localRevealIndex]);

  const settlementKey = settlement ? `${currentRound?.id || ""}_${selfId || ""}` : null;
  const lastSettlementKeyRef = useRef<string | null>(null);

  useEffect(() => {
    if (!settlement || !viewer) {
      setLocalRevealIndex(0);
      lastSettlementKeyRef.current = null;
      return;
    }
    const total = (settlement.revealOrder || []).length;
    const currentKey = settlementKey;
    const isNewSettlement = currentKey !== lastSettlementKeyRef.current;

    if (isNewSettlement) {
      lastSettlementKeyRef.current = currentKey;
      setLocalRevealIndex(viewer.mode === "instant" || viewer.completed ? total : 0);
    }

    if (viewer.mode === "instant") {
      setLocalRevealIndex(total);
      return;
    }

    if (viewer.completed && localRevealIndexRef.current >= total) {
      return;
    }

    if (!total) {
      if (!viewer.completed) socket.emit("settlement:revealCompleted");
      return;
    }

    const timer = window.setInterval(() => {
      setLocalRevealIndex((prev) => {
        const next = Math.min(total, prev + 1);
        if (next >= total) {
          window.clearInterval(timer);
          if (!viewer.completed) {
            window.setTimeout(() => socket.emit("settlement:revealCompleted"), 0);
          }
        }
        return next;
      });
    }, settlement.stepMs || 320);
    return () => window.clearInterval(timer);
  }, [settlementKey, settlement?.stepMs, settlement?.revealOrder, viewer?.mode, viewer?.completed, socket]);

  useEffect(() => {
    const closeWarehouseTip = () => setWarehouseTip(null);
    document.addEventListener("scroll", closeWarehouseTip, true);
    window.addEventListener("resize", closeWarehouseTip);
    return () => {
      document.removeEventListener("scroll", closeWarehouseTip, true);
      window.removeEventListener("resize", closeWarehouseTip);
    };
  }, []);

  function openWarehouseTip(item: any, eventOrEl?: React.MouseEvent<HTMLElement> | React.FocusEvent<HTMLElement> | HTMLElement | null) {
    const target = eventOrEl instanceof HTMLElement
      ? eventOrEl
      : eventOrEl && "currentTarget" in eventOrEl
        ? (eventOrEl.currentTarget as HTMLElement)
        : null;
    const rect = target?.getBoundingClientRect() || null;
    if (!rect || rect.width <= 0 || rect.height <= 0) return;
    setWarehouseTip({ item, rect });
  }

  function closeWarehouseTip() {
    setWarehouseTip(null);
    if (warehouseTipHoldRef.current) {
      window.clearTimeout(warehouseTipHoldRef.current);
      warehouseTipHoldRef.current = null;
    }
  }

  function startWarehouseTipHold(item: any, event: React.TouchEvent<HTMLElement>) {
    closeWarehouseTip();
    const el = event.currentTarget as HTMLElement;
    warehouseTipHoldRef.current = window.setTimeout(() => {
      openWarehouseTip(item, el);
    }, 420);
  }

  function clearWarehouseTipHold() {
    if (warehouseTipHoldRef.current) {
      window.clearTimeout(warehouseTipHoldRef.current);
      warehouseTipHoldRef.current = null;
    }
  }

  function appendBidDigit(digit: string) {
    setBidInput((prev) => `${prev}${digit}`.replace(/^0+(\d)/, "$1").slice(0, 9));
  }

  function deleteBidDigit() {
    setBidInput((prev) => prev.slice(0, -1));
  }

  function clearBidInput() {
    setBidInput("");
  }

  function persistIdentity(name: string, token: string) {
    localStorage.setItem("player_name", name);
    localStorage.setItem("player_token", token);
    socket.auth = { token };
  }

  function clearIdentityAndRoom() {
    localStorage.removeItem("player_token");
    localStorage.removeItem("room_id");
    setState(null);
    setJoinRoomId("");
    setSelectedTool(null);
    setShowToolPicker(false);
    setShowToolConfirm(false);
    setBidInput("");
    socket.auth = { token: "" };
    socket.emit("room:list", (res: any) => {
      if (res?.ok) {
        setRoomList(res.rooms || []);
        setGlobalOnlineCount(Number(res.onlineCount || 0));
      }
    });
  }

  function leaveRoom() {
    audio.click();
    socket.emit("room:leave", {}, () => clearIdentityAndRoom());
  }

  function createRoom() {
    audio.click();
    if (!playerName.trim()) {
      setUiDialog({ title: "无法创建房间", message: "请先填写道号。" });
      return;
    }
    socket.emit(
      "room:create",
      {
        name: playerName.trim(),
        maxPlayers: settingsForm.maxPlayers,
        hintRounds: settingsForm.hintRounds,
        multipliers: settingsForm.multipliers,
        password,
      },
      (res: any) => {
        if (!res?.ok) {
          setUiDialog({ title: "无法创建房间", message: res?.message || "创建失败" });
          return;
        }
        persistIdentity(playerName.trim(), res.token);
      }
    );
  }

  function joinRoom(targetRoomId?: string) {
    audio.click();
    const finalRoomId = (targetRoomId || joinRoomId).trim().toUpperCase();
    if (!playerName.trim()) {
      setUiDialog({ title: "无法加入房间", message: "请先填写道号。" });
      return;
    }
    if (!finalRoomId) {
      setUiDialog({ title: "无法加入房间", message: "请输入房间ID。" });
      return;
    }
    socket.emit("room:join", { name: playerName.trim(), roomId: finalRoomId, password }, (res: any) => {
      if (!res?.ok) {
        setUiDialog({ title: "无法加入房间", message: res?.message || "加入失败" });
        return;
      }
      persistIdentity(playerName.trim(), res.token);
    });
  }

  function updatePlayer(patch: Record<string, unknown>) {
    socket.emit("player:update", patch);
  }

  function updateRoomSettings() {
    socket.emit("room:updateSettings", settingsForm);
  }

  function submitBid() {
    audio.click();
    const amount = bidInput === "" ? null : Number(bidInput);
    if (isBankrupt) {
      setUiDialog({ title: "无法参与竞拍", message: "你已破产，无法继续参与竞拍。请等待本局结束。" });
      return;
    }
    if (amount !== null && amount > (me?.spiritStone ?? 0)) {
      setUiDialog({ title: "灵石不足", message: `当前最多只能出价 ${me?.spiritStone ?? 0}。` });
      return;
    }
    socket.emit("action:submitBid", { amount });
    audio.submit();
    setShowKeypad(false);
  }

  function sendChat() {
    if (!chatInput.trim()) return;
    audio.click();
    socket.emit("chat:send", { text: chatInput.trim().slice(0, 70) });
    setChatInput("");
  }

  function selectTool(tool: any) {
    if (!tool || !isActionPhase || isSubmitted || !!usedToolId || usedToolHistory.has(tool.id)) return;
    setSelectedTool(tool);
    setShowToolPicker(false);
    setShowToolConfirm(true);
  }

  function confirmUseTool() {
    if (!selectedTool || !isActionPhase || isSubmitted || !!usedToolId) return;
    if (isBankrupt) {
      setUiDialog({ title: "无法推演", message: "你已破产，无法继续推演。请等待本局结束。" });
      return;
    }
    if ((me?.spiritStone ?? 0) < (selectedTool?.cost ?? 0)) {
      setUiDialog({ title: "灵石不足", message: `无法催动【${selectedTool.name}】。` });
      return;
    }
    audio.click();
    socket.emit("action:useTool", { toolId: selectedTool.id });
    audio.submit();
    setShowToolConfirm(false);
    setSelectedTool(null);
  }

  function getRoundUsedToolMeta(playerId: string, roundNo: number) {
    const log = currentRound?.auction?.logs?.find((l: any) => l.roundNo === roundNo);
    const currentToolId = currentRound?.auction?.usedTools?.[playerId];
    const toolId = roundNo === currentBidRound && isActionPhase ? currentToolId : log?.usedTools?.[playerId];
    if (!toolId) return null;
    return toolList.find((t: any) => t.id === toolId) || null;
  }

  function getRoundUsedTool(playerId: string, roundNo: number) {
    const tool = getRoundUsedToolMeta(playerId, roundNo);
    return tool?.short || tool?.name || "";
  }

  function getRoundBidStatus(playerId: string, roundNo: number) {
    const logs = currentRound?.auction?.logs || [];
    const maxReachedRoundNo = currentBidRound || 0;
    const getCarryStatus = () => {
      const previous = [...logs]
        .filter((l: any) => l.roundNo <= Math.min(roundNo, maxReachedRoundNo))
        .sort((a: any, b: any) => b.roundNo - a.roundNo)
        .find((l: any) => (l?.statusByPlayer?.[playerId] || "") !== "");
      return previous?.statusByPlayer?.[playerId] || "";
    };

    if (roundNo > maxReachedRoundNo) {
      return "";
    }

    const log = logs.find((l: any) => l.roundNo === roundNo);
    if (log) {
      const rawBid = log?.bids?.[playerId];
      const bid = Number(rawBid ?? 0);
      const directStatus = log?.statusByPlayer?.[playerId] || "";
      const status = directStatus || (rawBid === undefined ? getCarryStatus() : "");
      const isSettlementPhase = currentRound?.auction?.phase === "回合结算";
      const displayMode = isSettlementPhase ? "amount" : (room?.settings?.revealBidDisplay || "amount");
      if (displayMode === "rank") {
        const numericEntries = Object.keys(log?.bids || {}).map((pid) => ({ pid, bid: Number(log.bids?.[pid] ?? 0) }));
        const higherCount = numericEntries.filter((entry) => entry.bid > bid).length;
        return `第${higherCount + 1}`;
      }
      return status || String(bid);
    }
    if (roundNo === currentBidRound && isActionPhase) {
      return currentRound?.auction?.submittedIds?.includes(playerId) ? "✓" : "";
    }
    const carryStatus = getCarryStatus();
    return carryStatus || "";
  }

  function getSettlementWinnerName() {
    if (!settlement?.winnerId) return "流拍";
    return room.players.find((p: any) => p.id === settlement.winnerId)?.name || "未知修士";
  }

  function resetCatalogSort() {
    setCatalogSort({ key: "type", direction: "asc" });
  }

  function resetCatalogFilterAndSort() {
    setCatalogFocusItemId(null);
    setCatalogFilter({ type: "全部", quality: "全部", shape: "全部", min: 0, max: 99999999 });
    resetCatalogSort();
  }

  function adjustRealmProbabilityBoundary(leftRealm: (typeof REALM_ORDER)[number], rightRealm: (typeof REALM_ORDER)[number], delta: number) {
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

  function adjustLockedRealmSegmentShift(prevRealm: (typeof REALM_ORDER)[number], nextRealm: (typeof REALM_ORDER)[number], delta: number) {
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
      const leftIndex = QUALITIES.indexOf(leftQuality);
      const rightIndex = QUALITIES.indexOf(rightQuality);
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

  function runShapeSimulation(samples = SHAPE_SIMULATION_RUNS) {
    const nextSeed = `${Date.now()}_${Math.random()}`;
    setShapeSimulationStats(
      simulateShapeMatrixStats({
        catalog,
        realmProbability: settingsForm.realmProbability,
        realmCellSettings: settingsForm.realmCellSettings,
        qualityProbability: settingsForm.qualityProbability,
        pricePreference: settingsForm.pricePreference,
        shapeWeights: settingsForm.shapeWeights,
        samples,
        randomSeed: nextSeed,
      })
    );
  }

  function resetParameterSettingsToDefault() {
    setSettingsForm((s) => ({
      ...s,
      realmProbability: {
        炼气: 5,
        筑基: 10,
        结丹: 15,
        元婴: 20,
        化神: 20,
        炼虚: 15,
        合体: 10,
        大乘: 5,
      },
      realmCellSettings: JSON.parse(JSON.stringify(DEFAULT_REALM_CELL_SETTINGS)),
      qualityProbability: { ...DEFAULT_QUALITY_PROBABILITY },
      pricePreference: {
        mode: "amount",
        amountMidpoint: 200000,
        amountDecay: 0.5,
        rankMidpoint: 320,
        rankDecay: 10,
      },
      shapeWeights: { ...DEFAULT_SHAPE_WEIGHTS },
    }));
    setRealmLocks({});
    setQualityLocks({});
    setActiveRealmTab("炼气");
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
    return values.map((v) => ({
      label: v.label,
      value: v.y / maxY,
      binEnd: v.binEnd,
    }));
  }

  function toggleCatalogSort(key: "type" | "name" | "quality" | "shape" | "size" | "price") {
    setCatalogSort((prev) =>
      prev.key === key
        ? { key, direction: prev.direction === "asc" ? "desc" : "asc" }
        : { key, direction: "asc" }
    );
  }

  function renderSortMark(key: "type" | "name" | "quality" | "shape" | "size" | "price") {
    if (catalogSort.key !== key) return "↕";
    return catalogSort.direction === "asc" ? "↑" : "↓";
  }

  function renderSettlementActionButtons() {
    if (!settlement || !viewer?.completed) return null;
    if (game.status === "已完成" || isFinalRound) {
      return canViewStats ? (
        <button
          className="flex h-14 w-14 items-center justify-center rounded-2xl border border-fuchsia-400/30 bg-fuchsia-500/10 px-2 text-[11px] text-fuchsia-100"
          onClick={() => setShowStatsModal(true)}
        >
          统计
        </button>
      ) : null;
    }
    return (
      <>
        <button
          className={cn(
            "flex h-14 w-14 items-center justify-center rounded-2xl border px-2 text-[11px] leading-tight",
            viewer?.readyForNextRound ? "border-emerald-400/30 bg-emerald-500/10 text-emerald-100 hover:border-amber-400/30 hover:bg-amber-500/10 hover:text-amber-100" : "border-emerald-400/30 bg-emerald-500/10 text-emerald-100"
          )}
          title={viewer?.readyForNextRound ? "点击取消准备" : "点击准备下一回合"}
          onClick={() => socket.emit("settlement:readyNext")}
        >
          {viewer?.readyForNextRound
            ? settlement.allReadyCountdownAt
              ? `取消${allReadyCountdown}s`
              : "已准备"
            : `准备${forceCountdown}s`}
        </button>
        {isHost && (
          <button
            className="flex h-14 w-14 items-center justify-center rounded-2xl border border-rose-400/30 bg-rose-500/10 px-2 text-[11px] text-rose-100"
            onClick={() => socket.emit("round:forceNext")}
          >
            强开
          </button>
        )}
      </>
    );
  }

  function getLobbyPlayerStatus(player: any) {
    if (player?.bankrupt) return "破产";
    return player.ready ? "已准备" : "未准备";
  }

  function canSeePlayerSpiritStone(playerId: string) {
    if (playerId === selfId) return true;
    return room?.settings?.showOtherSpiritStone !== false;
  }

  function getRolePickedNames(roleId: string) {
    return (roleSelections?.[roleId] || [])
      .map((pid: string) => room?.players?.find((p: any) => p.id === pid)?.name)
      .filter(Boolean)
      .join("、");
  }

  const selfRole = roleList.find((r: any) => r.id === me?.roleId);
  const gameMain = room && game;

  useEffect(() => {
    const messages = chatMessages || [];
    if (!messages.length) return;
    const latest = messages[messages.length - 1];
    if (!latest?.id || latest.id === lastChatMessageIdRef.current) return;
    lastChatMessageIdRef.current = latest.id;

    if (latest.senderId === "system" && latest.text) {
      audio.speak(latest.text, 1.02);
      return;
    }

    if (latest.text) {
      if (latest.senderId === selfId) {
        audio.speak(`你说：${latest.text}`, 1.05);
      } else {
        audio.speak(`${latest.senderName}说：${latest.text}`, 1.05);
      }
    }
  }, [chatMessages, selfId, audio]);

  useEffect(() => {
    if (!game || !currentRound || !isActionPhase) return;
    const key = `${game.id}_${currentRound.roundNo}_${currentBidRound}`;
    if (lastRoundAnnounceKeyRef.current === key) return;
    lastRoundAnnounceKeyRef.current = key;
    audio.speak(`第${currentRound.roundNo}回合，第${currentBidRound}轮竞拍。`, 1);
  }, [game, currentRound, currentBidRound, isActionPhase, audio]);

  useEffect(() => {
    if (!isActionPhase || !actionCountdown) return;
    if (lastCountdownSecondRef.current === actionCountdown) return;
    lastCountdownSecondRef.current = actionCountdown;
    if (actionCountdown === 10) audio.speak("还剩10秒。", 1.08);
    if (actionCountdown === 5) audio.speak("还剩5秒。", 1.12);
    if (actionCountdown <= 5 && actionCountdown >= 1) audio.tick();
  }, [actionCountdown, isActionPhase, audio]);


  useEffect(() => {
    const visibleIds = new Set<string>(visiblePlacedItems.filter((item: any) => item.viewMode === "item").map((item: any) => item.placedId));
    visibleIds.forEach((placedId) => {
      if (lastRevealedItemIdsRef.current.has(placedId)) return;
      lastRevealedItemIdsRef.current.add(placedId);
      const item = visiblePlacedItems.find((entry: any) => entry.placedId === placedId);
      audio.revealByQuality(item?.quality);
    });
  }, [visiblePlacedItems, audio]);

  useEffect(() => {
    if (!currentRound?.id) {
      lastRevealedItemIdsRef.current = new Set();
      lastCountdownSecondRef.current = null;
      return;
    }
    lastRevealedItemIdsRef.current = new Set();
    lastCountdownSecondRef.current = null;
  }, [currentRound?.id]);

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(34,197,94,0.08),_transparent_20%),radial-gradient(circle_at_top_right,_rgba(245,158,11,0.12),_transparent_24%),linear-gradient(180deg,_#05070f_0%,_#0b1020_45%,_#120d18_100%)] text-zinc-100">
      <header className="border-b border-amber-500/15 bg-black/35 backdrop-blur-xl">
        <div className="mx-auto flex max-w-[1800px] flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div>
            <p className="text-2xl font-semibold tracking-[0.32em] text-amber-100">修真拍卖行</p>
          </div>
          <div className="flex items-center gap-3 text-xs text-zinc-300">
            <div className="flex flex-wrap items-center gap-3 whitespace-nowrap">
              <span>联机状态：{connected ? "已连通灵网" : "灵网断开"}</span>
              {room?.roomId && <span>房间ID：{room.roomId}</span>}
            </div>
            {room && (
              <div className="flex items-center gap-2">
                {isHost && room && !game && (
                  <>
                    <button className="rounded-xl border border-cyan-400/30 bg-cyan-500/10 px-3 py-1 text-sm text-cyan-100" onClick={() => { audio.click(); setShowParameterSettings(true); }}>
                      参数设置
                    </button>
                    <button className="rounded-xl border border-amber-400/30 bg-amber-500/10 px-3 py-1 text-sm text-amber-100" onClick={() => { audio.click(); setSettingsOpen(true); }}>
                      房间设置
                    </button>
                  </>
                )}
                <button className="rounded-xl border border-rose-400/30 bg-rose-500/10 px-3 py-1 text-sm text-rose-100" onClick={leaveRoom}>
                  退出房间
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {!room && (
        <main className="mx-auto grid max-w-[1500px] gap-4 p-4 xl:grid-cols-[360px_1fr]">
          <section className="space-y-4">
            <div className="rounded-3xl border border-amber-400/15 bg-black/35 p-4 sm:p-5 shadow-[0_0_40px_rgba(245,158,11,0.08)] backdrop-blur-xl">
              <h2 className="mb-4 text-lg text-amber-200">开辟洞府房间</h2>
              <input className="mb-3 w-full rounded-xl border border-white/10 bg-slate-950/80 px-3 py-2" placeholder="你的道号" value={playerName} onChange={(e) => setPlayerName(e.target.value)} />
              <input className="mb-3 w-full rounded-xl border border-white/10 bg-slate-950/80 px-3 py-2" placeholder="房间密码（可空）" value={password} onChange={(e) => setPassword(e.target.value)} />
              <label className="mb-2 block text-sm text-zinc-400">加入人数上限（2-16）</label>
              <input type="number" min={2} max={16} className="mb-3 w-full rounded-xl border border-white/10 bg-slate-950/80 px-3 py-2" value={settingsForm.maxPlayers} onChange={(e) => setSettingsForm((s) => ({ ...s, maxPlayers: Math.max(2, Math.min(16, Number(e.target.value) || 6)) }))} />
              <button className="w-full rounded-xl border border-amber-400/30 bg-amber-500/10 py-2 text-amber-100" onClick={createRoom}>创建房间</button>
            </div>

            <div className="rounded-3xl border border-cyan-400/15 bg-black/35 p-4 sm:p-5 shadow-[0_0_40px_rgba(34,211,238,0.08)] backdrop-blur-xl">
              <h2 className="mb-4 text-lg text-cyan-200">按房间ID进入</h2>
              <input className="mb-3 w-full rounded-xl border border-white/10 bg-slate-950/80 px-3 py-2" placeholder="你的道号" value={playerName} onChange={(e) => setPlayerName(e.target.value)} />
              <input className="mb-3 w-full rounded-xl border border-white/10 bg-slate-950/80 px-3 py-2 uppercase" placeholder="房间ID" value={joinRoomId} onChange={(e) => setJoinRoomId(e.target.value.toUpperCase())} />
              <input className="mb-4 w-full rounded-xl border border-white/10 bg-slate-950/80 px-3 py-2" placeholder="房间密码（如有）" value={password} onChange={(e) => setPassword(e.target.value)} />
              <button className="w-full rounded-xl border border-cyan-400/30 bg-cyan-500/10 py-2 text-cyan-100" onClick={() => joinRoom()}>加入房间</button>
            </div>
          </section>

          <section className="rounded-3xl border border-white/10 bg-black/35 p-5 backdrop-blur-xl">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-2">
                <h2 className="text-lg text-fuchsia-200">洞府房间列表</h2>
                <span className="text-xs text-zinc-400">全站在线人数：{globalOnlineCount}</span>
              </div>
              <button className="rounded-xl border border-white/10 px-3 py-1 text-sm" onClick={() => { audio.click(); socket.emit("room:list", (res: any) => { if (res?.ok) { setRoomList(res.rooms || []); setGlobalOnlineCount(Number(res.onlineCount || 0)); } }); }}>刷新</button>
            </div>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {roomList.length === 0 && <div className="rounded-2xl border border-dashed border-white/10 p-6 text-sm text-zinc-500">当前没有可加入房间。</div>}
              {roomList.map((r: any) => {
                const canJoinRoom = r.phase !== "游戏中" && !r.latestResult;
                return (
                <div key={r.roomId} className="rounded-2xl border border-white/10 bg-slate-950/45 p-4">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm text-amber-100">{r.roomName ? `${r.roomName} · ${r.roomId}` : `房间 ${r.roomId}`}</p>
                    <span className="rounded-full border border-white/10 px-2 py-0.5 text-[10px] text-zinc-400">{r.phase}</span>
                  </div>
                  <p className="mt-2 text-xs text-zinc-400">房主：{r.ownerName}</p>
                  <p className="mt-1 text-xs text-zinc-400">人数：{r.playerCount}/{r.maxPlayers}（在线{r.onlinePlayerCount ?? r.playerCount}）</p>
                  <p className="mt-1 text-xs text-zinc-400">密码：{r.hasPassword ? "需要输入" : "无"}</p>
                  {r.phase === "游戏中" && <p className="mt-1 text-xs text-zinc-500">进度：第 {r.currentRound}/{r.totalRounds} 回合</p>}
                  <button
                    disabled={!canJoinRoom}
                    className={cn(
                      "mt-3 w-full rounded-xl border py-2 text-sm disabled:cursor-not-allowed disabled:opacity-45",
                      canJoinRoom
                        ? "border-cyan-400/30 bg-cyan-500/10 text-cyan-100"
                        : "border-slate-700/50 bg-slate-900/60 text-zinc-500"
                    )}
                    onClick={() => {
                      if (!canJoinRoom) return;
                      setJoinRoomId(r.roomId);
                      joinRoom(r.roomId);
                    }}
                  >
                    {canJoinRoom ? "加入该房间" : "游戏中不可加入"}
                  </button>
                </div>
              );})}
            </div>
          </section>
        </main>
      )}

      {room && !game && (
        <main className="mx-auto grid max-w-[1700px] gap-4 p-4 xl:grid-cols-[1.22fr_0.78fr]">
          <section className="space-y-4">
            <section className="rounded-3xl border border-white/10 bg-black/30 p-5 backdrop-blur-xl">
              <div className="mb-4 flex items-center justify-between gap-3">
                <div>
                  <p className="text-lg text-amber-100">房间准备</p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    disabled={isBankrupt}
                    className={cn(
                      "rounded-xl border px-3 py-2 text-sm disabled:opacity-40",
                      me?.ready ? "border-emerald-400/30 bg-emerald-500/10 text-emerald-100" : "border-white/10 bg-black/20 text-zinc-300"
                    )}
                    onClick={() => { audio.click(); updatePlayer({ ready: !me?.ready }); }}
                  >
                    {isBankrupt ? "已破产" : me?.ready ? "取消准备" : "准备游戏"}
                  </button>
                  {isHost && (
                    <button className="rounded-xl border border-fuchsia-400/30 bg-fuchsia-500/10 px-3 py-2 text-sm text-fuchsia-100 disabled:opacity-40" disabled={!canStartGame} onClick={() => { audio.click(); socket.emit("game:start"); }}>
                      开启游戏
                    </button>
                  )}
                </div>
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                {Array.from({ length: room.settings.maxPlayers }, (_, i) => room.players[i] || null).map((p: any, idx: number) => {
                  if (!p) {
                    return <div key={`empty-slot-${idx}`} className="rounded-2xl border border-dashed border-white/15 bg-black/10 p-4 text-sm text-zinc-500">空位 #{idx + 1}</div>;
                  }
                  const role = roleList.find((r: any) => r.id === p.roleId);
                  const self = p.id === selfId;
                  return (
                    <div key={p.id} className={cn("rounded-2xl border p-4", self ? "border-cyan-300/30 bg-cyan-500/5" : "border-white/10 bg-slate-950/40")}>
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-base text-zinc-100">{p.name}{p.isHost ? "（房主）" : ""}</p>
                          <p className="mt-1 text-sm text-zinc-400">状态：{getLobbyPlayerStatus(p)} · {p.connected ? "在线" : "离线托管"}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          {isHost && !self && (
                            <button
                              className="rounded-lg border border-rose-400/30 bg-rose-500/10 px-2 py-1 text-xs text-rose-100"
                              onClick={() => {
                                audio.click();
                                socket.emit("room:kickPlayer", { playerId: p.id }, (res: any) => {
                                  if (!res?.ok) setUiDialog({ title: "无法请离玩家", message: res?.message || "操作失败" });
                                });
                              }}
                            >
                              请离
                            </button>
                          )}
                        </div>
                      </div>
                      <div className="mt-3 rounded-2xl border border-white/10 bg-black/20 p-3">
                        <div className="flex items-center gap-3">
                          <div className="flex h-14 w-14 items-center justify-center rounded-xl border border-white/10 bg-slate-900/60 text-xl font-semibold text-amber-50">{role?.avatar}</div>
                          <div className="min-w-0 flex-1">
                            <p className="text-sm text-amber-100">{role?.name || "未选修士"}</p>
                            <p className="mt-1 line-clamp-2 text-xs text-zinc-400">{role?.skill || "暂无技能"}</p>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>

            <section className="rounded-3xl border border-white/10 bg-black/30 p-5 backdrop-blur-xl">
              <p className="mb-3 text-lg text-amber-100">房间信息</p>
              <div className="space-y-2 text-sm text-zinc-300">
                <p>房间ID：{room.roomId}</p>
                <p>房间名称：{room.settings.roomName || "未命名"}</p>
                <p>房主：{room.players.find((p: any) => p.id === room.ownerId)?.name || "无"}</p>
                <p>房间密码：{room.settings.password ? "已设置" : "无"}</p>
                <p>人数上限：{room.settings.maxPlayers}</p>
                <p>回合数：{room.settings.totalRounds}</p>
                <p>开局灵石：{room.settings.initialSpiritStone}</p>
                <p>入场券：每回合 {room.settings.entryFee}</p>
                <p>修士重复：{room.settings.allowDuplicateRoles ? "允许" : "禁止"}</p>
                <p>其他玩家灵石：{room.settings.showOtherSpiritStone === false ? "不显示" : "显示"}</p>
                <p>轮次揭晓显示：{room.settings.revealBidDisplay === "rank" ? "排名" : "金额"}</p>
                <p>系统提示轮次：{(room.settings.hintRounds || []).join("、") || "无"}</p>
                <p>前5轮判定倍率：{(room.settings.multipliers || [2, 1.6, 1.4, 1.2, 1]).join(" / ")} 倍</p>
              </div>
            </section>

            <section className="rounded-3xl border border-white/10 bg-black/30 p-5 backdrop-blur-xl">
              <p className="mb-3 text-lg text-emerald-100">聊天</p>
              <div ref={chatListRef} className="h-56 space-y-2 overflow-y-auto rounded-xl border border-white/10 bg-black/20 p-2 pr-1 text-xs">
                {(chatMessages || []).map((m: any) => (
                  <div key={m.id} className="rounded-lg bg-black/25 px-2 py-1">
                    <p><span className="text-zinc-500">[{m.time}]</span> <span className="text-amber-100">{m.senderName}</span></p>
                    <p className="mt-1 break-words text-zinc-200">{m.text}</p>
                  </div>
                ))}
              </div>
              <div className="mt-2 flex gap-2">
                <input maxLength={70} className="min-w-0 flex-1 rounded-xl border border-white/10 bg-slate-950/80 px-3 py-2 text-sm" value={chatInput} onChange={(e) => setChatInput(e.target.value.slice(0, 70))} onKeyDown={(e) => { if (e.key === "Enter") sendChat(); }} placeholder="输入消息（最多70字）" />
                <button className="rounded-xl border border-emerald-400/30 bg-emerald-500/10 px-4 text-emerald-100" onClick={sendChat}>发送</button>
              </div>
            </section>
          </section>

          <aside className="space-y-4">
            <section className="rounded-3xl border border-white/10 bg-black/30 p-5 backdrop-blur-xl">
              <div className="mb-3 flex items-center justify-between gap-3">
                <p className="text-lg text-amber-100">选择修士</p>
                <span className="text-[11px] text-zinc-500">{room.settings.allowDuplicateRoles ? "允许重复选择同名修士" : "不允许重复选择同名修士"}</span>
              </div>
              <div className="grid gap-2">
                {roleList.map((role: any) => {
                  const pickedNames = getRolePickedNames(role.id);
                  const pickedByOthers = (roleSelections?.[role.id] || []).some((pid: string) => pid !== selfId);
                  const disabled = !me || (!room.settings.allowDuplicateRoles && pickedByOthers && me?.roleId !== role.id);
                  return (
                    <button
                      key={role.id}
                      disabled={disabled}
                      onClick={() => me && updatePlayer({ roleId: role.id })}
                      className={cn(
                        "rounded-2xl border p-3 text-left",
                        me?.roleId === role.id
                          ? "border-amber-300 bg-amber-500/10 text-amber-50"
                          : disabled
                            ? "border-white/10 bg-black/10 text-zinc-500 opacity-70"
                            : "border-white/10 bg-black/20 text-zinc-300"
                      )}
                    >
                      <div className="flex items-center gap-3">
                        <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-white/10 bg-slate-900/60 text-xl font-semibold">{role.avatar}</div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-sm text-amber-100">{role.name}</p>
                            {pickedNames && <span className="text-[10px] text-cyan-200">已选：{pickedNames}</span>}
                          </div>
                          <p className="mt-1 line-clamp-2 text-xs text-zinc-400">{role.skill}</p>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </section>

            {room.latestResult && (
              <section className="rounded-3xl border border-yellow-400/20 bg-yellow-500/5 p-5 backdrop-blur-xl">
                <div className="mb-3 flex items-center justify-between gap-2">
                  <p className="text-yellow-200">上局结算 · 房间ID {room.roomId}</p>
                  <button className="rounded-xl border border-white/10 px-3 py-1 text-sm" onClick={() => setShowStatsModal(true)}>查看统计</button>
                </div>
                <div className="space-y-2 text-sm text-zinc-300">
                  {room.latestResult.ranking.slice(0, 3).map((r: any, idx: number) => (
                    <div key={r.id || r.playerId || r.name} className="rounded-xl border border-white/10 bg-black/20 px-3 py-2">
                      <div>#{idx + 1} {r.name} · 灵石 {r.spiritStone}</div>
                      <div className="mt-1 flex flex-wrap items-center gap-1.5">
                        <span className="text-xs text-zinc-400">称号：</span>
                        {(r.titleDetails || []).length > 0 ? (r.titleDetails || []).map((title: any) => (
                          <HoverTip
                            key={`${r.id}-${title.code}`}
                            side="top"
                            content={<><p className="text-amber-100">{title.code}</p><p className="mt-1 text-zinc-300">{title.desc || "暂无说明"}</p></>}
                            label={<span className="inline-flex h-6 min-w-6 items-center justify-center rounded-full border border-fuchsia-300/30 bg-fuchsia-500/10 px-2 text-xs text-fuchsia-100">{title.code}</span>}
                          />
                        )) : <span className="text-xs text-zinc-500">暂无</span>}
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}
          </aside>
        </main>
      )}

      {gameMain && (
        <>
        <main className="mx-auto flex min-h-[calc(100dvh-84px)] max-w-[1800px] flex-col gap-3 overflow-visible p-3 xl:h-[calc(100dvh-84px)] xl:min-h-0 xl:overflow-hidden">
          <div className="grid gap-3 overflow-visible grid-cols-1 xl:min-h-0 xl:flex-1 xl:overflow-hidden xl:grid-cols-[320px_minmax(0,1fr)_320px]">
            <section className="order-2 rounded-3xl border border-white/10 bg-black/30 p-3 backdrop-blur-xl overflow-visible xl:order-1 xl:min-h-0 xl:overflow-y-auto">
              <div className="mb-3 flex items-center justify-between">
                <p className="text-amber-100">修士榜</p>
                <p className="text-xs text-zinc-500">按灵石排序</p>
              </div>
              <div className="space-y-3 overflow-visible">
                {sortedPlayers.map((p: any, idx: number) => {
                  const role = roleList.find((r: any) => r.id === p.roleId);
                  const self = p.id === selfId;
                  return (
                    <div key={p.id} className={cn("rounded-2xl border p-3", self ? "border-cyan-300/30 bg-cyan-500/5" : "border-white/10 bg-slate-950/40")}>
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm text-zinc-100">#{idx + 1} {p.name}</p>
                          <HoverTip
                            side="top"
                            content={<><p className="text-amber-100">{role?.name || "未选角色"}</p><p className="mt-1 text-zinc-300">技能：{role?.skill || "暂无技能"}</p></>}
                            label={<p className="mt-1 inline-flex cursor-help items-center gap-1 text-xs text-zinc-400">{role?.avatar} · {role?.name}</p>}
                          />
                        </div>
                        <div className="text-right">
                          <p className={cn("text-sm", p.bankrupt ? "text-rose-300" : "text-amber-200")}>{canSeePlayerSpiritStone(p.id) ? p.spiritStone : "???"}</p>
                          <p className="text-[11px] text-zinc-500">{p.bankrupt ? "破产" : p.connected ? "在线" : "托管"}</p>
                        </div>
                      </div>
                      <div className="mt-3 grid grid-cols-5 gap-1.5 overflow-visible">
                        {Array.from({ length: 5 }, (_, i) => {
                          const roundNo = i + 1;
                          const usedTool = getRoundUsedToolMeta(p.id, roundNo);
                          const used = getRoundUsedTool(p.id, roundNo);
                          const active = currentBidRound === roundNo;
                          return usedTool ? (
                            <HoverTip
                              key={`${p.id}-tool-${roundNo}`}
                              side="top"
                              content={<><p className="text-cyan-100">第{roundNo}轮 · {usedTool.name}</p><p className="mt-1 text-zinc-300">{usedTool.desc}</p><p className="mt-1 text-amber-200">价格：{usedTool.cost} 灵石/次</p></>}
                              label={<div className={cn("flex aspect-square items-center justify-center rounded-xl border px-1 text-center text-[10px] leading-tight", active ? "border-cyan-300 bg-cyan-500/15 text-cyan-50" : "border-white/10 bg-slate-900/70 text-zinc-200")}>{usedTool?.short || used}</div>}
                            />
                          ) : (
                            <div key={`${p.id}-empty-${roundNo}`} className={cn("flex aspect-square items-center justify-center rounded-xl border text-[10px]", active ? "border-cyan-300/30 bg-cyan-500/10 text-cyan-100" : "border-white/10 bg-slate-950/30 text-zinc-600")}>·</div>
                          );
                        })}
                      </div>
                      <div className="mt-1.5 grid grid-cols-5 gap-1.5">
                        {Array.from({ length: 5 }, (_, i) => {
                          const roundNo = i + 1;
                          const active = currentBidRound === roundNo;
                          return <div key={`${p.id}-bid-${roundNo}`} className={cn("flex h-7 items-center justify-center rounded-lg border px-1 text-[10px]", active ? "border-amber-300/40 bg-amber-500/10 text-amber-100" : "border-white/10 bg-black/20 text-zinc-300")}>{getRoundBidStatus(p.id, roundNo)}</div>;
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>

            <section className="order-1 flex flex-col overflow-visible rounded-3xl border border-white/10 bg-black/30 p-3 backdrop-blur-xl xl:order-2 xl:min-h-0 xl:overflow-hidden">
              <div className="mb-3 shrink-0 overflow-hidden rounded-2xl border border-white/10 bg-slate-950/35 px-3 py-2 text-sm text-zinc-200">
                {settlement ? (
                  <>
                    <div className="grid items-center gap-2 md:grid-cols-[1fr_auto_1fr]">
                      <div className="order-1 flex items-center justify-center gap-x-4 gap-y-1 text-center text-sm text-zinc-200 md:order-1 md:justify-start md:text-left">
                        <span className="text-amber-100">第 {game.currentRound}/{game.totalRounds} 回合 · 结算 · 竞拍成功者：{getSettlementWinnerName()}</span>
                      </div>
                      <div className="order-3 flex justify-center md:order-2">
                        <div className="relative inline-flex max-w-full items-center justify-center rounded-t-2xl border border-b-0 border-white/15 bg-slate-950/55 px-4 py-1.5 text-center text-sm text-amber-100 before:absolute before:-left-4 before:bottom-[-1px] before:h-4 before:w-4 before:border-b before:border-l before:border-white/15 before:content-[''] after:absolute after:-right-4 after:bottom-[-1px] after:h-4 after:w-4 after:border-b after:border-r after:border-white/15 after:content-['']">
                          <div className="overflow-x-auto whitespace-nowrap px-1">【{currentRound.realm}修士】的储物袋（{bagSummaryText}）</div>
                        </div>
                      </div>
                      <div className="order-2 flex flex-wrap items-center justify-center gap-2 text-center text-xs text-zinc-200 md:order-3 md:justify-end md:text-right">
                        <span>竞拍价：{settlement.winningBid}</span>
                        <span className={settlementRunningProfit >= 0 ? "text-emerald-300" : "text-rose-300"}>盈亏：{settlementRunningProfit}</span>
                      </div>
                    </div>
                  </>
                ) : (
                    <div className="grid items-center gap-2 md:grid-cols-[1fr_auto_1fr]">
                      <div className="order-1 flex items-center justify-center gap-x-4 gap-y-1 text-center text-sm text-zinc-200 md:order-1 md:justify-start md:text-left">
                        <span className="text-amber-100">第 {game.currentRound}/{game.totalRounds} 回合 · 第 {currentBidRound} 轮</span>
                      </div>
                      <div className="order-3 flex justify-center md:order-2">
                        <div className="relative inline-flex max-w-full items-center justify-center rounded-t-2xl border border-b-0 border-white/15 bg-slate-950/55 px-4 py-1.5 text-center text-sm text-amber-100 before:absolute before:-left-4 before:bottom-[-1px] before:h-4 before:w-4 before:border-b before:border-l before:border-white/15 before:content-[''] after:absolute after:-right-4 after:bottom-[-1px] after:h-4 after:w-4 after:border-b after:border-r after:border-white/15 after:content-['']">
                          <div className="overflow-x-auto whitespace-nowrap px-1">【{currentRound.realm}修士】的储物袋（{bagSummaryText}）</div>
                        </div>
                      </div>
                      <div className="order-2 flex items-center justify-center text-center md:order-3 md:justify-end md:text-right">
                        <span className={cn("font-semibold", actionCountdown <= 10 ? "text-rose-300" : "text-amber-100")}>第 {currentBidRound} 轮竞拍倒计时：{actionCountdown}s</span>
                      </div>
                    </div>
                )}
              </div>

              <div className="mt-3 rounded-3xl border border-white/10 bg-[#040812]/90 p-2 md:p-3 xl:flex-1 xl:min-h-0 xl:overflow-hidden">
                <div className="mx-auto w-full max-w-[1280px] overflow-visible rounded-2xl border border-white/8 bg-[linear-gradient(180deg,rgba(255,255,255,0.02),rgba(255,255,255,0.01))] p-2 xl:h-full xl:overflow-y-auto xl:overflow-x-hidden">
                  <div className="relative mx-auto w-full max-w-[1180px]" style={{ aspectRatio: `${GRID_W} / ${GRID_H}` }}>
                    <div className="absolute inset-0 grid grid-cols-10 gap-1">
                      {Array.from({ length: GRID_W * GRID_H }).map((_, index) => (
                        <div key={index} className="aspect-square rounded-[8px] border border-white/8 bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.05),rgba(255,255,255,0.015))] shadow-[inset_0_0_10px_rgba(255,255,255,0.02)]" />
                      ))}
                    </div>

                    {visiblePlacedItems.map((item: any) => {
                      const isItem = item.viewMode === "item";
                      const hasKnownQuality = Boolean(item.knownQuality);
                      const commonStyle = {
                        left: `calc(${(item.x / GRID_W) * 100}% + 2px)`,
                        top: `calc(${(item.y / GRID_H) * 100}% + 2px)`,
                        width: `calc(${(item.width / GRID_W) * 100}% - 4px)`,
                        height: `calc(${(item.height / GRID_H) * 100}% - 4px)`,
                        boxSizing: "border-box" as const,
                      };
                      const itemBlock = (
                        <button
                          key={`${item.placedId}-${item.viewMode}`}
                          onClick={() => {
                            if (!isItem) {
                              setCatalogFocusItemId(null);
                              setCatalogFilter({
                                type: item.knownType ? item.type : "全部",
                                quality: hasKnownQuality ? item.quality : "全部",
                                shape: item.shape || "全部",
                                min: 0,
                                max: 99999999,
                              });
                              setShowCodex(true);
                            }
                          }}
                          className={cn(
                            "absolute z-10 overflow-hidden rounded-[12px] border text-white transition hover:brightness-110",
                            hasKnownQuality
                              ? `${QUALITY_COLOR[item.quality]} ${QUALITY_GLOW[item.quality]} border-white/70 bg-gradient-to-br from-white/18 via-white/8 to-black/10`
                              : "border-white/70 bg-white/10 shadow-[0_0_0_2px_rgba(255,255,255,0.14)]"
                          )}
                          style={commonStyle}
                        >
                          <div className="relative h-full w-full p-1.5 text-left">
                            {item.knownType && <p className="absolute left-1.5 top-1.5 hidden rounded-md bg-black/20 px-1 py-0.5 text-[9px] text-white/90 md:block">{item.type}</p>}
                            {hasKnownQuality && <p className="absolute right-1.5 top-1.5 hidden rounded-md bg-black/20 px-1 py-0.5 text-[9px] text-amber-100 md:block">{item.quality}</p>}
                            <p className="absolute bottom-1.5 left-1.5 hidden rounded-md bg-black/20 px-1 py-0.5 text-[9px] text-white/85 md:block">{item.width}×{item.height}</p>
                          </div>
                        </button>
                      );
                      return isItem ? (
                        <button
                          key={`${item.placedId}-${item.viewMode}`}
                          type="button"
                          onClick={() => {
                            setCatalogFocusItemId(item.id);
                            setCatalogFilter({ type: "全部", quality: "全部", shape: "全部", min: 0, max: 999999 });
                            setShowCodex(true);
                          }}
                          onMouseEnter={(e) => openWarehouseTip(item, e)}
                          onMouseMove={(e) => openWarehouseTip(item, e)}
                          onMouseLeave={closeWarehouseTip}
                          onFocus={(e) => openWarehouseTip(item, e)}
                          onBlur={closeWarehouseTip}
                          onTouchStart={(e) => startWarehouseTipHold(item, e)}
                          onTouchEnd={clearWarehouseTipHold}
                          onTouchCancel={clearWarehouseTipHold}
                          className={cn(
                            "absolute z-20 overflow-hidden rounded-[12px] border text-white transition hover:brightness-110 focus:outline-none focus:ring-2 focus:ring-amber-300/50",
                            `${QUALITY_COLOR[item.quality]} ${QUALITY_GLOW[item.quality]} bg-gradient-to-br from-white/14 via-white/6 to-black/10`
                          )}
                          style={commonStyle}
                        >
                          <div className="relative h-full w-full p-1.5 text-left">
                            {item.knownType && <p className="absolute left-1.5 top-1.5 hidden rounded-md bg-black/20 px-1 py-0.5 text-[9px] text-white/90 md:block">{item.type}</p>}
                            <p className="absolute right-1.5 top-1.5 hidden rounded-md bg-black/20 px-1 py-0.5 text-[9px] text-amber-100 md:block">{item.quality}</p>
                            <p className="absolute bottom-1.5 left-1.5 hidden rounded-md bg-black/20 px-1 py-0.5 text-[9px] text-white/85 md:block">{item.width}×{item.height}</p>
                            <p className="absolute bottom-1.5 right-1.5 hidden rounded-md bg-black/20 px-1 py-0.5 text-[9px] text-amber-50/90 md:block">{item.price}</p>
                            <div className="absolute inset-0 flex items-center justify-center px-2">
                              <p className="max-w-full overflow-hidden text-ellipsis whitespace-nowrap text-center text-[11px] font-semibold leading-tight text-white/95">
                                {item.name}
                              </p>
                            </div>
                          </div>
                        </button>
                      ) : itemBlock;
                    })}

                    {visibleQualityCells.map((cell: any, index: number) => (
                      <button
                        key={`${cell.x}-${cell.y}-${index}`}
                        onClick={() => {
                          setCatalogFocusItemId(null);
                          setCatalogFilter({
                            type: cell.type || "全部",
                            quality: cell.quality || "全部",
                            shape: "全部",
                            min: 0,
                            max: 99999999,
                          });
                          setShowCodex(true);
                        }}
                        className={cn("quality-pulse absolute z-20 rounded-[8px] border", QUALITY_COLOR[cell.quality], QUALITY_GLOW[cell.quality])}
                        style={{
                          left: `calc(${(cell.x / GRID_W) * 100}% + 2px)`,
                          top: `calc(${(cell.y / GRID_H) * 100}% + 2px)`,
                          width: `calc(${100 / GRID_W}% - 4px)`,
                          height: `calc(${100 / GRID_H}% - 4px)`,
                          boxSizing: "border-box",
                        }}
                      >
                        {cell.type && <span className="absolute left-1 top-1 hidden rounded-md bg-black/20 px-1 py-0.5 text-[9px] text-white/90 md:block">{cell.type}</span>}
                        <span className="absolute right-1 top-1 hidden rounded-md bg-black/20 px-1 py-0.5 text-[9px] text-amber-100 md:block">{cell.quality}</span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <section className="mt-3 shrink-0 rounded-3xl border border-white/10 bg-black/35 px-3 py-2 backdrop-blur-xl">
                <div className="grid items-center gap-2 md:grid-cols-[1fr_auto_1fr]">
                  <div className="flex flex-wrap items-center justify-center gap-2 md:justify-start">
                    <HoverTip
                      side="top"
                      content={me ? <><p className="text-amber-100">{me.name}</p><p className="mt-1 text-zinc-300">修士：{selfRole?.name || "未选"}</p><p className="mt-1 text-zinc-400">技能：{selfRole?.skill || "暂未开放，后续扩展。"}</p></> : "未加入修士信息"}
                      label={<div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-amber-300/20 bg-amber-500/10 text-2xl">{selfRole?.avatar || "？"}</div>}
                    />

                    <button className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-fuchsia-400/30 bg-fuchsia-500/10 text-[11px] text-fuchsia-100" onClick={() => { setCatalogFocusItemId(null); setShowCodex(true); }}>图鉴</button>

                      <button
                        ref={toolAnchorRef}
                        className="relative flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-cyan-400/30 bg-cyan-500/10 text-center text-[11px] text-cyan-100 disabled:opacity-40"
                        disabled={!isActionPhase || isSubmitted || !!usedToolId || isBankrupt || cannotBidThisRound || currentBidRound >= 6}
                        onClick={() => setShowToolPicker(true)}
                      >
                      推演
                      {usedToolId && <span className="absolute right-1 top-1 text-sm">✓</span>}
                    </button>
                  </div>

                  <div className="flex flex-wrap items-center justify-center gap-2">
                    <div className="flex h-14 min-w-[220px] items-center rounded-2xl border border-white/10 bg-slate-950/80 px-3">
                      <input
                        value={bidInput}
                        onChange={(e) => setBidInput(e.target.value.replace(/\D/g, "").slice(0, 9))}
                        placeholder={cannotBidThisRound ? currentRoundStatus : "手动输入竞价"}
                        disabled={!isActionPhase || isSubmitted || isBankrupt || cannotBidThisRound}
                        className="min-w-0 flex-1 bg-transparent text-left text-sm outline-none placeholder:text-zinc-500 disabled:opacity-40"
                      />
                      <button ref={bidAnchorRef} className="ml-2 rounded-xl border border-white/10 px-3 py-2 text-xs text-zinc-300 disabled:opacity-40" disabled={!isActionPhase || isSubmitted || isBankrupt || cannotBidThisRound} onClick={() => setShowKeypad(true)}>
                        出价
                      </button>
                    </div>

                    <HoverTip
                      side="top"
                      content={<><p className="text-emerald-100">提交竞价</p><p className="mt-1 text-zinc-300">本轮判定倍率：{((room?.settings?.multipliers || [2, 1.6, 1.4, 1.2, 1])[Math.min(currentBidRound, 5) - 1] ?? 1)} 倍</p></>}
                      label={<button className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-emerald-400/30 bg-emerald-500/10 text-[11px] text-emerald-100 disabled:opacity-40" disabled={!isActionPhase || isSubmitted || isBankrupt || cannotBidThisRound} onClick={submitBid}>提交</button>}
                    />
                  </div>

                  <div className="flex flex-wrap items-center justify-center gap-2 md:justify-end">
                    {cannotBidThisRound && !settlement && (
                      <div className="rounded-2xl border border-amber-400/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">
                        本回合已不能出价（{currentRoundStatus}）
                      </div>
                    )}
                    {settlement && viewer?.mode === "delay" && !viewer?.completed && (
                      <button
                        className="flex h-14 w-14 items-center justify-center rounded-2xl border border-cyan-400/30 bg-cyan-500/10 px-2 text-[11px] text-cyan-100"
                        onClick={() => socket.emit("settlement:chooseReveal", { mode: "instant" })}
                      >
                        直接显示
                      </button>
                    )}
                    {renderSettlementActionButtons()}
                  </div>
                </div>
              </section>
            </section>

            <section className="order-3 min-h-0 overflow-visible rounded-3xl border border-white/10 bg-black/30 p-3 backdrop-blur-xl xl:min-h-0 xl:overflow-hidden">
              <div className="grid grid-cols-1 gap-3 xl:h-full xl:min-h-0 xl:grid-cols-1 xl:grid-rows-4">
                <div className="min-h-0 overflow-hidden rounded-2xl border border-white/10 bg-slate-950/35 p-3 text-xs xl:flex xl:flex-col">
                  <p className="mb-2 text-amber-100">系统提示</p>
                  <div className="h-full min-h-0 space-y-2 overflow-y-auto pr-1 pb-3">
                    {(currentRound.systemHints || []).slice(-3).map((h: string, i: number) => <p key={`s-${i}`} className="rounded-lg bg-black/20 px-2 py-1">{h}</p>)}
                  </div>
                </div>
                <div className="min-h-0 overflow-hidden rounded-2xl border border-white/10 bg-slate-950/35 p-3 text-xs xl:flex xl:flex-col">
                  <p className="mb-2 text-cyan-100">技能提示</p>
                  <div className="h-full min-h-0 space-y-2 overflow-y-auto pr-1 pb-3">
                    {(currentRound.skillHints || []).map((h: string, i: number) => <p key={`k-${i}`} className="rounded-lg bg-black/20 px-2 py-1">{h}</p>)}
                  </div>
                </div>
                <div className="min-h-0 overflow-hidden rounded-2xl border border-white/10 bg-slate-950/35 p-3 text-xs xl:flex xl:flex-col">
                  <p className="mb-2 text-fuchsia-100">推演提示</p>
                  <div className="h-full min-h-0 space-y-2 overflow-y-auto pr-1 pb-3">
                    {(currentRound.toolHints || []).map((h: string, i: number) => <p key={`t-${i}`} className="rounded-lg bg-black/20 px-2 py-1">{h}</p>)}
                  </div>
                </div>
                <div className="min-h-0 overflow-hidden rounded-2xl border border-white/10 bg-slate-950/35 p-3 text-xs xl:flex xl:flex-col">
                  <p className="mb-2 text-emerald-100">聊天</p>
                  <div className="flex h-full min-h-0 flex-col">
                    <div ref={chatListRef} className="min-h-0 flex-1 space-y-2 overflow-y-auto rounded-xl border border-white/10 bg-black/20 p-2 pr-1 pb-3">
                      {(chatMessages || []).map((m: any) => (
                        <div key={m.id} className="rounded-lg bg-black/25 px-2 py-1">
                          <p><span className="text-zinc-500">[{m.time}]</span> <span className="text-amber-100">{m.senderName}</span></p>
                          <p className="mt-1 break-words text-zinc-200">{m.text}</p>
                        </div>
                      ))}
                    </div>
                    <div className="mt-2 flex shrink-0 gap-2">
                      <input maxLength={70} className="min-w-0 flex-1 rounded-xl border border-white/10 bg-slate-950/80 px-3 py-2" value={chatInput} onChange={(e) => setChatInput(e.target.value.slice(0, 70))} onKeyDown={(e) => { if (e.key === "Enter") sendChat(); }} placeholder="输入消息（最多70字）" />
                      <button className="rounded-xl border border-emerald-400/30 bg-emerald-500/10 px-4 text-emerald-100" onClick={sendChat}>发送</button>
                    </div>
                  </div>
                </div>
              </div>
            </section>
          </div>

          </main>
        </>
      )}

      {settingsOpen && isHost && room && !game && (
        <div className="fixed inset-0 z-40 bg-black/70 p-4">
          <div className="mx-auto max-w-2xl rounded-3xl border border-white/10 bg-[#0b1020] p-5 shadow-2xl">
            <div className="mb-4 flex items-center justify-between"><p className="text-lg text-amber-100">房间设置</p><button className="rounded-xl border border-white/10 px-3 py-1" onClick={() => setSettingsOpen(false)}>关闭</button></div>
            <div className="grid gap-3 md:grid-cols-2">
              <label className="text-sm text-zinc-300">房间名称（最多10字）<input className="mt-1 w-full rounded-xl border border-white/10 bg-slate-950/80 px-3 py-2" value={settingsForm.roomName} onChange={(e) => setSettingsForm((s) => ({ ...s, roomName: e.target.value.slice(0, 10) }))} placeholder="可空" maxLength={10} /></label>
              <label className="text-sm text-zinc-300">房间密码<input className="mt-1 w-full rounded-xl border border-white/10 bg-slate-950/80 px-3 py-2" value={settingsForm.password} onChange={(e) => setSettingsForm((s) => ({ ...s, password: e.target.value }))} placeholder="可空" /></label>
              <label className="text-sm text-zinc-300">人数上限（2-16）<input type="number" min={2} max={16} className="mt-1 w-full rounded-xl border border-white/10 bg-slate-950/80 px-3 py-2" value={settingsForm.maxPlayers} onChange={(e) => setSettingsForm((s) => ({ ...s, maxPlayers: Math.max(2, Math.min(16, Number(e.target.value) || 6)) }))} /></label>
              <label className="text-sm text-zinc-300">回合数量<input type="number" className="mt-1 w-full rounded-xl border border-white/10 bg-slate-950/80 px-3 py-2" value={settingsForm.totalRounds} onChange={(e) => setSettingsForm((s) => ({ ...s, totalRounds: Number(e.target.value) || 10 }))} /></label>
              <label className="text-sm text-zinc-300">开局灵石<input type="number" className="mt-1 w-full rounded-xl border border-white/10 bg-slate-950/80 px-3 py-2" value={settingsForm.initialSpiritStone} onChange={(e) => setSettingsForm((s) => ({ ...s, initialSpiritStone: Number(e.target.value) || 500000 }))} /></label>
              <label className="text-sm text-zinc-300">入场券（每回合）<input type="number" className="mt-1 w-full rounded-xl border border-white/10 bg-slate-950/80 px-3 py-2" value={settingsForm.entryFee} onChange={(e) => setSettingsForm((s) => ({ ...s, entryFee: Number(e.target.value) || 10000 }))} /></label>
              <label className="md:col-span-2 flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-slate-950/50 px-3 py-3 text-sm text-zinc-300">
                <span>允许选择相同修士</span>
                <input type="checkbox" checked={settingsForm.allowDuplicateRoles} onChange={(e) => setSettingsForm((s) => ({ ...s, allowDuplicateRoles: e.target.checked }))} />
              </label>
              <label className="md:col-span-2 flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-slate-950/50 px-3 py-3 text-sm text-zinc-300">
                <span>显示其他玩家剩余灵石</span>
                <input type="checkbox" checked={settingsForm.showOtherSpiritStone} onChange={(e) => setSettingsForm((s) => ({ ...s, showOtherSpiritStone: e.target.checked }))} />
              </label>
              <div className="md:col-span-2 flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-slate-950/50 px-3 py-3 text-sm text-zinc-300">
                <span>轮次揭晓显示</span>
                <div className="inline-flex overflow-hidden rounded-xl border border-white/10">
                  <button type="button" className={cn("px-3 py-1.5 text-sm", settingsForm.revealBidDisplay === "amount" ? "bg-cyan-500/15 text-cyan-100" : "bg-black/20 text-zinc-400")} onClick={() => setSettingsForm((s) => ({ ...s, revealBidDisplay: "amount" }))}>金额</button>
                  <button type="button" className={cn("px-3 py-1.5 text-sm", settingsForm.revealBidDisplay === "rank" ? "bg-cyan-500/15 text-cyan-100" : "bg-black/20 text-zinc-400")} onClick={() => setSettingsForm((s) => ({ ...s, revealBidDisplay: "rank" }))}>排名</button>
                </div>
              </div>
              <div className="md:col-span-2 rounded-2xl border border-white/10 bg-slate-950/50 px-3 py-3 text-sm text-zinc-300">
                <p className="mb-2 text-amber-100">系统提示轮次（1-5轮）</p>
                <div className="flex flex-wrap gap-2">
                  {[1, 2, 3, 4, 5].map((roundNo) => {
                    const checked = settingsForm.hintRounds.includes(roundNo);
                    return (
                      <label key={`hint-round-${roundNo}`} className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(e) => {
                            setSettingsForm((s) => ({
                              ...s,
                              hintRounds: e.target.checked
                                ? [...new Set([...s.hintRounds, roundNo])].sort((a, b) => a - b)
                                : s.hintRounds.filter((v) => v !== roundNo),
                            }));
                          }}
                        />
                        <span>第{roundNo}轮</span>
                      </label>
                    );
                  })}
                </div>
              </div>
              <div className="md:col-span-2 rounded-2xl border border-white/10 bg-slate-950/50 px-3 py-3 text-sm text-zinc-300">
                <p className="mb-3 text-amber-100">判定倍率（竞拍成功需超出第二名的倍数）：</p>
                <div className="grid gap-3 sm:grid-cols-5">
                  {settingsForm.multipliers.map((value, index) => (
                    <label key={`multiplier-${index}`} className="text-xs text-zinc-300">
                      第{index + 1}轮
                      <input
                        type="number"
                        step="0.1"
                        min="0.1"
                        className="mt-1 w-full rounded-xl border border-white/10 bg-slate-950/80 px-3 py-2 text-sm"
                        value={value}
                        onChange={(e) => {
                          const next = [...settingsForm.multipliers];
                          next[index] = Number(e.target.value) || [2, 1.6, 1.4, 1.2, 1][index];
                          setSettingsForm((s) => ({ ...s, multipliers: next }));
                        }}
                      />
                    </label>
                  ))}
                </div>
              </div>
            </div>
            <button className="mt-4 w-full rounded-xl border border-amber-400/30 bg-amber-500/10 py-2 text-amber-100" onClick={() => { updateRoomSettings(); setSettingsOpen(false); }}>保存设置</button>
          </div>
        </div>
      )}

      {showParameterSettings && isHost && room && !game && (
        <div className="fixed inset-0 z-40 bg-black/70 p-4">
          <div className="mx-auto max-h-[92vh] max-w-5xl overflow-y-auto rounded-3xl border border-white/10 bg-[#0b1020] p-5 shadow-2xl">
            <div className="mb-4 flex items-center justify-between gap-3">
              <p className="text-lg text-cyan-100">参数设置</p>
              <div className="flex items-center gap-2">
                <button className="rounded-xl border border-amber-400/30 bg-amber-500/10 px-3 py-1 text-amber-100" onClick={resetParameterSettingsToDefault}>重置</button>
                <button className="rounded-xl border border-white/10 px-3 py-1" onClick={() => setShowParameterSettings(false)}>关闭</button>
              </div>
            </div>
            <div className="mt-1">
              <QualityProbabilityEditor
                values={settingsForm.qualityProbability}
                locks={qualityLocks}
                onBoundaryShift={adjustQualityProbabilityBoundary}
                onLockedSegmentShift={adjustLockedQualitySegmentShift}
                onToggleLock={(quality) => setQualityLocks((prev) => ({ ...prev, [quality]: !prev[quality] }))}
              />
            </div>

            <div className="mt-5 rounded-2xl border border-white/10 bg-black/20 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <HoverTip
                  side="top"
                  content={<><p className="text-cyan-100">价格权重</p><p className="mt-1 text-zinc-300">左侧为价格金额（对数横轴），右侧为价格排名。点击图框或顶部按钮可切换模式；拖动曲线可左右调中值、上下调衰减，参数显示在图表内。</p></>}
                  label={<p className="inline-flex cursor-help text-cyan-100">价格权重</p>}
                />
                <div className="inline-flex overflow-hidden rounded-xl border border-white/10 bg-slate-950/60">
                  <button
                    type="button"
                    className={cn("px-4 py-2 text-sm", settingsForm.pricePreference.mode === "amount" ? "bg-cyan-500/15 text-cyan-100" : "text-zinc-400")}
                    onClick={() => updatePricePreference("mode", "amount")}
                  >
                    价格金额
                  </button>
                  <button
                    type="button"
                    className={cn("px-4 py-2 text-sm", settingsForm.pricePreference.mode === "rank" ? "bg-cyan-500/15 text-cyan-100" : "text-zinc-400")}
                    onClick={() => updatePricePreference("mode", "rank")}
                  >
                    价格排名
                  </button>
                </div>
              </div>

              <div className="mt-4 grid gap-4 xl:grid-cols-2">
                {(() => {
                  const amountTicks = buildAmountAxisTicks();
                  const rankTicks = buildRankAxisTicks();
                  const amountMidX = amountToChartRatio(settingsForm.pricePreference.amountMidpoint) * PRICE_CHART_WIDTH;
                  const rankMidX = rankToChartRatio(settingsForm.pricePreference.rankMidpoint) * PRICE_CHART_WIDTH;
                  const amountActive = settingsForm.pricePreference.mode === "amount";
                  const rankActive = settingsForm.pricePreference.mode === "rank";
                  const chartY = (weight: number) => (weightToChartY(weight) / 100) * PRICE_CHART_HEIGHT;
                  const scaleCurvePoints = (points: string) =>
                    points
                      .split(" ")
                      .map((pair) => {
                        const [x, y] = pair.split(",").map(Number);
                        return `${(x / 100) * PRICE_CHART_WIDTH},${(y / 100) * PRICE_CHART_HEIGHT}`;
                      })
                      .join(" ");
                  const renderYGuides = () => (
                    <>
                      {CHART_Y_TICKS.map((tick) => {
                        const y = chartY(tick);
                        return (
                          <g key={`y-${tick}`}>
                            <line
                              x1="0"
                              y1={y}
                              x2={PRICE_CHART_WIDTH}
                              y2={y}
                              stroke="rgba(255,255,255,0.08)"
                              strokeWidth="0.8"
                            />
                            <text x="-4" y={y + 2} textAnchor="end" fontSize="6" fill="rgba(255,255,255,0.45)">
                              {tick.toFixed(1)}
                            </text>
                          </g>
                        );
                      })}
                      <line
                        x1="0"
                        y1={chartY(0.5)}
                        x2={PRICE_CHART_WIDTH}
                        y2={chartY(0.5)}
                        stroke="rgba(148,163,184,0.55)"
                        strokeWidth="1"
                        strokeDasharray="4 4"
                      />
                    </>
                  );

                  const bindCurveDrag = (
                    mode: "amount" | "rank",
                    event: React.PointerEvent<SVGElement>
                  ) => {
                    const svg = event.currentTarget.ownerSVGElement || (event.currentTarget as SVGElement);
                    if (!svg) return;
                    const rect = svg.getBoundingClientRect();
                    const startX = event.clientX;
                    const startY = event.clientY;
                    const startAmountMid = settingsForm.pricePreference.amountMidpoint;
                    const startAmountDecay = settingsForm.pricePreference.amountDecay;
                    const startRankMid = settingsForm.pricePreference.rankMidpoint;
                    const startRankDecay = settingsForm.pricePreference.rankDecay;

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
                        updatePricePreference("amountMidpoint", nextMid);
                        updatePricePreference("amountDecay", nextDecay);
                      } else {
                        const startRatio = rankToChartRatio(startRankMid);
                        const nextRatio = clamp01(startRatio + ratioDx);
                        const nextMid = Math.max(1, Math.round(nextRatio * RANK_AXIS_MAX));
                        const nextDecay = Math.max(0.1, Math.min(20, Math.round((startRankDecay - ratioDy * 12) * 10) / 10));
                        updatePricePreference("rankMidpoint", nextMid);
                        updatePricePreference("rankDecay", nextDecay);
                      }
                    };

                    const onUp = () => {
                      window.removeEventListener("pointermove", onMove);
                      window.removeEventListener("pointerup", onUp);
                    };
                    window.addEventListener("pointermove", onMove);
                    window.addEventListener("pointerup", onUp);
                  };

                  return (
                    <>
                      <div
                        className={cn("rounded-xl border bg-slate-950/60 p-2 cursor-pointer", amountActive ? "border-cyan-300/50 shadow-[0_0_0_1px_rgba(34,211,238,0.2)]" : "border-white/10")}
                        onClick={() => updatePricePreference("mode", "amount")}
                      >
                        <div className="mb-2">
                          <HoverTip
                            side="top"
                            content={<><p className="text-cyan-100">价格金额</p><p className="mt-1 text-zinc-300">权重 = 1 / (1 + (价格 / 中值金额)^衰减速率)</p></>}
                            label={<p className="inline-flex cursor-help text-sm text-cyan-100">价格金额</p>}
                          />
                        </div>
                        <div className="rounded-xl border border-white/10 bg-black/20 p-1">
                          <svg viewBox={`-2 -6 ${PRICE_CHART_WIDTH + 4} ${PRICE_CHART_HEIGHT + 24}`} className="h-80 w-full overflow-visible">
                            {renderYGuides()}
                            <line x1="0" y1={PRICE_CHART_HEIGHT} x2={PRICE_CHART_WIDTH} y2={PRICE_CHART_HEIGHT} stroke="rgba(255,255,255,0.18)" strokeWidth="1.1" />
                            <line x1="0" y1="0" x2="0" y2={PRICE_CHART_HEIGHT} stroke="rgba(255,255,255,0.18)" strokeWidth="1.1" />
                            {amountTicks.map((tick) => (
                              <g key={`amount-tick-${tick.value}`}>
                                <line x1={tick.ratio * PRICE_CHART_WIDTH} y1={PRICE_CHART_HEIGHT} x2={tick.ratio * PRICE_CHART_WIDTH} y2={PRICE_CHART_HEIGHT + 5} stroke="rgba(255,255,255,0.22)" strokeWidth="0.8" />
                                <text x={tick.ratio * PRICE_CHART_WIDTH} y={PRICE_CHART_HEIGHT + 12} textAnchor="middle" fontSize="6" fill="rgba(255,255,255,0.45)">{tick.label}</text>
                              </g>
                            ))}
                            <polyline
                              fill="none"
                              stroke="#38bdf8"
                              strokeWidth={amountActive ? 1.8 : 1.2}
                              strokeDasharray={amountActive ? undefined : "4 3"}
                              points={scaleCurvePoints(buildAmountPreferenceCurvePoints(settingsForm.pricePreference.amountMidpoint, settingsForm.pricePreference.amountDecay))}
                              onPointerDown={(e) => bindCurveDrag("amount", e)}
                              style={{ cursor: "move" }}
                            />
                            <polyline
                              fill="none"
                              stroke="transparent"
                              strokeWidth="18"
                              points={scaleCurvePoints(buildAmountPreferenceCurvePoints(settingsForm.pricePreference.amountMidpoint, settingsForm.pricePreference.amountDecay))}
                              onPointerDown={(e) => bindCurveDrag("amount", e)}
                              style={{ cursor: "move" }}
                            />
                            <line
                              x1={amountMidX}
                              y1="0"
                              x2={amountMidX}
                              y2={PRICE_CHART_HEIGHT}
                              stroke="#38bdf8"
                              strokeWidth="1.4"
                              strokeDasharray="5 4"
                              onPointerDown={(e) => bindCurveDrag("amount", e)}
                              style={{ cursor: "move" }}
                            />
                            <text x="8" y="12" fontSize="7" fill="rgba(255,255,255,0.72)">中值 {settingsForm.pricePreference.amountMidpoint.toLocaleString()}</text>
                            <text x="8" y="22" fontSize="7" fill="rgba(255,255,255,0.56)">衰减 {settingsForm.pricePreference.amountDecay}</text>
                          </svg>
                        </div>
                      </div>

                      <div
                        className={cn("rounded-xl border bg-slate-950/60 p-2 cursor-pointer", rankActive ? "border-amber-300/50 shadow-[0_0_0_1px_rgba(251,191,36,0.2)]" : "border-white/10")}
                        onClick={() => updatePricePreference("mode", "rank")}
                      >
                        <div className="mb-2">
                          <HoverTip
                            side="top"
                            content={<><p className="text-amber-100">价格排名</p><p className="mt-1 text-zinc-300">权重 = 1 / (1 + (排名 / 中值排名)^衰减速率)</p></>}
                            label={<p className="inline-flex cursor-help text-sm text-amber-100">价格排名</p>}
                          />
                        </div>
                        <div className="rounded-xl border border-white/10 bg-black/20 p-1">
                          <svg viewBox={`-2 -6 ${PRICE_CHART_WIDTH + 4} ${PRICE_CHART_HEIGHT + 24}`} className="h-80 w-full overflow-visible">
                            {renderYGuides()}
                            <line x1="0" y1={PRICE_CHART_HEIGHT} x2={PRICE_CHART_WIDTH} y2={PRICE_CHART_HEIGHT} stroke="rgba(255,255,255,0.18)" strokeWidth="1.1" />
                            <line x1="0" y1="0" x2="0" y2={PRICE_CHART_HEIGHT} stroke="rgba(255,255,255,0.18)" strokeWidth="1.1" />
                            {rankTicks.map((tick) => (
                              <g key={`rank-tick-${tick.value}`}>
                                <line x1={tick.ratio * PRICE_CHART_WIDTH} y1={PRICE_CHART_HEIGHT} x2={tick.ratio * PRICE_CHART_WIDTH} y2={PRICE_CHART_HEIGHT + 5} stroke="rgba(255,255,255,0.22)" strokeWidth="0.8" />
                                <text x={tick.ratio * PRICE_CHART_WIDTH} y={PRICE_CHART_HEIGHT + 12} textAnchor="middle" fontSize="6" fill="rgba(255,255,255,0.45)">{tick.label}</text>
                              </g>
                            ))}
                            <polyline
                              fill="none"
                              stroke="#f59e0b"
                              strokeWidth={rankActive ? 1.8 : 1.2}
                              strokeDasharray={rankActive ? undefined : "4 3"}
                              points={scaleCurvePoints(buildRankPreferenceCurvePoints(settingsForm.pricePreference.rankMidpoint, settingsForm.pricePreference.rankDecay))}
                              onPointerDown={(e) => bindCurveDrag("rank", e)}
                              style={{ cursor: "move" }}
                            />
                            <polyline
                              fill="none"
                              stroke="transparent"
                              strokeWidth="18"
                              points={scaleCurvePoints(buildRankPreferenceCurvePoints(settingsForm.pricePreference.rankMidpoint, settingsForm.pricePreference.rankDecay))}
                              onPointerDown={(e) => bindCurveDrag("rank", e)}
                              style={{ cursor: "move" }}
                            />
                            <line
                              x1={rankMidX}
                              y1="0"
                              x2={rankMidX}
                              y2={PRICE_CHART_HEIGHT}
                              stroke="rgba(250,204,21,0.9)"
                              strokeWidth="1.4"
                              strokeDasharray="5 4"
                              onPointerDown={(e) => bindCurveDrag("rank", e)}
                              style={{ cursor: "move" }}
                            />
                            <text x="8" y="12" fontSize="7" fill="rgba(255,255,255,0.72)">中值 {settingsForm.pricePreference.rankMidpoint}</text>
                            <text x="8" y="22" fontSize="7" fill="rgba(255,255,255,0.56)">衰减 {settingsForm.pricePreference.rankDecay}</text>
                          </svg>
                        </div>
                      </div>
                    </>
                  );
                })()}
              </div>
            </div>

            <div className="mt-5 grid gap-5 xl:grid-cols-2 xl:items-stretch">
              <div className="h-full">
                <ShapeWeightEditor
                  value={settingsForm.shapeWeights}
                  catalog={catalog}
                  onChange={updateShapeWeight}
                />
              </div>
              <div className="h-full">
                <RealmProbabilityEditor
                  values={settingsForm.realmProbability}
                  locks={realmLocks}
                  onBoundaryShift={adjustRealmProbabilityBoundary}
                  onLockedSegmentShift={adjustLockedRealmSegmentShift}
                  onToggleLock={(realm) => setRealmLocks((prev) => ({ ...prev, [realm]: !prev[realm] }))}
                />
              </div>
            </div>

            <div className="mt-4 rounded-2xl border border-white/10 bg-slate-950/50 px-3 py-3 text-sm text-zinc-300">
              <p className="mb-3 text-cyan-100">格数权重</p>
              {(() => {
                const config = settingsForm.realmCellSettings[activeRealmTab] || DEFAULT_REALM_CELL_SETTINGS[activeRealmTab];
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
                  <>
                    <div className="mb-3 flex flex-wrap items-center gap-2">
                      {REALM_ORDER.map((realm) => {
                        const active = activeRealmTab === realm;
                        return (
                          <button
                            key={`realm-tab-${realm}`}
                            type="button"
                            className={cn(
                              "rounded-xl border px-3 py-1.5 text-sm",
                              active ? "border-cyan-300 bg-cyan-500/10 text-cyan-100" : "border-white/10 bg-black/20 text-zinc-300"
                            )}
                            onClick={() => setActiveRealmTab(realm)}
                          >
                            <span className="inline-flex items-center gap-2">
                              <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: REALM_COLORS[realm] }} />
                              <span>{realm}</span>
                            </span>
                          </button>
                        );
                      })}
                    </div>
                    <div className="mb-3 rounded-2xl border border-white/10 bg-black/20 p-3">
                      <div className="mb-2 flex items-center justify-between gap-3">
                        <p className="text-xs text-zinc-400">概率图</p>
                        <div className="flex items-center gap-2 text-xs text-zinc-300 whitespace-nowrap">
                          <span>扩散系数</span>
                          <button
                            type="button"
                            className="rounded-lg border border-white/10 bg-slate-950/80 px-2 py-1 text-sm text-zinc-200"
                            onClick={() => updateRealmCellSetting(activeRealmTab, "spread", Number((config.spread - 0.1).toFixed(1)))}
                          >
                            −
                          </button>
                          <input
                            type="number"
                            step="0.1"
                            min="0.1"
                            max="3.0"
                            className="w-24 rounded-xl border border-white/10 bg-slate-950/80 px-3 py-1.5 text-center text-sm"
                            value={config.spread}
                            onChange={(e) => updateRealmCellSetting(activeRealmTab, "spread", Number(e.target.value) || config.spread)}
                          />
                          <button
                            type="button"
                            className="rounded-lg border border-white/10 bg-slate-950/80 px-2 py-1 text-sm text-zinc-200"
                            onClick={() => updateRealmCellSetting(activeRealmTab, "spread", Number((config.spread + 0.1).toFixed(1)))}
                          >
                            +
                          </button>
                        </div>
                      </div>
                      <div className="relative overflow-x-auto pb-2 pr-3">
                        <div ref={realmChartRef} className="relative min-w-[620px] pr-0">
                          <div className="flex h-48 items-end gap-1 pb-5">
                            {histogram.map((bin, index) => {
                              const selected = bin.binEnd > config.min && bin.binEnd <= config.max;
                              return (
                                <div key={`${activeRealmTab}-bin-${index}`} className="flex min-w-0 flex-1 flex-col items-center gap-1">
                                  <div className="flex w-full items-end justify-center" style={{ height: "150px" }}>
                                    <div
                                      className="w-full"
                                      style={{
                                        height: `${Math.max(1, Math.round(bin.value * 135))}px`,
                                        background: selected ? REALM_COLORS[activeRealmTab] : "rgba(113,113,122,0.45)",
                                      }}
                                      title={bin.label}
                                    />
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
                          <button
                            type="button"
                            className="absolute top-0 bottom-5 w-4 cursor-ew-resize bg-transparent"
                            style={{ left: clampedMinLeft, transform: "translateX(-50%)" }}
                            onPointerDown={() => setDragRealmHandle("min")}
                            title={`下限 ${config.min}`}
                          >
                            <span className="pointer-events-none absolute inset-y-0 left-1/2 w-0.5 -translate-x-1/2 border-l-2 border-amber-300" />
                          </button>
                          <button
                            type="button"
                            className="absolute top-0 bottom-5 w-4 cursor-ew-resize bg-transparent"
                            style={{ left: clampedPeakLeft, transform: "translateX(-50%)" }}
                            onPointerDown={() => setDragRealmHandle("peak")}
                            title={`峰值中心 ${config.peak}`}
                          >
                            <span className="pointer-events-none absolute inset-y-0 left-1/2 w-0.5 -translate-x-1/2 border-l-2 border-cyan-300" />
                          </button>
                          <button
                            type="button"
                            className="absolute top-0 bottom-5 w-4 cursor-ew-resize bg-transparent"
                            style={{ left: clampedMaxLeft, transform: "translateX(-50%)" }}
                            onPointerDown={() => setDragRealmHandle("max")}
                            title={`上限 ${config.max}`}
                          >
                            <span className="pointer-events-none absolute inset-y-0 left-1/2 w-0.5 -translate-x-1/2 border-l-2 border-rose-300" />
                          </button>
                        </div>
                      </div>
                    </div>
                  </>
                );
              })()}
            </div>
            <div className="mt-5">
              <ShapeWeightMatrix
                simulation={shapeSimulationStats}
                catalog={catalog}
                actions={
                  <div className="flex flex-wrap items-center justify-end gap-2 text-sm text-zinc-300">
                    <span className="text-zinc-400">模拟：</span>
                    {[50, 100, 200, 300, 400, 500, 100].map((count, index, arr) => (
                      <div key={`shape-sim-${count}`} className="flex items-center gap-2">
                        <button
                          type="button"
                          className="text-sm text-cyan-100 hover:text-cyan-50"
                          onClick={() => runShapeSimulation(count)}
                        >
                          {count}{index === arr.length - 1 ? "次" : ""}
                        </button>
                        {index < arr.length - 1 ? <span className="text-zinc-500">|</span> : null}
                      </div>
                    ))}
                  </div>
                }
              />
            </div>
            <button className="mt-4 w-full rounded-xl border border-cyan-400/30 bg-cyan-500/10 py-2 text-cyan-100" onClick={() => { updateRoomSettings(); setShowParameterSettings(false); }}>保存参数设置</button>
          </div>
        </div>
      )}

      {showCodex && (
        <div className="fixed inset-0 z-40 bg-black/70 p-4">
          <div className="mx-auto max-h-[92vh] max-w-[1100px] overflow-y-auto rounded-3xl border border-white/10 bg-[#0b1020] p-5 shadow-2xl">
            <div className="mb-3 flex items-center justify-between gap-3">
              <p className="text-lg text-fuchsia-100">万物图鉴</p>
              <div className="flex items-center gap-2">
                <button className="rounded-xl border border-white/10 px-3 py-1 text-sm text-zinc-300" onClick={resetCatalogFilterAndSort}>重置</button>
                <button className={cn("rounded-xl border px-3 py-1 text-sm", codexViewMode === "list" ? "border-cyan-300 bg-cyan-500/10 text-cyan-100" : "border-white/10 text-zinc-300")} onClick={() => { resetCatalogSort(); setCodexViewMode("list"); }}>列表</button>
                <button className={cn("rounded-xl border px-3 py-1 text-sm", codexViewMode === "card" ? "border-cyan-300 bg-cyan-500/10 text-cyan-100" : "border-white/10 text-zinc-300")} onClick={() => setCodexViewMode("card")}>卡片</button>
                <button className="rounded-xl border border-white/10 px-3 py-1" onClick={() => { setShowCodex(false); setCatalogFocusItemId(null); }}>关闭</button>
              </div>
            </div>
            <div className="grid gap-2 md:grid-cols-5">
              <select value={catalogFilter.type} onChange={(e) => setCatalogFilter((f) => ({ ...f, type: e.target.value }))} className="rounded-xl border border-white/10 bg-slate-950/80 px-3 py-2"><option value="全部">全部类型</option>{TYPES.map((t: string) => <option key={t} value={t}>{t}</option>)}</select>
              <button ref={qualityAnchorRef} className={cn("rounded-xl border border-white/10 bg-slate-950/80 px-3 py-2 text-left", catalogFilter.quality !== "全部" ? QUALITY_TEXT_COLOR[catalogFilter.quality] : "text-zinc-300")} onClick={() => setShowQualityPicker(true)}>
                {catalogFilter.quality === "全部" ? "选择品级" : `品级：${catalogFilter.quality}`}
              </button>
              <button ref={shapeAnchorRef} className="rounded-xl border border-white/10 bg-slate-950/80 px-3 py-2 text-left text-zinc-300" onClick={() => setShowShapePicker(true)}>
                {catalogFilter.shape === "全部" ? "选择形状" : `形状：${catalogFilter.shape}`}
              </button>
              <input type="number" className="rounded-xl border border-white/10 bg-slate-950/80 px-3 py-2" value={catalogFilter.min} onChange={(e) => setCatalogFilter((f) => ({ ...f, min: Number(e.target.value) || 0 }))} placeholder="最低价" />
              <input type="number" className="rounded-xl border border-white/10 bg-slate-950/80 px-3 py-2" value={catalogFilter.max} onChange={(e) => setCatalogFilter((f) => ({ ...f, max: Number(e.target.value) || 99999999 }))} placeholder="最高价" />
            </div>

            {codexViewMode === "list" ? (
              <div className="mt-4 overflow-x-auto rounded-2xl border border-white/10 bg-slate-950/35 pb-1">
                <div className="min-w-[860px] w-full text-sm">
                  <div className="grid w-full grid-cols-[1.15fr_1.8fr_0.9fr_1fr_0.8fr_1fr] bg-black/30 text-fuchsia-100">
                    <button type="button" className="px-3 py-2 whitespace-nowrap text-left hover:bg-white/5" onClick={() => toggleCatalogSort("type")}>
                      类型 {renderSortMark("type")}
                    </button>
                    <button type="button" className="px-3 py-2 whitespace-nowrap text-left hover:bg-white/5" onClick={() => toggleCatalogSort("name")}>
                      名称 {renderSortMark("name")}
                    </button>
                    <button type="button" className="px-3 py-2 whitespace-nowrap text-left hover:bg-white/5" onClick={() => toggleCatalogSort("quality")}>
                      品级 {renderSortMark("quality")}
                    </button>
                    <button type="button" className="px-3 py-2 whitespace-nowrap text-left hover:bg-white/5" onClick={() => toggleCatalogSort("shape")}>
                      形状 {renderSortMark("shape")}
                    </button>
                    <button type="button" className="px-3 py-2 whitespace-nowrap text-left hover:bg-white/5" onClick={() => toggleCatalogSort("size")}>
                      格数 {renderSortMark("size")}
                    </button>
                    <button type="button" className="px-3 py-2 whitespace-nowrap text-left hover:bg-white/5" onClick={() => toggleCatalogSort("price")}>
                      价格 {renderSortMark("price")}
                    </button>
                  </div>
                  {filteredCatalog.map((it: any) => (
                    <HoverTip
                      key={it.id}
                      side="top"
                      content={
                        <>
                          <p className="text-amber-100">{it.name}</p>
                          <p className="mt-1 text-zinc-300">类型：{it.type}｜品级：{it.quality}</p>
                          <p className="mt-1 text-zinc-300">形状：{it.shape}｜尺寸：{it.width} × {it.height}（{it.size}格）</p>
                          <p className="mt-1 text-amber-200">价格：{it.price} 灵石</p>
                          <p className="mt-2 text-zinc-400">{it.desc}</p>
                        </>
                      }
                      label={
                        <div className="grid w-full grid-cols-[1.15fr_1.8fr_0.9fr_1fr_0.8fr_1fr] border-t border-white/10 text-zinc-300 transition hover:bg-white/5">
                          <div className="px-3 py-2 whitespace-nowrap">{it.type}</div>
                          <div className="px-3 py-2 whitespace-nowrap text-zinc-100">{it.name}</div>
                          <div className="px-3 py-2 whitespace-nowrap">{it.quality}</div>
                          <div className="px-3 py-2 whitespace-nowrap">{it.shape}</div>
                          <div className="px-3 py-2 whitespace-nowrap">{it.size}</div>
                          <div className="px-3 py-2 whitespace-nowrap text-amber-100">{it.price}</div>
                        </div>
                      }
                    />
                  ))}
                </div>
              </div>
            ) : (
              <div className="mt-4 grid gap-2 grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
                {filteredCatalog.map((it: any) => (
                  <HoverTip
                    key={it.id}
                    side="top"
                    content={
                      <>
                        <p className="text-amber-100">{it.name}</p>
                        <p className="mt-1 text-zinc-300">类型：{it.type}｜品级：{it.quality}</p>
                        <p className="mt-1 text-zinc-300">形状：{it.shape}｜尺寸：{it.width} × {it.height}（{it.size}格）</p>
                        <p className="mt-1 text-amber-200">价格：{it.price} 灵石</p>
                        <p className="mt-2 text-zinc-400">{it.desc}</p>
                      </>
                    }
                    label={<div className="rounded-xl border border-white/10 bg-slate-950/50 p-2.5 text-left"><div className="flex items-start justify-between gap-2"><p className="text-sm text-zinc-100">{it.name}</p><span className="text-xs text-zinc-400">{it.quality}</span></div><p className="mt-1 text-[11px] text-zinc-400">{it.type}｜{it.shape}｜{it.size}格</p><p className="mt-1 text-xs text-amber-100">{it.price} 灵石</p></div>}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      )}


      <KeypadPopover open={showKeypad} anchorRef={bidAnchorRef} value={bidInput} onClose={() => setShowKeypad(false)} onAppend={appendBidDigit} onDelete={deleteBidDigit} onClear={clearBidInput} />
      <ShapePopover
        open={showShapePicker}
        anchorRef={shapeAnchorRef}
        value={catalogFilter.shape}
        onClose={() => setShowShapePicker(false)}
        onSelect={(shape) => setCatalogFilter((f) => ({ ...f, shape }))}
        onClear={() => setCatalogFilter((f) => ({ ...f, shape: "全部" }))}
      />
      <QualityPopover
        open={showQualityPicker}
        anchorRef={qualityAnchorRef}
        value={catalogFilter.quality}
        onClose={() => setShowQualityPicker(false)}
        onSelect={(quality) => setCatalogFilter((f) => ({ ...f, quality }))}
        onClear={() => setCatalogFilter((f) => ({ ...f, quality: "全部" }))}
      />
      <ToolPopover
        open={showToolPicker}
        anchorRef={toolAnchorRef}
        tools={toolList}
        disabledToolIds={usedToolHistory}
        unaffordableToolIds={unaffordableToolIds}
        onClose={() => setShowToolPicker(false)}
        onSelect={selectTool}
      />
      {showToolConfirm && selectedTool && (
        <div className="fixed inset-0 z-[150] flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-sm rounded-3xl border border-white/10 bg-[#0b1020] p-5 shadow-2xl">
            <p className="text-lg text-cyan-100">确认施展推演</p>
            <p className="mt-3 text-zinc-200">是否使用【{selectedTool.name}】？</p>
            <p className="mt-1 text-sm text-zinc-400">{selectedTool.desc}</p>
            <p className="mt-1 text-sm text-amber-200">消耗：{selectedTool.cost} 灵石</p>
            <div className="mt-4 flex gap-2">
              <button className="flex-1 rounded-xl border border-white/10 bg-black/20 py-2 text-zinc-300" onClick={() => { setShowToolConfirm(false); setSelectedTool(null); }}>取消</button>
              <button className="flex-1 rounded-xl border border-cyan-400/30 bg-cyan-500/10 py-2 text-cyan-100" onClick={confirmUseTool}>确认使用</button>
            </div>
          </div>
        </div>
      )}

      {warehouseTip && typeof document !== "undefined" && createPortal(
        <div className="pointer-events-none fixed inset-0 z-[2147483647]">
          <div
            className="absolute rounded-2xl border border-white/10 bg-[#0a0f1b]/98 p-3 text-xs text-zinc-200 shadow-2xl backdrop-blur-xl"
            style={{
              width: Math.min(320, window.innerWidth - 24),
              left: Math.min(
                Math.max(warehouseTip.rect.left + warehouseTip.rect.width / 2, Math.min(320, window.innerWidth - 24) / 2 + 12),
                window.innerWidth - Math.min(320, window.innerWidth - 24) / 2 - 12
              ),
              top:
                warehouseTip.rect.top > 150
                  ? warehouseTip.rect.top - 10
                  : warehouseTip.rect.bottom + 10,
              transform: warehouseTip.rect.top > 150 ? "translate(-50%, -100%)" : "translate(-50%, 0)",
            }}
          >
            <div className="flex items-center justify-between gap-2">
              <p className="text-amber-100">{warehouseTip.item.name}</p>
              <span className="rounded-md bg-black/20 px-1.5 py-0.5 text-xs text-amber-100">{warehouseTip.item.quality}</span>
            </div>
            <p className="mt-1 text-zinc-300">类型：{warehouseTip.item.type}｜品级：{warehouseTip.item.quality}</p>
            <p className="mt-1 text-zinc-300">形状：{warehouseTip.item.shape}｜尺寸：{warehouseTip.item.width} × {warehouseTip.item.height}（{warehouseTip.item.size}格）</p>
            <p className="mt-1 text-amber-200">估价：{warehouseTip.item.price} 灵石</p>
            <p className="mt-2 text-zinc-400">{warehouseTip.item.desc}</p>
          </div>
        </div>,
        document.body
      )}

      {uiDialog && (
        <div className="fixed inset-0 z-[170] flex items-center justify-center bg-black/65 p-4">
          <div className="w-full max-w-md rounded-3xl border border-white/10 bg-[#0b1020] p-5 shadow-2xl">
            <p className="text-lg text-amber-100">{uiDialog.title}</p>
            <p className="mt-3 text-sm text-zinc-300">{uiDialog.message}</p>
            <button className="mt-5 w-full rounded-xl border border-cyan-400/30 bg-cyan-500/10 py-2 text-cyan-100" onClick={() => setUiDialog(null)}>
              知道了
            </button>
          </div>
        </div>
      )}

      {room?.latestResult && showStatsModal && (
        <div className="fixed inset-0 z-[160] bg-black/70 p-4">
          <div className="mx-auto max-h-[92vh] max-w-[1300px] overflow-y-auto rounded-3xl border border-white/10 bg-[#0b1020] p-5 shadow-2xl">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <p className="text-lg text-amber-100">本局统计 · 房间ID {room.roomId}</p>
                <p className="text-xs text-zinc-400">完成时间：{room.latestResult.finishedAt}</p>
              </div>
              <div className="flex gap-2">
                <button className="rounded-xl border border-white/10 px-3 py-1 text-sm" onClick={() => setShowStatsModal(false)}>关闭窗口</button>
              </div>
            </div>

            <div className="overflow-x-auto rounded-2xl border border-white/10 pb-1">
              <table className="min-w-[860px] text-sm">
                <thead className="bg-black/30 text-amber-100">
                  <tr>
                    <th className="px-3 py-2 text-left">排名</th>
                    <th className="px-3 py-2 text-left">玩家</th>
                    <th className="px-3 py-2 text-left">剩余灵石</th>
                    <th className="px-3 py-2 text-left">胜场</th>
                    <th className="px-3 py-2 text-left">总盈亏</th>
                    <th className="px-3 py-2 text-left">总出价</th>
                    <th className="px-3 py-2 text-left">推演/花费</th>
                    <th className="px-3 py-2 text-left">称号</th>
                  </tr>
                </thead>
                <tbody>
                  {room.latestResult.ranking.map((r: any, idx: number) => (
                    <tr key={r.id || r.playerId || r.name} className="border-t border-white/10 text-zinc-300">
                      <td className="px-3 py-2">#{idx + 1}</td>
                      <td className="px-3 py-2">{r.name}</td>
                      <td className="px-3 py-2">{r.spiritStone}</td>
                      <td className="px-3 py-2">{r.stats?.wins ?? 0}/{r.stats?.roundsWon ?? 0}</td>
                      <td className="px-3 py-2">{r.stats?.totalProfit ?? 0}</td>
                      <td className="px-3 py-2">{r.stats?.totalBidAmount ?? 0}</td>
                      <td className="px-3 py-2">{r.stats?.usedTools ?? 0} / {r.stats?.toolSpend ?? 0}</td>
                      <td className="px-3 py-2 text-fuchsia-200">
                        <div className="flex flex-wrap gap-1.5">
                          {(r.titleDetails || []).length > 0 ? (r.titleDetails || []).map((title: any) => (
                            <HoverTip
                              key={`${r.id}-${title.code}-table`}
                              side="top"
                              content={<><p className="text-amber-100">{title.code}</p><p className="mt-1 text-zinc-300">{title.desc || "暂无说明"}</p></>}
                              label={<span className="inline-flex h-6 min-w-6 items-center justify-center rounded-full border border-fuchsia-300/30 bg-fuchsia-500/10 px-2 text-xs text-fuchsia-100">{title.code}</span>}
                            />
                          )) : <span className="text-zinc-500">暂无</span>}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mt-5 flex flex-wrap gap-2">
              {(room.latestResult.rounds || []).map((round: any) => (
                <button
                  key={`stats-tab-${round.roundNo}`}
                  className={cn("rounded-xl border px-3 py-1 text-sm", statsRoundTab === round.roundNo ? "border-cyan-300 bg-cyan-500/10 text-cyan-100" : "border-white/10 bg-black/20 text-zinc-300")}
                  onClick={() => setStatsRoundTab(round.roundNo)}
                >
                  第 {round.roundNo} 回合
                </button>
              ))}
            </div>

            {(() => {
              const round = (room.latestResult.rounds || []).find((r: any) => r.roundNo === statsRoundTab) || room.latestResult.rounds?.[0];
              if (!round) return null;
              return (
                <div className="mt-4 rounded-2xl border border-white/10 bg-black/20 p-4">
                  <p className="text-amber-100">第 {round.roundNo} 回合 · 【{round.realm}修士】储物袋</p>
                  <p className="mt-1 text-sm text-zinc-400">成交者：{round.winnerName || "流拍"}｜成交价：{round.winningBid}｜总价值：{round.totalValue}｜盈亏：{round.profit}</p>
                  <p className="mt-1 text-xs text-zinc-500">占用格数：{round.targetCells || 0}｜物品总数：{round.itemCount || 0}</p>

                  <div className="mt-3 overflow-hidden rounded-xl border border-white/10 bg-slate-950/35">
                    <div className="border-b border-white/10 px-3 py-2 text-xs text-cyan-100">储物袋统计</div>
                    <div className="overflow-x-auto">
                      <table className="min-w-full text-xs text-zinc-300">
                        <thead className="bg-black/20 text-amber-100">
                          <tr>
                            <th className="px-3 py-2 text-left">品质 \ 类型</th>
                            {TYPES.map((type: string) => (
                              <th key={`matrix-type-${round.roundNo}-${type}`} className="px-3 py-2 text-left whitespace-nowrap">{type}</th>
                            ))}
                            <th className="px-3 py-2 text-left">合计</th>
                          </tr>
                        </thead>
                        <tbody>
                          {QUALITIES.map((quality: string) => {
                            const rowTotal = TYPES.reduce((sum: number, type: string) => {
                              const value = Number(round.matrixSummary?.[quality]?.[type] || 0);
                              return sum + value;
                            }, 0);
                            return (
                              <tr key={`matrix-row-${round.roundNo}-${quality}`} className="border-t border-white/10">
                                <td className="px-3 py-2 text-amber-100">{quality}</td>
                                {TYPES.map((type: string) => {
                                  const value = Number(round.matrixSummary?.[quality]?.[type] || 0);
                                  return <td key={`matrix-cell-${round.roundNo}-${quality}-${type}`} className="px-3 py-2">{value}</td>;
                                })}
                                <td className="px-3 py-2 text-cyan-100">{rowTotal}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                        <tfoot className="border-t border-white/10 bg-black/20 text-fuchsia-100">
                          <tr>
                            <td className="px-3 py-2">合计</td>
                            {TYPES.map((type: string) => {
                              const colTotal = QUALITIES.reduce((sum: number, quality: string) => {
                                const value = Number(round.matrixSummary?.[quality]?.[type] || 0);
                                return sum + value;
                              }, 0);
                              return <td key={`matrix-total-${round.roundNo}-${type}`} className="px-3 py-2">{colTotal}</td>;
                            })}
                            <td className="px-3 py-2 text-amber-100">{round.itemCount || 0}</td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  </div>

                  <div className="mt-3 space-y-3">
                    {(round.logs || []).map((log: any) => (
                      <div key={`${round.roundNo}-${log.roundNo}`} className="overflow-hidden rounded-xl border border-white/10 bg-slate-950/40">
                        <div className="border-b border-white/10 px-3 py-2 text-sm text-zinc-200">第 {log.roundNo} 轮 · 判定倍率 {log.multiplier}</div>
                        <div className="w-full overflow-x-auto">
                        <table className="w-full min-w-[720px] table-fixed text-xs text-zinc-300">
                          <colgroup>
                            <col className="w-[28%]" />
                            <col className="w-[20%]" />
                            <col className="w-[22%]" />
                            <col className="w-[30%]" />
                          </colgroup>
                          <thead className="bg-black/20">
                            <tr>
                              <th className="px-3 py-2 text-left">玩家</th>
                              <th className="px-3 py-2 text-left">出价</th>
                              <th className="px-3 py-2 text-left">推演</th>
                              <th className="px-3 py-2 text-left">结果</th>
                            </tr>
                          </thead>
                          <tbody>
                            {Object.keys(log.bids || {}).map((pid) => {
                              const playerName = log.bidPlayerNames?.[pid] || pid;
                              const toolName = toolList.find((t: any) => t.id === log.usedTools?.[pid])?.name || "-";
                              const bid = log.bids?.[pid];
                              const bidStatus = log.statusByPlayer?.[pid] || bid || 0;
                              return (
                                <tr key={pid} className="border-t border-white/10">
                                  <td className="px-3 py-2">{playerName}</td>
                                  <td className="px-3 py-2">{bidStatus}</td>
                                  <td className="px-3 py-2">{toolName}</td>
                                  <td className="px-3 py-2 whitespace-nowrap">{log.winnerId === pid ? "本轮领先" : "-"}</td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })()}
          </div>
        </div>
      )}
    </div>
  );
}

export default App;