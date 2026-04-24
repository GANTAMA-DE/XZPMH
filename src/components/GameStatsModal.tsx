import React from "react";
import { createPortal } from "react-dom";

function cn(...arr: Array<string | false | null | undefined>) {
  return arr.filter(Boolean).join(" ");
}

type HoverTipProps = {
  label: React.ReactNode;
  content: React.ReactNode;
  className?: string;
  side?: "bottom" | "top";
  style?: React.CSSProperties;
};

function HoverTip({ label, content, className = "", side = "bottom", style }: HoverTipProps) {
  const [open, setOpen] = React.useState(false);
  const [pos, setPos] = React.useState({ left: 0, top: 0, width: 320, transform: "translate(-50%, 0)" as string, ready: false });
  const anchorRef = React.useRef<HTMLDivElement | null>(null);
  const tipRef = React.useRef<HTMLDivElement | null>(null);
  const canHover = typeof window !== "undefined" && !!window.matchMedia?.("(hover: hover) and (pointer: fine)")?.matches;

  React.useEffect(() => {
    if (!open) return;
    const updatePosition = () => {
      const rect = anchorRef.current?.getBoundingClientRect();
      if (!rect) return;
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      const maxWidth = Math.min(320, viewportWidth - 24);
      const centerX = rect.left + rect.width / 2;
      const left = Math.min(Math.max(centerX, maxWidth / 2 + 12), viewportWidth - maxWidth / 2 - 12);
      const tipHeight = tipRef.current?.offsetHeight || 120;
      const preferTop = side === "top";
      const topSpace = rect.top;
      const bottomSpace = viewportHeight - rect.bottom;
      const useTop = preferTop ? topSpace > tipHeight + 18 || bottomSpace < tipHeight + 18 : !(bottomSpace > tipHeight + 18) && topSpace > tipHeight + 18;
      const rawTop = useTop ? rect.top - 10 : rect.bottom + 10;
      const safeTop = useTop ? Math.max(tipHeight + 12, rawTop) : Math.min(viewportHeight - tipHeight - 12, rawTop);
      setPos({ left, top: safeTop, width: maxWidth, transform: useTop ? "translate(-50%, -100%)" : "translate(-50%, 0)", ready: true });
    };
    const raf = window.requestAnimationFrame(updatePosition);
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.cancelAnimationFrame(raf);
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [open, side, content]);

  return (
    <div
      ref={anchorRef}
      className={cn("relative", className)}
      style={style}
      onMouseEnter={() => canHover && setOpen(true)}
      onMouseLeave={() => canHover && setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
    >
      {label}
      {open && typeof document !== "undefined" && createPortal(
        <div className="pointer-events-none fixed inset-0 z-[2147483647]">
          <div
            ref={tipRef}
            className="absolute rounded-2xl border border-white/10 bg-[#0a0f1b]/98 p-3 text-xs text-zinc-200 shadow-2xl backdrop-blur-xl"
            style={{ left: pos.left, top: pos.top, width: pos.width, maxWidth: pos.width, transform: pos.transform, opacity: pos.ready ? 1 : 0 }}
          >
            {content}
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}

export function LatestResultSummary({
  latestResult,
  roomId,
  onOpen,
}: {
  latestResult: any;
  roomId: string;
  onOpen: () => void;
}) {
  if (!latestResult) return null;
  return (
    <section className="rounded-3xl border border-yellow-400/20 bg-yellow-500/5 p-5 backdrop-blur-xl">
      <div className="mb-3 flex items-center justify-between gap-2">
        <p className="text-yellow-200">上局结算 · 房间ID {roomId}</p>
        <button className="rounded-xl border border-white/10 px-3 py-1 text-sm" onClick={onOpen}>查看统计</button>
      </div>
      <div className="space-y-2 text-sm text-zinc-300">
        {latestResult.ranking.slice(0, 3).map((r: any, idx: number) => (
          <div key={r.id || r.playerId || r.name} className="rounded-xl border border-white/10 bg-black/20 px-3 py-2">
            <div>#{idx + 1} {r.name} · 灵石 {r.spiritStone}</div>
            <div className="mt-1 flex flex-wrap items-center gap-1.5">
              <span className="text-xs text-zinc-400">称号：</span>
              {(r.titleDetails || []).length > 0 ? (r.titleDetails || []).map((title: any) => (
                <HoverTip
                  key={`${r.id}-${title.code}`}
                  side="top"
                  content={<><p className="text-amber-100">{title.code}</p><p className="mt-1 text-zinc-300">{title.desc || "暂无说明"}</p></>}
                  label={<span className="inline-flex h-6 min-w-6 items-center justify-center rounded-full border border-fuchsia-300/30 bg-fuchsia-500/10 px-2 text-xs text-fuchsia-100">{title.code}</span>}
                />
              )) : <span className="text-xs text-zinc-500">暂无</span>}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

export function GameStatsModal({
  open,
  latestResult,
  roomId,
  statsRoundTab,
  setStatsRoundTab,
  onClose,
  types,
  qualities,
}: {
  open: boolean;
  latestResult: any;
  roomId: string;
  statsRoundTab: number;
  setStatsRoundTab: (roundNo: number) => void;
  onClose: () => void;
  types: string[];
  qualities: string[];
}) {
  if (!open || !latestResult) return null;
  const round = (latestResult.rounds || []).find((r: any) => r.roundNo === statsRoundTab) || latestResult.rounds?.[0];
  return (
    <div className="fixed inset-0 z-[160] bg-black/70 p-4">
      <div className="mx-auto max-h-[92vh] max-w-[1300px] overflow-y-auto rounded-3xl border border-white/10 bg-[#0b1020] p-5 shadow-2xl">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <p className="text-lg text-amber-100">本局统计 · 房间ID {roomId}</p>
            <p className="text-xs text-zinc-400">完成时间：{latestResult.finishedAt}</p>
          </div>
          <div className="flex gap-2">
            <button className="rounded-xl border border-white/10 px-3 py-1 text-sm" onClick={onClose}>关闭窗口</button>
          </div>
        </div>

        <div className="overflow-x-auto rounded-2xl border border-white/10 pb-1">
          <table className="min-w-[860px] text-sm">
            <thead className="bg-black/30 text-amber-100">
              <tr>
                <th className="px-3 py-2 text-left">排名</th>
                <th className="px-3 py-2 text-left">玩家</th>
                <th className="px-3 py-2 text-left">剩余灵石</th>
                <th className="px-3 py-2 text-left">胜场</th>
                <th className="px-3 py-2 text-left">总盈亏</th>
                <th className="px-3 py-2 text-left">总出价</th>
                <th className="px-3 py-2 text-left">推演/花费</th>
                <th className="px-3 py-2 text-left">称号</th>
              </tr>
            </thead>
            <tbody>
              {latestResult.ranking.map((r: any, idx: number) => (
                <tr key={r.id || r.playerId || r.name} className="border-t border-white/10 text-zinc-300">
                  <td className="px-3 py-2">#{idx + 1}</td>
                  <td className="px-3 py-2">{r.name}</td>
                  <td className="px-3 py-2">{r.spiritStone}</td>
                  <td className="px-3 py-2">{r.stats?.wins ?? 0}/{r.stats?.roundsWon ?? 0}</td>
                  <td className="px-3 py-2">{r.stats?.totalProfit ?? 0}</td>
                  <td className="px-3 py-2">{r.stats?.totalBidAmount ?? 0}</td>
                  <td className="px-3 py-2">{r.stats?.usedTools ?? 0} / {r.stats?.toolSpend ?? 0}</td>
                  <td className="px-3 py-2 text-fuchsia-200">
                    <div className="flex flex-wrap gap-1.5">
                      {(r.titleDetails || []).length > 0 ? (r.titleDetails || []).map((title: any) => (
                        <HoverTip
                          key={`${r.id}-${title.code}-table`}
                          side="top"
                          content={<><p className="text-amber-100">{title.code}</p><p className="mt-1 text-zinc-300">{title.desc || "暂无说明"}</p></>}
                          label={<span className="inline-flex h-6 min-w-6 items-center justify-center rounded-full border border-fuchsia-300/30 bg-fuchsia-500/10 px-2 text-xs text-fuchsia-100">{title.code}</span>}
                        />
                      )) : <span className="text-zinc-500">暂无</span>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-5 flex flex-wrap gap-2">
          {(latestResult.rounds || []).map((tabRound: any) => (
            <button
              key={`stats-tab-${tabRound.roundNo}`}
              className={cn("rounded-xl border px-3 py-1 text-sm", statsRoundTab === tabRound.roundNo ? "border-cyan-300 bg-cyan-500/10 text-cyan-100" : "border-white/10 bg-black/20 text-zinc-300")}
              onClick={() => setStatsRoundTab(tabRound.roundNo)}
            >
              第 {tabRound.roundNo} 回合
            </button>
          ))}
        </div>

        {round ? (
          <div className="mt-4 rounded-2xl border border-white/10 bg-black/20 p-4">
            <p className="text-amber-100">第 {round.roundNo} 回合 · 【{round.realm}修士】储物袋</p>
            <p className="mt-1 text-sm text-zinc-400">成交者：{round.winnerName || "流拍"}｜成交价：{round.winningBid}｜总价值：{round.totalValue}｜盈亏：{round.profit}</p>
            <p className="mt-1 text-xs text-zinc-500">占用格数：{round.targetCells || 0}｜物品总数：{round.itemCount || 0}</p>

            <div className="mt-3 overflow-hidden rounded-xl border border-white/10 bg-slate-950/35">
              <div className="border-b border-white/10 px-3 py-2 text-xs text-cyan-100">储物袋统计</div>
              <div className="overflow-x-auto">
                <table className="min-w-full text-xs text-zinc-300">
                  <thead className="bg-black/20 text-amber-100">
                    <tr>
                      <th className="px-3 py-2 text-left">品质 \ 类型</th>
                      {types.map((type: string) => (
                        <th key={`matrix-type-${round.roundNo}-${type}`} className="px-3 py-2 text-left whitespace-nowrap">{type}</th>
                      ))}
                      <th className="px-3 py-2 text-left">合计</th>
                    </tr>
                  </thead>
                  <tbody>
                    {qualities.map((quality: string) => {
                      const rowTotal = types.reduce((sum: number, type: string) => sum + Number(round.matrixSummary?.[quality]?.[type] || 0), 0);
                      return (
                        <tr key={`matrix-row-${round.roundNo}-${quality}`} className="border-t border-white/10">
                          <td className="px-3 py-2 text-amber-100">{quality}</td>
                          {types.map((type: string) => {
                            const value = Number(round.matrixSummary?.[quality]?.[type] || 0);
                            return <td key={`matrix-cell-${round.roundNo}-${quality}-${type}`} className="px-3 py-2">{value}</td>;
                          })}
                          <td className="px-3 py-2 text-cyan-100">{rowTotal}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot className="border-t border-white/10 bg-black/20 text-fuchsia-100">
                    <tr>
                      <td className="px-3 py-2">合计</td>
                      {types.map((type: string) => {
                        const colTotal = qualities.reduce((sum: number, quality: string) => sum + Number(round.matrixSummary?.[quality]?.[type] || 0), 0);
                        return <td key={`matrix-total-${round.roundNo}-${type}`} className="px-3 py-2">{colTotal}</td>;
                      })}
                      <td className="px-3 py-2 text-amber-100">{round.itemCount || 0}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>

            <div className="mt-3 space-y-3">
              {(round.logs || []).map((log: any) => (
                <div key={`${round.roundNo}-${log.roundNo}`} className="overflow-hidden rounded-xl border border-white/10 bg-slate-950/40">
                  <div className="border-b border-white/10 px-3 py-2 text-sm text-zinc-200">第 {log.roundNo} 轮 · 判定倍率 {log.multiplier}</div>
                  <div className="w-full overflow-x-auto">
                    <table className="w-full min-w-[720px] table-fixed text-xs text-zinc-300">
                      <colgroup>
                        <col className="w-[28%]" />
                        <col className="w-[20%]" />
                        <col className="w-[22%]" />
                        <col className="w-[30%]" />
                      </colgroup>
                      <thead className="bg-black/20">
                        <tr>
                          <th className="px-3 py-2 text-left">玩家</th>
                          <th className="px-3 py-2 text-left">出价</th>
                          <th className="px-3 py-2 text-left">推演</th>
                          <th className="px-3 py-2 text-left">结果</th>
                        </tr>
                      </thead>
                      <tbody>
                        {Object.keys(log.bids || {}).map((pid) => {
                          const playerName = log.bidPlayerNames?.[pid] || pid;
                          const bid = log.bids?.[pid];
                          const bidStatus = log.statusByPlayer?.[pid] || bid || 0;
                          const toolName = log.usedTools?.[pid] || "-";
                          return (
                            <tr key={pid} className="border-t border-white/10">
                              <td className="px-3 py-2">{playerName}</td>
                              <td className="px-3 py-2">{bidStatus}</td>
                              <td className="px-3 py-2">{toolName}</td>
                              <td className="px-3 py-2 whitespace-nowrap">{log.winnerId === pid ? "本轮领先" : "-"}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
