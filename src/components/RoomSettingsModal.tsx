type FrontendRoomSettingsDraftLike = {
  roomName: string;
  totalRounds: number;
  initialSpiritStone: number;
  entryFee: number;
  maxPlayers: number;
  hintRounds: number[];
  multipliers: number[];
  allowDuplicateRoles: boolean;
  showOtherSpiritStone: boolean;
  revealBidDisplay: "amount" | "rank";
};

function cn(...arr: Array<string | false | null | undefined>) {
  return arr.filter(Boolean).join(" ");
}

export function RoomSettingsModal({
  open,
  settingsForm,
  setSettingsForm,
  onClose,
  onSave,
}: {
  open: boolean;
  settingsForm: FrontendRoomSettingsDraftLike;
  setSettingsForm: React.Dispatch<React.SetStateAction<FrontendRoomSettingsDraftLike>>;
  onClose: () => void;
  onSave: () => void;
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-40 bg-black/70 p-4">
      <div className="mx-auto max-w-2xl rounded-3xl border border-white/10 bg-[#0b1020] p-5 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <p className="text-lg text-amber-100">房间设置</p>
          <button className="rounded-xl border border-white/10 px-3 py-1" onClick={onClose}>关闭</button>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <label className="text-sm text-zinc-300">房间名称（最多10字）<input className="mt-1 w-full rounded-xl border border-white/10 bg-slate-950/80 px-3 py-2" value={settingsForm.roomName} onChange={(e) => setSettingsForm((s) => ({ ...s, roomName: e.target.value.slice(0, 10) }))} placeholder="可空" maxLength={10} /></label>
          <label className="text-sm text-zinc-300">人数上限（2-16）<input type="number" min={2} max={16} className="mt-1 w-full rounded-xl border border-white/10 bg-slate-950/80 px-3 py-2" value={settingsForm.maxPlayers} onChange={(e) => setSettingsForm((s) => ({ ...s, maxPlayers: Math.max(2, Math.min(16, Number(e.target.value) || 6)) }))} /></label>
          <label className="text-sm text-zinc-300">回合数量<input type="number" className="mt-1 w-full rounded-xl border border-white/10 bg-slate-950/80 px-3 py-2" value={settingsForm.totalRounds} onChange={(e) => setSettingsForm((s) => ({ ...s, totalRounds: Number(e.target.value) || 10 }))} /></label>
          <label className="text-sm text-zinc-300">开局灵石<input type="number" className="mt-1 w-full rounded-xl border border-white/10 bg-slate-950/80 px-3 py-2" value={settingsForm.initialSpiritStone} onChange={(e) => setSettingsForm((s) => ({ ...s, initialSpiritStone: Number(e.target.value) || 500000 }))} /></label>
          <label className="text-sm text-zinc-300">入场券（每回合）<input type="number" className="mt-1 w-full rounded-xl border border-white/10 bg-slate-950/80 px-3 py-2" value={settingsForm.entryFee} onChange={(e) => setSettingsForm((s) => ({ ...s, entryFee: Number(e.target.value) || 10000 }))} /></label>
          <label className="md:col-span-2 flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-slate-950/50 px-3 py-3 text-sm text-zinc-300">
            <span>允许选择相同修士</span>
            <input type="checkbox" checked={settingsForm.allowDuplicateRoles} onChange={(e) => setSettingsForm((s) => ({ ...s, allowDuplicateRoles: e.target.checked }))} />
          </label>
          <label className="md:col-span-2 flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-slate-950/50 px-3 py-3 text-sm text-zinc-300">
            <span>显示其他玩家剩余灵石</span>
            <input type="checkbox" checked={settingsForm.showOtherSpiritStone} onChange={(e) => setSettingsForm((s) => ({ ...s, showOtherSpiritStone: e.target.checked }))} />
          </label>
          <div className="md:col-span-2 flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-slate-950/50 px-3 py-3 text-sm text-zinc-300">
            <span>轮次揭晓显示</span>
            <div className="inline-flex overflow-hidden rounded-xl border border-white/10">
              <button type="button" className={cn("px-3 py-1.5 text-sm", settingsForm.revealBidDisplay === "amount" ? "bg-cyan-500/15 text-cyan-100" : "bg-black/20 text-zinc-400")} onClick={() => setSettingsForm((s) => ({ ...s, revealBidDisplay: "amount" }))}>金额</button>
              <button type="button" className={cn("px-3 py-1.5 text-sm", settingsForm.revealBidDisplay === "rank" ? "bg-cyan-500/15 text-cyan-100" : "bg-black/20 text-zinc-400")} onClick={() => setSettingsForm((s) => ({ ...s, revealBidDisplay: "rank" }))}>排名</button>
            </div>
          </div>
          <div className="md:col-span-2 rounded-2xl border border-white/10 bg-slate-950/50 px-3 py-3 text-sm text-zinc-300">
            <p className="mb-2 text-amber-100">系统提示轮次（1-5轮）</p>
            <div className="flex flex-wrap gap-2">
              {[1, 2, 3, 4, 5].map((roundNo) => {
                const checked = settingsForm.hintRounds.includes(roundNo);
                return (
                  <label key={`hint-round-${roundNo}`} className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(e) => {
                        setSettingsForm((s) => ({
                          ...s,
                          hintRounds: e.target.checked
                            ? [...new Set([...s.hintRounds, roundNo])].sort((a, b) => a - b)
                            : s.hintRounds.filter((v) => v !== roundNo),
                        }));
                      }}
                    />
                    <span>第{roundNo}轮</span>
                  </label>
                );
              })}
            </div>
          </div>
          <div className="md:col-span-2 rounded-2xl border border-white/10 bg-slate-950/50 px-3 py-3 text-sm text-zinc-300">
            <p className="mb-3 text-amber-100">判定倍率（竞拍成功需超出第二名的倍数）：</p>
            <div className="grid gap-3 sm:grid-cols-5">
              {settingsForm.multipliers.map((value, index) => (
                <label key={`multiplier-${index}`} className="text-xs text-zinc-300">
                  第{index + 1}轮
                  <input
                    type="number"
                    step="0.1"
                    min="0.1"
                    className="mt-1 w-full rounded-xl border border-white/10 bg-slate-950/80 px-3 py-2 text-sm"
                    value={value}
                    onChange={(e) => {
                      const next = [...settingsForm.multipliers];
                      next[index] = Number(e.target.value) || [2, 1.6, 1.4, 1.2, 1][index];
                      setSettingsForm((s) => ({ ...s, multipliers: next }));
                    }}
                  />
                </label>
              ))}
            </div>
          </div>
        </div>
        <button className="mt-4 w-full rounded-xl border border-amber-400/30 bg-amber-500/10 py-2 text-amber-100" onClick={onSave}>
          保存设置
        </button>
      </div>
    </div>
  );
}

export default RoomSettingsModal;
