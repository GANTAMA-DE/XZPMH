import { applyHintEffect, cloneIntel, createRng, hashSeed, type HintIntel, type HintTool } from "./shared";

export function computeFrontSystemHint({
  gameId,
  roundId,
  bidRound,
  hintRounds,
  tools,
  items,
  baseIntel,
}: {
  gameId: string;
  roundId: string;
  bidRound: number;
  hintRounds: number[];
  tools: HintTool[];
  items: Array<{ placedId: string; x: number; y: number; width: number; height: number; quality: string; type: string; size: number; price: number }>;
  baseIntel?: Partial<HintIntel> | null;
}) {
  if (!hintRounds.includes(bidRound)) {
    return {
      text: null as string | null,
      intel: cloneIntel(baseIntel),
      seedKey: `${gameId}_${roundId}_system_${bidRound}`,
    };
  }

  const seedKey = `${gameId}_${roundId}_system_${bidRound}`;
  const rng = createRng(hashSeed(seedKey));
  const effect = tools[Math.floor(rng() * tools.length)]?.effect || { type: "summary", metric: "totalSize", scope: { kind: "all" } };
  const intel = cloneIntel(baseIntel);
  const text = applyHintEffect(effect as any, intel, items, createRng(hashSeed(seedKey)), "系统");
  intel.texts.push(text);
  return { text, intel, seedKey };
}
