export type FrontSettlementView = {
  winnerId: string | null;
  winningBid: number;
  totalValue: number;
  profit: number;
  revealOrder: Array<{ placedId: string }>;
  viewer: {
    mode: "delay" | "instant";
    completed: boolean;
    readyForNextRound: boolean;
  };
  allReadyCountdownAt: number | null;
  forceNextAt: number | null;
  startedAt: number;
  stepMs: number;
};

export type FrontCurrentRoundView = {
  id?: string;
  roundNo: number;
  realm?: string;
  targetCells?: number;
  auction?: any;
  settlement?: FrontSettlementView | null;
};

export function getDisplayedGameCurrentRoundNo({
  rtcSnapshot,
  serverGame,
}: {
  rtcSnapshot: any;
  serverGame: any;
}) {
  return rtcSnapshot?.currentRoundNo || serverGame?.currentRound || 0;
}

export function buildFrontSettlementView({
  hostRoundSnapshot,
  frontRoundBag,
  frontSettlementUi,
}: {
  hostRoundSnapshot: any;
  frontRoundBag: any;
  frontSettlementUi?: { mode?: "delay" | "instant"; completed?: boolean; readyForNextRound?: boolean } | null;
}): FrontSettlementView | null {
  if (!hostRoundSnapshot || hostRoundSnapshot.phase !== "settlement") return null;
  const winningBid = Number(hostRoundSnapshot.winningBid || 0);
  const totalValue = Number((frontRoundBag?.placedItems || []).reduce((sum: number, item: any) => sum + Number(item?.price || 0), 0) || 0);
  return {
    winnerId: hostRoundSnapshot.winnerId || null,
    winningBid,
    totalValue,
    profit: totalValue - winningBid,
    revealOrder: (frontRoundBag?.revealOrder || []).map((item: any) => ({ placedId: item.placedId })),
    viewer: {
      mode: frontSettlementUi?.mode || "delay",
      completed: Boolean(frontSettlementUi?.completed),
      readyForNextRound: Boolean(frontSettlementUi?.readyForNextRound),
    },
    allReadyCountdownAt: hostRoundSnapshot.allReadyCountdownAt || null,
    forceNextAt: hostRoundSnapshot.forceNextAt || null,
    startedAt: hostRoundSnapshot.settlementStartedAt || Date.now(),
    stepMs: 320,
  };
}

export function buildDisplayedCurrentRound({
  serverCurrentRound,
  displayedRoundNo,
  frontRoundBag,
  frontSettlement,
  hostRoundSnapshot,
}: {
  serverCurrentRound: any;
  displayedRoundNo: number;
  frontRoundBag: any;
  frontSettlement: FrontSettlementView | null;
  hostRoundSnapshot: any;
}): FrontCurrentRoundView {
  const baseAuction = serverCurrentRound?.auction || {};
  const phase = hostRoundSnapshot?.phase === "settlement" ? "回合结算" : hostRoundSnapshot?.phase === "action" ? "行动中" : baseAuction.phase;
  return {
    ...serverCurrentRound,
    id: serverCurrentRound?.id || `front_round_${displayedRoundNo}`,
    roundNo: displayedRoundNo,
    realm: frontRoundBag?.realm || serverCurrentRound?.realm,
    targetCells: frontRoundBag?.targetCells ?? serverCurrentRound?.targetCells,
    auction: {
      ...baseAuction,
      bidRound: hostRoundSnapshot?.currentBidRound || baseAuction.bidRound || 1,
      deadlineAt: hostRoundSnapshot?.actionDeadlineAt || baseAuction.deadlineAt || null,
      activePlayerIds: hostRoundSnapshot?.activePlayerIds || baseAuction.activePlayerIds || [],
      phase,
    },
    settlement: frontSettlement || serverCurrentRound?.settlement || null,
  };
}
