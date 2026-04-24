export type RtcBidOverlayByRound = Record<number, Record<string, number | null>>;

export type RtcRoundOverlay = {
  bidRound?: number;
  settlementRoundNo?: number;
};

export function applyRtcBidOverlay(
  prev: RtcBidOverlayByRound,
  payload: { playerId?: string; amount?: number | null; bidRound?: number }
): RtcBidOverlayByRound {
  const playerId = payload.playerId;
  const bidRound = Number(payload.bidRound || 0);
  if (!playerId || !bidRound) return prev;
  return {
    ...prev,
    [bidRound]: {
      ...(prev[bidRound] || {}),
      [playerId]: payload.amount ?? null,
    },
  };
}

export function applyRtcRoundOverlay(
  prev: RtcRoundOverlay,
  payload: { bidRound?: number }
): RtcRoundOverlay {
  return { ...prev, bidRound: payload.bidRound ?? prev.bidRound };
}

export function applyRtcSettlementOverlay(
  prev: RtcRoundOverlay,
  payload: { roundNo?: number }
): RtcRoundOverlay {
  return { ...prev, settlementRoundNo: payload.roundNo ?? prev.settlementRoundNo };
}

export function getDisplayedCurrentBidRound(currentBidRound: number, overlay: RtcRoundOverlay) {
  return overlay.bidRound || currentBidRound;
}

export function getRtcCurrentRoundBidDisplay(
  roundNo: number,
  currentBidRound: number,
  isActionPhase: boolean,
  playerId: string,
  overlayByRound: RtcBidOverlayByRound
) {
  if (roundNo !== currentBidRound || !isActionPhase) return undefined;
  if (overlayByRound[roundNo]?.[playerId] !== undefined) return "✓";
  return undefined;
}
