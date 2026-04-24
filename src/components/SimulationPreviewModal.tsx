import { useMemo } from "react";
import {
  type ShapeSimulationStats,
  ShapeSimulationActions,
  ShapeWeightMatrix,
  simulateShapeMatrixStats,
} from "./parameter-settings/SimulationPreview";

type SimulationSettings = {
  realmProbability: Record<string, number>;
  realmCellSettings: Record<string, { min: number; max: number; peak: number; spread: number }>;
  qualityProbability: Record<string, number>;
  pricePreference: {
    mode: "amount" | "rank";
    amountMidpoint: number;
    amountDecay: number;
    rankMidpoint: number;
    rankDecay: number;
  };
  shapeWeights: Record<string, number>;
};

type SimulationPreviewModalProps = {
  open: boolean;
  settings: SimulationSettings;
  catalog: any[];
  simulation: ShapeSimulationStats | null;
  setSimulation: React.Dispatch<React.SetStateAction<ShapeSimulationStats | null>>;
  onClose: () => void;
};

const REALM_ORDER = ["炼气", "筑基", "结丹", "元婴", "化神", "炼虚", "合体", "大乘"] as const;
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

export function SimulationPreviewModal({
  open,
  settings,
  catalog,
  simulation,
  setSimulation,
  onClose,
}: SimulationPreviewModalProps) {
  const canSimulate = useMemo(() => Boolean(catalog?.length), [catalog]);

  function runShapeSimulation(samples = 500) {
    const nextSeed = `${Date.now()}_${Math.random()}`;
    setSimulation(
      simulateShapeMatrixStats({
        catalog,
        realmProbability: settings.realmProbability,
        realmCellSettings: settings.realmCellSettings,
        qualityProbability: settings.qualityProbability,
        pricePreference: settings.pricePreference,
        shapeWeights: settings.shapeWeights,
        samples,
        randomSeed: nextSeed,
        realmOrder: REALM_ORDER,
        defaultRealmCellSettings: DEFAULT_REALM_CELL_SETTINGS,
        defaultQualityProbability: DEFAULT_QUALITY_PROBABILITY,
        defaultShapeWeights: DEFAULT_SHAPE_WEIGHTS,
      })
    );
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[145] bg-black/70 p-4">
      <div className="mx-auto max-h-[92vh] max-w-6xl overflow-y-auto rounded-3xl border border-white/10 bg-[#0b1020] p-5 shadow-2xl">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <p className="text-lg text-cyan-100">模拟预览</p>
            <p className="text-xs text-zinc-400">使用当前房间参数，在本地浏览器执行储物袋模拟。</p>
          </div>
          <button className="rounded-xl border border-white/10 px-3 py-1 text-sm" onClick={onClose}>关闭</button>
        </div>

        {!canSimulate ? (
          <div className="rounded-2xl border border-dashed border-white/10 p-6 text-sm text-zinc-500">暂无可用于模拟的图鉴数据。</div>
        ) : (
          <ShapeWeightMatrix
            simulation={simulation}
            catalog={catalog}
            actions={<ShapeSimulationActions onRun={runShapeSimulation} />}
          />
        )}
      </div>
    </div>
  );
}

export default SimulationPreviewModal;
