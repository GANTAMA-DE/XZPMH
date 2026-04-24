const RESULT_TITLE_ORDER = [
  "冠","亚","季","魁","尾","破","富","豪","阔","宝","省","龙","凤","神","鬼","牛","熊","虎","龟","鼠","智","亏","秀","吉","凶","衰","福","寿","禄","财","喜","功","丹","器","阵","符","植","兽","杂","圣","天","地","玄","黄","凡",
];

const RESULT_TITLE_META: Record<string, { name: string; desc: string }> = {
  冠: { name: "冠军", desc: "本局排名第一的玩家" },
  亚: { name: "亚军", desc: "本局排名第二的玩家" },
  季: { name: "季军", desc: "本局排名第三的玩家" },
  魁: { name: "魁首", desc: "每回合结算后排名第一次数最多的玩家" },
  尾: { name: "垫底", desc: "本局排名倒数第一的玩家" },
  破: { name: "破产", desc: "本局结束时灵石数小于 0 的玩家" },
  富: { name: "首富", desc: "游戏过程中灵石曾达到全场最高金额的玩家" },
  豪: { name: "豪掷", desc: "所有轮次中单次出价最高的玩家" },
  阔: { name: "阔绰", desc: "所有回合中竞价成功所花费灵石总和最多的玩家" },
  宝: { name: "宝卦", desc: "使用推演轮次数最多的玩家" },
  省: { name: "省卦", desc: "使用推演轮次数最少的玩家" },
  龙: { name: "龙夺", desc: "竞价成功回合数最多的玩家" },
  凤: { name: "凤随", desc: "竞价成功回合中作为出价第二名次数最多的玩家" },
  神: { name: "神算", desc: "竞价成功且累计盈利金额最多的玩家" },
  鬼: { name: "鬼手", desc: "竞价成功但累计亏损金额最多的玩家" },
  牛: { name: "牛市", desc: "竞价成功且盈利回合数最多的玩家" },
  熊: { name: "熊市", desc: "竞价成功但亏损回合数最多的玩家" },
  虎: { name: "虎投", desc: "所有轮次中竞价给出的灵石总和最多的玩家" },
  龟: { name: "龟投", desc: "所有轮次中竞价给出的灵石总和最少的玩家" },
  鼠: { name: "鼠尾", desc: "所有轮次中竞价垫底次数最多的玩家" },
  智: { name: "智夺", desc: "竞价成功且与第二名差额最少的一次所属玩家" },
  亏: { name: "亏天", desc: "竞价成功且与第二名差额最多的一次所属玩家" },
  秀: { name: "秀盈", desc: "竞价成功且单次盈利最多的一次所属玩家" },
  吉: { name: "吉盈", desc: "竞价成功且单次盈利最少的一次所属玩家" },
  凶: { name: "凶亏", desc: "竞价成功且单次亏损最少的一次所属玩家" },
  衰: { name: "衰亏", desc: "竞价成功且单次亏损最多的一次所属玩家" },
  福: { name: "福", desc: "曾在第六轮竞价成功的玩家" },
  寿: { name: "寿", desc: "曾在第七轮竞价成功的玩家" },
  禄: { name: "禄", desc: "曾在第八轮竞价成功的玩家" },
  财: { name: "财", desc: "曾在第九轮竞价成功的玩家" },
  喜: { name: "喜", desc: "曾在第十轮竞价成功的玩家" },
  功: { name: "功", desc: "竞拍成功获得功法类物品数最多的玩家" },
  丹: { name: "丹", desc: "竞拍成功获得丹药类物品数最多的玩家" },
  器: { name: "器", desc: "竞拍成功获得武器类物品数最多的玩家" },
  阵: { name: "阵", desc: "竞拍成功获得阵法类物品数最多的玩家" },
  符: { name: "符", desc: "竞拍成功获得符箓类物品数最多的玩家" },
  植: { name: "植", desc: "竞拍成功获得灵植类物品数最多的玩家" },
  兽: { name: "兽", desc: "竞拍成功获得灵兽类物品数最多的玩家" },
  杂: { name: "杂", desc: "竞拍成功获得杂项类物品数最多的玩家" },
  圣: { name: "圣", desc: "竞拍成功获得圣级物品数最多的玩家" },
  天: { name: "天", desc: "竞拍成功获得天级物品数最多的玩家" },
  地: { name: "地", desc: "竞拍成功获得地级物品数最多的玩家" },
  玄: { name: "玄", desc: "竞拍成功获得玄级物品数最多的玩家" },
  黄: { name: "黄", desc: "竞拍成功获得黄级物品数最多的玩家" },
  凡: { name: "凡", desc: "竞拍成功获得凡级物品数最多的玩家" },
};

const RESULT_TYPE_TITLE_MAP: Record<string, string> = {
  功法: "功", 丹药: "丹", 武器: "器", 阵法: "阵", 符箓: "符", 灵植: "植", 灵兽: "兽", 杂项: "杂",
};

const RESULT_QUALITY_TITLE_MAP: Record<string, string> = {
  圣: "圣", 天: "天", 地: "地", 玄: "玄", 黄: "黄", 凡: "凡",
};

function nowText() {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}:${String(d.getSeconds()).padStart(2, "0")}`;
}

function countBy(items: any[], key: string) {
  return items.reduce((acc, item) => {
    const value = item?.[key];
    if (!value) return acc;
    acc[value] = (acc[value] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
}

function buildQualityTypeMatrix(items: any[]) {
  const qualities = ["圣", "天", "地", "玄", "黄", "凡"];
  const types = ["功法", "丹药", "武器", "阵法", "符箓", "灵植", "灵兽", "杂项"];
  const matrix = Object.fromEntries(qualities.map((quality) => [quality, Object.fromEntries(types.map((type) => [type, 0]))])) as Record<string, Record<string, number>>;
  (items || []).forEach((item) => {
    if (matrix[item.quality] && matrix[item.quality][item.type] !== undefined) {
      matrix[item.quality][item.type] += 1;
    }
  });
  return matrix;
}

function addResultTitle(titleMap: Record<string, Set<string>>, playerId: string, code: string) {
  if (!titleMap[playerId]) titleMap[playerId] = new Set();
  titleMap[playerId].add(code);
}

function awardResultTitle(titleMap: Record<string, Set<string>>, playerIds: string[], code: string) {
  playerIds.forEach((playerId) => addResultTitle(titleMap, playerId, code));
}

function sortResultTitles(codes: string[]) {
  return [...new Set(codes)].sort((a, b) => RESULT_TITLE_ORDER.indexOf(a) - RESULT_TITLE_ORDER.indexOf(b));
}

function numericBidEntries(log: any) {
  return Object.entries(log?.bids || {})
    .filter(([, bid]) => typeof bid === "number" && Number.isFinite(bid as number) && (bid as number) >= 0)
    .map(([playerId, bid]) => ({ playerId, bid: bid as number }))
    .sort((a, b) => b.bid - a.bid);
}

function awardByMax(titleMap: Record<string, Set<string>>, playerIds: string[], metricsByPlayer: any, code: string, getter: (metric: any, playerId: string) => number, options: { requirePositive?: boolean; requireFinite?: boolean } = {}) {
  const { requirePositive = false, requireFinite = true } = options;
  let best = -Infinity;
  const winners: string[] = [];
  playerIds.forEach((playerId) => {
    const value = getter(metricsByPlayer[playerId], playerId);
    if (requireFinite && !Number.isFinite(value)) return;
    if (requirePositive && !(value > 0)) return;
    if (value > best) {
      best = value; winners.length = 0; winners.push(playerId);
    } else if (value === best) winners.push(playerId);
  });
  if (winners.length) awardResultTitle(titleMap, winners, code);
}

function awardByMin(titleMap: Record<string, Set<string>>, playerIds: string[], metricsByPlayer: any, code: string, getter: (metric: any, playerId: string) => number, options: { requireFinite?: boolean } = {}) {
  const { requireFinite = true } = options;
  let best = Infinity;
  const winners: string[] = [];
  playerIds.forEach((playerId) => {
    const value = getter(metricsByPlayer[playerId], playerId);
    if (requireFinite && !Number.isFinite(value)) return;
    if (value < best) {
      best = value; winners.length = 0; winners.push(playerId);
    } else if (value === best) winners.push(playerId);
  });
  if (winners.length) awardResultTitle(titleMap, winners, code);
}

function awardEventByExtreme(titleMap: Record<string, Set<string>>, code: string, events: Array<{ playerId: string; value: number }>, mode: "max" | "min" = "max") {
  if (!events.length) return;
  const values = events.map((event) => event.value).filter((value) => Number.isFinite(value));
  if (!values.length) return;
  const target = mode === "min" ? Math.min(...values) : Math.max(...values);
  const winners = [...new Set(events.filter((event) => event.value === target).map((event) => event.playerId))];
  if (winners.length) awardResultTitle(titleMap, winners, code);
}

export function buildFrontGameResult({ room, roundsWithBags }: { room: any; roundsWithBags: any[] }) {
  const players = [...(room?.players || [])];
  const playerIds = players.map((player) => player.id);
  const playerNames = Object.fromEntries(players.map((player) => [player.id, player.name]));
  const toolNameById = Object.fromEntries(((room?.toolMeta || []) as any[]).map((tool) => [tool.id, tool.name || tool.id]));
  const titleMap = Object.fromEntries(playerIds.map((playerId) => [playerId, new Set<string>()]));
  const metricsByPlayer = Object.fromEntries(players.map((player) => [player.id, {
    maxWealth: room.settings.initialSpiritStone,
    firstAfterSettlementCount: 0,
    highestSingleBid: Number.NEGATIVE_INFINITY,
    totalWinningSpend: 0,
    toolSpend: 0,
    usedToolTurns: 0,
    wins: 0,
    winRounds: 0,
    roundsWon: 0,
    secondPlaceInWinningRounds: 0,
    positiveProfitTotal: 0,
    negativeLossAbsTotal: 0,
    profitableWinRounds: 0,
    losingWinRounds: 0,
    totalBidSum: 0,
    totalWinningBidAmount: 0,
    lowestBidRounds: 0,
    winAtRound: { 6: 0, 7: 0, 8: 0, 9: 0, 10: 0 },
    typeCounts: Object.fromEntries(Object.keys(RESULT_TYPE_TITLE_MAP).map((key) => [key, 0])),
    qualityCounts: Object.fromEntries(Object.keys(RESULT_QUALITY_TITLE_MAP).map((key) => [key, 0])),
  }]));

  const winningGapEvents: Array<{ playerId: string; value: number }> = [];
  const positiveProfitEvents: Array<{ playerId: string; value: number }> = [];
  const negativeLossEvents: Array<{ playerId: string; value: number }> = [];
  const balances = Object.fromEntries(playerIds.map((playerId) => [playerId, room.settings.initialSpiritStone]));
  const roundStartBalancesByRoundNo: Record<number, Record<string, number>> = {};

  (roundsWithBags || []).forEach((round) => {
    roundStartBalancesByRoundNo[round.roundNo] = { ...balances };
    const toolSpendByPlayer = Object.fromEntries(playerIds.map((playerId) => [playerId, 0]));

    (round.auction?.logs || []).forEach((log: any) => {
      const validNumericEntries = numericBidEntries(log).filter(({ playerId }) => Boolean(metricsByPlayer[playerId]));
      validNumericEntries.forEach(({ playerId, bid }) => {
        metricsByPlayer[playerId].highestSingleBid = Math.max(metricsByPlayer[playerId].highestSingleBid, bid);
        metricsByPlayer[playerId].totalBidSum += bid;
      });
      if (validNumericEntries.length >= 2) {
        const lowestBid = Math.min(...validNumericEntries.map((entry) => entry.bid));
        validNumericEntries.filter((entry) => entry.bid === lowestBid).forEach((entry) => {
          metricsByPlayer[entry.playerId].lowestBidRounds += 1;
        });
      }
      Object.entries(log?.usedTools || {}).forEach(([playerId, toolId]) => {
        if (!playerIds.includes(playerId) || !toolId) return;
        const toolList = room?.toolMeta || [];
        const tool = toolList.find((t: any) => t.id === toolId);
        metricsByPlayer[playerId].usedToolTurns += 1;
        metricsByPlayer[playerId].toolSpend += tool?.cost || 0;
        toolSpendByPlayer[playerId] += tool?.cost || 0;
      });
      if (log?.success && log?.winnerId && playerIds.includes(log.winnerId)) {
        if (log.roundNo >= 6 && log.roundNo <= 10) metricsByPlayer[log.winnerId].winAtRound[log.roundNo] += 1;
        if (validNumericEntries.length >= 2) {
          const secondBid = validNumericEntries[1].bid;
          validNumericEntries.filter((entry, index) => index > 0 && entry.bid === secondBid).forEach((entry) => {
            metricsByPlayer[entry.playerId].secondPlaceInWinningRounds += 1;
          });
          winningGapEvents.push({ playerId: log.winnerId, value: validNumericEntries[0].bid - secondBid });
        }
      }
    });

    if (!round.settlement) return;

    playerIds.forEach((playerId) => {
      balances[playerId] -= toolSpendByPlayer[playerId] || 0;
      balances[playerId] -= round.settlement.entryFee || 0;
    });

    if (round.settlement.winnerId && playerIds.includes(round.settlement.winnerId) && metricsByPlayer[round.settlement.winnerId]) {
      const winnerId = round.settlement.winnerId;
      const profit = round.settlement.profit || 0;
      metricsByPlayer[winnerId].wins += 1;
      metricsByPlayer[winnerId].roundsWon += 1;
      metricsByPlayer[winnerId].winRounds += 1;
      metricsByPlayer[winnerId].totalWinningSpend += round.settlement.winningBid || 0;
      metricsByPlayer[winnerId].totalWinningBidAmount += round.settlement.winningBid || 0;
      if (profit > 0) { metricsByPlayer[winnerId].positiveProfitTotal += profit; metricsByPlayer[winnerId].profitableWinRounds += 1; positiveProfitEvents.push({ playerId: winnerId, value: profit }); }
      if (profit < 0) { const absLoss = Math.abs(profit); metricsByPlayer[winnerId].negativeLossAbsTotal += absLoss; metricsByPlayer[winnerId].losingWinRounds += 1; negativeLossEvents.push({ playerId: winnerId, value: absLoss }); }
      balances[winnerId] += profit;
      (round.placedItems || []).forEach((item: any) => {
        if (metricsByPlayer[winnerId].typeCounts[item.type] !== undefined) metricsByPlayer[winnerId].typeCounts[item.type] += 1;
        if (metricsByPlayer[winnerId].qualityCounts[item.quality] !== undefined) metricsByPlayer[winnerId].qualityCounts[item.quality] += 1;
      });
    }

    Object.entries(round.settlement.sharing || {}).forEach(([playerId, delta]) => {
      if (!playerIds.includes(playerId)) return;
      balances[playerId] += Number(delta) || 0;
    });

    const topBalance = Math.max(...playerIds.map((playerId) => balances[playerId]));
    playerIds.forEach((playerId) => {
      metricsByPlayer[playerId].maxWealth = Math.max(metricsByPlayer[playerId].maxWealth, balances[playerId]);
      if (balances[playerId] === topBalance) metricsByPlayer[playerId].firstAfterSettlementCount += 1;
    });
  });

  const finalPlayers = players.map((player) => ({
    ...player,
    spiritStone: balances[player.id] ?? player.spiritStone,
  }));
  const rankingBase = [...finalPlayers].sort((a, b) => b.spiritStone - a.spiritStone);
  if (rankingBase[0]) addResultTitle(titleMap, rankingBase[0].id, "冠");
  if (rankingBase[1]) addResultTitle(titleMap, rankingBase[1].id, "亚");
  if (rankingBase[2]) addResultTitle(titleMap, rankingBase[2].id, "季");
  if (rankingBase[rankingBase.length - 1]) addResultTitle(titleMap, rankingBase[rankingBase.length - 1].id, "尾");
  rankingBase.filter((player) => player.spiritStone < 0).forEach((player) => addResultTitle(titleMap, player.id, "破"));

  awardByMax(titleMap, playerIds, metricsByPlayer, "魁", (metric) => metric.firstAfterSettlementCount, { requirePositive: true });
  awardByMax(titleMap, playerIds, metricsByPlayer, "富", (metric) => metric.maxWealth);
  awardByMax(titleMap, playerIds, metricsByPlayer, "豪", (metric) => metric.highestSingleBid, { requireFinite: true });
  awardByMax(titleMap, playerIds, metricsByPlayer, "阔", (metric) => metric.totalWinningSpend, { requirePositive: true });
  awardByMax(titleMap, playerIds, metricsByPlayer, "宝", (metric) => metric.usedToolTurns);
  awardByMin(titleMap, playerIds, metricsByPlayer, "省", (metric) => metric.usedToolTurns);
  awardByMax(titleMap, playerIds, metricsByPlayer, "龙", (metric) => metric.winRounds, { requirePositive: true });
  awardByMax(titleMap, playerIds, metricsByPlayer, "凤", (metric) => metric.secondPlaceInWinningRounds, { requirePositive: true });
  awardByMax(titleMap, playerIds, metricsByPlayer, "神", (metric) => metric.positiveProfitTotal, { requirePositive: true });
  awardByMax(titleMap, playerIds, metricsByPlayer, "鬼", (metric) => metric.negativeLossAbsTotal, { requirePositive: true });
  awardByMax(titleMap, playerIds, metricsByPlayer, "牛", (metric) => metric.profitableWinRounds, { requirePositive: true });
  awardByMax(titleMap, playerIds, metricsByPlayer, "熊", (metric) => metric.losingWinRounds, { requirePositive: true });
  awardByMax(titleMap, playerIds, metricsByPlayer, "虎", (metric) => metric.totalBidSum);
  awardByMin(titleMap, playerIds, metricsByPlayer, "龟", (metric) => metric.totalBidSum);
  awardByMax(titleMap, playerIds, metricsByPlayer, "鼠", (metric) => metric.lowestBidRounds, { requirePositive: true });
  awardEventByExtreme(titleMap, "智", winningGapEvents, "min");
  awardEventByExtreme(titleMap, "亏", winningGapEvents, "max");
  awardEventByExtreme(titleMap, "秀", positiveProfitEvents, "max");
  awardEventByExtreme(titleMap, "吉", positiveProfitEvents, "min");
  awardEventByExtreme(titleMap, "凶", negativeLossEvents, "min");
  awardEventByExtreme(titleMap, "衰", negativeLossEvents, "max");

  [[6, "福"], [7, "寿"], [8, "禄"], [9, "财"], [10, "喜"]].forEach(([roundNo, code]) => {
    const owners = playerIds.filter((playerId) => metricsByPlayer[playerId].winAtRound[roundNo as number] > 0);
    if (owners.length) awardResultTitle(titleMap, owners, code as string);
  });

  Object.entries(RESULT_TYPE_TITLE_MAP).forEach(([typeName, code]) => {
    awardByMax(titleMap, playerIds, metricsByPlayer, code, (metric) => metric.typeCounts[typeName], { requirePositive: true });
  });
  Object.entries(RESULT_QUALITY_TITLE_MAP).forEach(([qualityName, code]) => {
    awardByMax(titleMap, playerIds, metricsByPlayer, code, (metric) => metric.qualityCounts[qualityName], { requirePositive: true });
  });

  const ranking = rankingBase.map((player) => {
    const titleCodes = sortResultTitles([...titleMap[player.id]]);
    const netProfit = player.spiritStone - room.settings.initialSpiritStone;
    return {
      id: player.id,
      name: player.name,
      spiritStone: player.spiritStone,
      stats: {
        wins: metricsByPlayer[player.id].wins || 0,
        roundsWon: metricsByPlayer[player.id].roundsWon || 0,
        totalProfit: netProfit,
        totalBidAmount: metricsByPlayer[player.id].totalWinningBidAmount || 0,
        usedTools: metricsByPlayer[player.id].usedToolTurns || 0,
        toolSpend: metricsByPlayer[player.id].toolSpend || 0,
      },
      titles: titleCodes,
      titleDetails: titleCodes.map((code) => ({ code, ...(RESULT_TITLE_META[code] || {}) })),
      achievementMetrics: metricsByPlayer[player.id],
    };
  });

  const rounds = (roundsWithBags || []).map((round) => ({
    roundNo: round.roundNo,
    realm: round.realm,
    targetCells: round.targetCells || 0,
    itemCount: (round.placedItems || []).length,
    typeSummary: countBy(round.placedItems || [], "type"),
    qualitySummary: countBy(round.placedItems || [], "quality"),
    matrixSummary: buildQualityTypeMatrix(round.placedItems || []),
    winnerId: round.settlement?.winnerId || null,
    winnerName: round.settlement?.winnerId ? playerNames[round.settlement.winnerId] || round.settlement.winnerId : null,
    winningBid: round.settlement?.winningBid || 0,
    totalValue: round.settlement?.totalValue || 0,
    profit: round.settlement?.profit || 0,
    logs: (round.auction.logs || []).map((log: any) => ({
      roundNo: log.roundNo,
      multiplier: log.multiplier,
      winnerId: log.winnerId,
      winnerName: log.winnerId ? playerNames[log.winnerId] || log.winnerId : null,
      bids: log.bids || {},
      bidPlayerNames: Object.fromEntries(playerIds.map((playerId) => [playerId, playerNames[playerId] || playerId])),
      usedTools: Object.fromEntries(
        Object.entries(log.usedTools || {}).map(([playerId, toolId]) => [playerId, toolNameById[String(toolId)] || toolId || "-"])
      ),
      statusByPlayer: log.statusByPlayer || {},
      success: log.success,
    })),
  }));

  return {
    gameId: room?.game?.id || "",
    finishedAt: nowText(),
    titleMeta: RESULT_TITLE_META,
    ranking,
    rounds,
  };
}