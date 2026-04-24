import { LatestResultSummary } from "./GameStatsModal";

type RoleItem = {
  id: string;
  name: string;
  avatar: string;
  skill: string;
};

type PreparationPlayer = {
  id: string;
  name: string;
  ready?: boolean;
  bankrupt?: boolean;
  connected?: boolean;
  isHost?: boolean;
  roleId?: string;
};

type PreparationSettings = {
  roomName?: string;
  maxPlayers?: number;
  totalRounds?: number;
  initialSpiritStone?: number;
  entryFee?: number;
  allowDuplicateRoles?: boolean;
  showOtherSpiritStone?: boolean;
  revealBidDisplay?: "amount" | "rank";
  hintRounds?: number[];
  multipliers?: number[];
};

type GamePreparationViewProps = {
  room: any;
  game: any;
  isHost: boolean;
  isBankrupt: boolean;
  me: any;
  effectiveRoomSettings: PreparationSettings;
  displayedRoomPlayers: PreparationPlayer[];
  roleList: RoleItem[];
  selfId?: string;
  canStartGame: boolean;
  liveRoleSelections: Record<string, string[]>;
  rtcPrepOverlayByPlayer: Record<string, { roleId?: string }>;
  latestResult: any;
  chatMessages: any[];
  chatInput: string;
  chatListRef: React.RefObject<HTMLDivElement | null>;
  onChatInputChange: (value: string) => void;
  onSendChat: () => void;
  onToggleReady: () => void;
  onStartGame: () => void;
  onSelectRole: (roleId: string) => void;
  onOpenStats: () => void;
  getLobbyPlayerStatus: (player: any) => string;
  isLobbyRtcOnline: (player: any) => boolean;
  getRolePickedNames: (roleId: string) => string;
  cn: (...arr: Array<string | false | null | undefined>) => string;
};

export function GamePreparationView({
  room,
  game,
  isHost,
  isBankrupt,
  me,
  effectiveRoomSettings,
  displayedRoomPlayers,
  roleList,
  selfId,
  canStartGame,
  liveRoleSelections,
  rtcPrepOverlayByPlayer,
  latestResult,
  chatMessages,
  chatInput,
  chatListRef,
  onChatInputChange,
  onSendChat,
  onToggleReady,
  onStartGame,
  onSelectRole,
  onOpenStats,
  getLobbyPlayerStatus,
  isLobbyRtcOnline,
  getRolePickedNames,
  cn,
}: GamePreparationViewProps) {
  if (!room || game) return null;

  return (
    <main className="mx-auto grid max-w-[1700px] gap-4 p-4 xl:grid-cols-[1.22fr_0.78fr]">
      <section className="space-y-4">
        <section className="rounded-3xl border border-white/10 bg-black/30 p-5 backdrop-blur-xl">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <p className="text-lg text-amber-100">房间准备</p>
            </div>
            <div className="flex items-center gap-2">
              <button
                disabled={isBankrupt}
                className={cn(
                  "rounded-xl border px-3 py-2 text-sm disabled:opacity-40",
                  me?.ready ? "border-emerald-400/30 bg-emerald-500/10 text-emerald-100" : "border-white/10 bg-black/20 text-zinc-300"
                )}
                onClick={onToggleReady}
              >
                {isBankrupt ? "已破产" : me?.ready ? "取消准备" : "准备游戏"}
              </button>
              {isHost && (
                <button
                  className="rounded-xl border border-fuchsia-400/30 bg-fuchsia-500/10 px-3 py-2 text-sm text-fuchsia-100 disabled:opacity-40"
                  disabled={!canStartGame}
                  onClick={onStartGame}
                >
                  开启游戏
                </button>
              )}
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            {Array.from({ length: effectiveRoomSettings.maxPlayers || 6 }, (_, i) => displayedRoomPlayers[i] || null).map((p: any, idx: number) => {
              if (!p) {
                return (
                  <div key={`empty-slot-${idx}`} className="rounded-2xl border border-dashed border-white/15 bg-black/10 p-4 text-sm text-zinc-500">
                    空位 #{idx + 1}
                  </div>
                );
              }
              const role = roleList.find((r: any) => r.id === p.roleId);
              const self = p.id === selfId;
              return (
                <div key={p.id} className={cn("rounded-2xl border p-4", self ? "border-cyan-300/30 bg-cyan-500/5" : "border-white/10 bg-slate-950/40")}>
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-base text-zinc-100">{p.name}{p.isHost ? "（房主）" : ""}</p>
                      <p className="mt-1 text-sm text-zinc-400">状态：{getLobbyPlayerStatus(p)} · {isLobbyRtcOnline(p) ? "在线" : "未连接"}</p>
                    </div>
                    <div className="flex items-center gap-2" />
                  </div>
                  <div className="mt-3 rounded-2xl border border-white/10 bg-black/20 p-3">
                    <div className="flex items-center gap-3">
                      <div className="flex h-14 w-14 items-center justify-center rounded-xl border border-white/10 bg-slate-900/60 text-xl font-semibold text-amber-50">{role?.avatar}</div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm text-amber-100">{role?.name || "未选修士"}</p>
                        <p className="mt-1 line-clamp-2 text-xs text-zinc-400">{role?.skill || "暂无技能"}</p>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <section className="rounded-3xl border border-white/10 bg-black/30 p-5 backdrop-blur-xl">
          <p className="mb-3 text-lg text-amber-100">房间信息</p>
          <div className="space-y-2 text-sm text-zinc-300">
            <p>房间ID：{room.roomId}</p>
            <p>房间名称：{effectiveRoomSettings.roomName || "未命名"}</p>
            <p>房主：{room.players.find((p: any) => p.id === room.ownerId)?.name || "无"}</p>
            <p>人数上限：{effectiveRoomSettings.maxPlayers}</p>
            <p>回合数：{effectiveRoomSettings.totalRounds}</p>
            <p>开局灵石：{effectiveRoomSettings.initialSpiritStone}</p>
            <p>入场券：每回合 {effectiveRoomSettings.entryFee}</p>
            <p>修士重复：{effectiveRoomSettings.allowDuplicateRoles ? "允许" : "禁止"}</p>
            <p>其他玩家灵石：{effectiveRoomSettings.showOtherSpiritStone === false ? "不显示" : "显示"}</p>
            <p>轮次揭晓显示：{effectiveRoomSettings.revealBidDisplay === "rank" ? "排名" : "金额"}</p>
            <p>系统提示轮次：{(effectiveRoomSettings.hintRounds || []).join("、") || "无"}</p>
            <p>前5轮判定倍率：{(effectiveRoomSettings.multipliers || [2, 1.6, 1.4, 1.2, 1]).join(" / ")} 倍</p>
          </div>
        </section>

        <section className="rounded-3xl border border-white/10 bg-black/30 p-5 backdrop-blur-xl">
          <p className="mb-3 text-lg text-emerald-100">聊天</p>
          <div ref={chatListRef} className="h-56 space-y-2 overflow-y-auto rounded-xl border border-white/10 bg-black/20 p-2 pr-1 text-xs">
            {(chatMessages || []).map((m: any) => (
              <div key={m.id} className="rounded-lg bg-black/25 px-2 py-1">
                <p><span className="text-zinc-500">[{m.time}]</span> <span className="text-amber-100">{m.senderName}</span></p>
                <p className="mt-1 break-words text-zinc-200">{m.text}</p>
              </div>
            ))}
          </div>
          <div className="mt-2 flex gap-2">
            <input
              maxLength={70}
              className="min-w-0 flex-1 rounded-xl border border-white/10 bg-slate-950/80 px-3 py-2 text-sm"
              value={chatInput}
              onChange={(e) => onChatInputChange(e.target.value.slice(0, 70))}
              onKeyDown={(e) => {
                if (e.key === "Enter") onSendChat();
              }}
              placeholder="输入消息（最多70字）"
            />
            <button className="rounded-xl border border-emerald-400/30 bg-emerald-500/10 px-4 text-emerald-100" onClick={onSendChat}>发送</button>
          </div>
        </section>
      </section>

      <aside className="space-y-4">
        <section className="rounded-3xl border border-white/10 bg-black/30 p-5 backdrop-blur-xl">
          <div className="mb-3 flex items-center justify-between gap-3">
            <p className="text-lg text-amber-100">选择修士</p>
            <span className="text-[11px] text-zinc-500">{effectiveRoomSettings.allowDuplicateRoles ? "允许重复选择同名修士" : "不允许重复选择同名修士"}</span>
          </div>
          <div className="grid gap-2">
            {roleList.map((role: any) => {
              const pickedNames = getRolePickedNames(role.id);
              const pickedByOthers = (liveRoleSelections?.[role.id] || []).some((pid: string) => pid !== selfId);
              const myDisplayedRoleId = me?.roleId || rtcPrepOverlayByPlayer[selfId || ""]?.roleId;
              const disabled = !me || (!effectiveRoomSettings.allowDuplicateRoles && pickedByOthers && myDisplayedRoleId !== role.id);
              return (
                <button
                  key={role.id}
                  disabled={disabled}
                  onClick={() => onSelectRole(role.id)}
                  className={cn(
                    "rounded-2xl border p-3 text-left",
                    (me?.roleId || rtcPrepOverlayByPlayer[selfId || ""]?.roleId) === role.id
                      ? "border-amber-300 bg-amber-500/10 text-amber-50"
                      : disabled
                        ? "border-white/10 bg-black/10 text-zinc-500 opacity-70"
                        : "border-white/10 bg-black/20 text-zinc-300"
                  )}
                >
                  <div className="flex items-center gap-3">
                    <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-white/10 bg-slate-900/60 text-xl font-semibold">{role.avatar}</div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm text-amber-100">{role.name}</p>
                        {pickedNames && <span className="text-[10px] text-cyan-200">已选：{pickedNames}</span>}
                      </div>
                      <p className="mt-1 line-clamp-2 text-xs text-zinc-400">{role.skill}</p>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </section>

        <LatestResultSummary latestResult={latestResult} roomId={room.roomId} onOpen={onOpenStats} />
      </aside>
    </main>
  );
}

export default GamePreparationView;
