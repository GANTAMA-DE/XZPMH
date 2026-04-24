export type HostAuctionPlayerState = {
  id: string;
  name: string;
  spiritStone: number;
  roleId?: string;
};

export type HostAuctionBidRecord = {
  amount?: number | null;
  toolId?: string | null;
};

export type HostAuctionBidRoundResult = {
  bidRound: number;
  activePlayerIds: string[];
  winnerId: string | null;
  winningBid: number;
  success: boolean;
  nextBidRound: number | null;
  nextActivePlayerIds: string[];
  multiplier: number;
};

export type HostAuctionRoundSnapshot = {
  roundNo: number;
  bidRounds: Record<number, Record<string, HostAuctionBidRecord>>;
  settlementApplied: boolean;
  currentBidRound: number;
  phase: "action" | "settlement";
  activePlayerIds: string[];
  winnerId: string | null;
  winningBid: number;
  settlementStarted: boolean;
  settlementStartedAt: number | null;
  actionDeadlineAt: number | null;
  allReadyCountdownAt: number | null;
  forceNextAt: number | null;
  settlementReadyByPlayer: Record<string, boolean>;
  directRevealByPlayer: Record<string, boolean>;
  lastResult: HostAuctionBidRoundResult | null;
};

export type HostAuctionSnapshot = {
  gameId: string;
  currentRoundNo: number;
  totalRounds: number;
  status: "进行中" | "已完成";
  players: Record<string, HostAuctionPlayerState>;
  rounds: Record<number, HostAuctionRoundSnapshot>;
};

const ACTION_PHASE_MS = 60000;
const NEXT_ROUND_PREPARE_MS = 5000;
const FORCE_NEXT_MS = 90000;

export function createHostAuctionSnapshot({
  gameId,
  currentRoundNo,
  totalRounds,
  status = "进行中",
  players,
}: {
  gameId: string;
  currentRoundNo: number;
  totalRounds: number;
  status?: "进行中" | "已完成";
  players: Array<{ id: string; name: string; spiritStone: number; roleId?: string }>;
}): HostAuctionSnapshot {
  return {
    gameId,
    currentRoundNo,
    totalRounds,
    status,
    players: Object.fromEntries(
      players.map((player) => [
        player.id,
        {
          id: player.id,
          name: player.name,
          spiritStone: player.spiritStone,
          roleId: player.roleId,
        },
      ])
    ),
    rounds: {},
  };
}

export function ensureHostAuctionRound(snapshot: HostAuctionSnapshot, roundNo: number) {
  if (!snapshot.rounds[roundNo]) {
    snapshot.rounds[roundNo] = {
      roundNo,
      bidRounds: {},
      settlementApplied: false,
      currentBidRound: 1,
      phase: "action",
      activePlayerIds: Object.keys(snapshot.players),
      winnerId: null,
      winningBid: 0,
      settlementStarted: false,
      settlementStartedAt: null,
      actionDeadlineAt: Date.now() + ACTION_PHASE_MS,
      allReadyCountdownAt: null,
      forceNextAt: null,
      settlementReadyByPlayer: {},
      directRevealByPlayer: {},
      lastResult: null,
    };
  }
  return snapshot.rounds[roundNo];
}

export function resolveHostAuctionBidRound({
  snapshot,
  roundNo,
  multipliers,
}: {
  snapshot: HostAuctionSnapshot;
  roundNo: number;
  multipliers: number[];
}) {
  const round = ensureHostAuctionRound(snapshot, roundNo);
  const bidRound = round.currentBidRound || 1;
  const records = round.bidRounds[bidRound] || {};
  const activeIds = (round.activePlayerIds?.length ? round.activePlayerIds : Object.keys(snapshot.players)).filter(Boolean);
  const entries = activeIds.map((playerId) => ({
    playerId,
    amount: Object.prototype.hasOwnProperty.call(records[playerId] || {}, "amount") ? (records[playerId]?.amount ?? null) : null,
  }));
  const sorted = [...entries]
    .map((entry) => ({ playerId: entry.playerId, amount: Number(entry.amount ?? 0) }))
    .sort((a, b) => b.amount - a.amount);

  const top = sorted[0] || { playerId: null, amount: 0 };
  const second = sorted[1] || { playerId: null, amount: 0 };
  const multiplier = multipliers[Math.min(bidRound, 5) - 1] || 1;

  let success = false;
  let winnerId = null as string | null;
  if (activeIds.length === 1 && top.playerId && top.amount > 0) {
    success = true;
    winnerId = top.playerId;
  } else if (bidRound <= 4) {
    success = Boolean(top.playerId) && top.amount > 0 && top.amount > second.amount * multiplier;
    winnerId = success ? top.playerId : null;
  } else {
    success = Boolean(top.playerId) && top.amount > 0 && top.amount > second.amount;
    winnerId = success ? top.playerId : null;
  }

  let nextBidRound: number | null = null;
  let nextActivePlayerIds: string[] = [];

  if (success) {
    round.phase = "settlement";
    round.winnerId = winnerId;
    round.winningBid = top.amount;
    round.actionDeadlineAt = null;
  } else {
    if (bidRound < 5) {
      nextActivePlayerIds = activeIds.filter((playerId) => records[playerId]?.amount !== null);
      if (!nextActivePlayerIds.length) {
        round.phase = "settlement";
        round.winnerId = null;
        round.winningBid = 0;
        round.actionDeadlineAt = null;
      } else {
        nextBidRound = bidRound + 1;
        round.currentBidRound = nextBidRound;
        round.activePlayerIds = nextActivePlayerIds;
        round.actionDeadlineAt = Date.now() + ACTION_PHASE_MS;
      }
    } else {
      const tieIds = sorted.filter((entry) => entry.amount === top.amount && top.amount > 0).map((entry) => entry.playerId);
      if (tieIds.length >= 2) {
        nextBidRound = bidRound + 1;
        nextActivePlayerIds = tieIds;
        round.currentBidRound = nextBidRound;
        round.activePlayerIds = nextActivePlayerIds;
        round.actionDeadlineAt = Date.now() + ACTION_PHASE_MS;
      } else {
        round.phase = "settlement";
        round.winnerId = null;
        round.winningBid = 0;
        round.actionDeadlineAt = null;
      }
    }
  }

  round.lastResult = {
    bidRound,
    activePlayerIds: activeIds,
    winnerId,
    winningBid: success ? top.amount : 0,
    success,
    nextBidRound,
    nextActivePlayerIds,
    multiplier,
  };
  snapshot.currentRoundNo = roundNo;
  return round.lastResult;
}

export function applyHostAuctionSettlement({
  snapshot,
  roundNo,
  bagValue,
  entryFee,
}: {
  snapshot: HostAuctionSnapshot;
  roundNo: number;
  bagValue: number;
  entryFee: number;
}) {
  const round = ensureHostAuctionRound(snapshot, roundNo);
  if (round.settlementApplied) return snapshot;
  Object.keys(snapshot.players).forEach((playerId) => {
    snapshot.players[playerId] = {
      ...snapshot.players[playerId],
      spiritStone: snapshot.players[playerId].spiritStone - Math.max(0, entryFee || 0),
    };
  });
  if (round.winnerId && snapshot.players[round.winnerId]) {
    const profit = Math.max(0, bagValue || 0) - Math.max(0, round.winningBid || 0);
    snapshot.players[round.winnerId] = {
      ...snapshot.players[round.winnerId],
      spiritStone: snapshot.players[round.winnerId].spiritStone + profit,
    };
  }
  round.settlementApplied = true;
  return snapshot;
}

export function applyHostAuctionBid({
  snapshot,
  roundNo,
  bidRound,
  playerId,
  amount,
}: {
  snapshot: HostAuctionSnapshot;
  roundNo: number;
  bidRound: number;
  playerId: string;
  amount: number | null;
}) {
  const round = ensureHostAuctionRound(snapshot, roundNo);
  if (!round.bidRounds[bidRound]) round.bidRounds[bidRound] = {};
  const prev = round.bidRounds[bidRound][playerId] || {};
  if (Object.prototype.hasOwnProperty.call(prev, "amount") && (prev.amount ?? null) === (amount ?? null)) {
    snapshot.currentRoundNo = roundNo;
    return snapshot;
  }
  round.bidRounds[bidRound][playerId] = {
    ...prev,
    amount,
  };
  snapshot.currentRoundNo = roundNo;
  return snapshot;
}

export function applyHostAuctionTool({
  snapshot,
  roundNo,
  bidRound,
  playerId,
  toolId,
  toolCost,
}: {
  snapshot: HostAuctionSnapshot;
  roundNo: number;
  bidRound: number;
  playerId: string;
  toolId: string;
  toolCost: number;
}) {
  const round = ensureHostAuctionRound(snapshot, roundNo);
  if (!round.bidRounds[bidRound]) round.bidRounds[bidRound] = {};
  const prev = round.bidRounds[bidRound][playerId] || {};
  if (prev.toolId === toolId) {
    snapshot.currentRoundNo = roundNo;
    return snapshot;
  }
  round.bidRounds[bidRound][playerId] = {
    ...prev,
    toolId,
  };
  if (snapshot.players[playerId]) {
    snapshot.players[playerId] = {
      ...snapshot.players[playerId],
      spiritStone: snapshot.players[playerId].spiritStone - Math.max(0, toolCost || 0),
    };
  }
  snapshot.currentRoundNo = roundNo;
  return snapshot;
}

export function markHostAuctionSettlementStarted({
  snapshot,
  roundNo,
}: {
  snapshot: HostAuctionSnapshot;
  roundNo: number;
}) {
  const round = ensureHostAuctionRound(snapshot, roundNo);
  round.phase = "settlement";
  round.settlementStarted = true;
  round.settlementStartedAt = round.settlementStartedAt || Date.now();
  round.forceNextAt = round.forceNextAt || Date.now() + FORCE_NEXT_MS;
  if (roundNo >= snapshot.totalRounds) {
    snapshot.status = "已完成";
  }
  return snapshot;
}

export function setHostAuctionSettlementRevealMode({
  snapshot,
  roundNo,
  playerId,
  instant,
}: {
  snapshot: HostAuctionSnapshot;
  roundNo: number;
  playerId: string;
  instant: boolean;
}) {
  const round = ensureHostAuctionRound(snapshot, roundNo);
  round.directRevealByPlayer[playerId] = instant;
  return snapshot;
}

export function setHostAuctionReadyForNextRound({
  snapshot,
  roundNo,
  playerId,
  ready,
}: {
  snapshot: HostAuctionSnapshot;
  roundNo: number;
  playerId: string;
  ready: boolean;
}) {
  const round = ensureHostAuctionRound(snapshot, roundNo);
  round.settlementReadyByPlayer[playerId] = ready;
  const playerIds = Object.keys(snapshot.players);
  const allReady = playerIds.length > 0 && playerIds.every((id) => Boolean(round.settlementReadyByPlayer[id]));
  if (allReady) {
    round.allReadyCountdownAt = round.allReadyCountdownAt || Date.now() + NEXT_ROUND_PREPARE_MS;
  } else {
    round.allReadyCountdownAt = null;
  }
  return snapshot;
}

export function canHostAuctionAdvanceRound({
  snapshot,
  roundNo,
}: {
  snapshot: HostAuctionSnapshot;
  roundNo: number;
}) {
  const round = ensureHostAuctionRound(snapshot, roundNo);
  const now = Date.now();
  if (round.allReadyCountdownAt && now >= round.allReadyCountdownAt) return true;
  if (round.forceNextAt && now >= round.forceNextAt) return true;
  return false;
}

export function advanceHostAuctionToNextRound({
  snapshot,
  nextRoundNo,
}: {
  snapshot: HostAuctionSnapshot;
  nextRoundNo: number;
}) {
  if (nextRoundNo > snapshot.totalRounds) {
    snapshot.status = "已完成";
    return snapshot;
  }
  snapshot.currentRoundNo = nextRoundNo;
  ensureHostAuctionRound(snapshot, nextRoundNo);
  return snapshot;
}

export function cloneHostAuctionSnapshot(snapshot: HostAuctionSnapshot | null) {
  return snapshot ? (JSON.parse(JSON.stringify(snapshot)) as HostAuctionSnapshot) : null;
}

export function mergeHostAuctionSnapshot(base: HostAuctionSnapshot | null, incoming: HostAuctionSnapshot) {
  if (!base) return cloneHostAuctionSnapshot(incoming);
  return {
    ...base,
    gameId: incoming.gameId,
    currentRoundNo: incoming.currentRoundNo,
    totalRounds: incoming.totalRounds ?? base.totalRounds,
    status: incoming.status || base.status,
    players: { ...base.players, ...incoming.players },
    rounds: { ...base.rounds, ...incoming.rounds },
  } as HostAuctionSnapshot;
}
