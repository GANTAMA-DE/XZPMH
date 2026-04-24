import { useEffect, useMemo } from "react";
import { buildFrontGameResult } from "./frontGameResult";

export function useFrontGameResult({
  game,
  room,
  toolList,
  frontRoundsWithBags,
  frontGameResultCache,
  setFrontGameResultCache,
}: {
  game: any;
  room: any;
  toolList: any[];
  frontRoundsWithBags: any[];
  frontGameResultCache: Record<string, any>;
  setFrontGameResultCache: React.Dispatch<React.SetStateAction<Record<string, any>>>;
}) {
  const computedResult = useMemo(() => {
    if (!game?.id || !room || game.status !== "已完成" || !frontRoundsWithBags.length) return null;
    return buildFrontGameResult({
      room: { ...room, toolMeta: toolList, game },
      roundsWithBags: frontRoundsWithBags,
    });
  }, [game?.id, game?.status, room, frontRoundsWithBags, toolList]);

  useEffect(() => {
    if (!game?.id || !computedResult) return;
    setFrontGameResultCache((prev: any) => {
      if (prev?.[game.id] && JSON.stringify(prev[game.id]) === JSON.stringify(computedResult)) return prev;
      const next = { ...prev, [game.id]: computedResult };
      return next;
    });
  }, [game?.id, computedResult, setFrontGameResultCache]);

  return useMemo(() => {
    if (!game?.id) return frontGameResultCache[room?.roomId || ""] || null;
    return frontGameResultCache[game.id] || computedResult || null;
  }, [game?.id, room?.roomId, frontGameResultCache, computedResult]);
}