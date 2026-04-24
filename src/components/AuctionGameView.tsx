const QUALITY_COLOR: Record<string, string> = {
  圣: "bg-red-500/90 border-red-300/60",
  天: "bg-orange-500/90 border-orange-300/60",
  地: "bg-fuchsia-500/90 border-fuchsia-300/60",
  玄: "bg-sky-500/90 border-sky-300/60",
  黄: "bg-emerald-500/90 border-emerald-300/60",
  凡: "bg-slate-500/90 border-slate-300/60",
};

const QUALITY_GLOW: Record<string, string> = {
  圣: "shadow-[0_0_18px_rgba(239,68,68,0.35)]",
  天: "shadow-[0_0_18px_rgba(249,115,22,0.3)]",
  地: "shadow-[0_0_18px_rgba(217,70,239,0.3)]",
  玄: "shadow-[0_0_18px_rgba(14,165,233,0.3)]",
  黄: "shadow-[0_0_18px_rgba(16,185,129,0.28)]",
  凡: "shadow-[0_0_12px_rgba(100,116,139,0.24)]",
};

type AuctionGameViewProps = {
  gameMain: any;
  game: any;
  selfId?: string;
  isHost: boolean;
  sortedPlayers: any[];
  roleList: any[];
  currentBidRound: number;
  currentRound: any;
  getRoundUsedToolMeta: (playerId: string, roundNo: number) => any;
  getRoundUsedTool: (playerId: string, roundNo: number) => string;
  getRoundBidStatus: (playerId: string, roundNo: number) => string;
  cn: (...arr: Array<string | false | null | undefined>) => string;
  settlement: any;
  settlementRunningProfit: number;
  displayedGameCurrentRoundNo: number;
  bagSummaryText: string;
  actionCountdown: number;
  visiblePlacedItems: any[];
  visibleQualityCells: any[];
  openWarehouseTip: (item: any, eventOrEl?: any) => void;
  closeWarehouseTip: () => void;
  startWarehouseTipHold: (item: any, event: React.TouchEvent<HTMLElement>) => void;
  clearWarehouseTipHold: () => void;
  setCatalogFocusItemId: React.Dispatch<React.SetStateAction<string | null>>;
  setCatalogFilter: React.Dispatch<React.SetStateAction<{ type: string; quality: string; shape: string; min: number; max: number }>>;
  setShowCodex: (open: boolean) => void;
  selfRole: any;
  toolAnchorRef: React.RefObject<HTMLButtonElement | null>;
  bidAnchorRef: React.RefObject<HTMLButtonElement | null>;
  bidInput: string;
  setBidInput: React.Dispatch<React.SetStateAction<string>>;
  setShowToolPicker: (open: boolean) => void;
  hasUsedToolThisRound: boolean;
  hasSubmittedBidThisRound: boolean;
  isActionPhase: boolean;
  isBankrupt: boolean;
  cannotBidThisRound: boolean;
  currentRoundStatus: string;
  setShowKeypad: (open: boolean) => void;
  submitBid: () => void;
  viewer: any;
  frontSettlement: any;
  settlementRoundKey: string;
  setFrontSettlementUiByRound: React.Dispatch<React.SetStateAction<Record<string, { mode: "delay" | "instant"; completed: boolean; readyForNextRound: boolean }>>>;
  processGameEnvelopeAsHost: (message: any, fromPlayerId: string) => void;
  buildRtcGameRevealModeEnvelope: (payload: any) => any;
  buildRtcGameReadyNextEnvelope: (payload: any) => any;
  sendJsonToPeers: (message: any) => Promise<void> | void;
  renderSettlementActionButtons: () => React.ReactNode;
  visibleSystemHints: string[];
  visibleSkillHints: string[];
  visibleToolHints: string[];
  chatMessages: any[];
  chatListRef: React.RefObject<HTMLDivElement | null>;
  chatInput: string;
  setChatInput: React.Dispatch<React.SetStateAction<string>>;
  sendChat: () => void;
  getSettlementWinnerName: () => string;
};

export function AuctionGameView({
  gameMain,
  game,
  selfId,
  isHost,
  sortedPlayers,
  roleList,
  currentBidRound,
  currentRound,
  getRoundUsedToolMeta,
  getRoundUsedTool,
  getRoundBidStatus,
  cn,
  settlement,
  settlementRunningProfit,
  displayedGameCurrentRoundNo,
  bagSummaryText,
  actionCountdown,
  visiblePlacedItems,
  visibleQualityCells,
  openWarehouseTip,
  closeWarehouseTip,
  startWarehouseTipHold,
  clearWarehouseTipHold,
  setCatalogFocusItemId,
  setCatalogFilter,
  setShowCodex,
  selfRole,
  toolAnchorRef,
  bidAnchorRef,
  bidInput,
  setBidInput,
  setShowToolPicker,
  hasUsedToolThisRound,
  hasSubmittedBidThisRound,
  isActionPhase,
  isBankrupt,
  cannotBidThisRound,
  currentRoundStatus,
  setShowKeypad,
  submitBid,
  viewer,
  frontSettlement,
  settlementRoundKey,
  setFrontSettlementUiByRound,
  processGameEnvelopeAsHost,
  buildRtcGameRevealModeEnvelope,
  buildRtcGameReadyNextEnvelope,
  sendJsonToPeers,
  renderSettlementActionButtons,
  visibleSystemHints,
  visibleSkillHints,
  visibleToolHints,
  chatMessages,
  chatListRef,
  chatInput,
  setChatInput,
  sendChat,
  getSettlementWinnerName,
}: AuctionGameViewProps) {
  if (!gameMain) return null;

  return (
    <>
      <main className="mx-auto flex min-h-[calc(100dvh-84px)] max-w-[1800px] flex-col gap-3 overflow-visible p-3 xl:h-[calc(100dvh-84px)] xl:min-h-0 xl:overflow-hidden">
        <div className="grid gap-3 overflow-visible grid-cols-1 xl:min-h-0 xl:flex-1 xl:overflow-hidden xl:grid-cols-[320px_minmax(0,1fr)_320px]">
          <section className="order-2 rounded-3xl border border-white/10 bg-black/30 p-3 backdrop-blur-xl overflow-visible xl:order-1 xl:min-h-0 xl:overflow-y-auto">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-amber-100">修士榜</p>
              <p className="text-xs text-zinc-500">按灵石排序</p>
            </div>
            <div className="space-y-3 overflow-visible">
              {sortedPlayers.map((p: any, idx: number) => {
                const role = roleList.find((r: any) => r.id === p.roleId);
                const self = p.id === selfId;
                return (
                  <div key={p.id} className={cn("rxl border p-3", self ? "border-cyan-300/30 bg-cyan-500/5" : "border-white/10 bg-slate-950/40")}>
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm text-zinc-100">#{idx + 1} {p.name}</p>
                        <p className="mt-1 inline-flex items-center gap-1 text-xs text-zinc-400">{role?.avatar} · {role?.name}</p>
                      </div>
                      <div className="text-right">
                        <p className={cn("text-sm", p.bankrupt ? "text-rose-300" : "text-amber-200")}>{p.spiritStone}</p>
                        <p className="text-[11px] text-zinc-500">{p.bankrupt ? "破产" : p.connected ? "在线" : "托管"}</p>
                      </div>
                    </div>
                    <div className="mt-3 grid grid-cols-5 gap-1.5 overflow-visible">
                      {Array.from({ length: 5 }, (_, i) => {
                        const roundNo = i + 1;
                        const usedTool = getRoundUsedToolMeta(p.id, roundNo);
                        const used = getRoundUsedTool(p.id, roundNo);
                        const active = currentBidRound === roundNo;
                        return usedTool ? (
                          <div key={`${p.id}-tool-${roundNo}`} className={cn("flex aspect-square items-center justify-center rounded-xl border px-1 text-center text-[10px] leading-tight", active ? "border-cyan-300 bg-cyan-500/15 text-cyan-50" : "border-white/10 bg-slate-900/70 text-zinc-200")}>
                            {usedTool?.short || used}
                          </div>
                        ) : (
                          <div key={`${p.id}-empty-${roundNo}`} className={cn("flex aspect-square items-center justify-center rounded-xl border text-[10px]", active ? "border-cyan-300/30 bg-cyan-500/10 text-cyan-100" : "border-white/10 bg-slate-950/30 text-zinc-600")}>·</div>
                        );
                      })}
                    </div>
                    <div className="mt-1.5 grid grid-cols-5 gap-1.5">
                      {Array.from({ length: 5 }, (_, i) => {
                        const roundNo = i + 1;
                        const active = currentBidRound === roundNo;
                        return <div key={`${p.id}-bid-${roundNo}`} className={cn("flex h-7 items-center justify-center rounded-lg border px-1 text-[10px]", active ? "border-amber-300/40 bg-amber-500/10 text-amber-100" : "border-white/10 bg-black/20 text-zinc-300")}>{getRoundBidStatus(p.id, roundNo)}</div>;
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          <section className="order-1 flex flex-col overflow-visible rounded-3xl border border-white/10 bg-black/30 p-3 backdrop-blur-xl xl:order-2 xl:min-h-0 xl:overflow-hidden">
            <div className="mb-3 shrink-0 overflow-hidden rounded-2xl border border-white/10 bg-slate-950/35 px-3 py-2 text-sm text-zinc-200">
              {settlement ? (
                <div className="grid items-center gap-2 md:grid-cols-[1fr_auto_1fr]">
                  <div className="order-1 flex items-center justify-center gap-x-4 gap-y-1 text-center text-sm text-zinc-200 md:order-1 md:justify-start md:text-left">
                    <span className="text-amber-100">第 {displayedGameCurrentRoundNo}/{game.totalRounds} 回合 · 结算 · 竞拍成功者：{getSettlementWinnerName()}</span>
                  </div>
                  <div className="order-3 flex justify-center md:order-2">
                    <div className="relative inline-flex max-w-full items-center justify-center rounded-t-2xl border border-b-0 border-white/15 bg-slate-950/55 px-4 py-1.5 text-center text-sm text-amber-100 before:absolute before:-left-4 before:bottom-[-1px] before:h-4 before:w-4 before:border-b before:border-l before:border-white/15 before:content-[''] after:absolute after:-right-4 after:bottom-[-1px] after:h-4 after:w-4 after:border-b after:border-r after:border-white/15 after:content-['']">
                      <div className="overflow-x-auto whitespace-nowrap px-1">【{currentRound.realm}修士】的储物袋（{bagSummaryText}）</div>
                    </div>
                  </div>
                  <div className="order-2 flex flex-wrap items-center justify-center gap-2 text-center text-xs text-zinc-200 md:order-3 md:justify-end md:text-right">
                    <span>竞拍价：{settlement.winningBid}</span>
                    <span className={settlementRunningProfit >= 0 ? "text-emerald-300" : "text-rose-300"}>盈亏：{settlementRunningProfit}</span>
                  </div>
                </div>
              ) : (
                <div className="grid items-center gap-2 md:grid-cols-[1fr_auto_1fr]">
                  <div className="order-1 flex items-center justify-center gap-x-4 gap-y-1 text-center text-sm text-zinc-200 md:order-1 md:justify-start md:text-left">
                    <span className="text-amber-100">第 {displayedGameCurrentRoundNo}/{game.totalRounds} 回合 · 第 {currentBidRound} 轮</span>
                  </div>
                  <div className="order-3 flex justify-center md:order-2">
                    <div className="relative inline-flex max-w-full items-center justify-center rounded-t-2xl border border-b-0 border-white/15 bg-slate-950/55 px-4 py-1.5 text-center text-sm text-amber-100 before:absolute before:-left-4 before:bottom-[-1px] before:h-4 before:w-4 before:border-b before:border-l before:border-white/15 before:content-[''] after:absolute after:-right-4 after:bottom-[-1px] after:h-4 after:w-4 after:border-b after:border-r after:border-white/15 after:content-['']">
                      <div className="overflow-x-auto whitespace-nowrap px-1">【{currentRound.realm}修士】的储物袋（{bagSummaryText}）</div>
                    </div>
                  </div>
                  <div className="order-2 flex items-center justify-center text-center md:order-3 md:justify-end md:text-right">
                    <span className={cn("font-semibold", actionCountdown <= 10 ? "text-rose-300" : "text-amber-100")}>第 {currentBidRound} 轮竞拍倒计时：{actionCountdown}s</span>
                  </div>
                </div>
              )}
            </div>

            <div className="mt-3 rounded-3xl border border-white/10 bg-[#040812]/90 p-2 md:p-3 xl:flex-1 xl:min-h-0 xl:overflow-hidden">
              <div className="mx-auto w-full max-w-[1280px] overflow-visible rounded-2xl border border-white/8 bg-[linear-gradient(180deg,rgba(255,255,255,0.02),rgba(255,255,255,0.01))] p-2 xl:h-full xl:overflow-y-auto xl:overflow-x-hidden">
                <div className="relative mx-auto w-full max-w-[1180px]" style={{ aspectRatio: `10 / 30` }}>
                  <div className="absolute inset-0 grid grid-cols-10 gap-1">
                    {Array.from({ length: 10 * 30 }).map((_, index) => (
                      <div key={index} className="aspect-square rounded-[8px] border border-white/8 bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.05),rgba(255,255,255,0.015))] shadow-[inset_0_0_10px_rgba(255,255,255,0.02)]" />
                    ))}
                  </div>

                  {visiblePlacedItems.map((item: any) => {
                    const isItem = item.viewMode === "item";
                    const hasKnownQuality = Boolean(item.knownQuality);
                    const commonStyle = {
                      left: `calc(${(item.x / 10) * 100}% + 2px)`,
                      top: `calc(${(item.y / 30) * 100}% + 2px)`,
                      width: `calc(${(item.width / 10) * 100}% - 4px)`,
                      height: `calc(${(item.height / 30) * 100}% - 4px)`,
                      boxSizing: "border-box" as const,
                    };
                    const itemBlock = (
                      <button
                        key={`${item.placedId}-${item.viewMode}`}
                        onClick={() => {
                          if (!isItem) {
                            setCatalogFocusItemId(null);
                            setCatalogFilter({
                              type: item.knownType ? item.type : "全部",
                              quality: hasKnownQuality ? item.quality : "全部",
                              shape: item.shape || "全部",
                              min: 0,
                              max: 99999999,
                            });
                            setShowCodex(true);
                          }
                        }}
                        className={cn(
                          "absolute z-10 overflow-hidden rounded-[12px] border text-white transition hover:brightness-110",
                          hasKnownQuality
                            ? `${QUALITY_COLOR[item.quality]} ${QUALITY_GLOW[item.quality]} border-white/70 bg-gradient-to-br from-white/18 via-white/8 to-black/10`
                            : "border-white/70 bg-white/10 shadow-[0_0_0_2px_rgba(255,255,255,0.14)]"
                        )}
                        style={commonStyle}
                      >
                        <div className="relative h-full w-full p-1.5 text-left">
                          {item.knownType && <p className="absolute left-1.5 top-1.5 hidden rounded-md bg-black/20 px-1 py-0.5 text-[9px] text-white/90 md:block">{item.type}</p>}
                          {hasKnownQuality && <p className="absolute right-1.5 top-1.5 hidden rounded-md bg-black/20 px-1 py-0.5 text-[9px] text-amber-100 md:block">{item.quality}</p>}
                          <p className="absolute bottom-1.5 left-1.5 hidden rounded-md bg-black/20 px-1 py-0.5 text-[9px] text-white/85 md:block">{item.width}×{item.height}</p>
                        </div>
                      </button>
                    );
                    return isItem ? (
                      <button
                        key={`${item.placedId}-${item.viewMode}`}
                        type="button"
                        onClick={() => {
                          setCatalogFocusItemId(item.id);
                          setCatalogFilter({ type: "全部", quality: "全部", shape: "全部", min: 0, max: 999999 });
                          setShowCodex(true);
                        }}
                        onMouseEnter={(e) => openWarehouseTip(item, e)}
                        onMouseMove={(e) => openWarehouseTip(item, e)}
                        onMouseLeave={closeWarehouseTip}
                        onFocus={(e) => openWarehouseTip(item, e)}
                        onBlur={closeWarehouseTip}
                        onTouchStart={(e) => startWarehouseTipHold(item, e)}
                        onTouchEnd={clearWarehouseTipHold}
                        onTouchCancel={clearWarehouseTipHold}
                        className={cn(
                          "absolute z-20 overflow-hidden rounded-[12px] border bg-gradient-to-br from-white/14 via-white/6 to-black/10 text-white transition hover:brightness-110 focus:outline-none focus:ring-2 focus:ring-amber-300/50",
                          `${QUALITY_COLOR[item.quality]} ${QUALITY_GLOW[item.quality]}`
                        )}
                        style={commonStyle}
                      >
                        <div className="relative h-full w-full p-1.5 text-left">
                          {item.knownType && <p className="absolute left-1.5 top-1.5 hidden rounded-md bg-black/20 px-1 py-0.5 text-[9px] text-white/90 md:block">{item.type}</p>}
                          <p className="absolute right-1.5 top-1.5 hidden rounded-md bg-black/20 px-1 py-0.5 text-[9px] text-amber-100 md:block">{item.quality}</p>
                          <p className="absolute bottom-1.5 left-1.5 hidden rounded-md bg-black/20 px-1 py-0.5 text-[9px] text-white/85 md:block">{item.width}×{item.height}</p>
                          <p className="absolute bottom-1.5 right-1.5 hidden rounded-md bg-black/20 px-1 py-0.5 text-[9px] text-amber-50/90 md:block">{item.price}</p>
                          <div className="absolute inset-0 flex items-center justify-center px-2">
                            <p className="max-w-full overflow-hidden text-ellipsis whitespace-nowrap text-center text-[11px] font-semibold leading-tight text-white/95">{item.name}</p>
                          </div>
                        </div>
                      </button>
                    ) : itemBlock;
                  })}

                  {visibleQualityCells.map((cell: any, index: number) => (
                    <button
                      key={`${cell.x}-${cell.y}-${index}`}
                      onClick={() => {
                        setCatalogFocusItemId(null);
                        setCatalogFilter({
                          type: cell.type || "全部",
                          quality: cell.quality || "全部",
                          shape: "全部",
                          min: 0,
                          max: 99999999,
                        });
                        setShowCodex(true);
                      }}
                      className={cn("quality-pulse absolute z-20 rounded-[8px] border", QUALITY_COLOR[cell.quality], QUALITY_GLOW[cell.quality])}
                      style={{
                        left: `calc(${(cell.x / 10) * 100}% + 2px)`,
                        top: `calc(${(cell.y / 30) * 100}% + 2px)`,
                        width: `calc(${100 / 10}% - 4px)`,
                        height: `calc(${100 / 30}% - 4px)`,
                        boxSizing: "border-box",
                      }}
                    >
                      {cell.type && <span className="absolute left-1 top-1 hidden rounded-md bg-black/20 px-1 py-0.5 text-[9px] text-white/90 md:block">{cell.type}</span>}
                      <span className="absolute right-1 top-1 hidden rounded-md bg-black/20 px-1 py-0.5 text-[9px] text-amber-100 md:block">{cell.quality}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <section className="mt-3 shrink-0 rounded-3xl border border-white/10 bg-black/35 px-3 py-2 backdrop-blur-xl">
              <div className="grid items-center gap-2 md:grid-cols-[1fr_auto_1fr]">
                <div className="flex flex-wrap items-center justify-center gap-2 md:justify-start">
                  <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-amber-300/20 bg-amber-500/10 text-2xl">{selfRole?.avatar || "？"}</div>
                  <button className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-fuchsia-400/30 bg-fuchsia-500/10 text-[11px] text-fuchsia-100" onClick={() => { setCatalogFocusItemId(null); setShowCodex(true); }}>图鉴</button>
                  <button
                    ref={toolAnchorRef}
                    className="relative flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-cyan-400/30 bg-cyan-500/10 text-center text-[11px] text-cyan-100 disabled:opacity-40"
                    disabled={!isActionPhase || hasSubmittedBidThisRound || hasUsedToolThisRound || isBankrupt || cannotBidThisRound || currentBidRound >= 6}
                    onClick={() => setShowToolPicker(true)}
                  >
                    推演
                    {hasUsedToolThisRound && <span className="absolute right-1 top-1 text-sm">✓</span>}
                  </button>
                </div>

                <div className="flex flex-wrap items-center justify-center gap-2">
                  <div className="flex h-14 min-w-[220px] items-center rounded-2xl border border-white/10 bg-slate-950/80 px-3">
                    <input
                      value={bidInput}
                      onChange={(e) => setBidInput(e.target.value.replace(/\D/g, "").slice(0, 9))}
                      placeholder={cannotBidThisRound ? currentRoundStatus : "手动输入竞价"}
                      disabled={!isActionPhase || hasSubmittedBidThisRound || isBankrupt || cannotBidThisRound}
                      className="min-w-0 flex-1 bg-transparent text-left text-sm outline-none placeholder:text-zinc-500 disabled:opacity-40"
                    />
                    <button ref={bidAnchorRef} className="ml-2 rounded-xl border border-white/10 px-3 py-2 text-xs text-zinc-300 disabled:opacity-40" disabled={!isActionPhase || hasSubmittedBidThisRound || isBankrupt || cannotBidThisRound} onClick={() => setShowKeypad(true)}>
                      出价
                    </button>
                  </div>

                  <button className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-emerald-400/30 bg-emerald-500/10 text-[11px] text-emerald-100 disabled:opacity-40" disabled={!isActionPhase || hasSubmittedBidThisRound || isBankrupt || cannotBidThisRound} onClick={submitBid}>提交</button>
                </div>

                <div className="flex flex-wrap items-center justify-center gap-2 md:justify-end">
                  {cannotBidThisRound && !settlement && (
                    <div className="rounded-2xl border border-amber-400/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">
                      本回合已不能出价（{currentRoundStatus}）
                    </div>
                  )}
                  {settlement && viewer?.mode === "delay" && !viewer?.completed && (
                    <button
                      className="flex h-14 w-14 items-center justify-center rounded-2xl border border-cyan-400/30 bg-cyan-500/10 px-2 text-[11px] text-cyan-100"
                      onClick={() => {
                        if (frontSettlement && settlementRoundKey && currentRound?.roundNo && selfId) {
                          setFrontSettlementUiByRound((prev) => ({
                            ...prev,
                            [settlementRoundKey]: {
                              ...(prev[settlementRoundKey] || { mode: "delay", completed: false, readyForNextRound: false }),
                              mode: "instant",
                              completed: true,
                              readyForNextRound: true,
                            },
                          }));
                          if (isHost) {
                            processGameEnvelopeAsHost(
                              buildRtcGameRevealModeEnvelope({ roundNo: currentRound.roundNo, playerId: selfId, instant: true }),
                              selfId
                            );
                          } else {
                            void sendJsonToPeers(buildRtcGameRevealModeEnvelope({ roundNo: currentRound.roundNo, playerId: selfId, instant: true }));
                            void sendJsonToPeers(buildRtcGameReadyNextEnvelope({ roundNo: currentRound.roundNo, playerId: selfId, ready: true }));
                          }
                        }
                      }}
                    >
                      直接显示
                    </button>
                  )}
                  {renderSettlementActionButtons()}
                </div>
              </div>
            </section>
          </section>

          <section className="order-3 min-h-0 overflow-visible rounded-3xl border border-white/10 bg-black/30 p-3 backdrop-blur-xl xl:min-h-0 xl:overflow-hidden">
            <div className="grid grid-cols-1 gap-3 xl:h-full xl:min-h-0 xl:grid-cols-1 xl:grid-rows-4">
              <div className="min-h-0 overflow-hidden rounded-2xl border border-white/10 bg-slate-950/35 p-3 text-xs xl:flex xl:flex-col">
                <p className="mb-2 text-amber-100">系统提示</p>
                <div className="h-full min-h-0 space-y-2 overflow-y-auto pr-1 pb-3">
                  {visibleSystemHints.slice(-3).map((h: string, i: number) => <p key={`s-${i}`} className="rounded-lg bg-black/20 px-2 py-1">{h}</p>)}
                </div>
              </div>
              <div className="min-h-0 overflow-hidden rounded-2xl border border-white/10 bg-slate-950/35 p-3 text-xs xl:flex xl:flex-col">
                <p className="mb-2 text-cyan-100">技能提示</p>
                <div className="h-full min-h-0 space-y-2 overflow-y-auto pr-1 pb-3">
                  {visibleSkillHints.map((h: string, i: number) => <p key={`k-${i}`} className="rounded-lg bg-black/20 px-2 py-1">{h}</p>)}
                </div>
              </div>
              <div className="min-h-0 overflow-hidden rounded-2xl border border-white/10 bg-slate-950/35 p-3 text-xs xl:flex xl:flex-col">
                <p className="mb-2 text-fuchsia-100">推演提示</p>
                <div className="h-full min-h-0 space-y-2 overflow-y-auto pr-1 pb-3">
                  {visibleToolHints.map((h: string, i: number) => <p key={`t-${i}`} className="rounded-lg bg-black/20 px-2 py-1">{h}</p>)}
                </div>
              </div>
              <div className="min-h-0 overflow-hidden rounded-2xl border border-white/10 bg-slate-950/35 p-3 text-xs xl:flex xl:flex-col">
                <p className="mb-2 text-emerald-100">聊天</p>
                <div className="flex h-full min-h-0 flex-col">
                  <div ref={chatListRef} className="min-h-0 flex-1 space-y-2 overflow-y-auto rounded-xl border border-white/10 bg-black/20 p-2 pr-1 pb-3">
                    {(chatMessages || []).map((m: any) => (
                      <div key={m.id} className="rounded-lg bg-black/25 px-2 py-1">
                        <p><span className="text-zinc-500">[{m.time}]</span> <span className="text-amber-100">{m.senderName}</span></p>
                        <p className="mt-1 break-words text-zinc-200">{m.text}</p>
                      </div>
                    ))}
                  </div>
                  <div className="mt-2 flex shrink-0 gap-2">
                    <input maxLength={70} className="min-w-0 flex-1 rounded-xl border border-white/10 bg-slate-950/80 px-3 py-2" value={chatInput} onChange={(e) => setChatInput(e.target.value.slice(0, 70))} onKeyDown={(e) => { if (e.key === "Enter") sendChat(); }} placeholder="输入消息（最多70字）" />
                    <button className="rounded-xl border border-emerald-400/30 bg-emerald-500/10 px-4 text-emerald-100" onClick={sendChat}>发送</button>
                  </div>
                </div>
              </div>
            </div>
          </section>
        </div>
      </main>
    </>
  );
}

export default AuctionGameView;
