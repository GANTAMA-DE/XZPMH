import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { io, type Socket } from "socket.io-client";
import { ITEM_QUALITIES, ITEM_TYPES } from "../shared/itemCatalog.js";

function resolveWsUrl() {
  const search = new URLSearchParams(window.location.search);
  const queryWs = search.get("ws") || search.get("wsUrl");
  const runtimeWs = (window as any).__WS_URL__;
  const envWs = (import.meta as any).env?.VITE_WS_URL;
  if (queryWs) return String(queryWs);
  if (runtimeWs) return String(runtimeWs);
  if (envWs) return String(envWs);

  const { hostname, origin } = window.location;
  const isLocal = hostname === "localhost" || hostname === "127.0.0.1";
  if (isLocal) return "http://localhost:3001";
  return origin;
}

function resolveWsPath() {
  const search = new URLSearchParams(window.location.search);
  const queryPath = search.get("wspath") || search.get("wsPath");
  const runtimePath = (window as any).__WS_PATH__;
  const envPath = (import.meta as any).env?.VITE_WS_PATH;
  if (queryPath) return String(queryPath);
  if (runtimePath) return String(runtimePath);
  if (envPath) return String(envPath);
  return "/socket.io";
}

const WS_URL = resolveWsUrl();
const WS_PATH = resolveWsPath();
const GRID_W = 10;
const GRID_H = 30;
const TYPES = ITEM_TYPES;
const QUALITIES = ITEM_QUALITIES;

type ServerState = any;

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

function cn(...arr: Array<string | false | null | undefined>) {
  return arr.filter(Boolean).join(" ");
}

function useNowTicker(active: boolean) {
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!active) return;
    const timer = window.setInterval(() => setTick((v) => v + 1), 300);
    return () => window.clearInterval(timer);
  }, [active]);
}

function HoverTip({
  label,
  content,
  className = "",
  side = "bottom",
  style,
}: {
  label: React.ReactNode;
  content: React.ReactNode;
  className?: string;
  side?: "bottom" | "top";
  style?: React.CSSProperties;
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ left: 0, top: 0, width: 320, transform: "translate(-50%, 0)" as string });
  const anchorRef = useRef<HTMLDivElement | null>(null);
  const tipRef = useRef<HTMLDivElement | null>(null);
  const holdTimerRef = useRef<number | null>(null);
  const canHover = typeof window !== "undefined" && !!window.matchMedia?.("(hover: hover) and (pointer: fine)")?.matches;

  useEffect(() => {
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
      const safeTop = useTop
        ? Math.max(tipHeight + 12, rawTop)
        : Math.min(viewportHeight - tipHeight - 12, rawTop);
      setPos({
        left,
        top: safeTop,
        width: maxWidth,
        transform: useTop ? "translate(-50%, -100%)" : "translate(-50%, 0)",
      });
    };
    const closeByOutside = (event: PointerEvent) => {
      if (!anchorRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const raf = window.requestAnimationFrame(updatePosition);
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    document.addEventListener("pointerdown", closeByOutside);
    return () => {
      window.cancelAnimationFrame(raf);
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
      document.removeEventListener("pointerdown", closeByOutside);
    };
  }, [open, side]);

  useEffect(() => {
    if (!open || !tipRef.current) return;
    const raf = window.requestAnimationFrame(() => {
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
      const safeTop = useTop
        ? Math.max(tipHeight + 12, rawTop)
        : Math.min(viewportHeight - tipHeight - 12, rawTop);
      setPos({
        left,
        top: safeTop,
        width: maxWidth,
        transform: useTop ? "translate(-50%, -100%)" : "translate(-50%, 0)",
      });
    });
    return () => window.cancelAnimationFrame(raf);
  }, [open, side, content]);

  function clearHoldTimer() {
    if (holdTimerRef.current) {
      window.clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }
  }

  function startHoldOpen() {
    if (canHover) return;
    clearHoldTimer();
    holdTimerRef.current = window.setTimeout(() => setOpen(true), 420);
  }

  return (
    <div
      ref={anchorRef}
      className={cn("relative", className)}
      style={style}
      onMouseEnter={() => canHover && setOpen(true)}
      onMouseLeave={() => canHover && setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
      onTouchStart={startHoldOpen}
      onTouchEnd={clearHoldTimer}
      onTouchCancel={clearHoldTimer}
    >
      {label}
      {open &&
        typeof document !== "undefined" &&
        createPortal(
          <div className="pointer-events-none fixed inset-0 z-[2147483647]">
            <div
              ref={tipRef}
              className="absolute rounded-2xl border border-white/10 bg-[#0a0f1b]/98 p-3 text-xs text-zinc-200 shadow-2xl backdrop-blur-xl"
              style={{
                left: pos.left,
                top: pos.top,
                width: pos.width,
                maxWidth: pos.width,
                transform: pos.transform,
              }}
            >
              {content}
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}

function KeypadPopover({
  open,
  anchorRef,
  value,
  onClose,
  onAppend,
  onDelete,
  onClear,
}: {
  open: boolean;
  anchorRef: React.RefObject<HTMLElement | null>;
  value: string;
  onClose: () => void;
  onAppend: (digit: string) => void;
  onDelete: () => void;
  onClear: () => void;
}) {
  const [pos, setPos] = useState({ left: 0, top: 0, width: 280 });

  useEffect(() => {
    if (!open) return;
    const updatePosition = () => {
      const rect = anchorRef.current?.getBoundingClientRect();
      if (!rect) return;
      const width = Math.min(280, window.innerWidth - 24);
      const left = Math.min(Math.max(rect.left + rect.width / 2, width / 2 + 12), window.innerWidth - width / 2 - 12);
      const top = Math.max(12, rect.top - 12);
      setPos({ left, top, width });
    };
    const closeByOutside = (event: PointerEvent) => {
      if (!anchorRef.current?.contains(event.target as Node)) {
        const target = event.target as HTMLElement;
        if (!target.closest?.("[data-keypad-panel='1']")) onClose();
      }
    };
    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    document.addEventListener("pointerdown", closeByOutside);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
      document.removeEventListener("pointerdown", closeByOutside);
    };
  }, [open, anchorRef, onClose]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div
      data-keypad-panel="1"
      className="fixed z-[130] rounded-3xl border border-white/10 bg-[#0b1020]/96 p-3 shadow-2xl backdrop-blur-xl"
      style={{
        left: pos.left,
        top: pos.top,
        width: pos.width,
        transform: "translate(-50%, -100%)",
      }}
    >
      <div className="mb-2 rounded-2xl border border-white/10 bg-slate-950/80 px-3 py-2 text-right text-lg text-cyan-100">{value || "放弃本轮"}</div>
      <div className="grid grid-cols-3 gap-2">
        {["1", "2", "3", "4", "5", "6", "7", "8", "9", "C", "0", "←"].map((key) => (
          <button
            key={key}
            className="rounded-2xl border border-white/10 bg-slate-950/80 py-2 text-sm"
            onClick={() => {
              if (key === "C") return onClear();
              if (key === "←") return onDelete();
              onAppend(key);
            }}
          >
            {key}
          </button>
        ))}
      </div>
      <button className="mt-2 w-full rounded-2xl border border-white/10 py-2 text-sm text-zinc-300" onClick={onClose}>
        关闭数字盘
      </button>
    </div>,
    document.body
  );
}

function ShapePopover({
  open,
  anchorRef,
  value,
  onClose,
  onSelect,
  onClear,
}: {
  open: boolean;
  anchorRef: React.RefObject<HTMLElement | null>;
  value: string;
  onClose: () => void;
  onSelect: (shape: string) => void;
  onClear: () => void;
}) {
  const [pos, setPos] = useState({ left: 0, top: 0, width: 720 });

  useEffect(() => {
    if (!open) return;
      const updatePosition = () => {
        const rect = anchorRef.current?.getBoundingClientRect();
        if (!rect) return;
        const width = Math.min(720, window.innerWidth - 16);
        const left = Math.min(Math.max(rect.left + rect.width / 2, width / 2 + 8), window.innerWidth - width / 2 - 8);
        const top = Math.min(rect.bottom + 8, window.innerHeight - 720);
        setPos({ left, top, width });
      };
    const closeByOutside = (event: PointerEvent) => {
      if (!anchorRef.current?.contains(event.target as Node)) {
        const target = event.target as HTMLElement;
        if (!target.closest?.("[data-shape-panel='1']")) onClose();
      }
    };
    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    document.addEventListener("pointerdown", closeByOutside);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
      document.removeEventListener("pointerdown", closeByOutside);
    };
  }, [open, anchorRef, onClose]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div
      data-shape-panel="1"
      className="fixed z-[130] rounded-3xl border border-white/10 bg-[#0b1020]/96 p-2 shadow-2xl backdrop-blur-xl"
      style={{
        left: pos.left,
        top: pos.top,
        width: pos.width,
        transform: "translate(-50%, 0)",
      }}
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <div>
          <p className="text-xs text-fuchsia-100">形状筛选</p>
          <p className="text-[10px] text-zinc-400">当前：{value === "全部" ? "全部形状" : value}</p>
        </div>
        <div className="flex items-center gap-1.5">
          <button className="rounded-lg border border-white/10 px-2 py-1 text-[10px] text-zinc-300" onClick={onClear}>清空</button>
          <button className="rounded-lg border border-white/10 px-2 py-1 text-[10px] text-zinc-300" onClick={onClose}>关闭</button>
        </div>
      </div>
      <div className="grid max-h-[70vh] grid-cols-10 gap-2 overflow-y-auto pr-1">
        {Array.from({ length: 10 }, (_, h) => h + 1).flatMap((h) =>
          Array.from({ length: 10 }, (_, w) => {
            const shape = `${w + 1}x${h}`;
            const active = value === shape;
            return (
              <button
                key={shape}
                onClick={() => {
                  onSelect(shape);
                  onClose();
                }}
                className={cn(
                  "aspect-square min-h-10 rounded-lg border px-0 text-[11px] leading-none transition sm:min-h-12 sm:text-xs",
                  active ? "border-cyan-300 bg-cyan-500/15 text-cyan-50" : "border-white/10 bg-slate-950/60 text-zinc-300 hover:border-white/25"
                )}
                title={shape}
              >
                {w + 1}×{h}
              </button>
            );
          })
        )}
      </div>
    </div>,
    document.body
  );
}

function ToolPopover({
  open,
  anchorRef,
  tools,
  disabledToolIds,
  unaffordableToolIds,
  onClose,
  onSelect,
}: {
  open: boolean;
  anchorRef: React.RefObject<HTMLElement | null>;
  tools: any[];
  disabledToolIds: Set<string>;
  unaffordableToolIds: Set<string>;
  onClose: () => void;
  onSelect: (tool: any) => void;
}) {
  const [pos, setPos] = useState({ left: 0, top: 0, width: 720 });

  useEffect(() => {
    if (!open) return;
    const updatePosition = () => {
      const rect = anchorRef.current?.getBoundingClientRect();
      if (!rect) return;
      const width = Math.min(720, window.innerWidth - 16);
      const left = Math.min(Math.max(rect.left + rect.width / 2, width / 2 + 8), window.innerWidth - width / 2 - 8);
      const top = Math.max(8, rect.top - 8);
      setPos({ left, top, width });
    };
    const closeByOutside = (event: PointerEvent) => {
      if (!anchorRef.current?.contains(event.target as Node)) {
        const target = event.target as HTMLElement;
        if (!target.closest?.("[data-tool-panel='1']")) onClose();
      }
    };
    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    document.addEventListener("pointerdown", closeByOutside);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
      document.removeEventListener("pointerdown", closeByOutside);
    };
  }, [open, anchorRef, onClose]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div
      data-tool-panel="1"
      className="fixed z-[130] rounded-3xl border border-white/10 bg-[#0b1020]/96 p-2 shadow-2xl backdrop-blur-xl"
      style={{ left: pos.left, top: pos.top, width: pos.width, transform: "translate(-50%, -100%)" }}
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <div>
          <p className="text-xs text-cyan-100">选择道具</p>
          <p className="text-[10px] text-zinc-400">同一道具每回合仅可使用一次</p>
        </div>
        <button className="rounded-lg border border-white/10 px-2 py-1 text-[10px] text-zinc-300" onClick={onClose}>关闭</button>
      </div>
      <div className="grid max-h-[72vh] grid-cols-8 gap-2 overflow-y-auto pr-1">
        {tools.map((tool) => {
          const used = disabledToolIds.has(tool.id);
          const noMoney = unaffordableToolIds.has(tool.id);
          const disabled = used || noMoney;
          return (
            <HoverTip
              key={tool.id}
              side="top"
              content={<><p className="text-cyan-100">{tool.name}</p><p className="mt-1 text-zinc-300">{tool.desc}</p><p className="mt-1 text-amber-200">价格：{tool.cost} 灵石/次</p></>}
              label={
                <button
                  disabled={disabled}
                  onClick={() => !disabled && onSelect(tool)}
                  className={cn(
                    "relative h-16 w-16 rounded-xl border p-1 text-center sm:h-18 sm:w-18",
                    disabled ? "border-slate-700/60 bg-slate-800/50 text-zinc-600" : "border-white/10 bg-slate-950/60 text-zinc-100 hover:border-cyan-300/40"
                  )}
                >
                  <div className="flex h-full items-center justify-center">
                    <span className="text-sm font-semibold leading-tight text-cyan-50 sm:text-base">{tool.short || tool.name}</span>
                  </div>
                  {used && <span className="absolute right-1 top-1 text-xs text-emerald-200">✓</span>}
                  {!used && noMoney && <span className="absolute right-1 top-1 text-xs text-rose-300">×</span>}
                </button>
              }
            />
          );
        })}
      </div>
    </div>,
    document.body
  );
}

export function App() {
  const [connected, setConnected] = useState(false);
  const [state, setState] = useState<ServerState | null>(null);
  const [roomList, setRoomList] = useState<any[]>([]);
  const [playerName, setPlayerName] = useState(localStorage.getItem("player_name") || "");
  const [joinRoomId, setJoinRoomId] = useState(localStorage.getItem("room_id") || "");
  const [password, setPassword] = useState("");
  const [chatInput, setChatInput] = useState("");
  const [bidInput, setBidInput] = useState("");
  const [selectedTool, setSelectedTool] = useState<any | null>(null);
  const [showToolPicker, setShowToolPicker] = useState(false);
  const [showToolConfirm, setShowToolConfirm] = useState(false);
  const [showKeypad, setShowKeypad] = useState(false);
  const [showCodex, setShowCodex] = useState(false);
  const [showStatsModal, setShowStatsModal] = useState(false);
  const [statsRoundTab, setStatsRoundTab] = useState(1);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [showShapePicker, setShowShapePicker] = useState(false);
  const [showRoundBanner, setShowRoundBanner] = useState(true);
  const [catalogFilter, setCatalogFilter] = useState({ type: "全部", quality: "全部", shape: "全部", min: 0, max: 999999 });
  const [catalogFocusItemId, setCatalogFocusItemId] = useState<string | null>(null);
  const [statsAutoOpenedKey, setStatsAutoOpenedKey] = useState<string | null>(null);
  const [uiDialog, setUiDialog] = useState<{ title: string; message: string } | null>(null);
  const [settingsForm, setSettingsForm] = useState({
    password: "",
    totalRounds: 10,
    initialSpiritStone: 20000,
    entryFee: 200,
    maxPlayers: 6,
    hintRounds: [1, 3] as number[],
    allowDuplicateRoles: true,
  });

  const chatListRef = useRef<HTMLDivElement | null>(null);
  const toolAnchorRef = useRef<HTMLButtonElement | null>(null);
  const bidAnchorRef = useRef<HTMLButtonElement | null>(null);
  const shapeAnchorRef = useRef<HTMLButtonElement | null>(null);
  const warehouseTipHoldRef = useRef<number | null>(null);
  const [warehouseTip, setWarehouseTip] = useState<null | { item: any; rect: DOMRect }>(null);

  const socket = useMemo<Socket>(() => {
    const token = localStorage.getItem("player_token") || "";
    return io(WS_URL, {
      autoConnect: false,
      path: WS_PATH,
      transports: ["websocket", "polling"],
      auth: { token },
    });
  }, []);

  useEffect(() => {
    socket.connect();
    socket.on("connect", () => {
      setConnected(true);
      socket.emit("room:list", (res: any) => {
        if (res?.ok) setRoomList(res.rooms || []);
      });
    });
    socket.on("disconnect", () => setConnected(false));
    socket.on("connect_error", (err: Error) => {
      console.error("Socket连接失败:", err.message);
    });
    socket.on("state:update", (payload: any) => {
      setState(payload);
      if (payload?.room?.roomId) localStorage.setItem("room_id", payload.room.roomId);
      if (payload?.room?.settings) {
        setSettingsForm({
          password: payload.room.settings.password || "",
          totalRounds: payload.room.settings.totalRounds,
          initialSpiritStone: payload.room.settings.initialSpiritStone,
          entryFee: payload.room.settings.entryFee,
          maxPlayers: payload.room.settings.maxPlayers,
          hintRounds: Array.isArray(payload.room.settings.hintRounds) ? payload.room.settings.hintRounds : [1, 3],
          allowDuplicateRoles: Boolean(payload.room.settings.allowDuplicateRoles),
        });
      }
      socket.emit("room:list", (res: any) => {
        if (res?.ok) setRoomList(res.rooms || []);
      });
    });
    return () => {
      socket.removeAllListeners();
      socket.close();
    };
  }, [socket]);

  useEffect(() => {
    if (!chatListRef.current) return;
    chatListRef.current.scrollTop = chatListRef.current.scrollHeight;
  }, [state?.chat]);

  useEffect(() => {
    const result = state?.room?.latestResult;
    if (!result) {
      setStatsAutoOpenedKey(null);
      return;
    }
    const canOpenStatsNow = Boolean(state?.game?.status === "已完成" && state?.game?.currentRoundState?.settlement?.viewer?.completed);
    const resultKey = `${result.gameId}_${state?.selfId || "unknown"}`;
    if (canOpenStatsNow && statsAutoOpenedKey !== resultKey) {
      setShowCodex(false);
      setShowStatsModal(true);
      setStatsAutoOpenedKey(resultKey);
    }
  }, [state?.room?.latestResult, state?.game, state?.selfId, statsAutoOpenedKey]);

  const room = state?.room;
  const game = state?.game;
  const currentRound = game?.currentRoundState;
  const selfId = state?.selfId;
  const me = room?.players?.find((p: any) => p.id === selfId);
  const isHost = room?.ownerId === selfId;
  const roleList = state?.meta?.roles || [];
  const toolList = state?.meta?.tools || [];
  const catalog = state?.meta?.catalog || [];
  const roleSelections = room?.roleSelections || {};
  const currentBidRound = currentRound?.auction?.bidRound || 1;
  const isActionPhase = currentRound?.auction?.phase === "行动中";
  const isSubmitted = currentRound?.auction?.submittedIds?.includes(selfId);
  const settlement = currentRound?.settlement;
  const viewer = settlement?.viewer || null;
  const isFinalRound = Boolean(game && game.currentRound >= game.totalRounds);
  const canViewStats = Boolean(game?.status === "已完成" && viewer?.completed);
  const isBankrupt = Boolean(me?.bankrupt || state?.self?.bankrupt || ((me?.spiritStone ?? 0) < 0));
  const usedToolId = currentRound?.auction?.usedTools?.[selfId] || "";
  const usedToolHistory = new Set<string>(currentRound?.auction?.usedToolHistoryByPlayer?.[selfId] || []);
  const unaffordableToolIds = new Set<string>((toolList || []).filter((t: any) => (me?.spiritStone ?? 0) < t.cost).map((t: any) => t.id));
  const sortedPlayers = [...(room?.players || [])].sort((a: any, b: any) => b.spiritStone - a.spiritStone);
  const activeLobbyPlayers = room ? room.players.filter((p: any) => !p.bankrupt) : [];
  const canStartGame = Boolean(
    room &&
      activeLobbyPlayers.length >= 2 &&
      activeLobbyPlayers.every((p: any) => p.ready)
  );

  useNowTicker(Boolean(currentRound?.auction?.deadlineAt || settlement?.allReadyCountdownAt || settlement?.forceNextAt));

  const actionCountdown = currentRound?.auction?.deadlineAt ? Math.max(0, Math.ceil((currentRound.auction.deadlineAt - Date.now()) / 1000)) : 0;
  const allReadyCountdown = settlement?.allReadyCountdownAt ? Math.max(0, Math.ceil((settlement.allReadyCountdownAt - Date.now()) / 1000)) : 0;
  const forceCountdown = settlement?.forceNextAt ? Math.max(0, Math.ceil((settlement.forceNextAt - Date.now()) / 1000)) : 0;

  const settlementVisibleItems = useMemo(() => {
    if (!settlement || !viewer) return [] as any[];
    const revealIndex = viewer.revealIndex || 0;
    const ids = new Set((settlement.revealOrder || []).slice(0, revealIndex).map((it: any) => it.placedId));
    return (currentRound?.placedItems || []).filter((it: any) => ids.has(it.placedId));
  }, [settlement, viewer, currentRound]);

  const settlementRunningValue = useMemo(() => {
    return settlementVisibleItems.reduce((sum: number, it: any) => sum + (it.price || 0), 0);
  }, [settlementVisibleItems]);

  const settlementRunningProfit = useMemo(() => {
    if (!settlement) return 0;
    return settlementRunningValue - (settlement.winningBid || 0);
  }, [settlementRunningValue, settlement]);

  const lowestEstimatedBagValue = useMemo(() => {
    if (!currentRound || settlement) return 0;
    const allItems = currentRound.placedItems || [];
    const intel = currentRound.intel || {};
    const knownItemIds = new Set(intel.knownItemIds || []);
    const knownContours = new Set(intel.knownContours || []);
    const knownTypeIds = new Set(intel.knownTypeItemIds || []);
    const qualityByItemId = new Map<string, string>();
    (intel.knownQualityCells || []).forEach((cell: any) => {
      if (!qualityByItemId.has(cell.itemPlacedId) && cell.quality) qualityByItemId.set(cell.itemPlacedId, cell.quality);
    });

    return allItems.reduce((sum: number, item: any) => {
      if (knownItemIds.has(item.placedId)) return sum + (item.price || 0);
      const hasContour = knownContours.has(item.placedId);
      const knownType = knownTypeIds.has(item.placedId) ? item.type : null;
      const knownQuality = qualityByItemId.get(item.placedId) || null;
      if (!hasContour && !knownType && !knownQuality) return sum;
      const candidates = catalog.filter((catalogItem: any) => {
        if (hasContour && catalogItem.shape !== item.shape) return false;
        if (knownType && catalogItem.type !== knownType) return false;
        if (knownQuality && catalogItem.quality !== knownQuality) return false;
        return true;
      });
      if (!candidates.length) return sum;
      return sum + Math.min(...candidates.map((candidate: any) => candidate.price || 0));
    }, 0);
  }, [currentRound, settlement, catalog]);

  const bagSummaryText = settlement ? `总价值：${settlementRunningValue}` : `最低预估：${lowestEstimatedBagValue}`;

  const filteredCatalog = catalog.filter((item: any) => {
    if (catalogFocusItemId) return item.id === catalogFocusItemId;
    if (catalogFilter.type !== "全部" && item.type !== catalogFilter.type) return false;
    if (catalogFilter.quality !== "全部" && item.quality !== catalogFilter.quality) return false;
    if (catalogFilter.shape !== "全部" && item.shape !== catalogFilter.shape) return false;
    if (item.price < catalogFilter.min || item.price > catalogFilter.max) return false;
    return true;
  });

  const revealedPlacedIds = useMemo(() => {
    if (!settlement || !viewer) return new Set<string>();
    return new Set((settlement.revealOrder || []).slice(0, viewer.revealIndex || 0).map((it: any) => it.placedId));
  }, [settlement, viewer]);

  const qualityCellMap = useMemo(() => {
    const map = new Map<string, any>();
    if (!currentRound?.intel?.knownQualityCells) return map;
    currentRound.intel.knownQualityCells.forEach((cell: any) => {
      if (!map.has(cell.itemPlacedId)) map.set(cell.itemPlacedId, cell);
    });
    return map;
  }, [currentRound?.intel?.knownQualityCells]);

  const visiblePlacedItems = useMemo(() => {
    if (!currentRound) return [] as any[];
    if (settlement) {
      return settlementVisibleItems.map((item: any) => ({ ...item, viewMode: "item", knownQuality: true, knownType: true, qualityCell: null }));
    }
    const intel = currentRound.intel || { knownItemIds: [], knownContours: [], knownQualityItemIds: [], knownTypeItemIds: [] };
    return (currentRound.placedItems || []).flatMap((item: any) => {
      const knownItem = revealedPlacedIds.has(item.placedId) || intel.knownItemIds.includes(item.placedId);
      const knownContour = intel.knownContours.includes(item.placedId);
      const qualityCell = qualityCellMap.get(item.placedId) || null;
      const knownQuality = intel.knownQualityItemIds?.includes(item.placedId) || Boolean(qualityCell);
      const knownType = intel.knownTypeItemIds?.includes(item.placedId) || knownItem;
      if (knownItem) return [{ ...item, viewMode: "item", knownQuality: true, knownType: true, qualityCell }];
      if (knownContour) return [{ ...item, viewMode: "contour", knownQuality, knownType, qualityCell }];
      return [];
    });
  }, [currentRound, revealedPlacedIds, settlement, settlementVisibleItems, qualityCellMap]);

  const visibleItemIds = useMemo(() => new Set(visiblePlacedItems.filter((it: any) => it.viewMode === "item").map((it: any) => it.placedId)), [visiblePlacedItems]);

  const contourItemIds = useMemo(() => new Set(visiblePlacedItems.filter((it: any) => it.viewMode === "contour").map((it: any) => it.placedId)), [visiblePlacedItems]);

  const visibleQualityCells = useMemo(() => {
    if (settlement) return [] as any[];
    if (!currentRound?.intel?.knownQualityCells) return [] as any[];
    return currentRound.intel.knownQualityCells.filter((cell: any) => !visibleItemIds.has(cell.itemPlacedId) && !contourItemIds.has(cell.itemPlacedId));
  }, [currentRound, visibleItemIds, contourItemIds, settlement]);

  useEffect(() => {
    if (usedToolId) setSelectedTool(toolList.find((t: any) => t.id === usedToolId) || null);
    else setSelectedTool(null);
  }, [usedToolId, toolList]);

  useEffect(() => {
    const closeWarehouseTip = () => setWarehouseTip(null);
    document.addEventListener("scroll", closeWarehouseTip, true);
    window.addEventListener("resize", closeWarehouseTip);
    return () => {
      document.removeEventListener("scroll", closeWarehouseTip, true);
      window.removeEventListener("resize", closeWarehouseTip);
    };
  }, []);

  function openWarehouseTip(item: any, eventOrEl?: React.MouseEvent<HTMLElement> | React.FocusEvent<HTMLElement> | HTMLElement | null) {
    const target = eventOrEl instanceof HTMLElement
      ? eventOrEl
      : eventOrEl && "currentTarget" in eventOrEl
        ? (eventOrEl.currentTarget as HTMLElement)
        : null;
    const rect = target?.getBoundingClientRect() || null;
    if (!rect || rect.width <= 0 || rect.height <= 0) return;
    setWarehouseTip({ item, rect });
  }

  function closeWarehouseTip() {
    setWarehouseTip(null);
    if (warehouseTipHoldRef.current) {
      window.clearTimeout(warehouseTipHoldRef.current);
      warehouseTipHoldRef.current = null;
    }
  }

  function startWarehouseTipHold(item: any, event: React.TouchEvent<HTMLElement>) {
    closeWarehouseTip();
    const el = event.currentTarget as HTMLElement;
    warehouseTipHoldRef.current = window.setTimeout(() => {
      openWarehouseTip(item, el);
    }, 420);
  }

  function clearWarehouseTipHold() {
    if (warehouseTipHoldRef.current) {
      window.clearTimeout(warehouseTipHoldRef.current);
      warehouseTipHoldRef.current = null;
    }
  }

  function appendBidDigit(digit: string) {
    setBidInput((prev) => `${prev}${digit}`.replace(/^0+(\d)/, "$1").slice(0, 9));
  }

  function deleteBidDigit() {
    setBidInput((prev) => prev.slice(0, -1));
  }

  function clearBidInput() {
    setBidInput("");
  }

  function persistIdentity(name: string, token: string) {
    localStorage.setItem("player_name", name);
    localStorage.setItem("player_token", token);
    socket.auth = { token };
  }

  function clearIdentityAndRoom() {
    localStorage.removeItem("player_token");
    localStorage.removeItem("room_id");
    setState(null);
    setJoinRoomId("");
    setSelectedTool(null);
    setShowToolPicker(false);
    setShowToolConfirm(false);
    setBidInput("");
    socket.auth = { token: "" };
    socket.emit("room:list", (res: any) => {
      if (res?.ok) setRoomList(res.rooms || []);
    });
  }

  function leaveRoom() {
    socket.emit("room:leave", {}, () => clearIdentityAndRoom());
  }

  function createRoom() {
    if (!playerName.trim()) return;
    socket.emit(
      "room:create",
      { name: playerName.trim(), maxPlayers: settingsForm.maxPlayers, hintRounds: settingsForm.hintRounds, password },
      (res: any) => {
        if (!res?.ok) return;
        persistIdentity(playerName.trim(), res.token);
      }
    );
  }

  function joinRoom(targetRoomId?: string) {
    const finalRoomId = (targetRoomId || joinRoomId).trim().toUpperCase();
    if (!playerName.trim() || !finalRoomId) return;
    socket.emit("room:join", { name: playerName.trim(), roomId: finalRoomId, password }, (res: any) => {
      if (!res?.ok) {
        setUiDialog({ title: "无法加入房间", message: res?.message || "加入失败" });
        return;
      }
      persistIdentity(playerName.trim(), res.token);
    });
  }

  function updatePlayer(patch: Record<string, unknown>) {
    socket.emit("player:update", patch);
  }

  function updateRoomSettings() {
    socket.emit("room:updateSettings", settingsForm);
  }

  function submitBid() {
    const amount = bidInput === "" ? null : Number(bidInput);
    if (isBankrupt) {
      setUiDialog({ title: "无法参与竞拍", message: "你已破产，无法继续参与竞拍。请等待本局结束。" });
      return;
    }
    if (amount !== null && amount > (me?.spiritStone ?? 0)) {
      setUiDialog({ title: "灵石不足", message: `当前最多只能出价 ${me?.spiritStone ?? 0}。` });
      return;
    }
    socket.emit("action:submitBid", { amount });
    setShowKeypad(false);
  }

  function sendChat() {
    if (!chatInput.trim()) return;
    socket.emit("chat:send", { text: chatInput.trim() });
    setChatInput("");
  }

  function selectTool(tool: any) {
    if (!tool || !isActionPhase || isSubmitted || !!usedToolId || usedToolHistory.has(tool.id)) return;
    setSelectedTool(tool);
    setShowToolPicker(false);
    setShowToolConfirm(true);
  }

  function confirmUseTool() {
    if (!selectedTool || !isActionPhase || isSubmitted || !!usedToolId) return;
    if (isBankrupt) {
      setUiDialog({ title: "无法使用道具", message: "你已破产，无法继续使用道具。请等待本局结束。" });
      return;
    }
    if ((me?.spiritStone ?? 0) < (selectedTool?.cost ?? 0)) {
      setUiDialog({ title: "灵石不足", message: `无法催动【${selectedTool.name}】。` });
      return;
    }
    socket.emit("action:useTool", { toolId: selectedTool.id });
    setShowToolConfirm(false);
    setSelectedTool(null);
  }

  function getRoundUsedToolMeta(playerId: string, roundNo: number) {
    const log = currentRound?.auction?.logs?.find((l: any) => l.roundNo === roundNo);
    const currentToolId = currentRound?.auction?.usedTools?.[playerId];
    const toolId = roundNo === currentBidRound && isActionPhase ? currentToolId : log?.usedTools?.[playerId];
    if (!toolId) return null;
    return toolList.find((t: any) => t.id === toolId) || null;
  }

  function getRoundUsedTool(playerId: string, roundNo: number) {
    const tool = getRoundUsedToolMeta(playerId, roundNo);
    return tool?.short || tool?.name || "";
  }

  function getRoundBidStatus(playerId: string, roundNo: number) {
    const log = currentRound?.auction?.logs?.find((l: any) => l.roundNo === roundNo);
    if (log) {
      const bid = log?.bids?.[playerId];
      return bid === null || bid === undefined ? "放弃" : String(bid);
    }
    if (roundNo === currentBidRound && isActionPhase) {
      return currentRound?.auction?.submittedIds?.includes(playerId) ? "✓" : "";
    }
    return "";
  }

  function getSettlementWinnerName() {
    if (!settlement?.winnerId) return "流拍";
    return room.players.find((p: any) => p.id === settlement.winnerId)?.name || "未知修士";
  }

  function getLobbyPlayerStatus(player: any) {
    if (player?.bankrupt) return "破产";
    return player.ready ? "已准备" : "未准备";
  }

  function getRolePickedNames(roleId: string) {
    return (roleSelections?.[roleId] || [])
      .map((pid: string) => room?.players?.find((p: any) => p.id === pid)?.name)
      .filter(Boolean)
      .join("、");
  }

  const selfRole = roleList.find((r: any) => r.id === me?.roleId);
  const gameMain = room && game;

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(34,197,94,0.08),_transparent_20%),radial-gradient(circle_at_top_right,_rgba(245,158,11,0.12),_transparent_24%),linear-gradient(180deg,_#05070f_0%,_#0b1020_45%,_#120d18_100%)] text-zinc-100">
      <header className="border-b border-amber-500/15 bg-black/35 backdrop-blur-xl">
        <div className="mx-auto flex max-w-[1800px] flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div>
            <p className="text-2xl font-semibold tracking-[0.32em] text-amber-100">修真拍卖行</p>
          </div>
          <div className="flex items-center gap-3 text-xs text-zinc-300">
            <div className="flex flex-wrap items-center gap-3 whitespace-nowrap">
              <span>联机状态：{connected ? "已连通灵网" : "灵网断开"}</span>
              {room?.roomId && <span>房间ID：{room.roomId}</span>}
            </div>
            {room && (
              <div className="flex items-center gap-2">
                {isHost && room && !game && (
                  <button className="rounded-xl border border-amber-400/30 bg-amber-500/10 px-3 py-1 text-sm text-amber-100" onClick={() => setSettingsOpen(true)}>
                    房间设置
                  </button>
                )}
                <button className="rounded-xl border border-rose-400/30 bg-rose-500/10 px-3 py-1 text-sm text-rose-100" onClick={leaveRoom}>
                  退出房间
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {!room && (
        <main className="mx-auto grid max-w-[1500px] gap-4 p-4 xl:grid-cols-[360px_1fr]">
          <section className="space-y-4">
            <div className="rounded-3xl border border-amber-400/15 bg-black/35 p-5 shadow-[0_0_40px_rgba(245,158,11,0.08)] backdrop-blur-xl">
              <h2 className="mb-4 text-lg text-amber-200">开辟洞府房间</h2>
              <input className="mb-3 w-full rounded-xl border border-white/10 bg-slate-950/80 px-3 py-2" placeholder="你的道号" value={playerName} onChange={(e) => setPlayerName(e.target.value)} />
              <input className="mb-3 w-full rounded-xl border border-white/10 bg-slate-950/80 px-3 py-2" placeholder="房间密码（可空）" value={password} onChange={(e) => setPassword(e.target.value)} />
              <label className="mb-2 block text-sm text-zinc-400">加入人数上限（2-16）</label>
              <input type="number" min={2} max={16} className="mb-4 w-full rounded-xl border border-white/10 bg-slate-950/80 px-3 py-2" value={settingsForm.maxPlayers} onChange={(e) => setSettingsForm((s) => ({ ...s, maxPlayers: Math.max(2, Math.min(16, Number(e.target.value) || 6)) }))} />
              <button className="w-full rounded-xl border border-amber-400/30 bg-amber-500/10 py-2 text-amber-100" onClick={createRoom}>创建房间</button>
            </div>

            <div className="rounded-3xl border border-cyan-400/15 bg-black/35 p-5 shadow-[0_0_40px_rgba(34,211,238,0.08)] backdrop-blur-xl">
              <h2 className="mb-4 text-lg text-cyan-200">按房间ID进入</h2>
              <input className="mb-3 w-full rounded-xl border border-white/10 bg-slate-950/80 px-3 py-2" placeholder="你的道号" value={playerName} onChange={(e) => setPlayerName(e.target.value)} />
              <input className="mb-3 w-full rounded-xl border border-white/10 bg-slate-950/80 px-3 py-2 uppercase" placeholder="房间ID" value={joinRoomId} onChange={(e) => setJoinRoomId(e.target.value.toUpperCase())} />
              <input className="mb-4 w-full rounded-xl border border-white/10 bg-slate-950/80 px-3 py-2" placeholder="房间密码（如有）" value={password} onChange={(e) => setPassword(e.target.value)} />
              <button className="w-full rounded-xl border border-cyan-400/30 bg-cyan-500/10 py-2 text-cyan-100" onClick={() => joinRoom()}>加入房间</button>
            </div>
          </section>

          <section className="rounded-3xl border border-white/10 bg-black/35 p-5 backdrop-blur-xl">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg text-fuchsia-200">洞府房间列表</h2>
              <button className="rounded-xl border border-white/10 px-3 py-1 text-sm" onClick={() => socket.emit("room:list", (res: any) => res?.ok && setRoomList(res.rooms || []))}>刷新</button>
            </div>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {roomList.length === 0 && <div className="rounded-2xl border border-dashed border-white/10 p-6 text-sm text-zinc-500">当前没有可加入房间。</div>}
              {roomList.map((r: any) => {
                const canJoinRoom = r.phase !== "游戏中" && !r.latestResult;
                return (
                <div key={r.roomId} className="rounded-2xl border border-white/10 bg-slate-950/45 p-4">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm text-amber-100">房间 {r.roomId}</p>
                    <span className="rounded-full border border-white/10 px-2 py-0.5 text-[10px] text-zinc-400">{r.phase}</span>
                  </div>
                  <p className="mt-2 text-xs text-zinc-400">房主：{r.ownerName}</p>
                  <p className="mt-1 text-xs text-zinc-400">人数：{r.playerCount}/{r.maxPlayers}</p>
                  <p className="mt-1 text-xs text-zinc-400">密码：{r.hasPassword ? "需要输入" : "无"}</p>
                  {r.phase === "游戏中" && <p className="mt-1 text-xs text-zinc-500">进度：第 {r.currentRound}/{r.totalRounds} 回合</p>}
                  <button
                    disabled={!canJoinRoom}
                    className={cn(
                      "mt-3 w-full rounded-xl border py-2 text-sm disabled:cursor-not-allowed disabled:opacity-45",
                      canJoinRoom
                        ? "border-cyan-400/30 bg-cyan-500/10 text-cyan-100"
                        : "border-slate-700/50 bg-slate-900/60 text-zinc-500"
                    )}
                    onClick={() => {
                      if (!canJoinRoom) return;
                      setJoinRoomId(r.roomId);
                      joinRoom(r.roomId);
                    }}
                  >
                    {canJoinRoom ? "加入该房间" : "游戏中不可加入"}
                  </button>
                </div>
              );})}
            </div>
          </section>
        </main>
      )}

      {room && !game && (
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
                    onClick={() => updatePlayer({ ready: !me?.ready })}
                  >
                    {isBankrupt ? "已破产" : me?.ready ? "取消准备" : "准备游戏"}
                  </button>
                  {isHost && (
                    <button className="rounded-xl border border-fuchsia-400/30 bg-fuchsia-500/10 px-3 py-2 text-sm text-fuchsia-100 disabled:opacity-40" disabled={!canStartGame} onClick={() => socket.emit("game:start")}>
                      开启游戏
                    </button>
                  )}
                </div>
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                {Array.from({ length: room.settings.maxPlayers }, (_, i) => room.players[i] || null).map((p: any, idx: number) => {
                  if (!p) {
                    return <div key={`empty-slot-${idx}`} className="rounded-2xl border border-dashed border-white/15 bg-black/10 p-4 text-sm text-zinc-500">空位 #{idx + 1}</div>;
                  }
                  const role = roleList.find((r: any) => r.id === p.roleId);
                  const self = p.id === selfId;
                  return (
                    <div key={p.id} className={cn("rounded-2xl border p-4", self ? "border-cyan-300/30 bg-cyan-500/5" : "border-white/10 bg-slate-950/40")}>
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-base text-zinc-100">{p.name}{p.isHost ? "（房主）" : ""}</p>
                          <p className="mt-1 text-sm text-zinc-400">状态：{getLobbyPlayerStatus(p)} · {p.connected ? "在线" : "离线托管"}</p>
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
                <p>房主：{room.players.find((p: any) => p.id === room.ownerId)?.name || "无"}</p>
                <p>房间密码：{room.settings.password ? "已设置" : "无"}</p>
                <p>人数上限：{room.settings.maxPlayers}</p>
                <p>回合数：{room.settings.totalRounds}</p>
                <p>开局灵石：{room.settings.initialSpiritStone}</p>
                <p>入场券：{room.settings.entryFee}</p>
                <p>修士重复：{room.settings.allowDuplicateRoles ? "允许" : "禁止"}</p>
                <p>系统提示轮次：{(room.settings.hintRounds || []).join("、") || "无"}</p>
              </div>
            </section>
          </section>

          <aside className="space-y-4">
            <section className="rounded-3xl border border-white/10 bg-black/30 p-5 backdrop-blur-xl">
              <div className="mb-3 flex items-center justify-between gap-3">
                <p className="text-lg text-amber-100">选择修士</p>
                <span className="text-[11px] text-zinc-500">{room.settings.allowDuplicateRoles ? "允许重复选择同名修士" : "不允许重复选择同名修士"}</span>
              </div>
              <div className="grid gap-2">
                {roleList.map((role: any) => {
                  const pickedNames = getRolePickedNames(role.id);
                  const pickedByOthers = (roleSelections?.[role.id] || []).some((pid: string) => pid !== selfId);
                  const disabled = !me || (!room.settings.allowDuplicateRoles && pickedByOthers && me?.roleId !== role.id);
                  return (
                    <button
                      key={role.id}
                      disabled={disabled}
                      onClick={() => me && updatePlayer({ roleId: role.id })}
                      className={cn(
                        "rounded-2xl border p-3 text-left",
                        me?.roleId === role.id
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

            {room.latestResult && (
              <section className="rounded-3xl border border-yellow-400/20 bg-yellow-500/5 p-5 backdrop-blur-xl">
                <div className="mb-3 flex items-center justify-between gap-2">
                  <p className="text-yellow-200">上局结算 · 房间ID {room.roomId}</p>
                  <button className="rounded-xl border border-white/10 px-3 py-1 text-sm" onClick={() => setShowStatsModal(true)}>查看统计</button>
                </div>
                <div className="space-y-2 text-sm text-zinc-300">
                  {room.latestResult.ranking.slice(0, 3).map((r: any, idx: number) => (
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
            )}
          </aside>
        </main>
      )}

      {gameMain && (
        <>
          {settlement && showRoundBanner && (
            <div className="pointer-events-none fixed left-1/2 top-0 z-30 flex h-[61px] w-[min(80%,980px)] -translate-x-1/2 items-center justify-center overflow-hidden px-2 text-zinc-100">
              <div className="flex w-full justify-center overflow-x-auto bg-transparent text-center text-lg font-semibold sm:text-xl">
                <div className="inline-flex min-w-max items-center justify-center gap-x-8 whitespace-nowrap px-3">
                  <span>竞拍成功者：{getSettlementWinnerName()}</span>
                  <span>竞拍价：{settlement.winningBid}</span>
                  <span>总价值：{settlementRunningValue}</span>
                  <span className={settlementRunningProfit >= 0 ? "text-emerald-300" : "text-rose-300"}>盈亏：{settlementRunningProfit}</span>
                </div>
              </div>
            </div>
          )}
          <main className="mx-auto flex h-[calc(100dvh-84px)] min-h-0 max-w-[1800px] flex-col gap-3 overflow-hidden p-3">
            <div className="grid min-h-0 flex-1 gap-3 overflow-y-auto grid-cols-1 xl:grid-cols-[320px_minmax(0,1fr)_320px]">
            <section className="order-2 min-h-[28vh] overflow-y-auto rounded-3xl border border-white/10 bg-black/30 p-3 backdrop-blur-xl xl:order-1 xl:min-h-0">
              <div className="mb-3 flex items-center justify-between">
                <p className="text-amber-100">修士榜</p>
                <p className="text-xs text-zinc-500">按灵石排序</p>
              </div>
              <div className="space-y-3 overflow-visible">
                {sortedPlayers.map((p: any, idx: number) => {
                  const role = roleList.find((r: any) => r.id === p.roleId);
                  const self = p.id === selfId;
                  return (
                    <div key={p.id} className={cn("rounded-2xl border p-3", self ? "border-cyan-300/30 bg-cyan-500/5" : "border-white/10 bg-slate-950/40")}>
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm text-zinc-100">#{idx + 1} {p.name}</p>
                          <HoverTip
                            side="top"
                            content={<><p className="text-amber-100">{role?.name || "未选角色"}</p><p className="mt-1 text-zinc-300">技能：{role?.skill || "暂无技能"}</p></>}
                            label={<p className="mt-1 inline-flex cursor-help items-center gap-1 text-xs text-zinc-400">{role?.avatar} · {role?.name}</p>}
                          />
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
                            <HoverTip
                              key={`${p.id}-tool-${roundNo}`}
                              side="top"
                              content={<><p className="text-cyan-100">第{roundNo}轮 · {usedTool.name}</p><p className="mt-1 text-zinc-300">{usedTool.desc}</p><p className="mt-1 text-amber-200">价格：{usedTool.cost} 灵石/次</p></>}
                              label={<div className={cn("flex aspect-square items-center justify-center rounded-xl border px-1 text-center text-[10px] leading-tight", active ? "border-cyan-300 bg-cyan-500/15 text-cyan-50" : "border-white/10 bg-slate-900/70 text-zinc-200")}>{usedTool?.short || used}</div>}
                            />
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

            <section className="order-1 min-h-[58vh] overflow-hidden rounded-3xl border border-white/10 bg-black/30 p-3 backdrop-blur-xl xl:order-2 xl:min-h-0">
              <div className="mb-3 shrink-0 overflow-hidden rounded-2xl border border-white/10 bg-slate-950/35 px-4 py-2 text-sm text-zinc-200">
                {settlement ? (
                  <div className="grid items-center gap-2 md:grid-cols-[1fr_auto_1fr]">
                    <div className="flex items-center gap-x-4 gap-y-1 text-sm text-zinc-200">
                      <span className="text-amber-100">第 {game.currentRound}/{game.totalRounds} 回合 · 结算</span>
                    </div>
                    <div className="flex justify-center">
                      <div className="relative inline-flex max-w-full items-center justify-center rounded-t-2xl border border-b-0 border-white/15 bg-slate-950/55 px-5 py-1.5 text-center text-sm text-amber-100 shadow-[0_-1px_0_rgba(255,255,255,0.08)] before:absolute before:-left-4 before:bottom-[-1px] before:h-4 before:w-4 before:border-b before:border-l before:border-white/15 before:content-[''] after:absolute after:-right-4 after:bottom-[-1px] after:h-4 after:w-4 after:border-b after:border-r after:border-white/15 after:content-['']">
                        <div className="overflow-x-auto whitespace-nowrap px-1">【{currentRound.realm}修士】的储物袋（{bagSummaryText}）</div>
                      </div>
                    </div>
                    <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
                      <button
                        className={cn(
                          "rounded-lg border px-2 py-1 text-xs",
                          showRoundBanner ? "border-cyan-400/30 bg-cyan-500/10 text-cyan-100" : "border-white/10 bg-black/20 text-zinc-300"
                        )}
                        onClick={() => setShowRoundBanner((v) => !v)}
                      >
                        本轮统计
                      </button>
                      {viewer?.mode === "delay" && !viewer?.completed && (
                        <button
                          className="rounded-lg border border-cyan-400/30 bg-cyan-500/10 px-2 py-1 text-xs text-cyan-100"
                          onClick={() => socket.emit("settlement:chooseReveal", { mode: "instant" })}
                        >
                          直接显示
                        </button>
                      )}
                      {viewer?.completed && (
                        game.status === "已完成" || isFinalRound ? (
                          <>
                            {canViewStats && (
                              <button
                                className="rounded-lg border border-fuchsia-400/30 bg-fuchsia-500/10 px-2 py-1 text-xs text-fuchsia-100"
                                onClick={() => setShowStatsModal(true)}
                              >
                                游戏统计
                              </button>
                            )}
                          </>
                        ) : (
                          <button
                            className={cn(
                              "rounded-lg border px-2 py-1 text-xs",
                              viewer?.readyForNextRound ? "border-emerald-400/30 bg-emerald-500/10 text-emerald-100 hover:border-amber-400/30 hover:bg-amber-500/10 hover:text-amber-100" : "border-emerald-400/30 bg-emerald-500/10 text-emerald-100"
                            )}
                            title={viewer?.readyForNextRound ? "点击取消准备" : "点击准备下一回合"}
                            onClick={() => socket.emit("settlement:readyNext")}
                          >
                            {viewer?.readyForNextRound
                              ? settlement.allReadyCountdownAt
                                ? `取消准备（${allReadyCountdown}s）`
                                : "已准备"
                              : `准备（${forceCountdown}s）`}
                          </button>
                        )
                      )}
                      {isHost && viewer?.completed && game.status !== "已完成" && !isFinalRound && (
                        <button
                          className="rounded-lg border border-rose-400/30 bg-rose-500/10 px-2 py-1 text-xs text-rose-100"
                          onClick={() => socket.emit("round:forceNext")}
                        >
                          强制开始
                        </button>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="grid items-center gap-2 md:grid-cols-[1fr_auto_1fr]">
                    <div className="flex items-center gap-x-4 gap-y-1 text-sm text-zinc-200">
                      <span className="text-amber-100">第 {game.currentRound}/{game.totalRounds} 回合 · 第 {currentBidRound} 轮</span>
                    </div>
                    <div className="flex justify-center">
                      <div className="relative inline-flex max-w-full items-center justify-center rounded-t-2xl border border-b-0 border-white/15 bg-slate-950/55 px-5 py-1.5 text-center text-sm text-amber-100 shadow-[0_-1px_0_rgba(255,255,255,0.08)] before:absolute before:-left-4 before:bottom-[-1px] before:h-4 before:w-4 before:border-b before:border-l before:border-white/15 before:content-[''] after:absolute after:-right-4 after:bottom-[-1px] after:h-4 after:w-4 after:border-b after:border-r after:border-white/15 after:content-['']">
                        <div className="overflow-x-auto whitespace-nowrap px-1">【{currentRound.realm}修士】的储物袋（{bagSummaryText}）</div>
                      </div>
                    </div>
                    <div className="flex justify-end">
                      <span className={cn("font-semibold", actionCountdown <= 10 ? "text-rose-300" : "text-amber-100")}>第 {currentBidRound} 轮竞拍倒计时：{actionCountdown}s</span>
                    </div>
                  </div>
                )}
              </div>

              <div className="mt-3 h-[calc(100%-68px)] overflow-hidden rounded-3xl border border-white/10 bg-[#040812]/90 p-2 md:p-3">
                <div className="mx-auto h-full w-full max-w-[1280px] overflow-y-auto overflow-x-hidden rounded-2xl border border-white/8 bg-[linear-gradient(180deg,rgba(255,255,255,0.02),rgba(255,255,255,0.01))] p-2">
                  <div className="relative mx-auto w-full max-w-[1180px]" style={{ aspectRatio: `${GRID_W} / ${GRID_H}` }}>
                    <div className="absolute inset-0 grid grid-cols-10 gap-1">
                      {Array.from({ length: GRID_W * GRID_H }).map((_, index) => (
                        <div key={index} className="aspect-square rounded-[8px] border border-white/8 bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.05),rgba(255,255,255,0.015))] shadow-[inset_0_0_10px_rgba(255,255,255,0.02)]" />
                      ))}
                    </div>

                    {visiblePlacedItems.map((item: any) => {
                      const isItem = item.viewMode === "item";
                      const hasKnownQuality = Boolean(item.knownQuality);
                      const commonStyle = {
                        left: `calc(${(item.x / GRID_W) * 100}% + 2px)`,
                        top: `calc(${(item.y / GRID_H) * 100}% + 2px)`,
                        width: `calc(${(item.width / GRID_W) * 100}% - 4px)`,
                        height: `calc(${(item.height / GRID_H) * 100}% - 4px)`,
                        boxSizing: "border-box" as const,
                      };
                      const itemBlock = (
                        <button
                          key={`${item.placedId}-${item.viewMode}`}
                          onClick={() => {
                            if (!isItem) {
                              setCatalogFocusItemId(null);
                              setCatalogFilter({
                                type: "全部",
                                quality: hasKnownQuality ? item.quality : "全部",
                                shape: item.shape,
                                min: 0,
                                max: 999999,
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
                            {item.knownType && <p className="absolute left-1.5 top-1.5 rounded-md bg-black/20 px-1 py-0.5 text-[9px] text-white/90">{item.type}</p>}
                            {hasKnownQuality && <p className="absolute right-1.5 top-1.5 rounded-md bg-black/20 px-1 py-0.5 text-[9px] text-amber-100">{item.quality}</p>}
                            <p className="absolute bottom-1.5 left-1.5 rounded-md bg-black/20 px-1 py-0.5 text-[9px] text-white/85">{item.width}×{item.height}</p>
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
                            "absolute z-20 overflow-hidden rounded-[12px] border text-white transition hover:brightness-110 focus:outline-none focus:ring-2 focus:ring-amber-300/50",
                            `${QUALITY_COLOR[item.quality]} ${QUALITY_GLOW[item.quality]} bg-gradient-to-br from-white/14 via-white/6 to-black/10`
                          )}
                          style={commonStyle}
                        >
                          <div className="relative h-full w-full p-1.5 text-left">
                            {item.knownType && <p className="absolute left-1.5 top-1.5 rounded-md bg-black/20 px-1 py-0.5 text-[9px] text-white/90">{item.type}</p>}
                            <p className="absolute right-1.5 top-1.5 rounded-md bg-black/20 px-1 py-0.5 text-[9px] text-amber-100">{item.quality}</p>
                            <p className="absolute bottom-1.5 left-1.5 rounded-md bg-black/20 px-1 py-0.5 text-[9px] text-white/85">{item.width}×{item.height}</p>
                            <p className="absolute bottom-1.5 right-1.5 rounded-md bg-black/20 px-1 py-0.5 text-[9px] text-amber-50/90">{item.price}</p>
                            <div className="absolute inset-0 flex items-center justify-center px-2">
                              <p className="max-w-full overflow-hidden text-ellipsis whitespace-nowrap text-center text-[11px] font-semibold leading-tight text-white/95">
                                {item.name}
                              </p>
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
                          setCatalogFilter({ type: "全部", quality: cell.quality, shape: "全部", min: 0, max: 999999 });
                          setShowCodex(true);
                        }}
                        className={cn("quality-pulse absolute z-20 rounded-[8px] border", QUALITY_COLOR[cell.quality], QUALITY_GLOW[cell.quality])}
                        style={{
                          left: `calc(${(cell.x / GRID_W) * 100}% + 2px)`,
                          top: `calc(${(cell.y / GRID_H) * 100}% + 2px)`,
                          width: `calc(${100 / GRID_W}% - 4px)`,
                          height: `calc(${100 / GRID_H}% - 4px)`,
                          boxSizing: "border-box",
                        }}
                      >
                        <span className="absolute right-1 top-1 rounded-md bg-black/20 px-1 py-0.5 text-[9px] text-amber-100">{cell.quality}</span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </section>

            <section className="order-3 min-h-[46vh] overflow-hidden rounded-3xl border border-white/10 bg-black/30 p-3 backdrop-blur-xl xl:min-h-0">
              <div className="grid h-full min-h-0 gap-3 grid-cols-1 sm:grid-cols-2 xl:grid-cols-1 xl:grid-rows-4">
                <div className="min-h-[160px] overflow-hidden rounded-2xl border border-white/10 bg-slate-950/35 p-3 text-xs xl:min-h-0 xl:flex xl:flex-col">
                  <p className="mb-2 text-amber-100">系统提示</p>
                  <div className="h-full min-h-0 space-y-2 overflow-y-auto pr-1">
                    {(currentRound.systemHints || []).slice(-3).map((h: string, i: number) => <p key={`s-${i}`} className="rounded-lg bg-black/20 px-2 py-1">{h}</p>)}
                  </div>
                </div>
                <div className="min-h-[160px] overflow-hidden rounded-2xl border border-white/10 bg-slate-950/35 p-3 text-xs xl:min-h-0 xl:flex xl:flex-col">
                  <p className="mb-2 text-cyan-100">技能提示</p>
                  <div className="h-full min-h-0 space-y-2 overflow-y-auto pr-1">
                    {(currentRound.skillHints || []).map((h: string, i: number) => <p key={`k-${i}`} className="rounded-lg bg-black/20 px-2 py-1">{h}</p>)}
                  </div>
                </div>
                <div className="min-h-[160px] overflow-hidden rounded-2xl border border-white/10 bg-slate-950/35 p-3 text-xs xl:min-h-0 xl:flex xl:flex-col">
                  <p className="mb-2 text-fuchsia-100">道具提示</p>
                  <div className="h-full min-h-0 space-y-2 overflow-y-auto pr-1">
                    {(currentRound.toolHints || []).map((h: string, i: number) => <p key={`t-${i}`} className="rounded-lg bg-black/20 px-2 py-1">{h}</p>)}
                  </div>
                </div>
                <div className="min-h-[280px] overflow-hidden rounded-2xl border border-white/10 bg-slate-950/35 p-3 text-xs xl:min-h-0 xl:flex xl:flex-col">
                  <p className="mb-2 text-emerald-100">聊天</p>
                  <div ref={chatListRef} className="min-h-0 flex-1 space-y-2 overflow-y-auto rounded-xl border border-white/10 bg-black/20 p-2 pr-1">
                    {(state.chat || []).map((m: any) => (
                      <div key={m.id} className="rounded-lg bg-black/25 px-2 py-1">
                        <p><span className="text-zinc-500">[{m.time}]</span> <span className="text-amber-100">{m.senderName}</span></p>
                        <p className="mt-1 break-words text-zinc-200">{m.text}</p>
                      </div>
                    ))}
                  </div>
                  <div className="mt-2 flex shrink-0 gap-2">
                    <input className="min-w-0 flex-1 rounded-xl border border-white/10 bg-slate-950/80 px-3 py-2" value={chatInput} onChange={(e) => setChatInput(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") sendChat(); }} placeholder="输入消息" />
                    <button className="rounded-xl border border-emerald-400/30 bg-emerald-500/10 px-4 text-emerald-100" onClick={sendChat}>发送</button>
                  </div>
                </div>
              </div>
            </section>
          </div>

          <section className="shrink-0 overflow-x-auto rounded-3xl border border-white/10 bg-black/35 px-3 py-2 backdrop-blur-xl">
            <div className="flex min-w-max items-center gap-2 overflow-visible">
              <HoverTip
                side="top"
                content={me ? <><p className="text-amber-100">{me.name}</p><p className="mt-1 text-zinc-300">角色：{selfRole?.name || "未选"}</p><p className="mt-1 text-zinc-400">技能：{selfRole?.skill || "暂未开放，后续扩展。"}</p></> : "未加入角色信息"}
                label={<div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-amber-300/20 bg-amber-500/10 text-2xl">{selfRole?.avatar || "？"}</div>}
              />

              <button
                ref={toolAnchorRef}
                className="relative flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-cyan-400/30 bg-cyan-500/10 text-center text-xs text-cyan-100 disabled:opacity-40"
                disabled={!isActionPhase || isSubmitted || !!usedToolId || isBankrupt}
                onClick={() => setShowToolPicker(true)}
              >
                使用道具
                {usedToolId && <span className="absolute right-1 top-1 text-sm">✓</span>}
              </button>

              <div className="flex h-14 min-w-[200px] items-center rounded-2xl border border-white/10 bg-slate-950/80 px-3">
                <input
                  value={bidInput}
                  onChange={(e) => setBidInput(e.target.value.replace(/\D/g, "").slice(0, 9))}
                  placeholder="手动输入竞价"
                  disabled={!isActionPhase || isSubmitted || isBankrupt}
                  className="min-w-0 flex-1 bg-transparent text-left text-sm outline-none placeholder:text-zinc-500 disabled:opacity-40"
                />
                <button ref={bidAnchorRef} className="ml-2 rounded-xl border border-white/10 px-3 py-2 text-xs text-zinc-300 disabled:opacity-40" disabled={!isActionPhase || isSubmitted || isBankrupt} onClick={() => setShowKeypad(true)}>
                  数字盘
                </button>
              </div>

              <button className="h-14 min-w-[108px] rounded-2xl border border-emerald-400/30 bg-emerald-500/10 px-3 text-sm text-emerald-100 disabled:opacity-40" disabled={!isActionPhase || isSubmitted || isBankrupt} onClick={submitBid}>提交竞价</button>
              <button className="h-14 min-w-[88px] rounded-2xl border border-fuchsia-400/30 bg-fuchsia-500/10 px-3 text-sm text-fuchsia-100" onClick={() => { setCatalogFocusItemId(null); setShowCodex(true); }}>图鉴</button>
            </div>
          </section>
          </main>
        </>
      )}

      {settingsOpen && isHost && room && !game && (
        <div className="fixed inset-0 z-40 bg-black/70 p-4">
          <div className="mx-auto max-w-2xl rounded-3xl border border-white/10 bg-[#0b1020] p-5 shadow-2xl">
            <div className="mb-4 flex items-center justify-between"><p className="text-lg text-amber-100">房间设置</p><button className="rounded-xl border border-white/10 px-3 py-1" onClick={() => setSettingsOpen(false)}>关闭</button></div>
            <div className="grid gap-3 md:grid-cols-2">
              <label className="text-sm text-zinc-300">房间密码<input className="mt-1 w-full rounded-xl border border-white/10 bg-slate-950/80 px-3 py-2" value={settingsForm.password} onChange={(e) => setSettingsForm((s) => ({ ...s, password: e.target.value }))} placeholder="可空" /></label>
              <label className="text-sm text-zinc-300">人数上限（2-16）<input type="number" min={2} max={16} className="mt-1 w-full rounded-xl border border-white/10 bg-slate-950/80 px-3 py-2" value={settingsForm.maxPlayers} onChange={(e) => setSettingsForm((s) => ({ ...s, maxPlayers: Math.max(2, Math.min(16, Number(e.target.value) || 6)) }))} /></label>
              <label className="text-sm text-zinc-300">回合数量<input type="number" className="mt-1 w-full rounded-xl border border-white/10 bg-slate-950/80 px-3 py-2" value={settingsForm.totalRounds} onChange={(e) => setSettingsForm((s) => ({ ...s, totalRounds: Number(e.target.value) || 10 }))} /></label>
              <label className="text-sm text-zinc-300">开局灵石<input type="number" className="mt-1 w-full rounded-xl border border-white/10 bg-slate-950/80 px-3 py-2" value={settingsForm.initialSpiritStone} onChange={(e) => setSettingsForm((s) => ({ ...s, initialSpiritStone: Number(e.target.value) || 20000 }))} /></label>
              <label className="text-sm text-zinc-300">入场券<input type="number" className="mt-1 w-full rounded-xl border border-white/10 bg-slate-950/80 px-3 py-2" value={settingsForm.entryFee} onChange={(e) => setSettingsForm((s) => ({ ...s, entryFee: Number(e.target.value) || 200 }))} /></label>
              <label className="md:col-span-2 flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-slate-950/50 px-3 py-3 text-sm text-zinc-300">
                <span>允许选择相同修士</span>
                <input type="checkbox" checked={settingsForm.allowDuplicateRoles} onChange={(e) => setSettingsForm((s) => ({ ...s, allowDuplicateRoles: e.target.checked }))} />
              </label>
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
            </div>
            <button className="mt-4 w-full rounded-xl border border-amber-400/30 bg-amber-500/10 py-2 text-amber-100" onClick={() => { updateRoomSettings(); setSettingsOpen(false); }}>保存设置</button>
          </div>
        </div>
      )}

      {showCodex && (
        <div className="fixed inset-0 z-40 bg-black/70 p-4">
          <div className="mx-auto max-h-[92vh] max-w-[1100px] overflow-y-auto rounded-3xl border border-white/10 bg-[#0b1020] p-5 shadow-2xl">
            <div className="mb-3 flex items-center justify-between"><p className="text-lg text-fuchsia-100">万物图鉴</p><button className="rounded-xl border border-white/10 px-3 py-1" onClick={() => { setShowCodex(false); setCatalogFocusItemId(null); }}>关闭</button></div>
            <div className="grid gap-2 md:grid-cols-5">
              <select value={catalogFilter.type} onChange={(e) => setCatalogFilter((f) => ({ ...f, type: e.target.value }))} className="rounded-xl border border-white/10 bg-slate-950/80 px-3 py-2"><option value="全部">全部类型</option>{TYPES.map((t: string) => <option key={t} value={t}>{t}</option>)}</select>
              <select value={catalogFilter.quality} onChange={(e) => setCatalogFilter((f) => ({ ...f, quality: e.target.value }))} className="rounded-xl border border-white/10 bg-slate-950/80 px-3 py-2"><option value="全部">全部品质</option>{QUALITIES.map((q: string) => <option key={q} value={q}>{q}</option>)}</select>
              <button ref={shapeAnchorRef} className="rounded-xl border border-white/10 bg-slate-950/80 px-3 py-2 text-left text-zinc-300" onClick={() => setShowShapePicker(true)}>
                {catalogFilter.shape === "全部" ? "选择形状" : `形状：${catalogFilter.shape}`}
              </button>
              <input type="number" className="rounded-xl border border-white/10 bg-slate-950/80 px-3 py-2" value={catalogFilter.min} onChange={(e) => setCatalogFilter((f) => ({ ...f, min: Number(e.target.value) || 0 }))} placeholder="最低价" />
              <input type="number" className="rounded-xl border border-white/10 bg-slate-950/80 px-3 py-2" value={catalogFilter.max} onChange={(e) => setCatalogFilter((f) => ({ ...f, max: Number(e.target.value) || 999999 }))} placeholder="最高价" />
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {filteredCatalog.map((it: any) => (
                <HoverTip
                  key={it.id}
                  side="top"
                  content={<><p className="text-amber-100">{it.quality} · {it.name}</p><p className="mt-1 text-zinc-300">类型：{it.type}｜形状：{it.shape}</p><p className="mt-1 text-zinc-300">尺寸：{it.width} × {it.height}（{it.size}格）</p><p className="mt-1 text-amber-200">估价：{it.price} 灵石</p><p className="mt-2 text-zinc-400">{it.desc}</p></>}
                  label={<div className="rounded-2xl border border-white/10 bg-slate-950/50 p-3 text-left"><div className="flex items-start justify-between gap-2"><p>{it.quality} · {it.name}</p></div><p className="mt-1 text-xs text-zinc-400">{it.type} | {it.shape} | {it.price} 灵石</p><p className="mt-2 text-xs text-zinc-500">{it.desc}</p></div>}
                />
              ))}
            </div>
          </div>
        </div>
      )}

      <KeypadPopover open={showKeypad} anchorRef={bidAnchorRef} value={bidInput} onClose={() => setShowKeypad(false)} onAppend={appendBidDigit} onDelete={deleteBidDigit} onClear={clearBidInput} />
      <ShapePopover
        open={showShapePicker}
        anchorRef={shapeAnchorRef}
        value={catalogFilter.shape}
        onClose={() => setShowShapePicker(false)}
        onSelect={(shape) => setCatalogFilter((f) => ({ ...f, shape }))}
        onClear={() => setCatalogFilter((f) => ({ ...f, shape: "全部" }))}
      />
      <ToolPopover
        open={showToolPicker}
        anchorRef={toolAnchorRef}
        tools={toolList}
        disabledToolIds={usedToolHistory}
        unaffordableToolIds={unaffordableToolIds}
        onClose={() => setShowToolPicker(false)}
        onSelect={selectTool}
      />
      {showToolConfirm && selectedTool && (
        <div className="fixed inset-0 z-[150] flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-sm rounded-3xl border border-white/10 bg-[#0b1020] p-5 shadow-2xl">
            <p className="text-lg text-cyan-100">确认使用道具</p>
            <p className="mt-3 text-zinc-200">是否使用【{selectedTool.name}】？</p>
            <p className="mt-1 text-sm text-zinc-400">{selectedTool.desc}</p>
            <p className="mt-1 text-sm text-amber-200">消耗：{selectedTool.cost} 灵石</p>
            <div className="mt-4 flex gap-2">
              <button className="flex-1 rounded-xl border border-white/10 bg-black/20 py-2 text-zinc-300" onClick={() => { setShowToolConfirm(false); setSelectedTool(null); }}>取消</button>
              <button className="flex-1 rounded-xl border border-cyan-400/30 bg-cyan-500/10 py-2 text-cyan-100" onClick={confirmUseTool}>确认使用</button>
            </div>
          </div>
        </div>
      )}

      {warehouseTip && typeof document !== "undefined" && createPortal(
        <div className="pointer-events-none fixed inset-0 z-[2147483647]">
          <div
            className="absolute rounded-2xl border border-white/10 bg-[#0a0f1b]/98 p-3 text-xs text-zinc-200 shadow-2xl backdrop-blur-xl"
            style={{
              width: Math.min(320, window.innerWidth - 24),
              left: Math.min(
                Math.max(warehouseTip.rect.left + warehouseTip.rect.width / 2, Math.min(320, window.innerWidth - 24) / 2 + 12),
                window.innerWidth - Math.min(320, window.innerWidth - 24) / 2 - 12
              ),
              top:
                warehouseTip.rect.top > 150
                  ? warehouseTip.rect.top - 10
                  : warehouseTip.rect.bottom + 10,
              transform: warehouseTip.rect.top > 150 ? "translate(-50%, -100%)" : "translate(-50%, 0)",
            }}
          >
            <div className="flex items-center justify-between gap-2">
              <p className="text-amber-100">{warehouseTip.item.name}</p>
              <span className="rounded-md bg-black/20 px-1.5 py-0.5 text-xs text-amber-100">{warehouseTip.item.quality}</span>
            </div>
            <p className="mt-1 text-zinc-300">类型：{warehouseTip.item.type}｜品级：{warehouseTip.item.quality}</p>
            <p className="mt-1 text-zinc-300">形状：{warehouseTip.item.shape}｜尺寸：{warehouseTip.item.width} × {warehouseTip.item.height}（{warehouseTip.item.size}格）</p>
            <p className="mt-1 text-amber-200">估价：{warehouseTip.item.price} 灵石</p>
            <p className="mt-2 text-zinc-400">{warehouseTip.item.desc}</p>
          </div>
        </div>,
        document.body
      )}

      {uiDialog && (
        <div className="fixed inset-0 z-[170] flex items-center justify-center bg-black/65 p-4">
          <div className="w-full max-w-md rounded-3xl border border-white/10 bg-[#0b1020] p-5 shadow-2xl">
            <p className="text-lg text-amber-100">{uiDialog.title}</p>
            <p className="mt-3 text-sm text-zinc-300">{uiDialog.message}</p>
            <button className="mt-5 w-full rounded-xl border border-cyan-400/30 bg-cyan-500/10 py-2 text-cyan-100" onClick={() => setUiDialog(null)}>
              知道了
            </button>
          </div>
        </div>
      )}

      {room?.latestResult && showStatsModal && (
        <div className="fixed inset-0 z-[160] bg-black/70 p-4">
          <div className="mx-auto max-h-[92vh] max-w-[1300px] overflow-y-auto rounded-3xl border border-white/10 bg-[#0b1020] p-5 shadow-2xl">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <p className="text-lg text-amber-100">本局统计 · 房间ID {room.roomId}</p>
                <p className="text-xs text-zinc-400">完成时间：{room.latestResult.finishedAt}</p>
              </div>
              <div className="flex gap-2">
                <button className="rounded-xl border border-white/10 px-3 py-1 text-sm" onClick={() => setShowStatsModal(false)}>关闭窗口</button>
              </div>
            </div>

            <div className="overflow-hidden rounded-2xl border border-white/10">
              <table className="min-w-full text-sm">
                <thead className="bg-black/30 text-amber-100">
                  <tr>
                    <th className="px-3 py-2 text-left">排名</th>
                    <th className="px-3 py-2 text-left">玩家</th>
                    <th className="px-3 py-2 text-left">剩余灵石</th>
                    <th className="px-3 py-2 text-left">胜场</th>
                    <th className="px-3 py-2 text-left">总盈亏</th>
                    <th className="px-3 py-2 text-left">总出价</th>
                    <th className="px-3 py-2 text-left">道具/花费</th>
                    <th className="px-3 py-2 text-left">称号</th>
                  </tr>
                </thead>
                <tbody>
                  {room.latestResult.ranking.map((r: any, idx: number) => (
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
              {(room.latestResult.rounds || []).map((round: any) => (
                <button
                  key={`stats-tab-${round.roundNo}`}
                  className={cn("rounded-xl border px-3 py-1 text-sm", statsRoundTab === round.roundNo ? "border-cyan-300 bg-cyan-500/10 text-cyan-100" : "border-white/10 bg-black/20 text-zinc-300")}
                  onClick={() => setStatsRoundTab(round.roundNo)}
                >
                  第 {round.roundNo} 回合
                </button>
              ))}
            </div>

            {(() => {
              const round = (room.latestResult.rounds || []).find((r: any) => r.roundNo === statsRoundTab) || room.latestResult.rounds?.[0];
              if (!round) return null;
              return (
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
                            {TYPES.map((type: string) => (
                              <th key={`matrix-type-${round.roundNo}-${type}`} className="px-3 py-2 text-left whitespace-nowrap">{type}</th>
                            ))}
                            <th className="px-3 py-2 text-left">合计</th>
                          </tr>
                        </thead>
                        <tbody>
                          {QUALITIES.map((quality: string) => {
                            const rowTotal = TYPES.reduce((sum: number, type: string) => {
                              const value = Number(round.matrixSummary?.[quality]?.[type] || 0);
                              return sum + value;
                            }, 0);
                            return (
                              <tr key={`matrix-row-${round.roundNo}-${quality}`} className="border-t border-white/10">
                                <td className="px-3 py-2 text-amber-100">{quality}</td>
                                {TYPES.map((type: string) => {
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
                            {TYPES.map((type: string) => {
                              const colTotal = QUALITIES.reduce((sum: number, quality: string) => {
                                const value = Number(round.matrixSummary?.[quality]?.[type] || 0);
                                return sum + value;
                              }, 0);
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
                        <table className="min-w-full text-xs text-zinc-300">
                          <thead className="bg-black/20">
                            <tr>
                              <th className="px-3 py-2 text-left">玩家</th>
                              <th className="px-3 py-2 text-left">出价</th>
                              <th className="px-3 py-2 text-left">道具</th>
                              <th className="px-3 py-2 text-left">结果</th>
                            </tr>
                          </thead>
                          <tbody>
                            {Object.keys(log.bids || {}).map((pid) => {
                              const playerName = log.bidPlayerNames?.[pid] || pid;
                              const toolName = toolList.find((t: any) => t.id === log.usedTools?.[pid])?.name || "-";
                              const bid = log.bids?.[pid];
                              const bidStatus = bid ?? log.statusByPlayer?.[pid] ?? "放弃";
                              return (
                                <tr key={pid} className="border-t border-white/10">
                                  <td className="px-3 py-2">{playerName}</td>
                                  <td className="px-3 py-2">{bidStatus}</td>
                                  <td className="px-3 py-2">{toolName}</td>
                                  <td className="px-3 py-2">{log.winnerId === pid ? "本轮领先" : "-"}</td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })()}
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
