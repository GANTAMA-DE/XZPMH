export type RtcSettingsSnapshot = {
  roomName?: string;
  maxPlayers?: number;
  password?: string;
  totalRounds?: number;
  hintRounds?: number[];
  multipliers?: number[];
  initialSpiritStone?: number;
  entryFee?: number;
  profitShareRate?: number;
  lossRebateRate?: number;
  allowDuplicateRoles?: boolean;
  showOtherSpiritStone?: boolean;
  revealBidDisplay?: "amount" | "rank";
  realmProbability?: Record<string, number>;
  realmCellSettings?: Record<string, { min: number; max: number; peak: number; spread: number }>;
  qualityProbability?: Record<string, number>;
  pricePreference?: {
    mode: "amount" | "rank";
    amountMidpoint: number;
    amountDecay: number;
    rankMidpoint: number;
    rankDecay: number;
  };
  shapeWeights?: Record<string, number>;
};

export type RtcSettingsEnvelope = {
  type: "room:settings";
  settings: RtcSettingsSnapshot;
  fromPlayerId: string;
  ts: number;
};

export function isRtcSettingsEnvelope(message: unknown): message is RtcSettingsEnvelope {
  return !!message && typeof message === "object" && (message as { type?: unknown }).type === "room:settings";
}

export function buildRtcSettingsEnvelope(settings: RtcSettingsSnapshot, fromPlayerId: string): RtcSettingsEnvelope {
  return {
    type: "room:settings",
    settings,
    fromPlayerId,
    ts: Date.now(),
  };
}
