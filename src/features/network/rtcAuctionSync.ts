export type RtcBidSubmitPayload = {
  playerId: string;
  amount: number | null;
  bidRound: number;
};

export type RtcRoundAdvancePayload = {
  bidRound: number;
};

export type RtcSettlementAdvancePayload = {
  roundNo: number;
  phase: "settlement" | "next-round";
};

export type RtcAuctionEnvelope =
  | { type: "auction:bid"; payload: RtcBidSubmitPayload }
  | { type: "auction:round"; payload: RtcRoundAdvancePayload }
  | { type: "auction:settlement"; payload: RtcSettlementAdvancePayload };

export function isRtcAuctionEnvelope(value: any): value is RtcAuctionEnvelope {
  return value?.type === "auction:bid" || value?.type === "auction:round" || value?.type === "auction:settlement";
}

export function buildRtcBidEnvelope(payload: RtcBidSubmitPayload): RtcAuctionEnvelope {
  return { type: "auction:bid", payload };
}

export function buildRtcRoundEnvelope(payload: RtcRoundAdvancePayload): RtcAuctionEnvelope {
  return { type: "auction:round", payload };
}

export function buildRtcSettlementEnvelope(payload: RtcSettlementAdvancePayload): RtcAuctionEnvelope {
  return { type: "auction:settlement", payload };
}
