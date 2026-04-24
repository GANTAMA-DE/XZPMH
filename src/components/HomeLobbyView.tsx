type LobbyRoomSummary = {
  roomId: string;
  roomName?: string;
  ownerName?: string;
  playerCount?: number;
  maxPlayers?: number;
  onlinePlayerCount?: number;
  hasPassword?: boolean;
  phase?: string;
  latestResult?: unknown;
  currentRound?: number;
  totalRounds?: number;
};

function cn(...arr: Array<string | false | null | undefined>) {
  return arr.filter(Boolean).join(" ");
}

export function HomeLobbyView({
  playerName,
  password,
  joinRoomId,
  maxPlayers,
  roomList,
  globalOnlineCount,
  isJoiningRoom,
  onPlayerNameChange,
  onPasswordChange,
  onJoinRoomIdChange,
  onMaxPlayersChange,
  onCreateRoom,
  onJoinRoom,
  onJoinListedRoom,
  onRefreshRooms,
}: {
  playerName: string;
  password: string;
  joinRoomId: string;
  maxPlayers: number;
  roomList: LobbyRoomSummary[];
  globalOnlineCount: number;
  isJoiningRoom: boolean;
  onPlayerNameChange: (value: string) => void;
  onPasswordChange: (value: string) => void;
  onJoinRoomIdChange: (value: string) => void;
  onMaxPlayersChange: (value: number) => void;
  onCreateRoom: () => void;
  onJoinRoom: () => void;
  onJoinListedRoom: (roomId: string) => void;
  onRefreshRooms: () => void;
}) {
  return (
    <main className="mx-auto grid max-w-[1500px] gap-4 p-4 xl:grid-cols-[360px_1fr]">
      <section className="space-y-4">
        <div className="rounded-3xl border border-amber-400/15 bg-black/35 p-4 shadow-[0_0_40px_rgba(245,158,11,0.08)] backdrop-blur-xl sm:p-5">
          <h2 className="mb-4 text-lg text-amber-200">开辟洞府房间</h2>
          <input
            className="mb-3 w-full rounded-xl border border-white/10 bg-slate-950/80 px-3 py-2"
            placeholder="你的道号"
            value={playerName}
            onChange={(e) => onPlayerNameChange(e.target.value)}
          />
          <input
            className="mb-3 w-full rounded-xl border border-white/10 bg-slate-950/80 px-3 py-2"
            placeholder="房间密码（可空）"
            value={password}
            onChange={(e) => onPasswordChange(e.target.value)}
          />
          <label className="mb-2 block text-sm text-zinc-400">加入人数上限（2-16）</label>
          <input
            type="number"
            min={2}
            max={16}
            className="mb-3 w-full rounded-xl border border-white/10 bg-slate-950/80 px-3 py-2"
            value={maxPlayers}
            onChange={(e) => onMaxPlayersChange(Number(e.target.value) || 6)}
          />
          <button
            className="w-full rounded-xl border border-amber-400/30 bg-amber-500/10 py-2 text-amber-100 disabled:cursor-not-allowed disabled:opacity-45"
            onClick={onCreateRoom}
            disabled={isJoiningRoom}
          >
            创建房间
          </button>
        </div>

        <div className="rounded-3xl border border-cyan-400/15 bg-black/35 p-4 shadow-[0_0_40px_rgba(34,211,238,0.08)] backdrop-blur-xl sm:p-5">
          <h2 className="mb-4 text-lg text-cyan-200">按房间ID进入</h2>
          <input
            className="mb-3 w-full rounded-xl border border-white/10 bg-slate-950/80 px-3 py-2"
            placeholder="你的道号"
            value={playerName}
            onChange={(e) => onPlayerNameChange(e.target.value)}
          />
          <input
            className="mb-3 w-full rounded-xl border border-white/10 bg-slate-950/80 px-3 py-2 uppercase"
            placeholder="房间ID"
            value={joinRoomId}
            onChange={(e) => onJoinRoomIdChange(e.target.value.toUpperCase())}
          />
          <input
            className="mb-4 w-full rounded-xl border border-white/10 bg-slate-950/80 px-3 py-2"
            placeholder="房间密码（如有）"
            value={password}
            onChange={(e) => onPasswordChange(e.target.value)}
          />
          <button
            className="w-full rounded-xl border border-cyan-400/30 bg-cyan-500/10 py-2 text-cyan-100 disabled:cursor-not-allowed disabled:opacity-45"
            onClick={onJoinRoom}
            disabled={isJoiningRoom}
          >
            {isJoiningRoom ? "正在加入..." : "加入房间"}
          </button>
        </div>
      </section>

      <section className="rounded-3xl border border-white/10 bg-black/35 p-5 backdrop-blur-xl">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2">
            <h2 className="text-lg text-fuchsia-200">洞府房间列表</h2>
            <span className="text-xs text-zinc-400">全站在线人数：{globalOnlineCount}</span>
          </div>
          <button className="rounded-xl border border-white/10 px-3 py-1 text-sm" onClick={onRefreshRooms}>
            刷新
          </button>
        </div>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {roomList.length === 0 && <div className="rounded-2xl border border-dashed border-white/10 p-6 text-sm text-zinc-500">当前没有可加入房间。</div>}
          {roomList.map((room) => {
            const canJoinRoom = room.phase !== "游戏中" && !room.latestResult;
            return (
              <div key={room.roomId} className="rounded-2xl border border-white/10 bg-slate-950/45 p-4">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm text-amber-100">{room.roomName ? `${room.roomName} · ${room.roomId}` : `房间 ${room.roomId}`}</p>
                  <span className="rounded-full border border-white/10 px-2 py-0.5 text-[10px] text-zinc-400">{room.phase}</span>
                </div>
                <p className="mt-2 text-xs text-zinc-400">房主：{room.ownerName}</p>
                <p className="mt-1 text-xs text-zinc-400">人数：{room.playerCount}/{room.maxPlayers}（在线{room.onlinePlayerCount ?? room.playerCount}）</p>
                <p className="mt-1 text-xs text-zinc-400">密码：{room.hasPassword ? "需要输入" : "无"}</p>
                {room.phase === "游戏中" && <p className="mt-1 text-xs text-zinc-500">进度：第 {room.currentRound}/{room.totalRounds} 回合</p>}
                <button
                  disabled={!canJoinRoom}
                  className={cn(
                    "mt-3 w-full rounded-xl border py-2 text-sm disabled:cursor-not-allowed disabled:opacity-45",
                    canJoinRoom && !isJoiningRoom
                      ? "border-cyan-400/30 bg-cyan-500/10 text-cyan-100"
                      : "border-slate-700/50 bg-slate-900/60 text-zinc-500"
                  )}
                  onClick={() => {
                    if (!canJoinRoom || isJoiningRoom) return;
                    onJoinListedRoom(room.roomId);
                  }}
                >
                  {isJoiningRoom ? "正在加入..." : canJoinRoom ? "加入该房间" : "游戏中不可加入"}
                </button>
              </div>
            );
          })}
        </div>
      </section>
    </main>
  );
}

export default HomeLobbyView;
