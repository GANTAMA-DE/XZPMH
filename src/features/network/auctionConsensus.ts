export type AuctionActionType =
  | "ACTION_BID"
  | "ACTION_TOOL"
  | "ACTION_FORFEIT"
  | "READY_NEXT"
  | "REQUEST_MISSING_ACTIONS"
  | "SYNC_MISSING_ACTIONS"
  | "START_NEXT_ROUND"
  | "FORCE_START";

export type AuctionActionEnvelope = {
  type: AuctionActionType;
  payload: Record<string, any>;
};

export type AuctionRoundAction = {
  actionId: string;
  type: "ACTION_BID" | "ACTION_TOOL" | "ACTION_FORFEIT";
  round: number;
  turn: number;
  playerId: string;
  timestamp: number;
  amount?: number | null;
  toolId?: string;
  toolCost?: number;
  reason?: "offline" | "timeout" | "manual" | "cascade";
};

export type ReadyNextPayload = {
  round: number;
  playerId: string;
  assetsHash: string;
  actionIds: string[];
  timestamp: number;
};

export type StartNextRoundPayload = {
  round: number;
  nextRound: number;
  hostPlayerId: string;
  assetsSnapshot: Record<string, number>;
  timestamp: number;
};

export type RequestMissingActionsPayload = {
  round: number;
  requesterId: string;
  targetId?: string;
  missingActionIds: string[];
  timestamp: number;
};

export type SyncMissingActionsPayload = {
  round: number;
  senderId: string;
  targetId?: string;
  actions: AuctionRoundAction[];
  timestamp: number;
};

export type ForceStartPayload = {
  round: number;
  nextRound: number;
  hostPlayerId: string;
  timestamp: number;
};

export type ClientAuctionRoundState = {
  roundNo: number;
  currentTurn: number;
  actions: AuctionRoundAction[];
  readyNextByPlayer: Record<string, ReadyNextPayload>;
  startNextPayload?: StartNextRoundPayload | null;
  forceStartPayload?: ForceStartPayload | null;
};

export function createAuctionActionId(prefix: string, round: number, turn: number, playerId: string) {
  return `${prefix}_${round}_${turn}_${playerId}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export function isAuctionConsensusEnvelope(value: any): value is AuctionActionEnvelope {
  return Boolean(
    value &&
      typeof value === "object" &&
      typeof value.type === "string" &&
      [
        "ACTION_BID",
        "ACTION_TOOL",
        "ACTION_FORFEIT",
        "READY_NEXT",
        "REQUEST_MISSING_ACTIONS",
        "SYNC_MISSING_ACTIONS",
        "START_NEXT_ROUND",
        "FORCE_START",
      ].includes(value.type)
  );
}

export function buildActionBidEnvelope(payload: AuctionRoundAction): AuctionActionEnvelope {
  return { type: "ACTION_BID", payload };
}

export function buildActionToolEnvelope(payload: AuctionRoundAction): AuctionActionEnvelope {
  return { type: "ACTION_TOOL", payload };
}

export function buildActionForfeitEnvelope(payload: AuctionRoundAction): AuctionActionEnvelope {
  return { type: "ACTION_FORFEIT", payload };
}

export function buildReadyNextEnvelope(payload: ReadyNextPayload): AuctionActionEnvelope {
  return { type: "READY_NEXT", payload };
}

export function buildRequestMissingActionsEnvelope(payload: RequestMissingActionsPayload): AuctionActionEnvelope {
  return { type: "REQUEST_MISSING_ACTIONS", payload };
}

export function buildSyncMissingActionsEnvelope(payload: SyncMissingActionsPayload): AuctionActionEnvelope {
  return { type: "SYNC_MISSING_ACTIONS", payload };
}

export function buildStartNextRoundEnvelope(payload: StartNextRoundPayload): AuctionActionEnvelope {
  return { type: "START_NEXT_ROUND", payload };
}

export function buildForceStartEnvelope(payload: ForceStartPayload): AuctionActionEnvelope {
  return { type: "FORCE_START", payload };
}

export function appendUniqueRoundAction(prev: AuctionRoundAction[], action: AuctionRoundAction) {
  if (!action?.actionId) return prev;
  if (prev.some((item) => item.actionId === action.actionId)) return prev;
  return [...prev, action].sort((a, b) => a.timestamp - b.timestamp || a.actionId.localeCompare(b.actionId));
}

export function stableStringify(value: any): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  return `{${Object.keys(value)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`)
    .join(",")}}`;
}

export function simpleHash(input: string) {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

export function buildAssetsHash(assetsSnapshot: Record<string, number>) {
  return simpleHash(stableStringify(assetsSnapshot));
}

export function summarizeRoundActions({
  actions,
  playerIds,
}: {
  actions: AuctionRoundAction[];
  playerIds: string[];
}) {
  const ordered = [...actions].sort((a, b) => a.timestamp - b.timestamp || a.actionId.localeCompare(b.actionId));
  const lockedBidByPlayer: Record<string, number | null | undefined> = {};
  const toolByPlayer: Record<string, string | null> = {};
  const forfeitedTurnByPlayer: Record<string, number> = {};

  ordered.forEach((action) => {
    if (!playerIds.includes(action.playerId)) return;
    const existingForfeitTurn = forfeitedTurnByPlayer[action.playerId];
    if (typeof existingForfeitTurn === "number" && action.turn >= existingForfeitTurn) {
      if (action.type !== "ACTION_FORFEIT") return;
    }
    if (action.type === "ACTION_TOOL") {
      if (lockedBidByPlayer[action.playerId] !== undefined) return;
      if (!toolByPlayer[action.playerId]) toolByPlayer[action.playerId] = action.toolId || null;
      return;
    }
    if (action.type === "ACTION_BID") {
      if (typeof forfeitedTurnByPlayer[action.playerId] === "number" && action.turn >= forfeitedTurnByPlayer[action.playerId]) return;
      if (lockedBidByPlayer[action.playerId] !== undefined) return;
      lockedBidByPlayer[action.playerId] = action.amount ?? 0;
      return;
    }
    if (action.type === "ACTION_FORFEIT") {
      if (typeof forfeitedTurnByPlayer[action.playerId] !== "number") forfeitedTurnByPlayer[action.playerId] = action.turn;
      if (lockedBidByPlayer[action.playerId] === undefined) lockedBidByPlayer[action.playerId] = 0;
    }
  });

  return {
    orderedActions: ordered,
    bidByPlayer: lockedBidByPlayer,
    toolByPlayer,
    forfeitedTurnByPlayer,
  };
}

export function shouldAutoResolveTurn({
  actions,
  activePlayerIds,
  turn,
}: {
  actions: AuctionRoundAction[];
  activePlayerIds: string[];
  turn: number;
}) {
  const relevant = actions.filter((action) => action.turn === turn);
  const acted = new Set(relevant.map((action) => action.playerId));
  return activePlayerIds.every((playerId) => acted.has(playerId));
}

export function resolveAuctionTurn({
  actions,
  activePlayerIds,
  turn,
  multipliers,
}: {
  actions: AuctionRoundAction[];
  activePlayerIds: string[];
  turn: number;
  multipliers: number[];
}) {
  const relevant = actions.filter((action) => action.turn === turn && activePlayerIds.includes(action.playerId));
  const actionByPlayer = summarizeRoundActions({ actions: relevant, playerIds: activePlayerIds });
  const entries = activePlayerIds
    .map((playerId) => ({ playerId, amount: Number(actionByPlayer.bidByPlayer[playerId] ?? 0) }))
    .sort((a, b) => b.amount - a.amount || a.playerId.localeCompare(b.playerId));

  const top = entries[0] || { playerId: "", amount: 0 };
  const second = entries[1] || { playerId: "", amount: 0 };
  const multiplier = multipliers[Math.min(turn, 5) - 1] || 1;

  let success = false;
  let winnerId: string | null = null;
  let nextTurn: number | null = null;
  let nextActivePlayerIds: string[] = [];

  if (activePlayerIds.length === 1 && top.playerId) {
    success = true;
    winnerId = top.playerId;
  } else if (turn <= 4) {
    success = Boolean(top.playerId) && top.amount > 0 && top.amount > second.amount * multiplier;
    winnerId = success ? top.playerId : null;
    if (!success) {
      nextTurn = turn + 1;
      nextActivePlayerIds = activePlayerIds.filter((playerId) => Number(actionByPlayer.bidByPlayer[playerId] ?? 0) > 0);
    }
  } else {
    const sameTopIds = entries.filter((entry) => entry.amount === top.amount && top.amount > 0).map((entry) => entry.playerId);
    if (sameTopIds.length === 1 && top.amount > 0) {
      success = true;
      winnerId = top.playerId;
    } else if (sameTopIds.length >= 2) {
      nextTurn = turn + 1;
      nextActivePlayerIds = sameTopIds;
    }
  }

  return {
    turn,
    multiplier,
    entries,
    success,
    winnerId,
    winningBid: success ? top.amount : 0,
    nextTurn,
    nextActivePlayerIds,
    forfeitedTurnByPlayer: actionByPlayer.forfeitedTurnByPlayer,
  };
}

export function buildRoundAssetsFromHostSnapshot(snapshot: Record<string, number>) {
  return Object.fromEntries(Object.entries(snapshot || {}).map(([playerId, amount]) => [playerId, Number(amount || 0)]));
}
