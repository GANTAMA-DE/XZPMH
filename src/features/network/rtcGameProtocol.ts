import type { HostAuctionSnapshot } from "../game/hostAuctionEngine";

export type RtcGameBidEnvelope = {
  type: "game:bid";
  payload: {
    roundNo: number;
    bidRound: number;
    playerId: string;
    amount: number | null;
  };
};

export type RtcGameToolEnvelope = {
  type: "game:tool";
  payload: {
    roundNo: number;
    bidRound: number;
    playerId: string;
    toolId: string;
    toolCost: number;
  };
};

export type RtcGameStateEnvelope = {
  type: "game:state";
  payload: {
    state: HostAuctionSnapshot;
  };
};

export type RtcGameRevealModeEnvelope = {
  type: "game:reveal-mode";
  payload: {
    roundNo: number;
    playerId: string;
    instant: boolean;
  };
};

export type RtcGameReadyNextEnvelope = {
  type: "game:ready-next";
  payload: {
    roundNo: number;
    playerId: string;
    ready: boolean;
  };
};

export type RtcGameForceNextEnvelope = {
  type: "game:force-next";
  payload: {
    roundNo: number;
    playerId: string;
  };
};

export type RtcGameEnvelope =
  | RtcGameBidEnvelope
  | RtcGameToolEnvelope
  | RtcGameStateEnvelope
  | RtcGameRevealModeEnvelope
  | RtcGameReadyNextEnvelope
  | RtcGameForceNextEnvelope;

export function isRtcGameEnvelope(message: unknown): message is RtcGameEnvelope {
  if (!message || typeof message !== "object") return false;
  const type = (message as { type?: string }).type;
  return (
    type === "game:bid" ||
    type === "game:tool" ||
    type === "game:state" ||
    type === "game:reveal-mode" ||
    type === "game:ready-next" ||
    type === "game:force-next"
  );
}

export function buildRtcGameBidEnvelope(payload: RtcGameBidEnvelope["payload"]): RtcGameBidEnvelope {
  return { type: "game:bid", payload };
}

export function buildRtcGameToolEnvelope(payload: RtcGameToolEnvelope["payload"]): RtcGameToolEnvelope {
  return { type: "game:tool", payload };
}

export function buildRtcGameStateEnvelope(state: HostAuctionSnapshot): RtcGameStateEnvelope {
  return { type: "game:state", payload: { state } };
}

export function buildRtcGameRevealModeEnvelope(payload: RtcGameRevealModeEnvelope["payload"]): RtcGameRevealModeEnvelope {
  return { type: "game:reveal-mode", payload };
}

export function buildRtcGameReadyNextEnvelope(payload: RtcGameReadyNextEnvelope["payload"]): RtcGameReadyNextEnvelope {
  return { type: "game:ready-next", payload };
}

export function buildRtcGameForceNextEnvelope(payload: RtcGameForceNextEnvelope["payload"]): RtcGameForceNextEnvelope {
  return { type: "game:force-next", payload };
}
