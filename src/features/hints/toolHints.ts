import { applyHintEffect, cloneIntel, createRng, hashSeed, type HintIntel, type HintTool } from "./shared";

export function computeFrontToolHint({
  gameId,
  roundId,
  playerId,
  bidRound,
  tool,
  items,
  baseIntel,
}: {
  gameId: string;
  roundId: string;
  playerId: string;
  bidRound: number;
  tool: HintTool;
  items: Array<{ placedId: string; x: number; y: number; width: number; height: number; quality: string; type: string; size: number; price: number }>;
  baseIntel?: Partial<HintIntel> | null;
}) {
  const seedKey = `${gameId}_${roundId}_${playerId}_${tool.id}_${bidRound}`;
  const intel = cloneIntel(baseIntel);
  const text = applyHintEffect(tool.effect as any, intel, items, createRng(hashSeed(seedKey)), `推演【${tool.name}】`);
  intel.texts.push(text);
  return { text, intel, seedKey };
}
