type NetworkPlayer = {
  id: string;
  name: string;
  isHost?: boolean;
  connected?: boolean;
};

type ConnectionReport = {
  playerId: string;
  connectedPeerIds: string[];
  ts: number;
};

type NetworkConnectionsModalProps = {
  open: boolean;
  onClose: () => void;
  roomId?: string;
  selfId?: string;
  players: NetworkPlayer[];
  reports: Record<string, ConnectionReport>;
};

function cn(...arr: Array<string | false | null | undefined>) {
  return arr.filter(Boolean).join(" ");
}

function renderCellStatus({
  rowPlayerId,
  colPlayerId,
  selfId,
  reports,
}: {
  rowPlayerId: string;
  colPlayerId: string;
  selfId?: string;
  reports: Record<string, ConnectionReport>;
}) {
  if (rowPlayerId === colPlayerId) {
    return {
      label: rowPlayerId === selfId ? "本机" : "自身",
      className: "border-white/10 bg-white/5 text-zinc-300",
    };
  }

  const report = reports[rowPlayerId];
  if (!report) {
    return {
      label: "未知",
      className: "border-white/10 bg-slate-950/40 text-zinc-500",
    };
  }

  const linked = (report.connectedPeerIds || []).includes(colPlayerId);
  if (linked) {
    return {
      label: "已连",
      className: "border-emerald-400/30 bg-emerald-500/10 text-emerald-100",
    };
  }

  return {
    label: "未连",
    className: "border-rose-400/25 bg-rose-500/10 text-rose-200",
  };
}

export function NetworkConnectionsModal({
  open,
  onClose,
  roomId,
  selfId,
  players,
  reports,
}: NetworkConnectionsModalProps) {
  if (!open) return null;

  const sortedPlayers = [...(players || [])];

  return (
    <div className="fixed inset-0 z-[160] bg-black/70 p-4">
      <div className="mx-auto max-h-[92vh] max-w-[1200px] overflow-y-auto rounded-3xl border border-white/10 bg-[#0b1020] p-5 shadow-2xl">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <p className="text-lg text-cyan-100">网络连接</p>
            <p className="text-xs text-zinc-400">房间ID：{roomId || "-"} · 展示当前客户端已收到的房间内连接报告</p>
          </div>
          <button className="rounded-xl border border-white/10 px-3 py-1 text-sm text-zinc-300" onClick={onClose}>关闭</button>
        </div>

        <div className="grid gap-3 md:grid-cols-3">
          <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
            <p className="text-xs text-zinc-400">房间玩家数</p>
            <p className="mt-2 text-2xl text-amber-100">{sortedPlayers.length}</p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
            <p className="text-xs text-zinc-400">收到连接报告</p>
            <p className="mt-2 text-2xl text-cyan-100">{Object.keys(reports || {}).length}</p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
            <p className="text-xs text-zinc-400">当前身份</p>
            <p className="mt-2 text-base text-zinc-100">{sortedPlayers.find((player) => player.id === selfId)?.name || selfId || "未知"}</p>
          </div>
        </div>

        <div className="mt-4 rounded-2xl border border-white/10 bg-black/20 p-4">
          <p className="mb-3 text-sm text-amber-100">玩家列表</p>
          <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
            {sortedPlayers.map((player) => {
              const report = reports[player.id];
              return (
                <div key={`network-player-${player.id}`} className="rounded-xl border border-white/10 bg-slate-950/40 p-3 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-zinc-100">
                      {player.name}
                      {player.id === selfId ? "（你）" : ""}
                      {player.isHost ? "（房主）" : ""}
                    </p>
                    <span className={cn("rounded-full border px-2 py-0.5 text-[10px]", player.connected ? "border-emerald-400/30 bg-emerald-500/10 text-emerald-100" : "border-rose-400/30 bg-rose-500/10 text-rose-200")}>
                      {player.connected ? "在线" : "离线"}
                    </span>
                  </div>
                  <p className="mt-2 text-xs text-zinc-400">PeerID：{player.id}</p>
                  <p className="mt-1 text-xs text-zinc-400">已连节点：{report?.connectedPeerIds?.length ?? 0}</p>
                  <p className="mt-1 text-xs text-zinc-500">上报时间：{report?.ts ? new Date(report.ts).toLocaleTimeString() : "未收到"}</p>
                </div>
              );
            })}
          </div>
        </div>

        <div className="mt-4 rounded-2xl border border-white/10 bg-black/20 p-4">
          <p className="mb-3 text-sm text-cyan-100">连接矩阵</p>
          <div className="overflow-x-auto rounded-2xl border border-white/10 bg-slate-950/35">
            <div className="min-w-[760px]">
              <div
                className="grid border-b border-white/10 bg-black/30 text-xs text-cyan-100"
                style={{ gridTemplateColumns: `180px repeat(${sortedPlayers.length}, minmax(88px, 1fr))` }}
              >
                <div className="px-3 py-2 text-left">上报方 \ 目标</div>
                {sortedPlayers.map((player) => (
                  <div key={`network-head-${player.id}`} className="px-2 py-2 text-center whitespace-nowrap">{player.name}</div>
                ))}
              </div>

              {sortedPlayers.map((rowPlayer) => (
                <div
                  key={`network-row-${rowPlayer.id}`}
                  className="grid border-b border-white/10 last:border-b-0"
                  style={{ gridTemplateColumns: `180px repeat(${sortedPlayers.length}, minmax(88px, 1fr))` }}
                >
                  <div className="flex items-center px-3 py-2 text-sm text-zinc-200">
                    {rowPlayer.name}
                    {rowPlayer.id === selfId ? "（你）" : ""}
                  </div>
                  {sortedPlayers.map((colPlayer) => {
                    const status = renderCellStatus({
                      rowPlayerId: rowPlayer.id,
                      colPlayerId: colPlayer.id,
                      selfId,
                      reports,
                    });
                    return (
                      <div key={`network-cell-${rowPlayer.id}-${colPlayer.id}`} className="px-2 py-2">
                        <div className={cn("flex h-9 items-center justify-center rounded-lg border text-xs", status.className)}>{status.label}</div>
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
          <p className="mt-3 text-xs text-zinc-500">说明：矩阵按“每位玩家自己上报的已连接 Peer 列表”展示；若尚未收到某玩家的连接报告，则显示“未知”。</p>
        </div>
      </div>
    </div>
  );
}

export default NetworkConnectionsModal;
