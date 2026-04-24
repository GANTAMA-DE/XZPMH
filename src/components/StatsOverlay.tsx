import { GameStatsModal } from "./GameStatsModal";

export function StatsOverlay({
  latestResult,
  showStatsModal,
  roomId,
  statsRoundTab,
  setStatsRoundTab,
  onClose,
  types,
  qualities,
}: {
  latestResult: any;
  showStatsModal: boolean;
  roomId: string;
  statsRoundTab: number;
  setStatsRoundTab: (roundNo: number) => void;
  onClose: () => void;
  types: string[];
  qualities: string[];
}) {
  return (
    <GameStatsModal
      open={Boolean(latestResult && showStatsModal)}
      latestResult={latestResult}
      roomId={roomId}
      statsRoundTab={statsRoundTab}
      setStatsRoundTab={setStatsRoundTab}
      onClose={onClose}
      types={types}
      qualities={qualities}
    />
  );
}
