import {
  cloneIntel,
  createRng,
  hashSeed,
  itemQualityRank,
  pickRandom,
  uniquePush,
  type HintIntel,
} from "./shared";

const qAsc = ["黄", "玄", "地", "天", "圣"];
const qDesc = ["圣", "天", "地", "玄", "黄"];
const typeRounds = [
  ["功法"],
  ["丹药", "武器"],
  ["阵法", "符箓"],
  ["灵植", "灵兽"],
  ["杂项"],
];

function getUnknownQualityItems(intel: HintIntel, items: any[]) {
  const knownIds = new Set([...(intel.knownItemIds || [])]);
  const qualityIds = new Set((intel.knownQualityCells || []).map((cell) => cell.itemPlacedId));
  qualityIds.forEach((id) => knownIds.add(id));
  return items.filter((item) => !knownIds.has(item.placedId));
}

function getUnknownContourItems(intel: HintIntel, items: any[]) {
  const knownIds = new Set([...(intel.knownContours || []), ...(intel.knownItemIds || [])]);
  return items.filter((item) => !knownIds.has(item.placedId));
}

function filterByQualities(items: any[], qualities: string[]) {
  return items.filter((item) => qualities.includes(item.quality));
}

function filterByTypes(items: any[], itemTypes: string[]) {
  return items.filter((item) => itemTypes.includes(item.type));
}

function formatAvg(value: number) {
  return (Math.floor(value * 100) / 100).toFixed(2);
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

function revealItemQuality(intel: HintIntel, item: any, rng: () => number) {
  const cells = qualityCellsForItem(item);
  if (!cells.length) return;
  const pick = cells[Math.floor(rng() * cells.length)] || cells[0];
  if (!intel.knownQualityCells.some((cell) => `${cell.itemPlacedId}_${cell.x}_${cell.y}` === `${pick.itemPlacedId}_${pick.x}_${pick.y}`)) {
    intel.knownQualityCells.push(pick);
  }
}

function revealItemContour(intel: HintIntel, item: any) {
  uniquePush(intel.knownContours, item.placedId);
}

function revealItemFull(intel: HintIntel, item: any) {
  uniquePush(intel.knownItemIds, item.placedId);
  uniquePush(intel.knownTypeItemIds, item.placedId);
}

function revealItemType(intel: HintIntel, item: any) {
  uniquePush(intel.knownTypeItemIds, item.placedId);
}

function pickHighestQualityRandom(items: any[], rng: () => number) {
  if (!items.length) return null;
  const maxRank = Math.max(...items.map(itemQualityRank));
  const pool = items.filter((item) => itemQualityRank(item) === maxRank);
  return pickRandom(pool, rng);
}

function pickLowestQualityRandom(items: any[], rng: () => number) {
  if (!items.length) return null;
  const minRank = Math.min(...items.map(itemQualityRank));
  const pool = items.filter((item) => itemQualityRank(item) === minRank);
  return pickRandom(pool, rng);
}

export function computeFrontRoleHint({
  gameId,
  roundId,
  playerId,
  role,
  bidRound,
  items,
  baseIntel,
}: {
  gameId: string;
  roundId: string;
  playerId: string;
  role: { id: string; name: string } | null | undefined;
  bidRound: number;
  items: any[];
  baseIntel?: Partial<HintIntel> | null;
}) {
  const intel = cloneIntel(baseIntel);
  if (!role || !bidRound || bidRound < 1 || bidRound > 5) {
    return { text: null as string | null, intel, seedKey: `${gameId}_${roundId}_${playerId}_role_${bidRound}` };
  }

  const seedKey = `${gameId}_${roundId}_${playerId}_role_${bidRound}`;
  const rng = createRng(hashSeed(seedKey));
  const roleName = role.name;
  let text: string | null = null;

  if (roleName === "刘一") {
    const quality = qAsc[bidRound - 1];
    const list = items.filter((item) => item.quality === quality);
    list.forEach((item) => revealItemQuality(intel, item, rng));
    text = `技能提示：刘一显露所有${quality}级物品的品质（共${list.length}件）。`;
  } else if (roleName === "陈二") {
    const quality = qAsc[bidRound - 1];
    const list = items.filter((item) => item.quality === quality);
    list.forEach((item) => revealItemContour(intel, item));
    text = `技能提示：陈二显露所有${quality}级物品的轮廓（共${list.length}件）。`;
  } else if (roleName === "张三") {
    const unknown = getUnknownQualityItems(intel, items);
    const high = pickHighestQualityRandom(unknown, rng);
    const low = pickLowestQualityRandom(unknown.filter((item) => item.placedId !== high?.placedId), rng);
    const shown: string[] = [];
    if (high) {
      revealItemQuality(intel, high, rng);
      shown.push(`最高品质之一（${high.quality}）`);
    }
    if (low) {
      revealItemQuality(intel, low, rng);
      shown.push(`最低品质之一（${low.quality}）`);
    }
    text = `技能提示：张三揭示剩余未知品质中的${shown.join("；") || "0件物品品质"}。`;
  } else if (roleName === "李四") {
    const unknown = getUnknownContourItems(intel, items);
    const high = pickHighestQualityRandom(unknown, rng);
    const low = pickLowestQualityRandom(unknown.filter((item) => item.placedId !== high?.placedId), rng);
    const shown: string[] = [];
    if (high) {
      revealItemContour(intel, high);
      shown.push(`最高品质之一的轮廓（${high.shape}）`);
    }
    if (low) {
      revealItemContour(intel, low);
      shown.push(`最低品质之一的轮廓（${low.shape}）`);
    }
    text = `技能提示：李四揭示剩余未知轮廓中的${shown.join("；") || "0件物品轮廓"}。`;
  } else if (roleName === "王五") {
    const types = typeRounds[bidRound - 1] || [];
    const shown: string[] = [];
    const emptyTypes: string[] = [];
    types.forEach((type) => {
      const typedItems = filterByTypes(items, [type]);
      const top = pickHighestQualityRandom(typedItems, rng);
      if (top) {
        revealItemQuality(intel, top, rng);
        revealItemType(intel, top);
        shown.push(`${type}最高品质之一（${top.quality}）`);
      } else {
        emptyTypes.push(type);
      }
    });
    const parts: string[] = [];
    if (shown.length) parts.push(`揭示${shown.join("；")}的品质`);
    if (emptyTypes.length) parts.push(`${emptyTypes.join("、")}暂无物品`);
    text = `技能提示：王五${parts.join("；") || "本轮对应类型暂无物品"}。`;
  } else if (roleName === "赵六") {
    const types = typeRounds[bidRound - 1] || [];
    const shownParts: string[] = [];
    const emptyTypes: string[] = [];
    types.forEach((type) => {
      const typedItems = filterByTypes(items, [type]);
      if (!typedItems.length) {
        emptyTypes.push(type);
        return;
      }
      typedItems.forEach((item) => {
        revealItemContour(intel, item);
        revealItemType(intel, item);
      });
      shownParts.push(`${type}（共${typedItems.length}件）`);
    });
    const parts: string[] = [];
    if (shownParts.length) parts.push(`显露${shownParts.join("；")}物品的轮廓`);
    if (emptyTypes.length) parts.push(`${emptyTypes.join("、")}暂无物品`);
    text = `技能提示：赵六${parts.join("；") || "本轮对应类型暂无物品"}。`;
  } else if (roleName === "孙七") {
    const quality = qDesc[bidRound - 1];
    const list = filterByQualities(items, [quality]);
    text = `技能提示：孙七得知所有${quality}级物品的平均格数 = ${list.length ? formatAvg(list.reduce((a, b) => a + b.size, 0) / list.length) : "0.00"}。`;
  } else if (roleName === "周八") {
    const quality = qDesc[bidRound - 1];
    const list = filterByQualities(items, [quality]);
    text = `技能提示：周八得知所有${quality}级物品的总格数 = ${list.reduce((a, b) => a + b.size, 0)}。`;
  } else if (roleName === "吴九") {
    const qualitySets = [["凡"], ["玄", "黄"], ["天", "地"], ["圣"], ["凡", "黄", "玄", "地", "天", "圣"]];
    const qualities = qualitySets[bidRound - 1] || [];
    const list = filterByQualities(items, qualities);
    text = `技能提示：吴九得知${qualities.join("、")}级物品的数量 = ${list.length}。`;
  } else if (roleName === "郑十") {
    const qualitySets = [["凡"], ["玄", "黄"], ["天", "地"], ["圣"], ["凡", "黄", "玄", "地", "天", "圣"]];
    const qualities = qualitySets[bidRound - 1] || [];
    const list = filterByQualities(items, qualities);
    text = `技能提示：郑十得知${qualities.join("、")}级物品的均价 = ${list.length ? formatAvg(list.reduce((a, b) => a + b.price, 0) / list.length) : "0.00"}。`;
  } else {
    const professionMap: Record<string, string> = {
      炼丹师: "丹药",
      炼器师: "武器",
      阵法师: "阵法",
      符箓师: "符箓",
      灵植师: "灵植",
      灵兽师: "灵兽",
    };
    const boundType = professionMap[roleName];
    if (boundType) {
      const list = items.filter((item) => item.type === boundType);
      if (bidRound === 1) {
        text = `技能提示：${roleName}得知所有${boundType}物品的数量 = ${list.length}。`;
      } else if (bidRound === 2) {
        text = `技能提示：${roleName}得知所有${boundType}物品的总格数 = ${list.reduce((a, b) => a + b.size, 0)}。`;
      } else if (bidRound === 3) {
        list.forEach((item) => {
          revealItemContour(intel, item);
          revealItemType(intel, item);
        });
        text = `技能提示：${roleName}显露所有${boundType}物品的轮廓（共${list.length}件）。`;
      } else if (bidRound === 4) {
        list.forEach((item) => {
          revealItemQuality(intel, item, rng);
          revealItemType(intel, item);
        });
        text = `技能提示：${roleName}显露所有${boundType}物品的品质（共${list.length}件）。`;
      } else if (bidRound === 5) {
        list.forEach((item) => revealItemFull(intel, item));
        text = `技能提示：${roleName}显露所有${boundType}物品（共${list.length}件）。`;
      }
    }
  }

  if (!text) return { text: null as string | null, intel, seedKey };
  intel.texts.push(text);
  return { text, intel, seedKey };
}
