import { createEmptyIntel, type HintIntel } from "./shared";

export type FrontHintCacheRoundEntry = {
  intel: HintIntel;
  systemHints: string[];
  skillHints: string[];
  toolHints: string[];
  usedToolId?: string;
};

export type FrontHintCacheByRound = Record<number, FrontHintCacheRoundEntry>;

function uniq(arr: string[]) {
  return Array.from(new Set(arr.filter(Boolean)));
}

export function mergeIntel(base: HintIntel, extra?: HintIntel | null): HintIntel {
  if (!extra) return base;
  return {
    knownItemIds: Array.from(new Set([...(base.knownItemIds || []), ...(extra.knownItemIds || [])])),
    knownContours: Array.from(new Set([...(base.knownContours || []), ...(extra.knownContours || [])])),
    knownQualityCells: [
      ...(base.knownQualityCells || []),
      ...((extra.knownQualityCells || []).filter(
        (cell) =>
          !(base.knownQualityCells || []).some(
            (baseCell) => `${baseCell.itemPlacedId}_${baseCell.x}_${baseCell.y}` === `${cell.itemPlacedId}_${cell.x}_${cell.y}`
          )
      )),
    ],
    knownTypeItemIds: Array.from(new Set([...(base.knownTypeItemIds || []), ...(extra.knownTypeItemIds || [])])),
    texts: [...(base.texts || []), ...(extra.texts || [])],
  };
}

export function aggregateFrontHintCache(cache: FrontHintCacheByRound, upToRound: number) {
  let intel = createEmptyIntel();
  const systemHints: string[] = [];
  const skillHints: string[] = [];
  const toolHints: string[] = [];
  for (let roundNo = 1; roundNo <= upToRound; roundNo += 1) {
    const entry = cache[roundNo];
    if (!entry) continue;
    intel = mergeIntel(intel, entry.intel);
    systemHints.push(...(entry.systemHints || []));
    skillHints.push(...(entry.skillHints || []));
    toolHints.push(...(entry.toolHints || []));
  }
  return {
    intel,
    systemHints: uniq(systemHints),
    skillHints: uniq(skillHints),
    toolHints: uniq(toolHints),
  };
}

