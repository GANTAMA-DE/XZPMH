import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ITEM_QUALITIES, ITEM_TYPES } from "./data/itemCatalog";
import { ParameterSettingsModal } from "./components/ParameterSettingsModal";
import { HomeLobbyView } from "./components/HomeLobbyView";
import { GamePreparationView } from "./components/GamePreparationView";
import { AuctionGameView } from "./components/AuctionGameView";
import { RoomSettingsModal } from "./components/RoomSettingsModal";
import { NetworkConnectionsModal } from "./components/NetworkConnectionsModal";
import { SimulationPreviewModal } from "./components/SimulationPreviewModal";
import { CodexModal } from "./components/CodexModal";
import { KeypadPopover, QualityPopover, ShapePopover, ToolConfirmDialog, ToolPopover } from "./components/ToolingOverlays";
import { StatsOverlay } from "./components/StatsOverlay";
import { createEmptyIntel, type HintTool } from "./features/hints/shared";
import { FRONT_DEFAULT_SETTINGS, FRONT_ITEM_CATALOG, FRONT_ROLES, FRONT_TOOLS } from "./features/game/meta";
import { computeFrontToolHint } from "./features/hints/toolHints";
import { computeFrontSystemHint } from "./features/hints/systemHints";
import { computeFrontRoleHint } from "./features/hints/roleHints";
import { aggregateFrontHintCache, mergeIntel, type FrontHintCacheByRound } from "./features/hints/cache";
import { generateFrontRoundBag } from "./features/bag/generator";
import { useFrontGameResult } from "./features/results/useFrontGameResult";
import {
  buildTrysteroRoomId,
  generateTrysteroShortRoomId,
  getTrysteroSelfId,
  useTrysteroLobby,
  useTrysteroRoom,
} from "./features/network/trysteroMesh";
import { appendUniqueChatMessage, buildRtcChatMessage, isRtcChatEnvelope } from "./features/chat/rtcChat";
import { buildRtcBidEnvelope, buildRtcRoundEnvelope, buildRtcSettlementEnvelope, isRtcAuctionEnvelope } from "./features/network/rtcAuctionSync";
import {
  applyRtcBidOverlay,
  applyRtcRoundOverlay,
  applyRtcSettlementOverlay,
  getDisplayedCurrentBidRound,
  getRtcCurrentRoundBidDisplay,
  type RtcBidOverlayByRound,
  type RtcRoundOverlay,
} from "./features/network/rtcAuctionOverlay";
import { buildRtcSettingsEnvelope, isRtcSettingsEnvelope, type RtcSettingsSnapshot } from "./features/network/rtcSettingsSync";
import {
  advanceHostAuctionToNextRound,
  applyHostAuctionBid,
  applyHostAuctionSettlement,
  applyHostAuctionTool,
  cloneHostAuctionSnapshot,
  createHostAuctionSnapshot,
  ensureHostAuctionRound,
  markHostAuctionSettlementStarted,
  mergeHostAuctionSnapshot,
  resolveHostAuctionBidRound,
  setHostAuctionReadyForNextRound,
  setHostAuctionSettlementRevealMode,
  type HostAuctionSnapshot,
} from "./features/game/hostAuctionEngine";
import {
  getDisplayedGameCurrentRoundNo,
} from "./features/game/frontGameView";
import {
  buildRtcGameBidEnvelope,
  buildRtcGameForceNextEnvelope,
  buildRtcGameReadyNextEnvelope,
  buildRtcGameRevealModeEnvelope,
  buildRtcGameStateEnvelope,
  buildRtcGameToolEnvelope,
  isRtcGameEnvelope,
} from "./features/network/rtcGameProtocol";
import {
  appendUniqueRoundAction,
  buildActionBidEnvelope,
  buildActionForfeitEnvelope,
  buildActionToolEnvelope,
  buildAssetsHash,
  buildRequestMissingActionsEnvelope,
  buildStartNextRoundEnvelope,
  buildSyncMissingActionsEnvelope,
  createAuctionActionId,
  isAuctionConsensusEnvelope,
  type AuctionRoundAction,
  type ClientAuctionRoundState,
} from "./features/network/auctionConsensus";

const TYPES = ITEM_TYPES;
const QUALITIES = ITEM_QUALITIES;
type ServerState = any;
type LocalRoomPeer = { peerId: string; name: string; isHost?: boolean; joinedAt?: number };
type LocalRoomState = {
  roomId: string;
  ownerPeerId: string;
  selfPeerId: string;
  players: Array<{
    id: string;
    name: string;
    ready: boolean;
    connected: boolean;
    managed: boolean;
    bankrupt: boolean;
    isHost: boolean;
    spiritStone: number;
    roleId: string;
    stats: Record<string, any>;
  }>;
  roleSelections: Record<string, string[]>;
};

function buildLocalRoomStateFromPeers({
  roomId,
  ownerPeerId,
  selfPeerId,
  peers,
  settings,
  previousPlayers,
}: {
  roomId: string;
  ownerPeerId: string;
  selfPeerId: string;
  peers: LocalRoomPeer[];
  settings: FrontendRoomSettingsDraft;
  previousPlayers?: Array<any>;
}): LocalRoomState {
  const previousMap = Object.fromEntries((previousPlayers || []).map((player) => [player.id, player]));
  const nextPlayers = (peers || []).map((peer, index) => {
    const previous = previousMap[peer.peerId];
    return {
      id: peer.peerId,
      name: peer.name,
      ready: typeof previous?.ready === "boolean" ? previous.ready : false,
      connected: true,
      managed: false,
      bankrupt: false,
      isHost: peer.peerId === ownerPeerId,
      spiritStone: Number(previous?.spiritStone ?? settings.initialSpiritStone ?? 500000),
      roleId: previous?.roleId || FRONT_ROLES[index % FRONT_ROLES.length]?.id || FRONT_ROLES[0].id,
      stats: previous?.stats || {},
    };
  });
  const roleSelections = nextPlayers.reduce((acc, player) => {
    if (!player.roleId) return acc;
    if (!acc[player.roleId]) acc[player.roleId] = [];
    acc[player.roleId].push(player.id);
    return acc;
  }, {} as Record<string, string[]>);
  return {
    roomId,
    ownerPeerId,
    selfPeerId,
    players: nextPlayers,
    roleSelections,
  };
}

const QUALITY_TEXT_COLOR: Record<string, string> = {
  圣: "text-red-300",
  天: "text-orange-300",
  地: "text-fuchsia-300",
  玄: "text-sky-300",
  黄: "text-emerald-300",
  凡: "text-slate-300",
};

const DEFAULT_FRONTEND_ROOM_SETTINGS = {
  ...FRONT_DEFAULT_SETTINGS,
  realmProbability: { ...FRONT_DEFAULT_SETTINGS.realmProbability },
  realmCellSettings: FRONT_DEFAULT_SETTINGS.realmCellSettings as Record<string, { min: number; max: number; peak: number; spread: number }>,
  qualityProbability: FRONT_DEFAULT_SETTINGS.qualityProbability as Record<string, number>,
  pricePreference: { ...FRONT_DEFAULT_SETTINGS.pricePreference },
  shapeWeights: { ...(FRONT_DEFAULT_SETTINGS.shapeWeights as Record<string, number>) },
  hintRounds: [...FRONT_DEFAULT_SETTINGS.hintRounds] as number[],
  multipliers: [...FRONT_DEFAULT_SETTINGS.multipliers] as number[],
  revealBidDisplay: FRONT_DEFAULT_SETTINGS.revealBidDisplay as "amount" | "rank",
};

type FrontendRoomSettingsDraft = {
  roomName: string;
  totalRounds: number;
  initialSpiritStone: number;
  entryFee: number;
  maxPlayers: number;
  hintRounds: number[];
  multipliers: number[];
  realmProbability: Record<string, number>;
  realmCellSettings: Record<string, { min: number; max: number; peak: number; spread: number }>;
  qualityProbability: Record<string, number>;
  pricePreference: {
    mode: "amount" | "rank";
    amountMidpoint: number;
    amountDecay: number;
    rankMidpoint: number;
    rankDecay: number;
  };
  shapeWeights: Record<string, number>;
  allowDuplicateRoles: boolean;
  showOtherSpiritStone: boolean;
  revealBidDisplay: "amount" | "rank";
};

function loadFrontendRoomSettingsDraft(): FrontendRoomSettingsDraft {
  return { ...DEFAULT_FRONTEND_ROOM_SETTINGS };
}

function cn(...arr: Array<string | false | null | undefined>) {
  return arr.filter(Boolean).join(" ");
}


const QUALITY_TONE: Record<string, OscillatorType> = {
  凡: "sine",
  黄: "triangle",
  玄: "triangle",
  地: "square",
  天: "square",
  圣: "sawtooth",
};

function useGameAudio() {
  const audioCtxRef = useRef<AudioContext | null>(null);
  const enabledRef = useRef(true);

  function getCtx() {
    const AudioContextCtor = (window as any).AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextCtor) return null;
    if (!audioCtxRef.current) audioCtxRef.current = new AudioContextCtor();
    const ctx = audioCtxRef.current;
    if (!ctx) return null;
    if (ctx.state === "suspended") {
      ctx.resume().catch(() => undefined);
    }
    return ctx;
  }

  function beep({
    type = "sine",
    frequency = 440,
    duration = 0.08,
    volume = 0.04,
    attack = 0.005,
    release = 0.04,
  }: {
    type?: OscillatorType;
    frequency?: number;
    duration?: number;
    volume?: number;
    attack?: number;
    release?: number;
  }) {
    if (!enabledRef.current) return;
    const ctx = getCtx();
    if (!ctx) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(frequency, now);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(volume, now + attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration + release);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + duration + release + 0.01);
  }

  function click() {
    beep({ type: "triangle", frequency: 920, duration: 0.03, volume: 0.035, attack: 0.002, release: 0.03 });
    window.setTimeout(() => {
      beep({ type: "sine", frequency: 1280, duration: 0.025, volume: 0.025, attack: 0.002, release: 0.02 });
    }, 18);
  }

  function submit() {
    beep({ type: "triangle", frequency: 660, duration: 0.05, volume: 0.05, attack: 0.002, release: 0.03 });
    window.setTimeout(() => beep({ type: "square", frequency: 990, duration: 0.05, volume: 0.04 }), 50);
  }

  function tick() {
    beep({ type: "square", frequency: 1200, duration: 0.018, volume: 0.022, attack: 0.001, release: 0.02 });
  }

  function revealByQuality(quality?: string) {
    const tone = QUALITY_TONE[quality || "凡"] || "sine";
    const freq = quality === "圣" ? 1080 : quality === "天" ? 920 : quality === "地" ? 820 : quality === "玄" ? 700 : quality === "黄" ? 620 : 500;
    beep({ type: tone, frequency: freq, duration: 0.06, volume: 0.045, attack: 0.003, release: 0.05 });
  }

  function speak(text: string, rate = 1) {
    if (!enabledRef.current) return;
    if (!("speechSynthesis" in window) || !text) return;
    try {
      const utter = new SpeechSynthesisUtterance(text);
      utter.lang = "zh-CN";
      utter.rate = rate;
      utter.pitch = 1;
      utter.volume = 0.85;
      window.speechSynthesis.speak(utter);
    } catch {
      // noop
    }
  }

  return { click, submit, tick, revealByQuality, speak };
}

function useNowTicker(active: boolean) {
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!active) return;
    const timer = window.setInterval(() => setTick((v) => v + 1), 300);
    return () => window.clearInterval(timer);
  }, [active]);
}

export function App() {
  const [connected, setConnected] = useState(false);
  const [state, setState] = useState<ServerState | null>(null);
  const [localRoomState, setLocalRoomState] = useState<LocalRoomState | null>(null);
  const [pendingLocalRoomState, setPendingLocalRoomState] = useState<LocalRoomState | null>(null);
  const [chatMessages, setChatMessages] = useState<any[]>([]);
  const [roomList, setRoomList] = useState<any[]>([]);
  const [globalOnlineCount, setGlobalOnlineCount] = useState(0);
  const [playerName, setPlayerName] = useState(localStorage.getItem("player_name") || "");
  const [joinRoomId, setJoinRoomId] = useState(localStorage.getItem("room_id") || "");
  const [password, setPassword] = useState("");
  const [roomJoinPassword, setRoomJoinPassword] = useState("");
  const [chatInput, setChatInput] = useState("");
  const [bidInput, setBidInput] = useState("");
  const [selectedTool, setSelectedTool] = useState<any | null>(null);
  const [showToolPicker, setShowToolPicker] = useState(false);
  const [showToolConfirm, setShowToolConfirm] = useState(false);
  const [showKeypad, setShowKeypad] = useState(false);
  const [showCodex, setShowCodex] = useState(false);
  const [codexViewMode, setCodexViewMode] = useState<"list" | "card">("card");
  const [catalogSort, setCatalogSort] = useState<{ key: "type" | "name" | "quality" | "shape" | "size" | "price"; direction: "asc" | "desc" }>({
    key: "type",
    direction: "asc",
  });
  const [showStatsModal, setShowStatsModal] = useState(false);
  const [statsRoundTab, setStatsRoundTab] = useState(1);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [showParameterSettings, setShowParameterSettings] = useState(false);
  const [isJoiningRoom, setIsJoiningRoom] = useState(false);
  const [showShapePicker, setShowShapePicker] = useState(false);
  const [showQualityPicker, setShowQualityPicker] = useState(false);
  const [showNetworkConnections, setShowNetworkConnections] = useState(false);
  const [showSimulationPreview, setShowSimulationPreview] = useState(false);
  const [simulationPreviewStats, setSimulationPreviewStats] = useState<any | null>(null);
  const [catalogFilter, setCatalogFilter] = useState({ type: "全部", quality: "全部", shape: "全部", min: 0, max: 99999999 });
  const [prepPlayersMap, setPrepPlayersMap] = useState<Record<string, { id: string; name: string; ready: boolean; roleId: string; isHost: boolean; connected: boolean; spiritStone: number; joinedAt?: number }>>({});
  const [networkReportsByPlayer, setNetworkReportsByPlayer] = useState<Record<string, { playerId: string; connectedPeerIds: string[]; ts: number }>>({});
  const [catalogFocusItemId, setCatalogFocusItemId] = useState<string | null>(null);
  const [frontRoundBagCache, setFrontRoundBagCache] = useState<Record<string, any>>({});
  const [frontGameResultCache, setFrontGameResultCache] = useState<Record<string, any>>({});
  const [localRevealIndex, setLocalRevealIndex] = useState(0);
  const [statsAutoOpenedKey, setStatsAutoOpenedKey] = useState<string | null>(null);
  const [uiDialog, setUiDialog] = useState<{ title: string; message: string } | null>(null);
  const [settingsForm, setSettingsForm] = useState<FrontendRoomSettingsDraft>(loadFrontendRoomSettingsDraft);
  const [rtcPrepOverlayByPlayer, setRtcPrepOverlayByPlayer] = useState<Record<string, { ready?: boolean; roleId?: string }>>({});
  const [rtcBidOverlayByRound, setRtcBidOverlayByRound] = useState<RtcBidOverlayByRound>({});
  const [rtcRoundOverlay, setRtcRoundOverlay] = useState<Record<number, RtcRoundOverlay>>({});
  const [rtcRoomSettings, setRtcRoomSettings] = useState<RtcSettingsSnapshot | null>(null);
  const [localPendingActionByRound, setLocalPendingActionByRound] = useState<Record<string, { bidSubmitted?: boolean; toolUsed?: boolean }>>({});
  const [rtcHostAuctionSnapshot, setRtcHostAuctionSnapshot] = useState<HostAuctionSnapshot | null>(null);
  const [frontHintCacheByRound, setFrontHintCacheByRound] = useState<FrontHintCacheByRound>({});
  const [frontSettlementUiByRound, setFrontSettlementUiByRound] = useState<Record<string, { mode: "delay" | "instant"; completed: boolean; readyForNextRound: boolean }>>({});
  const [clientAuctionStateByRound, setClientAuctionStateByRound] = useState<Record<number, ClientAuctionRoundState>>({});
  const [hostRoundAssetSnapshots, setHostRoundAssetSnapshots] = useState<Record<number, Record<string, number>>>({});

  function resetFrontOwnedGameState() {
    setRtcPrepOverlayByPlayer({});
    setRtcBidOverlayByRound({});
    setRtcRoundOverlay({});
    setRtcRoomSettings(null);
    setRtcHostAuctionSnapshot(null);
    setFrontHintCacheByRound({});
    setFrontSettlementUiByRound({});
    setClientAuctionStateByRound({});
    setHostRoundAssetSnapshots({});
    setLocalRevealIndex(0);
  }

  const chatListRef = useRef<HTMLDivElement | null>(null);
  const toolAnchorRef = useRef<HTMLButtonElement | null>(null);
  const bidAnchorRef = useRef<HTMLButtonElement | null>(null);
  const shapeAnchorRef = useRef<HTMLButtonElement | null>(null);
  const qualityAnchorRef = useRef<HTMLButtonElement | null>(null);
  const warehouseTipHoldRef = useRef<number | null>(null);
  const localRevealIndexRef = useRef(0);
  const [warehouseTip, setWarehouseTip] = useState<null | { item: any; rect: DOMRect }>(null);
  const audio = useGameAudio();
  const lastChatMessageIdRef = useRef<string>("");
  const lastRoundAnnounceKeyRef = useRef<string>("");
  const lastCountdownKeyRef = useRef<string>("");
  const lastRevealedItemIdsRef = useRef<Set<string>>(new Set());
  const lastSentRtcBidRoundRef = useRef<number | null>(null);
  const lastSentRtcSettlementRoundRef = useRef<number | null>(null);
  const lastResolvedRtcAuctionKeyRef = useRef<string>("");
  const lastIdentitySyncSignatureRef = useRef<string>("");
  const lastRtcPrepHydrationSignatureRef = useRef<string>("");
  const lastMemberListSyncSignatureRef = useRef<string>("");
  const roomSettingsDebounceRef = useRef<number | null>(null);
  const joinAttemptRef = useRef(0);
  const joinTimeoutRef = useRef<number | null>(null);

  const trysteroSelfId = useMemo(() => getTrysteroSelfId() || `peer_${Math.random().toString(36).slice(2, 8)}`, []);
  const localRoomId = localRoomState?.roomId || pendingLocalRoomState?.roomId || "";
  const trysteroRoomNamespace = localRoomId ? buildTrysteroRoomId(localRoomId) : "";
  const [authoritativeMemberList, setAuthoritativeMemberList] = useState<Array<{ playerId: string; name: string; isHost?: boolean; joinedAt?: number }>>([]);

  const lobbyAnnouncement = useMemo(() => {
    if (!localRoomState || !localRoomState.ownerPeerId || localRoomState.ownerPeerId !== trysteroSelfId) return null;
    const phase = rtcHostAuctionSnapshot ? "游戏中" : "准备中";
    return {
      roomId: localRoomState.roomId,
      ownerPeerId: localRoomState.ownerPeerId,
      ownerName: localRoomState.players.find((player) => player.id === localRoomState.ownerPeerId)?.name || playerName || "房主",
      roomName: settingsForm.roomName,
      hasPassword: Boolean(password),
      maxPlayers: Number(settingsForm.maxPlayers || 6),
      playerCount: Number(localRoomState.players.length || 0),
      onlinePlayerCount: Number(localRoomState.players.length || 0),
      phase,
      currentRound: Number(rtcHostAuctionSnapshot?.currentRoundNo || 0),
      totalRounds: Number(rtcHostAuctionSnapshot?.totalRounds || settingsForm.totalRounds || 0),
      ts: Date.now(),
    };
  }, [localRoomState, trysteroSelfId, playerName, settingsForm, rtcHostAuctionSnapshot]);

  const shouldEnableLobby = !localRoomState && !pendingLocalRoomState
    ? true
    : Boolean((localRoomState || pendingLocalRoomState) && !state?.game && (localRoomState?.ownerPeerId || pendingLocalRoomState?.ownerPeerId) === trysteroSelfId);
  const lobby = useTrysteroLobby({
    enabled: shouldEnableLobby,
    selfName: playerName || "匿名修士",
    roomAnnouncement: shouldEnableLobby ? lobbyAnnouncement : null,
  });

  const previousShouldEnableLobbyRef = useRef(shouldEnableLobby);
  useEffect(() => {
    if (previousShouldEnableLobbyRef.current && !shouldEnableLobby) {
      lobby.leaveLobby();
    }
    previousShouldEnableLobbyRef.current = shouldEnableLobby;
  }, [shouldEnableLobby, lobby.leaveLobby]);

  useEffect(() => {
    setConnected(Boolean(lobby.connected));
    setRoomList(lobby.rooms.map((room) => ({
      roomId: room.roomId,
      roomName: room.roomName,
      ownerName: room.ownerName,
      playerCount: room.playerCount,
      onlinePlayerCount: room.onlinePlayerCount,
      maxPlayers: room.maxPlayers,
      hasPassword: room.hasPassword,
      phase: room.phase,
      currentRound: room.currentRound,
      totalRounds: room.totalRounds,
      ownerPeerId: room.ownerPeerId,
    })));
    setGlobalOnlineCount(lobby.peerIds.length + 1);
  }, [lobby.connected, lobby.rooms, lobby.peerIds.length]);

  useEffect(() => {
    if (!chatListRef.current) return;
    chatListRef.current.scrollTop = chatListRef.current.scrollHeight;
  }, [chatMessages]);

  useEffect(() => {
    if (showCodex) resetCatalogSort();
  }, [showCodex]);

  useEffect(() => {
    if (showCodex && codexViewMode === "list") resetCatalogSort();
  }, [showCodex, codexViewMode]);

  useEffect(() => {
    setChatMessages([]);
    lastChatMessageIdRef.current = "";
  }, [localRoomState?.roomId, pendingLocalRoomState?.roomId]);

  const rtcRoomState = localRoomState || pendingLocalRoomState;
  const roomBase = localRoomState
    ? {
        roomId: localRoomState.roomId,
        ownerId: localRoomState.ownerPeerId,
        players: localRoomState.players,
        roleSelections: localRoomState.roleSelections,
      }
    : state?.room;
  const serverGame = state?.game;
  const serverCurrentRound = serverGame?.currentRoundState;
  const selfId = rtcRoomState?.selfPeerId || state?.selfId;
  const effectiveRoomSettings = useMemo(() => ({ ...(FRONT_DEFAULT_SETTINGS as any), ...(settingsForm || {}), ...(rtcRoomSettings || {}) }), [rtcRoomSettings, settingsForm]);
  const room = roomBase ? ({ ...roomBase, settings: effectiveRoomSettings } as any) : undefined;
  const displayedGameCurrentRoundNo = getDisplayedGameCurrentRoundNo({ rtcSnapshot: rtcHostAuctionSnapshot, serverGame });
  const hostCurrentRoundSnapshot = rtcHostAuctionSnapshot?.rounds?.[displayedGameCurrentRoundNo] || null;
  let game: any = rtcHostAuctionSnapshot
    ? {
        id: rtcHostAuctionSnapshot.gameId,
        currentRound: rtcHostAuctionSnapshot.currentRoundNo,
        totalRounds: rtcHostAuctionSnapshot.totalRounds,
        status: rtcHostAuctionSnapshot.status,
        rounds: Object.values(rtcHostAuctionSnapshot.rounds || {})
          .sort((a: any, b: any) => Number(a?.roundNo || 0) - Number(b?.roundNo || 0))
          .map((round: any) => ({
            roundNo: Number(round?.roundNo || 0),
            auction: {
              bidRound: Number(round?.currentBidRound || 1),
              phase: round?.phase === "settlement" ? "回合结算" : "行动中",
              logs: Object.keys(round?.bidRounds || {})
                .map((roundKey) => {
                  const turn = Number(roundKey || 0);
                  return {
                    roundNo: turn,
                    bids: Object.fromEntries(
                      Object.entries(round?.bidRounds?.[turn] || {}).map(([playerId, record]: any) => [playerId, record?.amount ?? null])
                    ),
                    usedTools: Object.fromEntries(
                      Object.entries(round?.bidRounds?.[turn] || {}).map(([playerId, record]: any) => [playerId, record?.toolId || null])
                    ),
                    statusByPlayer: {},
                    success: Boolean(round?.lastResult?.bidRound === turn && round?.winnerId),
                    winnerId: round?.lastResult?.bidRound === turn ? round?.winnerId || null : null,
                    multiplier: round?.lastResult?.bidRound === turn ? round?.lastResult?.multiplier || 1 : 1,
                  };
                })
                .sort((a: any, b: any) => a.roundNo - b.roundNo),
            },
            settlement: round?.phase === "settlement"
              ? {
                  winnerId: round?.winnerId || null,
                  winningBid: Number(round?.winningBid || 0),
                  entryFee: Number(effectiveRoomSettings.entryFee || 0),
                  sharing: {},
                }
              : null,
          })),
      }
    : serverGame;
  let currentRound: any = serverCurrentRound;

  useEffect(() => {
    if (!state?.game) {
      setRtcHostAuctionSnapshot(null);
      setFrontSettlementUiByRound({});
    }
  }, [state?.game, roomBase?.roomId]);

  const displayedRoomPlayers = useMemo(() => {
    const roomPlayers = room?.players || [];
    const playerMap = new Map<string, any>();

    roomPlayers.forEach((player: any) => {
      const prep = prepPlayersMap[player.id] || {};
      const hostPlayer = rtcHostAuctionSnapshot?.players?.[player.id];
      playerMap.set(player.id, {
        ...player,
        id: player.id,
        name: prep.name || player.name,
        ready: typeof prep.ready === "boolean" ? prep.ready : player.ready,
        roleId: typeof prep.roleId === "string" && prep.roleId ? prep.roleId : player.roleId,
        connected: player.id === selfId ? true : Boolean(prep.connected ?? player.connected),
        spiritStone: typeof hostPlayer?.spiritStone === "number" ? hostPlayer.spiritStone : (typeof prep.spiritStone === "number" ? prep.spiritStone : player.spiritStone),
        isHost: Boolean(player.isHost),
      });
    });

    Object.values(prepPlayersMap).forEach((player) => {
      if (!playerMap.has(player.id)) {
        playerMap.set(player.id, {
          id: player.id,
          name: player.name,
          ready: Boolean(player.ready),
          connected: Boolean(player.connected),
          managed: false,
          bankrupt: false,
          isHost: Boolean(player.isHost),
          spiritStone: Number(player.spiritStone ?? effectiveRoomSettings.initialSpiritStone ?? FRONT_DEFAULT_SETTINGS.initialSpiritStone),
          roleId: player.roleId || FRONT_ROLES[0].id,
          stats: {},
        });
      }
    });

    const orderedIds = authoritativeMemberList.length
      ? authoritativeMemberList.map((member) => member.playerId)
      : ((localRoomState?.players || pendingLocalRoomState?.players || []).map((player: any) => player.id).filter((id: string) => playerMap.has(id)).length
          ? (localRoomState?.players || pendingLocalRoomState?.players || []).map((player: any) => player.id).filter((id: string) => playerMap.has(id))
          : Array.from(playerMap.keys()));

    const ordered = orderedIds.map((playerId) => playerMap.get(playerId)).filter(Boolean);

    if (authoritativeMemberList.length) {
      return ordered;
    }

    const missing = Array.from(playerMap.entries())
      .filter(([playerId]) => !orderedIds.includes(playerId))
      .map(([, player]) => player);

    return [...ordered, ...missing];
  }, [room?.players, prepPlayersMap, rtcHostAuctionSnapshot, selfId, effectiveRoomSettings.initialSpiritStone, authoritativeMemberList]);
  const me = displayedRoomPlayers.find((p: any) => p.id === selfId);
  const isHost = (room?.ownerId || rtcRoomState?.ownerPeerId) === selfId;

  useEffect(() => {
    if (!room || game) {
      setRtcPrepOverlayByPlayer({});
    }
  }, [room?.roomId, game?.id]);
  const roleList = FRONT_ROLES as unknown as any[];
  const toolList = FRONT_TOOLS as unknown as any[];
  const catalog = FRONT_ITEM_CATALOG as any[];
  const currentBidRound = hostCurrentRoundSnapshot?.currentBidRound || currentRound?.auction?.bidRound || 1;
  const currentRoundOverlay = rtcRoundOverlay[displayedGameCurrentRoundNo] || {};
  const displayedCurrentBidRound = getDisplayedCurrentBidRound(currentBidRound, currentRoundOverlay);
  const isActionPhase = hostCurrentRoundSnapshot
    ? hostCurrentRoundSnapshot.phase === "action"
    : currentRound?.auction?.phase === "行动中";
  const frontSettlement = hostCurrentRoundSnapshot?.phase === "settlement"
    ? {
        winnerId: hostCurrentRoundSnapshot.winnerId,
        winningBid: hostCurrentRoundSnapshot.winningBid,
        totalValue: 0,
        profit: 0,
        entryFee: effectiveRoomSettings.entryFee,
        sharing: {},
        revealOrder: [],
        startedAt: hostCurrentRoundSnapshot.settlementStartedAt || Date.now(),
        readyOpenAt: null,
        allReadyCountdownAt: hostCurrentRoundSnapshot.allReadyCountdownAt || null,
        forceNextAt: hostCurrentRoundSnapshot.forceNextAt || null,
        viewer: {
          mode: "delay",
          completed: false,
          readyForNextRound: false,
        },
      }
    : null;
  const settlementRoundKey = `${game?.id || room?.roomId || "game"}_round_${displayedGameCurrentRoundNo}`;
  const frontSettlementUi = frontSettlementUiByRound[settlementRoundKey] || { mode: "delay" as const, completed: false, readyForNextRound: false };

  if (hostCurrentRoundSnapshot) {
    const activeBidRound = hostCurrentRoundSnapshot.currentBidRound || 1;
    currentRound = {
      ...(serverCurrentRound || {}),
      id: `${game?.id || room?.roomId || "game"}_R${displayedGameCurrentRoundNo}`,
      roundNo: displayedGameCurrentRoundNo,
      auction: {
        bidRound: activeBidRound,
        phase: hostCurrentRoundSnapshot.phase === "settlement" ? "回合结算" : "行动中",
        deadlineAt: hostCurrentRoundSnapshot.actionDeadlineAt || null,
        activePlayerIds: hostCurrentRoundSnapshot.activePlayerIds || [],
        submittedIds: Object.entries(hostCurrentRoundSnapshot.bidRounds?.[activeBidRound] || {})
          .filter(([, record]: any) => Object.prototype.hasOwnProperty.call(record || {}, "amount"))
          .map(([playerId]) => playerId),
        usedTools: Object.fromEntries(
          Object.entries(hostCurrentRoundSnapshot.bidRounds?.[activeBidRound] || {}).map(([playerId, record]: any) => [playerId, record?.toolId || ""])
        ),
        statusByPlayer: {},
        forfeitedThisRound: {},
        logs:
          Object.keys(hostCurrentRoundSnapshot.bidRounds || {})
            .map((roundKey) => {
              const roundBid = Number(roundKey);
              return {
                roundNo: roundBid,
                bids: Object.fromEntries(
                  Object.entries(hostCurrentRoundSnapshot.bidRounds?.[roundBid] || {}).map(([playerId, record]: any) => [playerId, record?.amount ?? null])
                ),
                usedTools: Object.fromEntries(
                  Object.entries(hostCurrentRoundSnapshot.bidRounds?.[roundBid] || {}).map(([playerId, record]: any) => [playerId, record?.toolId || null])
                ),
                statusByPlayer: {},
                success: Boolean(hostCurrentRoundSnapshot.lastResult?.bidRound === roundBid && hostCurrentRoundSnapshot.winnerId),
                winnerId: hostCurrentRoundSnapshot.lastResult?.bidRound === roundBid ? hostCurrentRoundSnapshot.winnerId || null : null,
                multiplier: hostCurrentRoundSnapshot.lastResult?.bidRound === roundBid ? hostCurrentRoundSnapshot.lastResult?.multiplier || 1 : 1,
              };
            })
            .sort((a, b) => a.roundNo - b.roundNo),
      },
      settlement: frontSettlement
        ? {
            ...frontSettlement,
            viewer: {
              mode: frontSettlementUi.mode,
              completed: frontSettlementUi.completed,
              readyForNextRound: frontSettlementUi.readyForNextRound,
            },
          }
        : null,
    };
  }

  const settlement = currentRound?.settlement || null;
  const viewer = settlement?.viewer || null;
  const isFinalRound = Boolean(game && game.currentRound >= game.totalRounds);
  const canViewStats = Boolean((game?.status === "已完成") || isFinalRound || viewer?.completed);
  const isBankrupt = Boolean(me?.bankrupt || state?.self?.bankrupt || ((me?.spiritStone ?? 0) < 0));
  const actionRoundKey = `${displayedGameCurrentRoundNo}_${currentBidRound}_${selfId || "self"}`;
  const localPendingAction = localPendingActionByRound[actionRoundKey] || {};
  const hostCurrentRecord = hostCurrentRoundSnapshot?.bidRounds?.[currentBidRound]?.[selfId || ""];
  const currentRoundStatus = isBankrupt
    ? "破产"
    : !me?.connected
      ? "离线"
      : me?.managed
        ? ((me as any)?.managedReason === "托管" ? "托管" : "离线")
        : hostCurrentRecord && Object.prototype.hasOwnProperty.call(hostCurrentRecord, "amount") && hostCurrentRecord.amount === null
          ? "放弃"
          : "";
  const cannotBidThisRound = Boolean(["放弃", "破产", "离线", "托管"].includes(currentRoundStatus));
  const unaffordableToolIds = new Set<string>((toolList || []).filter((t: any) => (me?.spiritStone ?? 0) < t.cost).map((t: any) => t.id));
  const sortedPlayers = [...(displayedRoomPlayers || [])].sort((a: any, b: any) => b.spiritStone - a.spiritStone);
  const activeLobbyPlayers = displayedRoomPlayers.filter((p: any) => !p.bankrupt);
  const canStartGame = Boolean(
    room &&
      activeLobbyPlayers.length >= 2 &&
      activeLobbyPlayers.every((p: any) => p.ready)
  );
  const selfRole = roleList.find((r: any) => r.id === (me?.roleId || rtcPrepOverlayByPlayer[selfId || ""]?.roleId));

  function appendChatMessage(message: any) {
    setChatMessages((prev) => appendUniqueChatMessage(prev, message));
  }

  const {
    connected: trysteroRoomConnected,
    peerStates,
    sendJsonToPeers,
    sendSettingsUpdate,
    sendPlayerStatus,
    sendChatMessage,
    sendIdentitySync,
    sendMemberListSync,
    leaveRoom: leaveTrysteroRoom,
  } = useTrysteroRoom({
    roomId: trysteroRoomNamespace,
    enabled: Boolean(trysteroRoomNamespace),
    isHost,
    selfName: playerName || "匿名修士",
    password: roomJoinPassword,
    onPeerOpen: (peerId: string) => {
      if (!selfId) return;
      const selfPlayer = (localRoomState?.players || []).find((player) => player.id === selfId) || me;
      if (selfPlayer) {
        const connectedPeerIds = Object.entries(peerStates).filter(([, state]) => state === "open").map(([id]) => id);
        void sendIdentitySync({
          playerId: selfId,
          name: String(selfPlayer.name || playerName || "匿名修士"),
          avatar: String((selfRole?.avatar || playerName || "匿").slice(0, 1)),
          ready: Boolean(selfPlayer.ready),
          roleId: String(selfPlayer.roleId || FRONT_ROLES[0].id),
          isHost: Boolean(isHost),
          connectionStatus: connectedPeerIds.length > 0 ? "open" : "partial",
          connectedPeerIds,
        }, peerId);
        void sendPlayerStatus({ playerId: selfId, name: String(selfPlayer.name || playerName || "匿名修士"), ready: Boolean(selfPlayer.ready), roleId: String(selfPlayer.roleId || "") }, peerId);
      }
      if (isHost) {
        void sendSettingsUpdate(effectiveRoomSettings, peerId);
        (localRoomState?.players || [])
          .filter((player) => player.id !== selfId)
          .forEach((player) => {
            void sendIdentitySync({
              playerId: player.id,
              name: String(player.name || "匿名修士"),
              avatar: String((roleList.find((role: any) => role.id === player.roleId)?.avatar || player.name || "匿").slice(0, 1)),
              ready: Boolean(player.ready),
              roleId: String(player.roleId || FRONT_ROLES[0].id),
              isHost: Boolean(player.isHost),
              connectionStatus: player.connected === false ? "closed" : "unknown",
              connectedPeerIds: [],
            }, peerId);
            void sendPlayerStatus({ playerId: player.id, name: String(player.name || "匿名修士"), ready: Boolean(player.ready), roleId: String(player.roleId || "") }, peerId);
          });
      }
    },
    onPeerLeave: (peerId: string) => {
      if (!currentRound?.roundNo || !isActionPhase) return;
      const roundNo = Number(currentRound.roundNo || 0);
      const turn = Number(currentBidRound || 1);
      void sendJsonToPeers(buildActionForfeitEnvelope({
        actionId: createAuctionActionId("forfeit_offline", roundNo, turn, peerId),
        type: "ACTION_FORFEIT",
        round: roundNo,
        turn,
        playerId: peerId,
        reason: "offline",
        timestamp: Date.now(),
      }));
      setPrepPlayersMap((prev) => ({
        ...prev,
        [peerId]: {
          ...(prev[peerId] || {}),
          id: peerId,
          name: prev[peerId]?.name || displayedRoomPlayers.find((player: any) => player.id === peerId)?.name || "匿名修士",
          ready: Boolean(prev[peerId]?.ready),
          roleId: prev[peerId]?.roleId || FRONT_ROLES[0].id,
          isHost: Boolean(prev[peerId]?.isHost),
          connected: false,
          spiritStone: Number(prev[peerId]?.spiritStone ?? effectiveRoomSettings.initialSpiritStone ?? FRONT_DEFAULT_SETTINGS.initialSpiritStone),
          joinedAt: prev[peerId]?.joinedAt,
        },
      }));
    },
    onSettingsUpdate: (payload) => {
      setRtcRoomSettings(payload.settings || null);
    },
    onPlayerStatus: (payload, fromPlayerId: string) => {
      const playerId = String(payload.playerId || fromPlayerId);
      setPrepPlayersMap((prev) => {
        const previousEntry = prev[playerId] || {};
        const nextEntry = {
          ...previousEntry,
          id: playerId,
          name: (typeof payload.name === "string" && payload.name) || previousEntry.name || displayedRoomPlayers.find((player: any) => player.id === playerId)?.name || "匿名修士",
          isHost: previousEntry.isHost || playerId === (localRoomState?.ownerPeerId || rtcRoomState?.ownerPeerId),
          connected: true,
          spiritStone: Number(previousEntry.spiritStone ?? effectiveRoomSettings.initialSpiritStone ?? FRONT_DEFAULT_SETTINGS.initialSpiritStone),
          roleId: typeof payload.roleId === "string" ? payload.roleId : (previousEntry.roleId || FRONT_ROLES[0].id),
          ready: typeof payload.ready === "boolean" ? payload.ready : Boolean(previousEntry.ready),
          joinedAt: previousEntry.joinedAt,
        };
        return JSON.stringify(previousEntry) === JSON.stringify(nextEntry)
          ? prev
          : { ...prev, [playerId]: nextEntry };
      });
    },
    onIdentitySync: (payload, fromPlayerId: string) => {
      const playerId = String(payload.playerId || fromPlayerId);
      setPrepPlayersMap((prev) => {
        const previousEntry = prev[playerId] || {};
        const nextEntry = {
          ...previousEntry,
          id: playerId,
          name: String(payload.name || previousEntry.name || "匿名修士"),
          ready: typeof payload.ready === "boolean" ? payload.ready : Boolean(previousEntry.ready),
          roleId: typeof payload.roleId === "string" ? payload.roleId : (previousEntry.roleId || FRONT_ROLES[0].id),
          isHost: typeof payload.isHost === "boolean" ? payload.isHost : Boolean(previousEntry.isHost),
          connected: payload.connectionStatus ? payload.connectionStatus !== "closed" : true,
          spiritStone: Number(previousEntry.spiritStone ?? effectiveRoomSettings.initialSpiritStone ?? FRONT_DEFAULT_SETTINGS.initialSpiritStone),
          joinedAt: previousEntry.joinedAt,
        };
        return JSON.stringify(previousEntry) === JSON.stringify(nextEntry)
          ? prev
          : { ...prev, [playerId]: nextEntry };
      });
      if (Array.isArray(payload.connectedPeerIds)) {
        setNetworkReportsByPlayer((prev) => {
          const previousReport = prev[playerId];
          const nextReport = {
            playerId,
            connectedPeerIds: (payload.connectedPeerIds || []).map((id: string) => String(id)),
            ts: Number(payload.ts || Date.now()),
          };
          return previousReport && JSON.stringify(previousReport) === JSON.stringify(nextReport)
            ? prev
            : { ...prev, [playerId]: nextReport };
        });
      }
    },
    onMemberListSync: (payload) => {
      setAuthoritativeMemberList((prev) => {
        const next = payload.members || [];
        return JSON.stringify(prev) === JSON.stringify(next) ? prev : next;
      });
    },
    onJoinError: (error: unknown) => {
      const isPendingJoin = Boolean(isJoiningRoom && pendingLocalRoomState && !localRoomState);
      if (!isPendingJoin) return;
      const rawMessage = typeof error === "string"
        ? error
        : (typeof (error as any)?.message === "string" ? (error as any).message : "加入房间失败，请稍后重试。");
      const lowered = String(rawMessage).toLowerCase();
      const friendly = lowered.includes("password")
        ? "房间密码错误或校验失败。"
        : lowered.includes("join") || lowered.includes("connect")
          ? "无法连接到该房间，请确认房主在线且网络正常。"
          : String(rawMessage || "加入房间失败，请稍后重试。");
      setUiDialog({ title: "无法加入房间", message: friendly });
      clearIdentityAndRoom();
    },
    onChatMessage: (payload) => {
      if (payload.roomId && room?.roomId && payload.roomId !== room.roomId) return;
      appendChatMessage(payload);
    },
    onDataMessage: (fromPlayerId: string, message: any) => {
      if (isRtcChatEnvelope(message)) {
        const payload = message.payload;
        const chatMessage = {
          ...payload,
          senderId: String(payload.senderId || fromPlayerId),
          senderName: String(payload.senderName || room?.players?.find((p: any) => p.id === (payload.senderId || fromPlayerId))?.name || "未知修士"),
          text: String(payload.text || "").slice(0, 70),
        };
        appendChatMessage(chatMessage);
        return;
      }

      if (isAuctionConsensusEnvelope(message)) {
        processAuctionConsensusEnvelope(message, fromPlayerId);
        return;
      }

      if (isRtcSettingsEnvelope(message)) {
        setRtcRoomSettings(message.settings || null);
        return;
      }

      if (isRtcAuctionEnvelope(message)) {
        if (message.type === "auction:bid" && message.payload?.playerId) {
          const { playerId } = message.payload;
          setRtcBidOverlayByRound((prev) => applyRtcBidOverlay(prev, message.payload));
          if (isHost && playerId !== selfId) void sendJsonToPeers(message);
        }
        if (message.type === "auction:round") {
          const roundNo = Number(currentRound?.roundNo || displayedGameCurrentRoundNo || 0);
          if (roundNo) {
            setRtcRoundOverlay((prev) => ({
              ...prev,
              [roundNo]: applyRtcRoundOverlay(prev[roundNo] || {}, message.payload || {}),
            }));
          }
          if (isHost) void sendJsonToPeers(message);
        }
        if (message.type === "auction:settlement") {
          const roundNo = Number(message.payload?.roundNo || currentRound?.roundNo || displayedGameCurrentRoundNo || 0);
          if (roundNo) {
            setRtcRoundOverlay((prev) => ({
              ...prev,
              [roundNo]: applyRtcSettlementOverlay(prev[roundNo] || {}, message.payload || {}),
            }));
          }
          if (isHost) void sendJsonToPeers(message);
        }
        return;
      }

      if (isRtcGameEnvelope(message)) {
        if (message.type === "game:state") {
          setRtcHostAuctionSnapshot((prev) => mergeHostAuctionSnapshot(prev, message.payload.state));
          if (isHost && fromPlayerId !== selfId) void sendJsonToPeers(message);
          return;
        }
        if (
          message.type === "game:bid" ||
          message.type === "game:tool" ||
          message.type === "game:reveal-mode" ||
          message.type === "game:ready-next" ||
          message.type === "game:force-next"
        ) {
          processGameEnvelopeAsHost(message, fromPlayerId);
          return;
        }
      }
    },
  });
  useEffect(() => {
    if (!localRoomState || !selfId || game) return;
    const selfPlayer = localRoomState.players.find((player) => player.id === selfId);
    if (!selfPlayer) return;
    const connectedPeerIds = Object.entries(peerStates).filter(([, state]) => state === "open").map(([id]) => id);
    const payload = {
      playerId: selfId,
      name: String(selfPlayer.name || playerName || "匿名修士"),
      avatar: String((selfRole?.avatar || playerName || "匿").slice(0, 1)),
      ready: Boolean(selfPlayer.ready),
      roleId: String(selfPlayer.roleId || FRONT_ROLES[0].id),
      isHost: Boolean(isHost),
      connectionStatus: (connectedPeerIds.length > 0 ? "open" : "partial") as "open" | "partial",
      connectedPeerIds,
    };
    const signature = JSON.stringify(payload);
    if (lastIdentitySyncSignatureRef.current === signature) return;
    lastIdentitySyncSignatureRef.current = signature;
    void sendIdentitySync(payload);
  }, [localRoomState?.roomId, localRoomState?.players, selfId, playerName, game?.id, sendIdentitySync, selfRole?.avatar, isHost, peerStates]);

  useEffect(() => {
    if (!currentRound?.roundNo || !selfId) return;
    const roundNo = Number(currentRound.roundNo || 0);
    if (!roundNo) return;
    setClientAuctionStateByRound((prev) => {
      if (prev[roundNo]) return prev;
      return {
        ...prev,
        [roundNo]: {
          roundNo,
          currentTurn: Number(currentBidRound || 1),
          actions: [],
          readyNextByPlayer: {},
          startNextPayload: null,
          forceStartPayload: null,
        },
      };
    });
  }, [currentRound?.roundNo, currentBidRound, selfId]);

  function processAuctionConsensusEnvelope(message: any, fromPlayerId: string) {
    if (!isAuctionConsensusEnvelope(message)) return;
    const type = message.type;
    const payload = (message.payload || {}) as Record<string, any>;

    if (type === "START_NEXT_ROUND") {
      const nextRoundNo = Number(payload.nextRound || 0);
      const typedPayload = {
        round: Number(payload.round || 0),
        nextRound: nextRoundNo,
        hostPlayerId: String(payload.hostPlayerId || fromPlayerId || ""),
        assetsSnapshot: { ...(payload.assetsSnapshot || {}) },
        timestamp: Number(payload.timestamp || Date.now()),
      };
      setHostRoundAssetSnapshots((prev) => ({ ...prev, [nextRoundNo]: typedPayload.assetsSnapshot }));
      setClientAuctionStateByRound((prev) => ({
        ...prev,
        [nextRoundNo]: {
          roundNo: nextRoundNo,
          currentTurn: 1,
          actions: prev[nextRoundNo]?.actions || [],
          readyNextByPlayer: {},
          startNextPayload: typedPayload,
          forceStartPayload: null,
        },
      }));
      return;
    }

    if (type === "FORCE_START") {
      const roundNo = Number(payload.round || currentRound?.roundNo || 0);
      const typedPayload = {
        round: roundNo,
        nextRound: Number(payload.nextRound || roundNo + 1),
        hostPlayerId: String(payload.hostPlayerId || fromPlayerId || ""),
        timestamp: Number(payload.timestamp || Date.now()),
      };
      setClientAuctionStateByRound((prev) => ({
        ...prev,
        [roundNo]: {
          ...(prev[roundNo] || {
            roundNo,
            currentTurn: Number(currentBidRound || 1),
            actions: [],
            readyNextByPlayer: {},
            startNextPayload: null,
            forceStartPayload: null,
          }),
          forceStartPayload: typedPayload,
        },
      }));
      return;
    }

    if (type === "REQUEST_MISSING_ACTIONS") {
      const targetId = String(payload.targetId || "");
      if (targetId && targetId !== selfId) return;
      const roundNo = Number(payload.round || 0);
      const missingIds = new Set<string>((payload.missingActionIds || []).map((id: string) => String(id)));
      const actions = (clientAuctionStateByRound[roundNo]?.actions || []).filter((action) => missingIds.has(action.actionId));
      if (actions.length) {
        void sendJsonToPeers(buildSyncMissingActionsEnvelope({
          round: roundNo,
          senderId: selfId,
          targetId: String(payload.requesterId || fromPlayerId || ""),
          actions,
          timestamp: Date.now(),
        }));
      }
      return;
    }

    if (type === "SYNC_MISSING_ACTIONS") {
      const targetId = String(payload.targetId || "");
      if (targetId && targetId !== selfId) return;
      const roundNo = Number(payload.round || 0);
      setClientAuctionStateByRound((prev) => {
        const roundState = prev[roundNo] || {
          roundNo,
          currentTurn: Number(currentBidRound || 1),
          actions: [],
          readyNextByPlayer: {},
          startNextPayload: null,
          forceStartPayload: null,
        };
        const merged = (payload.actions || []).reduce((acc: AuctionRoundAction[], action: AuctionRoundAction) => appendUniqueRoundAction(acc, action), roundState.actions || []);
        return {
          ...prev,
          [roundNo]: {
            ...roundState,
            actions: merged,
          },
        };
      });
      return;
    }

    if (type === "READY_NEXT") {
      const roundNo = Number(payload.round || 0);
      const readyPayload = {
        round: roundNo,
        playerId: String(payload.playerId || fromPlayerId),
        assetsHash: String(payload.assetsHash || ""),
        actionIds: Array.isArray(payload.actionIds) ? payload.actionIds.map((id: string) => String(id)) : [],
        timestamp: Number(payload.timestamp || Date.now()),
      };
      setClientAuctionStateByRound((prev) => {
        const roundState = prev[roundNo] || {
          roundNo,
          currentTurn: Number(currentBidRound || 1),
          actions: [],
          readyNextByPlayer: {},
          startNextPayload: null,
          forceStartPayload: null,
        };
        const nextReady = { ...roundState.readyNextByPlayer, [readyPayload.playerId]: readyPayload };
        return {
          ...prev,
          [roundNo]: {
            ...roundState,
            readyNextByPlayer: nextReady,
          },
        };
      });
      const hostSnapshot = hostRoundAssetSnapshots[roundNo] || {};
      const localHash = buildAssetsHash(hostSnapshot);
      if (readyPayload.assetsHash && localHash && readyPayload.assetsHash !== localHash) {
        void sendJsonToPeers(buildRequestMissingActionsEnvelope({
          round: roundNo,
          requesterId: selfId,
          targetId: readyPayload.playerId,
          missingActionIds: [],
          timestamp: Date.now(),
        }));
      }
      return;
    }

    if (type === "ACTION_BID" || type === "ACTION_TOOL" || type === "ACTION_FORFEIT") {
      const roundNo = Number(payload.round || 0);
      const action = payload as AuctionRoundAction;
      setClientAuctionStateByRound((prev) => {
        const roundState = prev[roundNo] || {
          roundNo,
          currentTurn: Number(currentBidRound || 1),
          actions: [],
          readyNextByPlayer: {},
          startNextPayload: null,
          forceStartPayload: null,
        };
        return {
          ...prev,
          [roundNo]: {
            ...roundState,
            currentTurn: Math.max(roundState.currentTurn || 1, Number(action.turn || 1)),
            actions: appendUniqueRoundAction(roundState.actions || [], action),
          },
        };
      });
    }
  }

  function processGameEnvelopeAsHost(message: any, fromPlayerId: string) {
    if (!isHost) return;
    if (!message || typeof message !== "object") return;
    setRtcHostAuctionSnapshot((prev) => {
      const fallbackRoundNo = Number(message?.payload?.roundNo || currentRound?.roundNo || displayedGameCurrentRoundNo || 1);
      const next = cloneHostAuctionSnapshot(prev) || createHostAuctionSnapshot({
        gameId: game?.id || room?.roomId || "local_game",
        currentRoundNo: fallbackRoundNo,
        totalRounds: game?.totalRounds || effectiveRoomSettings.totalRounds || FRONT_DEFAULT_SETTINGS.totalRounds,
        status: game?.status || "进行中",
        players: (room?.players || []).map((player: any) => ({ id: player.id, name: player.name, spiritStone: player.spiritStone, roleId: player.roleId })),
      });

      if (message.type === "game:bid") {
        applyHostAuctionBid({
          snapshot: next,
          roundNo: message.payload.roundNo,
          bidRound: message.payload.bidRound,
          playerId: message.payload.playerId,
          amount: message.payload.amount,
        });
      } else if (message.type === "game:tool") {
        applyHostAuctionTool({
          snapshot: next,
          roundNo: message.payload.roundNo,
          bidRound: message.payload.bidRound,
          playerId: message.payload.playerId,
          toolId: message.payload.toolId,
          toolCost: message.payload.toolCost,
        });
      } else if (message.type === "game:reveal-mode") {
        setHostAuctionSettlementRevealMode({
          snapshot: next,
          roundNo: message.payload.roundNo,
          playerId: message.payload.playerId,
          instant: message.payload.instant,
        });
        if (message.payload.instant) {
          setHostAuctionReadyForNextRound({
            snapshot: next,
            roundNo: message.payload.roundNo,
            playerId: message.payload.playerId,
            ready: true,
          });
        }
      } else if (message.type === "game:ready-next") {
        setHostAuctionReadyForNextRound({
          snapshot: next,
          roundNo: message.payload.roundNo,
          playerId: message.payload.playerId,
          ready: message.payload.ready,
        });
      } else if (message.type === "game:force-next") {
        const nextRoundNo = message.payload.roundNo + 1;
        advanceHostAuctionToNextRound({ snapshot: next, nextRoundNo });
      } else {
        return prev;
      }

      if (rtcPeerCount > 0 && fromPlayerId !== selfId) {
        sendJsonToPeers(buildRtcGameStateEnvelope(next));
      } else if (rtcPeerCount > 0 && fromPlayerId === selfId) {
        sendJsonToPeers(buildRtcGameStateEnvelope(next));
      }
      return next;
    });
  }

  const hostLoopbackOpen = Boolean(rtcRoomState?.ownerPeerId && selfId && rtcRoomState.ownerPeerId === selfId);
  const rtcPeerCount = Object.values(peerStates).filter((state) => state === "open").length + (hostLoopbackOpen ? 1 : 0);

  useEffect(() => {
    setConnected(Boolean(lobby.connected || trysteroRoomConnected));
  }, [lobby.connected, trysteroRoomConnected]);

  const connectionScopesLabel = [
    lobby.connected ? "公共大厅" : null,
    trysteroRoomConnected ? "游戏房间" : null,
  ].filter(Boolean).join(" | ");

  useEffect(() => {
    if (!selfId || !room?.roomId) return;
    const connectedPeerIds = Object.entries(peerStates)
      .filter(([, state]) => state === "open")
      .map(([peerId]) => peerId);
    setNetworkReportsByPlayer((prev) => {
      const previousReport = prev[selfId];
      const nextReport = {
        playerId: selfId,
        connectedPeerIds,
        ts: Date.now(),
      };
      return previousReport && JSON.stringify({ ...previousReport, ts: 0 }) === JSON.stringify({ ...nextReport, ts: 0 })
        ? prev
        : { ...prev, [selfId]: nextReport };
    });
  }, [selfId, room?.roomId, peerStates]);

  useEffect(() => {
    if (!rtcRoomState) return;
    const hydrationSignature = JSON.stringify({
      roomId: rtcRoomState.roomId,
      players: (rtcRoomState.players || []).map((player: any) => ({
        id: player.id,
        name: player.name,
        ready: player.ready,
        roleId: player.roleId,
        isHost: player.isHost,
        connected: player.id === selfId ? true : Boolean(peerStates[player.id] === "open" || player.connected),
        spiritStone: player.spiritStone,
      })),
    });
    if (lastRtcPrepHydrationSignatureRef.current === hydrationSignature) return;
    lastRtcPrepHydrationSignatureRef.current = hydrationSignature;
    setPrepPlayersMap((prev) => {
      const next = { ...prev };
      let changed = false;
      (rtcRoomState.players || []).forEach((player: any) => {
        const previousEntry = next[player.id] || {};
        const previousName = String(previousEntry.name || "");
        const incomingName = String(player.name || "");
        const resolvedName = incomingName && incomingName !== "匿名修士"
          ? incomingName
          : (previousName && previousName !== "匿名修士"
              ? previousName
              : (incomingName || previousName || (player.id === selfId ? playerName : "匿名修士")));
        const nextEntry = {
          ...previousEntry,
          id: player.id,
          name: resolvedName,
          ready: typeof previousEntry.ready === "boolean" ? previousEntry.ready : Boolean(player.ready),
          roleId: previousEntry.roleId || player.roleId || FRONT_ROLES[0].id,
          isHost: Boolean(player.isHost),
          connected: player.id === selfId ? true : Boolean(peerStates[player.id] === "open" || player.connected),
          spiritStone: Number(previousEntry.spiritStone ?? player.spiritStone ?? effectiveRoomSettings.initialSpiritStone ?? FRONT_DEFAULT_SETTINGS.initialSpiritStone),
          joinedAt: previousEntry.joinedAt,
        };
        if (JSON.stringify(previousEntry) !== JSON.stringify(nextEntry)) {
          changed = true;
          next[player.id] = nextEntry;
        }
      });
      return changed ? next : prev;
    });
  }, [rtcRoomState, peerStates, selfId, effectiveRoomSettings.initialSpiritStone, playerName]);

  useEffect(() => {
    if (!pendingLocalRoomState) return;
    const ownerPeerId = pendingLocalRoomState.ownerPeerId;
    const isHostSelf = pendingLocalRoomState.selfPeerId === ownerPeerId;
    const connectedToHost = isHostSelf || peerStates[ownerPeerId] === "open";
    if (!connectedToHost) return;
    setLocalRoomState(pendingLocalRoomState);
    setPendingLocalRoomState(null);
    if (joinTimeoutRef.current) {
      window.clearTimeout(joinTimeoutRef.current);
      joinTimeoutRef.current = null;
    }
    setIsJoiningRoom(false);
  }, [pendingLocalRoomState, peerStates]);

  useEffect(() => {
    if (localRoomState || !pendingLocalRoomState) {
      setIsJoiningRoom(false);
    }
  }, [localRoomState, pendingLocalRoomState]);

  useEffect(() => {
    if (!localRoomState) return;
    setLocalRoomState((prev) => {
      if (!prev) return prev;
      const hostPeer = prev.players.find((player) => player.id === prev.ownerPeerId) || {
        peerId: prev.ownerPeerId,
        name: prepPlayersMap[prev.ownerPeerId]?.name || "房主",
        isHost: true,
      };
      const selfPeer = prev.players.find((player) => player.id === prev.selfPeerId) || {
        peerId: prev.selfPeerId,
        name: prepPlayersMap[prev.selfPeerId]?.name || playerName || "匿名修士",
        isHost: prev.selfPeerId === prev.ownerPeerId,
      };
      const authoritativePeers = authoritativeMemberList.map((member) => ({
        peerId: member.playerId,
        name: member.name,
        isHost: Boolean(member.isHost),
      }));
      const unique = new Map<string, LocalRoomPeer>();
      const candidatePeers = authoritativeMemberList.length
        ? [hostPeer as any, selfPeer as any, ...authoritativePeers]
        : [hostPeer as any, selfPeer as any, ...prev.players.map((player) => ({ peerId: player.id, name: player.name, isHost: player.isHost }))];
      candidatePeers.forEach((peer: any) => {
        if (!peer?.peerId) return;
        if (!unique.has(peer.peerId)) unique.set(peer.peerId, peer);
      });
      const nextState = buildLocalRoomStateFromPeers({
        roomId: prev.roomId,
        ownerPeerId: prev.ownerPeerId,
        selfPeerId: prev.selfPeerId,
        peers: Array.from(unique.values()),
        settings: settingsForm,
        previousPlayers: prev.players,
      });
      const prevSign = JSON.stringify({
        roomId: prev.roomId,
        ownerPeerId: prev.ownerPeerId,
        selfPeerId: prev.selfPeerId,
        players: prev.players.map((player) => ({ id: player.id, name: player.name, ready: player.ready, roleId: player.roleId, isHost: player.isHost })),
      });
      const nextSign = JSON.stringify({
        roomId: nextState.roomId,
        ownerPeerId: nextState.ownerPeerId,
        selfPeerId: nextState.selfPeerId,
        players: nextState.players.map((player) => ({ id: player.id, name: player.name, ready: player.ready, roleId: player.roleId, isHost: player.isHost })),
      });
      return prevSign === nextSign ? prev : nextState;
    });
  }, [localRoomState?.roomId, localRoomState?.ownerPeerId, localRoomState?.selfPeerId, prepPlayersMap, authoritativeMemberList, playerName, settingsForm]);
  const liveRoleSelections = useMemo(() => {
    return displayedRoomPlayers.reduce((acc: Record<string, string[]>, player: any) => {
      if (!player.roleId) return acc;
      if (!acc[player.roleId]) acc[player.roleId] = [];
      acc[player.roleId].push(player.id);
      return acc;
    }, {} as Record<string, string[]>);
  }, [displayedRoomPlayers]);

  useEffect(() => {
    if (!isHost || !localRoomState?.roomId || !selfId) return;
    const syncMembers = () => {
      const activePeerIds = new Set<string>([selfId, ...Object.keys(peerStates).filter((peerId) => peerStates[peerId] === "open")]);
      const basePlayers = localRoomState.players || [];
      const nextMembers = basePlayers
        .filter((player: any) => activePeerIds.has(player.id))
        .map((player: any, index: number) => {
          const synced = prepPlayersMap[player.id] || {};
          const previousMember = authoritativeMemberList.find((member) => member.playerId === player.id);
          const resolvedName = String(synced.name || player.name || (player.id === selfId ? playerName : "匿名修士"));
          return {
            playerId: player.id,
            name: resolvedName,
            isHost: Boolean(player.isHost),
            joinedAt: previousMember?.joinedAt || index + 1,
          };
        });
      const nextSign = JSON.stringify(nextMembers);
      const changed = lastMemberListSyncSignatureRef.current !== nextSign;
      if (changed) {
        lastMemberListSyncSignatureRef.current = nextSign;
        setAuthoritativeMemberList(nextMembers);
        void sendMemberListSync({ roomId: localRoomState.roomId, members: nextMembers });
      }
    };
    syncMembers();
    const timer = window.setInterval(syncMembers, 10000);
    return () => window.clearInterval(timer);
  }, [isHost, localRoomState?.roomId, localRoomState?.players, selfId, peerStates, prepPlayersMap, playerName, sendMemberListSync]);

  function isLobbyRtcOnline(player: any) {
    if (!player) return false;
    if (player.id === selfId) {
      return player.id === rtcRoomState?.ownerPeerId ? hostLoopbackOpen : true;
    }
    if (player.id === rtcRoomState?.ownerPeerId) return peerStates[player.id] === "open";
    return peerStates[player.id] === "open";
  }

  useEffect(() => {
    if (!localRoomState || !selfId) return;
    if (localRoomState.ownerPeerId === selfId) return;
    const ownerState = peerStates[localRoomState.ownerPeerId];
    if (!ownerState) return;
    if (["closed", "disconnected", "failed", "error"].includes(ownerState)) {
      clearIdentityAndRoom();
      setUiDialog({ title: "房主已离线", message: "房主离开了当前房间，大厅中的房间条目已自动失效。" });
    }
  }, [localRoomState, selfId, peerStates]);
  useEffect(() => {
    if (!isHost || !hostCurrentRoundSnapshot || !displayedGameCurrentRoundNo) return;
    if (hostCurrentRoundSnapshot.phase !== "settlement" || hostCurrentRoundSnapshot.settlementStarted) return;
    setRtcHostAuctionSnapshot((prev) => {
      const next = cloneHostAuctionSnapshot(prev);
      if (!next) return prev;
      markHostAuctionSettlementStarted({ snapshot: next, roundNo: displayedGameCurrentRoundNo });
      if (rtcPeerCount > 0) sendJsonToPeers(buildRtcGameStateEnvelope(next));
      return next;
    });
  }, [isHost, hostCurrentRoundSnapshot, displayedGameCurrentRoundNo, rtcPeerCount, sendJsonToPeers]);

  useEffect(() => {
    if (!isHost || !rtcHostAuctionSnapshot || !game?.currentRound) return;
    const roundNo = Number(rtcHostAuctionSnapshot.currentRoundNo || 0);
    if (!roundNo) return;
    const snapshot = Object.fromEntries(
      Object.entries(rtcHostAuctionSnapshot.players || {}).map(([playerId, player]: any) => [playerId, Number(player?.spiritStone || 0)])
    );
    const alreadyBroadcast = hostRoundAssetSnapshots[roundNo];
    if (alreadyBroadcast && JSON.stringify(alreadyBroadcast) === JSON.stringify(snapshot)) return;
    setHostRoundAssetSnapshots((prev) => ({ ...prev, [roundNo]: snapshot }));
    if (rtcPeerCount > 0 && selfId) {
      void sendJsonToPeers(buildStartNextRoundEnvelope({
        round: Math.max(0, roundNo - 1),
        nextRound: roundNo,
        hostPlayerId: selfId,
        assetsSnapshot: snapshot,
        timestamp: Date.now(),
      }));
    }
  }, [isHost, rtcHostAuctionSnapshot?.currentRoundNo, rtcHostAuctionSnapshot?.players, rtcPeerCount, selfId, game?.currentRound, hostRoundAssetSnapshots, sendJsonToPeers]);

  useEffect(() => {
    if (!isHost || !rtcHostAuctionSnapshot || !displayedGameCurrentRoundNo || !game) return;
    const round = rtcHostAuctionSnapshot.rounds?.[displayedGameCurrentRoundNo];
    if (!round || round.phase !== "settlement") return;
    const watchedRoundNo = displayedGameCurrentRoundNo;
    const timer = window.setInterval(() => {
      setRtcHostAuctionSnapshot((prev) => {
        const next = cloneHostAuctionSnapshot(prev);
        if (!next) return prev;
        if (next.currentRoundNo !== watchedRoundNo) return prev;
        const currentHostRound = next.rounds?.[watchedRoundNo];
        if (!currentHostRound || currentHostRound.phase !== "settlement") return prev;
        const activePlayerIds = Object.keys(next.players).filter((playerId) => prepPlayersMap[playerId]?.connected !== false);
        const activeReady = activePlayerIds.length > 0 && activePlayerIds.every((playerId) => Boolean(currentHostRound.settlementReadyByPlayer?.[playerId]));
        if (activeReady) {
          currentHostRound.allReadyCountdownAt = currentHostRound.allReadyCountdownAt || Date.now();
        }
        const now = Date.now();
        const allReadyReached = Boolean(currentHostRound.allReadyCountdownAt && now >= currentHostRound.allReadyCountdownAt);
        const forceReached = Boolean(currentHostRound.forceNextAt && now >= currentHostRound.forceNextAt);
        if (!allReadyReached && !forceReached) return prev;
        const nextRoundNo = watchedRoundNo + 1;
        advanceHostAuctionToNextRound({ snapshot: next, nextRoundNo });
        if (rtcPeerCount > 0) sendJsonToPeers(buildRtcGameStateEnvelope(next));
        return next;
      });
    }, 250);
    return () => window.clearInterval(timer);
  }, [isHost, rtcHostAuctionSnapshot, displayedGameCurrentRoundNo, game, rtcPeerCount, sendJsonToPeers]);

  useEffect(() => {
    if (!isHost || !hostCurrentRoundSnapshot || hostCurrentRoundSnapshot.phase !== "action" || !currentRound?.roundNo) return;
    if (!hostCurrentRoundSnapshot.actionDeadlineAt) return;
    const watchedRoundNo = Number(currentRound.roundNo || 0);
    const watchedBidRound = Number(hostCurrentRoundSnapshot.currentBidRound || currentBidRound || 1);
    const timer = window.setInterval(() => {
      if (Date.now() < Number(hostCurrentRoundSnapshot.actionDeadlineAt || 0)) return;
      setRtcHostAuctionSnapshot((prev) => {
        const next = cloneHostAuctionSnapshot(prev);
        if (!next) return prev;
        const round = next.rounds?.[watchedRoundNo];
        if (!round || round.phase !== "action") return prev;
        const activeIds = (round.activePlayerIds?.length ? round.activePlayerIds : Object.keys(next.players)).filter((playerId) => {
          const prep = prepPlayersMap[playerId];
          return prep?.connected !== false;
        });
        activeIds.forEach((playerId) => {
          const record = round.bidRounds?.[watchedBidRound]?.[playerId];
          if (!Object.prototype.hasOwnProperty.call(record || {}, "amount")) {
            applyHostAuctionBid({ snapshot: next, roundNo: watchedRoundNo, bidRound: watchedBidRound, playerId, amount: 0 });
            void sendJsonToPeers(buildActionBidEnvelope({
              actionId: createAuctionActionId("timeout_zero", watchedRoundNo, watchedBidRound, playerId),
              type: "ACTION_BID",
              round: watchedRoundNo,
              turn: watchedBidRound,
              playerId,
              amount: 0,
              timestamp: Date.now(),
            }));
          }
        });
        return next;
      });
    }, 250);
    return () => window.clearInterval(timer);
  }, [isHost, hostCurrentRoundSnapshot, currentRound?.roundNo, currentBidRound, prepPlayersMap, sendJsonToPeers]);

  useEffect(() => {
    if (!settlement || !viewer?.completed || !currentRound?.roundNo || !game) return;
    const roundNo = Number(currentRound.roundNo || 0);
    const activePlayers = (displayedRoomPlayers || []).filter((player: any) => player.connected !== false);
    const readyCount = activePlayers.filter((player: any) => {
      if (player.id === selfId) return Boolean(frontSettlementUiByRound[settlementRoundKey]?.readyForNextRound || viewer?.readyForNextRound);
      return Boolean(hostCurrentRoundSnapshot?.settlementReadyByPlayer?.[player.id]);
    }).length;
    if (!activePlayers.length || readyCount < activePlayers.length) return;
    const readyMap = clientAuctionStateByRound[roundNo]?.readyNextByPlayer || {};
    const activeReadyPayloads = activePlayers.map((player: any) => readyMap[player.id]).filter(Boolean);
    const hashSet = new Set(activeReadyPayloads.map((item: any) => item.assetsHash).filter(Boolean));
    if (activeReadyPayloads.length < activePlayers.length || hashSet.size > 1) return;
    if (isHost) {
      setRtcHostAuctionSnapshot((prev) => {
        const next = cloneHostAuctionSnapshot(prev);
        if (!next) return prev;
        const currentHostRound = next.rounds?.[roundNo];
        if (!currentHostRound) return prev;
        currentHostRound.allReadyCountdownAt = Date.now();
        return next;
      });
    }
  }, [settlement, viewer?.completed, currentRound?.roundNo, game?.id, displayedRoomPlayers, selfId, frontSettlementUiByRound, settlementRoundKey, hostCurrentRoundSnapshot, isHost, clientAuctionStateByRound]);

  useEffect(() => {
    const gameId = game?.id || room?.roomId || "";
    const roundId = currentRound?.id || "";
    const playerId = selfId || "";
    if (!gameId || !roundId || !playerId) {
      setFrontHintCacheByRound({});
    }
  }, [game?.id, currentRound?.id, selfId, room?.roomId]);

  const frontUsedToolIdByRound = useMemo(
    () => Object.fromEntries(Object.entries(frontHintCacheByRound).flatMap(([roundNo, entry]) => entry?.usedToolId ? [[Number(roundNo), entry.usedToolId]] : [])) as Record<number, string>,
    [frontHintCacheByRound]
  );

  useNowTicker(Boolean(currentRound?.auction?.deadlineAt || settlement?.allReadyCountdownAt || settlement?.forceNextAt));

  const actionCountdown = (hostCurrentRoundSnapshot?.actionDeadlineAt || currentRound?.auction?.deadlineAt)
    ? Math.max(0, Math.ceil((((hostCurrentRoundSnapshot?.actionDeadlineAt || currentRound?.auction?.deadlineAt) as number) - Date.now()) / 1000))
    : 0;
  const allReadyCountdown = (hostCurrentRoundSnapshot?.allReadyCountdownAt || settlement?.allReadyCountdownAt)
    ? Math.max(0, Math.ceil((((hostCurrentRoundSnapshot?.allReadyCountdownAt || settlement?.allReadyCountdownAt) as number) - Date.now()) / 1000))
    : 0;
  const forceCountdown = (hostCurrentRoundSnapshot?.forceNextAt || settlement?.forceNextAt)
    ? Math.max(0, Math.ceil((((hostCurrentRoundSnapshot?.forceNextAt || settlement?.forceNextAt) as number) - Date.now()) / 1000))
    : 0;

  useEffect(() => {
    if (!rtcPeerCount || !isHost || !isActionPhase) return;
    if (lastSentRtcBidRoundRef.current === currentBidRound) return;
    lastSentRtcBidRoundRef.current = currentBidRound;
    sendJsonToPeers(buildRtcRoundEnvelope({ bidRound: currentBidRound }));
  }, [rtcPeerCount, isHost, isActionPhase, currentBidRound, sendJsonToPeers]);

  useEffect(() => {
    if (!rtcPeerCount || !isHost || !settlement || !currentRound?.roundNo) return;
    if (lastSentRtcSettlementRoundRef.current === currentRound.roundNo) return;
    lastSentRtcSettlementRoundRef.current = currentRound.roundNo;
    sendJsonToPeers(buildRtcSettlementEnvelope({ roundNo: currentRound.roundNo, phase: "settlement" }));
  }, [rtcPeerCount, isHost, settlement, currentRound?.roundNo, sendJsonToPeers]);

  const catalogById = useMemo(() => {
    const map = new Map<string, any>();
    (catalog || []).forEach((item: any) => map.set(item.id, item));
    return map;
  }, [catalog]);

  const frontRoundBagKey = useMemo(() => {
    if (!game?.id || !displayedGameCurrentRoundNo) return "";
    return `${game.id}_${displayedGameCurrentRoundNo}`;
  }, [game?.id, displayedGameCurrentRoundNo]);

  const frontRoundBag = useMemo(() => {
    if (!frontRoundBagKey || !catalog.length || !effectiveRoomSettings) return null;
    if (frontRoundBagCache[frontRoundBagKey]) return frontRoundBagCache[frontRoundBagKey];
    return generateFrontRoundBag({
      gameId: game?.id || room?.roomId || "game",
      roundNo: displayedGameCurrentRoundNo || 1,
      settings: effectiveRoomSettings,
      catalog,
    });
  }, [frontRoundBagKey, frontRoundBagCache, catalog, effectiveRoomSettings, game?.id, room?.roomId, displayedGameCurrentRoundNo]);

  useEffect(() => {
    if (!frontRoundBagKey || !frontRoundBag) return;
    if (frontRoundBagCache[frontRoundBagKey]) return;
    setFrontRoundBagCache((prev: any) => {
      const next = { ...prev, [frontRoundBagKey]: frontRoundBag };
      return next;
    });
  }, [frontRoundBagKey, frontRoundBag, frontRoundBagCache]);

  if (currentRound && frontRoundBag?.realm && !currentRound.realm) {
    currentRound = { ...currentRound, realm: frontRoundBag.realm, targetCells: frontRoundBag.targetCells || currentRound.targetCells };
  }

  useEffect(() => {
    if (!isHost || !currentRound?.roundNo || !room?.players?.length) return;
    const existing = rtcHostAuctionSnapshot?.rounds?.[currentRound.roundNo];
    if (existing) return;
    const next = cloneHostAuctionSnapshot(rtcHostAuctionSnapshot) || createHostAuctionSnapshot({
      gameId: game?.id || room?.roomId || "local_game",
      currentRoundNo: currentRound.roundNo,
      totalRounds: game?.totalRounds || effectiveRoomSettings.totalRounds || FRONT_DEFAULT_SETTINGS.totalRounds,
      status: game?.status || "进行中",
      players: (room?.players || []).map((player: any) => ({
        id: player.id,
        name: player.name,
        spiritStone: player.spiritStone,
        roleId: player.roleId,
      })),
    });
    ensureHostAuctionRound(next, currentRound.roundNo);
    setRtcHostAuctionSnapshot(next);
    if (rtcPeerCount > 0) sendJsonToPeers(buildRtcGameStateEnvelope(next));
  }, [isHost, currentRound?.roundNo, room?.players, rtcHostAuctionSnapshot, game?.id, room?.roomId, rtcPeerCount, sendJsonToPeers]);

  useEffect(() => {
    if (!isHost || !rtcHostAuctionSnapshot || !currentRound?.roundNo || !frontRoundBag) return;
    if (rtcHostAuctionSnapshot.currentRoundNo !== currentRound.roundNo) return;
    const round = rtcHostAuctionSnapshot.rounds[currentRound.roundNo];
    if (!round || round.phase !== "action") return;
    const bidRound = round.currentBidRound || currentBidRound || 1;
    const bidMap = round.bidRounds?.[bidRound] || {};
    const activeIds = (round.activePlayerIds?.length ? round.activePlayerIds : Object.keys(rtcHostAuctionSnapshot.players)).filter((playerId) => Boolean(playerId) && prepPlayersMap[playerId]?.connected !== false);
    const submittedCount = activeIds.filter((playerId) => Object.prototype.hasOwnProperty.call(bidMap[playerId] || {}, "amount")).length;
    if (submittedCount < activeIds.length) return;
    const resolveKey = `${currentRound.roundNo}_${bidRound}_${submittedCount}_${activeIds.length}`;
    if (lastResolvedRtcAuctionKeyRef.current === resolveKey) return;
    lastResolvedRtcAuctionKeyRef.current = resolveKey;

    const next = cloneHostAuctionSnapshot(rtcHostAuctionSnapshot);
    if (!next) return;
    resolveHostAuctionBidRound({
      snapshot: next,
      roundNo: currentRound.roundNo,
      multipliers: effectiveRoomSettings.multipliers || [2, 1.6, 1.4, 1.2, 1],
    });
    if (next.rounds[currentRound.roundNo]?.phase === "settlement") {
      applyHostAuctionSettlement({
        snapshot: next,
        roundNo: currentRound.roundNo,
        bagValue: frontRoundBag.placedItems.reduce((sum: number, item: any) => sum + (item.price || 0), 0),
        entryFee: Number(effectiveRoomSettings.entryFee || 0),
      });
    }
    setRtcHostAuctionSnapshot(next);
    if (rtcPeerCount > 0) sendJsonToPeers(buildRtcGameStateEnvelope(next));
  }, [
    isHost,
    rtcHostAuctionSnapshot,
    currentRound?.roundNo,
    currentBidRound,
    frontRoundBag,
    effectiveRoomSettings.multipliers,
    effectiveRoomSettings.entryFee,
    rtcPeerCount,
    sendJsonToPeers,
  ]);

  const resolvedPlacedItems = useMemo(() => {
    return (frontRoundBag?.placedItems || []).map((item: any) => ({
      ...catalogById.get(item.id),
      ...item,
    }));
  }, [frontRoundBag?.placedItems, catalogById]);

  useEffect(() => {
    if (!currentRound || !selfId || settlement) return;
    if (frontHintCacheByRound[currentBidRound]) return;
    const gameId = game?.id || room?.roomId || "game";
    const roundId = currentRound.id || `round_${game?.currentRound || 1}`;
    const prevAggregated = aggregateFrontHintCache(frontHintCacheByRound, currentBidRound - 1);
    const systemResult = computeFrontSystemHint({
      gameId,
      roundId,
      bidRound: currentBidRound,
      hintRounds: room?.settings?.hintRounds || [],
      tools: (toolList || []) as HintTool[],
      items: resolvedPlacedItems,
      baseIntel: prevAggregated.intel,
    });
    const afterSystemIntel = mergeIntel(prevAggregated.intel, systemResult.intel);
    const roleResult = computeFrontRoleHint({
      gameId,
      roundId,
      playerId: selfId,
      role: selfRole || null,
      bidRound: currentBidRound,
      items: resolvedPlacedItems,
      baseIntel: afterSystemIntel,
    });
    setFrontHintCacheByRound((prev) => ({
      ...prev,
      [currentBidRound]: {
        intel: mergeIntel(systemResult.intel || createEmptyIntel(), roleResult.intel || createEmptyIntel()),
        systemHints: systemResult.text ? [systemResult.text] : [],
        skillHints: roleResult.text ? [roleResult.text] : [],
        toolHints: prev[currentBidRound]?.toolHints || [],
        usedToolId: prev[currentBidRound]?.usedToolId,
      },
    }));
  }, [currentRound?.id, currentBidRound, selfId, settlement, game?.id, game?.currentRound, room?.roomId, room?.settings?.hintRounds, toolList, resolvedPlacedItems, selfRole, frontHintCacheByRound]);

  const currentSettlementRevealOrder = useMemo(() => {
    if (!settlement) return [] as any[];
    return frontRoundBag?.revealOrder || settlement.revealOrder || [];
  }, [settlement, frontRoundBag, settlement?.revealOrder]);

  const settlementVisibleItems = useMemo(() => {
    if (!settlement || !viewer) return [] as any[];
    const revealIndex = Math.max(0, Math.min(localRevealIndex, currentSettlementRevealOrder.length));
    const ids = new Set(currentSettlementRevealOrder.slice(0, revealIndex).map((it: any) => it.placedId));
    return resolvedPlacedItems.filter((it: any) => ids.has(it.placedId));
  }, [settlement, viewer, localRevealIndex, currentSettlementRevealOrder, resolvedPlacedItems]);

  const settlementRunningValue = useMemo(() => {
    return settlementVisibleItems.reduce((sum: number, it: any) => sum + (it.price || 0), 0);
  }, [settlementVisibleItems]);

  const settlementRunningProfit = useMemo(() => {
    if (!settlement) return 0;
    return settlementRunningValue - (settlement.winningBid || 0);
  }, [settlementRunningValue, settlement]);

  const frontReplayResult = useMemo(
    () => aggregateFrontHintCache(frontHintCacheByRound, currentBidRound || currentRound?.auction?.logs?.length || 0),
    [frontHintCacheByRound, currentBidRound, currentRound?.auction?.logs?.length]
  );

  const usedToolId = frontUsedToolIdByRound[currentBidRound] || "";
  const usedToolHistory = new Set<string>(Object.values(frontUsedToolIdByRound).filter(Boolean) as string[]);
  const hasSubmittedBidThisRound = hostCurrentRoundSnapshot
    ? Object.prototype.hasOwnProperty.call(hostCurrentRoundSnapshot.bidRounds?.[currentBidRound]?.[selfId || ""] || {}, "amount") || Boolean(localPendingAction.bidSubmitted)
    : Boolean(currentRound?.auction?.submittedIds?.includes(selfId));
  const hasUsedToolThisRound = Boolean(usedToolId || localPendingAction.toolUsed);

  useEffect(() => {
    setLocalPendingActionByRound((prev) => {
      const next: Record<string, { bidSubmitted?: boolean; toolUsed?: boolean }> = {};
      const current = prev[actionRoundKey] || {};
      const syncedBid = Object.prototype.hasOwnProperty.call(hostCurrentRecord || {}, "amount");
      const syncedTool = Boolean(hostCurrentRecord?.toolId) || Boolean(usedToolId);
      const nextCurrent = {
        bidSubmitted: syncedBid ? false : Boolean(current.bidSubmitted),
        toolUsed: syncedTool ? false : Boolean(current.toolUsed),
      };
      if (nextCurrent.bidSubmitted || nextCurrent.toolUsed) next[actionRoundKey] = nextCurrent;
      const changed = JSON.stringify(prev) !== JSON.stringify(next);
      return changed ? next : prev;
    });
  }, [actionRoundKey, hostCurrentRecord, usedToolId]);

  const mergedIntel = useMemo(() => frontReplayResult.intel || createEmptyIntel(), [frontReplayResult]);

  const visibleSystemHints = useMemo(() => frontReplayResult.systemHints || [], [frontReplayResult]);

  const visibleSkillHints = useMemo(() => frontReplayResult.skillHints || [], [frontReplayResult]);

  const visibleToolHints = useMemo(() => frontReplayResult.toolHints || [], [frontReplayResult]);

  const lowestEstimatedBagValue = useMemo(() => {
    if (!currentRound || settlement) return 0;
    const allItems = resolvedPlacedItems;
    const intel = mergedIntel || {};
    const knownItemIds = new Set([...(intel.knownItemIds || [])]);
    const knownContours = new Set([...(intel.knownContours || [])]);
    const knownTypeIds = new Set(intel.knownTypeItemIds || []);
    const qualityByItemId = new Map<string, string>();
    (intel.knownQualityCells || []).forEach((cell: any) => {
      const matchedItem = allItems.find((it: any) => it.placedId === cell.itemPlacedId);
      if (!matchedItem?.quality) return;
      qualityByItemId.set(cell.itemPlacedId, matchedItem.quality);
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
  }, [currentRound, settlement, catalog, resolvedPlacedItems, mergedIntel]);

  const bagSummaryText = settlement ? `总价值：${settlementRunningValue}` : `最低预估：${lowestEstimatedBagValue}`;

  const filteredCatalog = useMemo(() => {
    if (!showCodex) return [] as any[];
    const result = catalog.filter((item: any) => {
      if (catalogFocusItemId) return item.id === catalogFocusItemId;
      if (catalogFilter.type !== "全部" && item.type !== catalogFilter.type) return false;
      if (catalogFilter.quality !== "全部" && item.quality !== catalogFilter.quality) return false;
      if (catalogFilter.shape !== "全部" && item.shape !== catalogFilter.shape) return false;
      if (item.price < catalogFilter.min || item.price > catalogFilter.max) return false;
      return true;
    });
    const qualityIndex = new Map(QUALITIES.map((q, idx) => [q, idx]));
    const directionFactor = catalogSort.direction === "asc" ? 1 : -1;
    return [...result].sort((a: any, b: any) => {
      let primary = 0;
      if (catalogSort.key === "type") {
        primary = String(a.type).localeCompare(String(b.type), "zh-Hans-CN");
      } else if (catalogSort.key === "name") {
        primary = String(a.name).localeCompare(String(b.name), "zh-Hans-CN");
      } else if (catalogSort.key === "quality") {
        primary = (qualityIndex.get(a.quality) ?? 999) - (qualityIndex.get(b.quality) ?? 999);
      } else if (catalogSort.key === "shape") {
        primary = String(a.shape).localeCompare(String(b.shape), "zh-Hans-CN");
      } else if (catalogSort.key === "size") {
        primary = (a.size || 0) - (b.size || 0);
      } else if (catalogSort.key === "price") {
        primary = (a.price || 0) - (b.price || 0);
      }
      if (primary !== 0) return primary * directionFactor;

      const typeCompare = String(a.type).localeCompare(String(b.type), "zh-Hans-CN");
      if (typeCompare !== 0) return typeCompare;
      const qualityCompare = (qualityIndex.get(a.quality) ?? 999) - (qualityIndex.get(b.quality) ?? 999);
      if (qualityCompare !== 0) return qualityCompare;
      const sizeCompare = (a.size || 0) - (b.size || 0);
      if (sizeCompare !== 0) return sizeCompare;
      const priceCompare = (a.price || 0) - (b.price || 0);
      if (priceCompare !== 0) return priceCompare;
      return String(a.name).localeCompare(String(b.name), "zh-Hans-CN");
    });
  }, [showCodex, catalog, catalogFocusItemId, catalogFilter.type, catalogFilter.quality, catalogFilter.shape, catalogFilter.min, catalogFilter.max, catalogSort]);

  const revealedPlacedIds = useMemo(() => {
    if (!settlement || !viewer) return new Set<string>();
    return new Set(currentSettlementRevealOrder.slice(0, localRevealIndex).map((it: any) => it.placedId));
  }, [settlement, viewer, localRevealIndex, currentSettlementRevealOrder]);

  const qualityCellMap = useMemo(() => {
    const map = new Map<string, any>();
    if (!mergedIntel?.knownQualityCells) return map;
    mergedIntel.knownQualityCells.forEach((cell: any) => {
      map.set(cell.itemPlacedId, cell);
    });
    return map;
  }, [mergedIntel?.knownQualityCells]);

  const visiblePlacedItems = useMemo(() => {
    if (!currentRound) return [] as any[];
    if (settlement) {
      return settlementVisibleItems.map((item: any) => ({ ...item, viewMode: "item", knownQuality: true, knownType: true, qualityCell: null }));
    }
    const intel = mergedIntel || { knownItemIds: [], knownContours: [], knownTypeItemIds: [] };
    return resolvedPlacedItems.flatMap((item: any) => {
      const knownItem = revealedPlacedIds.has(item.placedId) || intel.knownItemIds.includes(item.placedId);
      const knownContour = intel.knownContours.includes(item.placedId);
      const qualityCell = qualityCellMap.get(item.placedId) || null;
      const knownQuality = Boolean(qualityCell);
      const knownType = intel.knownTypeItemIds?.includes(item.placedId);
      if (knownItem) return [{ ...item, viewMode: "item", knownQuality: true, knownType: true, qualityCell }];
      if (knownContour) return [{ ...item, viewMode: "contour", knownQuality, knownType, qualityCell }];
      return [];
    });
  }, [currentRound, revealedPlacedIds, settlement, settlementVisibleItems, qualityCellMap, mergedIntel]);

  const visibleItemIds = useMemo(() => new Set(visiblePlacedItems.filter((it: any) => it.viewMode === "item").map((it: any) => it.placedId)), [visiblePlacedItems]);

  const contourItemIds = useMemo(() => new Set(visiblePlacedItems.filter((it: any) => it.viewMode === "contour").map((it: any) => it.placedId)), [visiblePlacedItems]);

  const visibleQualityCells = useMemo(() => {
    if (settlement) return [] as any[];
    if (!mergedIntel?.knownQualityCells?.length) return [] as any[];
    const knownTypeIds = new Set(mergedIntel?.knownTypeItemIds || []);
    return (mergedIntel?.knownQualityCells || [])
      .filter((cell: any) => !visibleItemIds.has(cell.itemPlacedId) && !contourItemIds.has(cell.itemPlacedId))
      .map((cell: any) => {
        const matchedItem = resolvedPlacedItems.find((it: any) => it.placedId === cell.itemPlacedId);
        return {
          ...cell,
          quality: matchedItem?.quality,
          type: knownTypeIds.has(cell.itemPlacedId) ? matchedItem?.type : null,
        };
      })
      .filter((cell: any) => cell.quality);
  }, [currentRound, visibleItemIds, contourItemIds, settlement, resolvedPlacedItems, mergedIntel]);

  useEffect(() => {
    if (usedToolId) setSelectedTool(toolList.find((t: any) => t.id === usedToolId) || null);
    else setSelectedTool(null);
  }, [usedToolId, toolList]);

  useEffect(() => {
    localRevealIndexRef.current = localRevealIndex;
  }, [localRevealIndex]);

  const settlementKey = settlement ? `${currentRound?.id || ""}_${selfId || ""}` : null;

  const frontRoundsWithBags = useMemo(() => {
    if (!game?.rounds?.length || !catalog.length) return [] as any[];
    return game.rounds.map((round: any) => {
      const key = `${game.id}_${round.roundNo}`;
      const rawBag = frontRoundBagCache[key] || generateFrontRoundBag({
        gameId: game.id,
        roundNo: round.roundNo,
        settings: effectiveRoomSettings,
        catalog,
      });
      const placedItems = (rawBag?.placedItems || []).map((item: any) => ({
        ...catalogById.get(item.id),
        ...item,
      }));
      const placedMap = new Map(placedItems.map((item: any) => [item.placedId, item]));
      const revealOrder = (rawBag?.revealOrder || [])
        .map((entry: any) => placedMap.get(entry.placedId))
        .filter(Boolean);
      return {
        ...round,
        realm: rawBag.realm,
        targetCells: rawBag.targetCells,
        placedItems,
        settlement: round.settlement
          ? {
              ...round.settlement,
              revealOrder,
              totalValue: placedItems.reduce((sum: number, item: any) => sum + (item.price || 0), 0),
              profit: placedItems.reduce((sum: number, item: any) => sum + (item.price || 0), 0) - (round.settlement.winningBid || 0),
            }
          : null,
      };
    });
  }, [game?.rounds, game?.id, catalog, effectiveRoomSettings, frontRoundBagCache, catalogById]);

  const latestResult = useFrontGameResult({
    game,
    room,
    toolList,
    frontRoundsWithBags,
    frontGameResultCache,
    setFrontGameResultCache,
  });

  useEffect(() => {
    const result = latestResult;
    if (!result) {
      setStatsAutoOpenedKey(null);
      return;
    }
    const canOpenStatsNow = Boolean((game?.status === "已完成" || isFinalRound) && viewer?.completed);
    const resultKey = `${result.gameId}_${selfId || "unknown"}`;
    if (canOpenStatsNow && statsAutoOpenedKey !== resultKey) {
      setShowCodex(false);
      setShowStatsModal(true);
      setStatsAutoOpenedKey(resultKey);
    }
  }, [latestResult, game?.status, isFinalRound, viewer?.completed, selfId, statsAutoOpenedKey]);

  const lastSettlementKeyRef = useRef<string | null>(null);

  useEffect(() => {
    if (!settlement || !viewer) {
      setLocalRevealIndex(0);
      lastSettlementKeyRef.current = null;
      return;
    }
    if (frontSettlement && settlementRoundKey) {
      const ui = frontSettlementUiByRound[settlementRoundKey] || { mode: "delay" as const, completed: false, readyForNextRound: false };
      if (ui.mode === "instant") {
        setLocalRevealIndex(currentSettlementRevealOrder.length);
        return;
      }
    }
    const total = currentSettlementRevealOrder.length;
    const currentKey = settlementKey;
    const isNewSettlement = currentKey !== lastSettlementKeyRef.current;

    if (isNewSettlement) {
      lastSettlementKeyRef.current = currentKey;
      setLocalRevealIndex(viewer.mode === "instant" || viewer.completed ? total : 0);
      if (frontSettlement && settlementRoundKey) {
        setFrontSettlementUiByRound((prev) => ({
          ...prev,
          [settlementRoundKey]: {
            mode: "delay",
            completed: false,
            readyForNextRound: false,
          },
        }));
      }
    }

    if (viewer.mode === "instant") {
      setLocalRevealIndex(total);
      return;
    }

    if (viewer.completed && localRevealIndexRef.current >= total) {
      return;
    }

    if (!total) {
      return;
    }

    const timer = window.setInterval(() => {
      setLocalRevealIndex((prev) => {
        const next = Math.min(total, prev + 1);
        if (next >= total) {
          window.clearInterval(timer);
          if (frontSettlement && settlementRoundKey) {
            setFrontSettlementUiByRound((prev) => ({
              ...prev,
              [settlementRoundKey]: {
                ...(prev[settlementRoundKey] || { mode: "delay", completed: false, readyForNextRound: false }),
                completed: true,
                readyForNextRound: true,
              },
            }));
            if (currentRound?.roundNo && selfId) {
              const roundNo = Number(currentRound.roundNo || 0);
              const roundActions = clientAuctionStateByRound[roundNo]?.actions || [];
              const assetsSnapshot = hostRoundAssetSnapshots[roundNo] || Object.fromEntries(
                (displayedRoomPlayers || []).map((player: any) => [player.id, Number(player.spiritStone || 0)])
              );
              const assetsHash = buildAssetsHash(assetsSnapshot);
              setClientAuctionStateByRound((prev) => ({
                ...prev,
                [roundNo]: {
                  ...(prev[roundNo] || {
                    roundNo,
                    currentTurn: Number(currentBidRound || 1),
                    actions: [],
                    readyNextByPlayer: {},
                    startNextPayload: null,
                    forceStartPayload: null,
                  }),
                  readyNextByPlayer: {
                    ...((prev[roundNo]?.readyNextByPlayer) || {}),
                    [selfId]: {
                      round: roundNo,
                      playerId: selfId,
                      assetsHash,
                      actionIds: roundActions.map((action: any) => action.actionId),
                      timestamp: Date.now(),
                    },
                  },
                },
              }));
              if (rtcPeerCount > 0) {
                void sendJsonToPeers({
                  type: "READY_NEXT",
                  payload: {
                    round: roundNo,
                    playerId: selfId,
                    assetsHash,
                    actionIds: roundActions.map((action: any) => action.actionId),
                    timestamp: Date.now(),
                  },
                });
              }
              if (isHost) {
                processGameEnvelopeAsHost(
                  buildRtcGameReadyNextEnvelope({ roundNo: currentRound.roundNo, playerId: selfId, ready: true }),
                  selfId
                );
              } else if (rtcPeerCount > 0) {
                sendJsonToPeers(buildRtcGameReadyNextEnvelope({ roundNo: currentRound.roundNo, playerId: selfId, ready: true }));
              }
            }
          }
        }
        return next;
      });
    }, settlement.stepMs || 320);
    return () => window.clearInterval(timer);
  }, [settlementKey, settlement?.stepMs, currentSettlementRevealOrder, viewer?.mode, viewer?.completed, currentRound?.roundNo, selfId, rtcPeerCount, sendJsonToPeers]);

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

  function persistIdentity(name: string) {
    localStorage.setItem("player_name", name);
  }

  function clearIdentityAndRoom() {
    resetFrontOwnedGameState();
    localStorage.removeItem("room_id");
    if (joinTimeoutRef.current) {
      window.clearTimeout(joinTimeoutRef.current);
      joinTimeoutRef.current = null;
    }
    setIsJoiningRoom(false);
    setRoomJoinPassword("");
    setLocalRoomState(null);
    setPendingLocalRoomState(null);
    setState(null);
    setJoinRoomId("");
    setSelectedTool(null);
    setShowToolPicker(false);
    setShowToolConfirm(false);
    setBidInput("");
    setChatMessages([]);
    setPrepPlayersMap({});
    setAuthoritativeMemberList([]);
    try {
      leaveTrysteroRoom();
    } catch {
      // noop
    }
    void lobby.queryRooms();
  }

  function leaveRoom() {
    audio.click();
    const leavingRoomId = localRoomState?.roomId || pendingLocalRoomState?.roomId || "";
    try {
      leaveTrysteroRoom();
    } catch {
      // noop
    }
    setPrepPlayersMap({});
    if (leavingRoomId) {
      setRoomList((prev) => prev.filter((room: any) => room.roomId !== leavingRoomId));
    }
    clearIdentityAndRoom();
  }

  function createRoom() {
    audio.click();
    resetFrontOwnedGameState();
    if (!playerName.trim()) {
      setUiDialog({ title: "无法创建房间", message: "请先填写道号。" });
      return;
    }
    setRoomJoinPassword(password || "");
    persistIdentity(playerName.trim());
    const nextRoomId = generateTrysteroShortRoomId();
    const selfPeerId = trysteroSelfId;
    localStorage.setItem("room_id", nextRoomId);
    setJoinRoomId(nextRoomId);
    const nextRoom = buildLocalRoomStateFromPeers({
      roomId: nextRoomId,
      ownerPeerId: selfPeerId,
      selfPeerId,
      peers: [{ peerId: selfPeerId, name: playerName.trim(), isHost: true }],
      settings: settingsForm,
      previousPlayers: localRoomState?.players,
    });
    setRoomList((prev) => prev.filter((room: any) => room.ownerPeerId !== selfPeerId || room.roomId === nextRoomId));
    setPrepPlayersMap({
      [selfPeerId]: {
        id: selfPeerId,
        name: playerName.trim(),
        ready: false,
        roleId: nextRoom.players[0]?.roleId || FRONT_ROLES[0].id,
        isHost: true,
        connected: true,
        spiritStone: Number(settingsForm.initialSpiritStone || FRONT_DEFAULT_SETTINGS.initialSpiritStone),
      },
    });
    setAuthoritativeMemberList([{ playerId: selfPeerId, name: playerName.trim(), isHost: true, joinedAt: Date.now() }]);
    setPendingLocalRoomState(nextRoom);
    setLocalRoomState(nextRoom);
  }

  async function joinRoom(targetRoomId?: string) {
    if (isJoiningRoom) {
      setUiDialog({ title: "正在加入房间", message: "当前正在连接一个房间，请等待连接完成或超时后再尝试其他房间。" });
      return;
    }
    audio.click();
    resetFrontOwnedGameState();
    const finalRoomId = (targetRoomId || joinRoomId).trim().toUpperCase();
    if (!playerName.trim()) {
      setUiDialog({ title: "无法加入房间", message: "请先填写道号。" });
      return;
    }
    if (!finalRoomId) {
      setUiDialog({ title: "无法加入房间", message: "请输入房间ID。" });
      return;
    }
    const targetRoom = roomList.find((entry: any) => String(entry.roomId || "").toUpperCase() === finalRoomId);
    const ownerPeerId = String(targetRoom?.ownerPeerId || "");
    if (!ownerPeerId) {
      setUiDialog({ title: "无法加入房间", message: "未在大厅中找到该房间或房主已离线。" });
      return;
    }
    const attemptId = joinAttemptRef.current + 1;
    joinAttemptRef.current = attemptId;
    if (joinTimeoutRef.current) {
      window.clearTimeout(joinTimeoutRef.current);
      joinTimeoutRef.current = null;
    }
    setIsJoiningRoom(true);
    setRoomJoinPassword(password);
    joinTimeoutRef.current = window.setTimeout(() => {
      if (joinAttemptRef.current !== attemptId) return;
      setIsJoiningRoom(false);
      setPendingLocalRoomState(null);
      setAuthoritativeMemberList([]);
      setPrepPlayersMap({});
      setRoomJoinPassword("");
      setUiDialog({ title: "加入房间超时", message: "连接房间超时，请确认房主在线、密码正确后重试。" });
    }, 8000);
    persistIdentity(playerName.trim());
    const selfPeerId = trysteroSelfId;
    const nextRoom = buildLocalRoomStateFromPeers({
      roomId: finalRoomId,
      ownerPeerId,
      selfPeerId,
      peers: [
        { peerId: ownerPeerId, name: targetRoom?.ownerName || "房主", isHost: true },
        { peerId: selfPeerId, name: playerName.trim(), isHost: false },
      ],
      settings: settingsForm,
      previousPlayers: localRoomState?.players,
    });
    const normalizedJoinPlayers = nextRoom.players.map((player) => ({
      ...player,
      roleId: FRONT_ROLES[0].id,
    }));
    const normalizedJoinRoom = {
      ...nextRoom,
      players: normalizedJoinPlayers,
      roleSelections: { [FRONT_ROLES[0].id]: normalizedJoinPlayers.map((player) => player.id) },
    };
    if (joinAttemptRef.current !== attemptId) return;
    setPrepPlayersMap({
      [ownerPeerId]: {
        id: ownerPeerId,
        name: targetRoom?.ownerName || "房主",
        ready: false,
        roleId: FRONT_ROLES[0].id,
        isHost: true,
        connected: false,
        spiritStone: Number(settingsForm.initialSpiritStone || FRONT_DEFAULT_SETTINGS.initialSpiritStone),
      },
      [selfPeerId]: {
        id: selfPeerId,
        name: playerName.trim(),
        ready: false,
        roleId: FRONT_ROLES[0].id,
        isHost: false,
        connected: true,
        spiritStone: Number(settingsForm.initialSpiritStone || FRONT_DEFAULT_SETTINGS.initialSpiritStone),
      },
    });
    setAuthoritativeMemberList([
      { playerId: ownerPeerId, name: targetRoom?.ownerName || "房主", isHost: true, joinedAt: Date.now() - 1 },
      { playerId: selfPeerId, name: playerName.trim(), isHost: false, joinedAt: Date.now() },
    ]);
    localStorage.setItem("room_id", finalRoomId);
    setJoinRoomId(finalRoomId);
    setPendingLocalRoomState(normalizedJoinRoom);
    setLocalRoomState(null);
  }

  function updatePlayer(patch: Record<string, unknown>) {
    setLocalRoomState((prev) => {
      if (!prev || !selfId) return prev;
      const nextPlayers = prev.players.map((player) =>
        player.id === selfId
          ? {
              ...player,
              ...(typeof patch.ready === "boolean" ? { ready: patch.ready } : {}),
              ...(typeof patch.roleId === "string" ? { roleId: patch.roleId } : {}),
            }
          : player
      );
      const nextRoleSelections = nextPlayers.reduce((acc, player) => {
        if (!player.roleId) return acc;
        if (!acc[player.roleId]) acc[player.roleId] = [];
        acc[player.roleId].push(player.id);
        return acc;
      }, {} as Record<string, string[]>);
      return { ...prev, players: nextPlayers, roleSelections: nextRoleSelections };
    });
    if (selfId) {
      const localSelfPlayer = localRoomState?.players?.find((player) => player.id === selfId);
      const resolvedSelfName = String(localSelfPlayer?.name || prepPlayersMap[selfId]?.name || me?.name || playerName || "匿名修士");
      const resolvedSelfRoleId = String(
        (typeof patch.roleId === "string" ? patch.roleId : undefined) ||
        localSelfPlayer?.roleId ||
        prepPlayersMap[selfId]?.roleId ||
        me?.roleId ||
        FRONT_ROLES[0].id
      );
      setPrepPlayersMap((prev) => ({
        ...prev,
        [selfId]: {
          ...(prev[selfId] || {}),
          id: selfId,
          name: resolvedSelfName,
          ready: typeof patch.ready === "boolean" ? patch.ready : Boolean(prev[selfId]?.ready),
          roleId: resolvedSelfRoleId,
          isHost: Boolean(isHost),
          connected: true,
          spiritStone: Number(prev[selfId]?.spiritStone ?? localSelfPlayer?.spiritStone ?? me?.spiritStone ?? effectiveRoomSettings.initialSpiritStone ?? FRONT_DEFAULT_SETTINGS.initialSpiritStone),
          joinedAt: prev[selfId]?.joinedAt,
        },
      }));
      void sendPlayerStatus({
        playerId: selfId,
        name: resolvedSelfName,
        ...(typeof patch.ready === "boolean" ? { ready: patch.ready } : {}),
        roleId: resolvedSelfRoleId,
      });
    }
  }

  function updateRoomSettings(nextSettings?: typeof settingsForm) {
    const finalSettings = nextSettings || settingsForm;
    setSettingsForm(finalSettings);
    if (isHost && selfId) {
      setRtcRoomSettings(finalSettings);
      if (roomSettingsDebounceRef.current) {
        window.clearTimeout(roomSettingsDebounceRef.current);
      }
      roomSettingsDebounceRef.current = window.setTimeout(() => {
        void sendSettingsUpdate(finalSettings);
      }, 160);
    }
  }

  function startFrontGame() {
    if (!isHost || !room || !selfId) return;
    const gameId = `${room.roomId}_${Date.now()}`;
    const playersForGame = (displayedRoomPlayers || []).map((player: any) => ({
      id: player.id,
      name: player.name,
      spiritStone: Number(effectiveRoomSettings.initialSpiritStone || FRONT_DEFAULT_SETTINGS.initialSpiritStone),
      roleId: player.roleId,
    }));
    const initialAssetsSnapshot = Object.fromEntries(
      playersForGame.map((player: any) => [player.id, Number(player.spiritStone || 0)])
    );
    const snapshot = createHostAuctionSnapshot({
      gameId,
      currentRoundNo: 1,
      totalRounds: effectiveRoomSettings.totalRounds || FRONT_DEFAULT_SETTINGS.totalRounds,
      status: "进行中",
      players: playersForGame,
    });
    ensureHostAuctionRound(snapshot, 1);
    setHostRoundAssetSnapshots((prev) => ({ ...prev, 1: initialAssetsSnapshot }));
    setClientAuctionStateByRound({
      1: {
        roundNo: 1,
        currentTurn: 1,
        actions: [],
        readyNextByPlayer: {},
        startNextPayload: {
          round: 0,
          nextRound: 1,
          hostPlayerId: selfId,
          assetsSnapshot: initialAssetsSnapshot,
          timestamp: Date.now(),
        },
        forceStartPayload: null,
      },
    });
    setLocalRoomState((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        players: prev.players.map((player) => ({
          ...player,
          spiritStone: Number(effectiveRoomSettings.initialSpiritStone || FRONT_DEFAULT_SETTINGS.initialSpiritStone),
          bankrupt: false,
          managed: false,
          ready: true,
          stats: {},
        })),
      };
    });
    setRtcHostAuctionSnapshot(snapshot);
    setRtcRoomSettings(settingsForm);
    if (rtcPeerCount > 0) {
      sendJsonToPeers(buildRtcSettingsEnvelope(settingsForm, selfId));
      sendJsonToPeers(buildRtcGameStateEnvelope(snapshot));
      sendJsonToPeers(buildStartNextRoundEnvelope({
        round: 0,
        nextRound: 1,
        hostPlayerId: selfId,
        assetsSnapshot: initialAssetsSnapshot,
        timestamp: Date.now(),
      }));
    }
  }

  function submitBid() {
    audio.click();
    const amount = bidInput === "" ? null : Number(bidInput);
    if (isBankrupt) {
      setUiDialog({ title: "无法参与竞拍", message: "你已破产，无法继续参与竞拍。请等待本局结束。" });
      return;
    }
    if (amount !== null && amount > (me?.spiritStone ?? 0)) {
      setUiDialog({ title: "灵石不足", message: `当前最多只能出价 ${me?.spiritStone ?? 0}。` });
      return;
    }
    if (rtcPeerCount > 0 && selfId && currentRound?.roundNo) {
      setLocalPendingActionByRound((prev) => ({
        ...prev,
        [actionRoundKey]: { ...(prev[actionRoundKey] || {}), bidSubmitted: true },
      }));
      setRtcBidOverlayByRound((prev) => ({
        ...prev,
        [currentBidRound]: { ...(prev[currentBidRound] || {}), [selfId]: amount },
      }));
      sendJsonToPeers(buildRtcBidEnvelope({ playerId: selfId, amount, bidRound: currentBidRound }));
      const actionId = createAuctionActionId("bid", currentRound.roundNo, currentBidRound, selfId);
      const bidEnvelope = buildRtcGameBidEnvelope({
        roundNo: currentRound.roundNo,
        bidRound: currentBidRound,
        playerId: selfId,
        amount,
      });
      sendJsonToPeers(bidEnvelope);
      void sendJsonToPeers(buildActionBidEnvelope({
        actionId,
        type: "ACTION_BID",
        round: currentRound.roundNo,
        turn: currentBidRound,
        playerId: selfId,
        amount,
        timestamp: Date.now(),
      }));
      if (isHost) {
        processGameEnvelopeAsHost(bidEnvelope, selfId);
      }
    }
    audio.submit();
    setShowKeypad(false);
  }

  function sendChat() {
    const text = chatInput.trim().slice(0, 70);
    if (!text) return;
    audio.click();
    const message = {
      ...buildRtcChatMessage({
        senderId: selfId || "local",
        senderName: me?.name || playerName || "匿名修士",
        text,
      }),
      roomId: room?.roomId || localRoomState?.roomId || pendingLocalRoomState?.roomId || "",
    };
    appendChatMessage(message);
    void sendChatMessage(message);
    setChatInput("");
  }

  function selectTool(tool: any) {
    if (!tool || !isActionPhase || hasSubmittedBidThisRound || hasUsedToolThisRound || usedToolHistory.has(tool.id)) return;
    setSelectedTool(tool);
    setShowToolPicker(false);
    setShowToolConfirm(true);
  }

  function confirmUseTool() {
    if (!selectedTool || !isActionPhase || hasSubmittedBidThisRound || hasUsedToolThisRound) return;
    if (isBankrupt) {
      setUiDialog({ title: "无法推演", message: "你已破产，无法继续推演。请等待本局结束。" });
      return;
    }
    if ((me?.spiritStone ?? 0) < (selectedTool?.cost ?? 0)) {
      setUiDialog({ title: "灵石不足", message: `无法催动【${selectedTool.name}】。` });
      return;
    }
    if (!currentRound || !selfId) return;
    const gameId = game?.id || room?.roomId || "game";
    const roundId = currentRound.id || `round_${game?.currentRound || 1}`;
    const prevAggregated = aggregateFrontHintCache(frontHintCacheByRound, currentBidRound - 1);
    const systemResult = computeFrontSystemHint({
      gameId,
      roundId,
      bidRound: currentBidRound,
      hintRounds: effectiveRoomSettings.hintRounds || [],
      tools: (toolList || []) as HintTool[],
      items: resolvedPlacedItems,
      baseIntel: prevAggregated.intel,
    });
    const afterSystemIntel = mergeIntel(prevAggregated.intel, systemResult.intel);
    const roleResult = computeFrontRoleHint({
      gameId,
      roundId,
      playerId: selfId,
      role: selfRole || null,
      bidRound: currentBidRound,
      items: resolvedPlacedItems,
      baseIntel: afterSystemIntel,
    });
    const afterRoleIntel = mergeIntel(afterSystemIntel, roleResult.intel);
    const toolResult = computeFrontToolHint({
      gameId,
      roundId,
      playerId: selfId,
      bidRound: currentBidRound,
      tool: selectedTool as HintTool,
      items: resolvedPlacedItems,
      baseIntel: afterRoleIntel,
    });
    setFrontHintCacheByRound((prev) => ({
      ...prev,
      [currentBidRound]: {
        intel: mergeIntel(mergeIntel(systemResult.intel || createEmptyIntel(), roleResult.intel || createEmptyIntel()), toolResult.intel || createEmptyIntel()),
        systemHints: systemResult.text ? [systemResult.text] : [],
        skillHints: roleResult.text ? [roleResult.text] : [],
        toolHints: toolResult.text ? [`${toolResult.text}（前端推演）`] : [],
        usedToolId: selectedTool.id,
      },
    }));
    if (rtcPeerCount > 0) {
      setLocalPendingActionByRound((prev) => ({
        ...prev,
        [actionRoundKey]: { ...(prev[actionRoundKey] || {}), toolUsed: true },
      }));
    }
    if (rtcPeerCount > 0 && currentRound?.roundNo) {
      sendJsonToPeers(buildRtcGameToolEnvelope({
        roundNo: currentRound.roundNo,
        bidRound: currentBidRound,
        playerId: selfId,
        toolId: selectedTool.id,
        toolCost: selectedTool.cost || 0,
      }));
      void sendJsonToPeers(buildActionToolEnvelope({
        actionId: createAuctionActionId("tool", currentRound.roundNo, currentBidRound, selfId),
        type: "ACTION_TOOL",
        round: currentRound.roundNo,
        turn: currentBidRound,
        playerId: selfId,
        toolId: selectedTool.id,
        toolCost: selectedTool.cost || 0,
        timestamp: Date.now(),
      }));
      if (isHost) {
        processGameEnvelopeAsHost(
          buildRtcGameToolEnvelope({
            roundNo: currentRound.roundNo,
            bidRound: currentBidRound,
            playerId: selfId,
            toolId: selectedTool.id,
            toolCost: selectedTool.cost || 0,
          }),
          selfId
        );
      }
    }
    audio.click();
    audio.submit();
    setShowToolConfirm(false);
    setSelectedTool(null);
  }

  function getRoundUsedToolMeta(playerId: string, roundNo: number) {
    const hostRound = rtcHostAuctionSnapshot?.rounds?.[currentRound?.roundNo || 0];
    const hostBidRound = hostRound?.currentBidRound || currentBidRound;
    const log = currentRound?.auction?.logs?.find((l: any) => l.roundNo === roundNo);
    const pendingKey = `${currentRound?.roundNo || displayedGameCurrentRoundNo}_${roundNo}_${playerId}`;
    const pendingToolId = playerId === selfId && roundNo === currentBidRound && localPendingActionByRound[pendingKey]?.toolUsed ? (selectedTool?.id || frontUsedToolIdByRound[roundNo] || "pending") : undefined;
    const currentToolId = playerId === selfId && roundNo === currentBidRound ? (frontUsedToolIdByRound[roundNo] || pendingToolId) : undefined;
    const hostToolId = hostRound && roundNo === hostBidRound ? hostRound?.bidRounds?.[roundNo]?.[playerId]?.toolId || null : null;
    const toolId = hostToolId || currentToolId || log?.usedTools?.[playerId] || null;
    if (!toolId) return null;
    return toolList.find((t: any) => t.id === toolId) || null;
  }

  function getRoundUsedTool(playerId: string, roundNo: number) {
    const hostRound = rtcHostAuctionSnapshot?.rounds?.[currentRound?.roundNo || 0];
    const hostBidRound = hostRound?.currentBidRound || currentBidRound;
    if (hostRound && roundNo === hostBidRound && hostRound.phase === "action") {
      const pendingKey = `${currentRound?.roundNo || displayedGameCurrentRoundNo}_${roundNo}_${playerId}`;
      const hasTool = Boolean(hostRound?.bidRounds?.[roundNo]?.[playerId]?.toolId) || Boolean(playerId === selfId && localPendingActionByRound[pendingKey]?.toolUsed);
      return hasTool ? "✓" : "";
    }
    const tool = getRoundUsedToolMeta(playerId, roundNo);
    return tool?.short || tool?.name || "";
  }

  function getRoundBidStatus(playerId: string, roundNo: number) {
    const hostRound = rtcHostAuctionSnapshot?.rounds?.[currentRound?.roundNo || 0];
    if (hostRound) {
      const hostBidRound = hostRound.currentBidRound || 1;
      const hostRecord = hostRound.bidRounds?.[roundNo]?.[playerId];
      if (roundNo > hostBidRound) return "";
      if (roundNo === hostBidRound && hostRound.phase === "action") {
        const pendingKey = `${currentRound?.roundNo || displayedGameCurrentRoundNo}_${roundNo}_${playerId}`;
        return (Object.prototype.hasOwnProperty.call(hostRecord || {}, "amount") || Boolean(playerId === selfId && localPendingActionByRound[pendingKey]?.bidSubmitted)) ? "✓" : "";
      }
      if (hostRecord && Object.prototype.hasOwnProperty.call(hostRecord || {}, "amount")) {
        return hostRecord.amount === null ? "放弃" : String(hostRecord.amount);
      }
    }
    const logs = currentRound?.auction?.logs || [];
    const maxReachedRoundNo = currentBidRound || 0;
    const getCarryStatus = () => {
      const previous = [...logs]
        .filter((l: any) => l.roundNo <= Math.min(roundNo, maxReachedRoundNo))
        .sort((a: any, b: any) => b.roundNo - a.roundNo)
        .find((l: any) => (l?.statusByPlayer?.[playerId] || "") !== "");
      return previous?.statusByPlayer?.[playerId] || "";
    };

    if (roundNo > maxReachedRoundNo) {
      return "";
    }

    const log = logs.find((l: any) => l.roundNo === roundNo);
    if (log) {
      const rawBid = log?.bids?.[playerId];
      const bid = Number(rawBid ?? 0);
      const directStatus = log?.statusByPlayer?.[playerId] || "";
      const status = directStatus || (rawBid === undefined ? getCarryStatus() : "");
      const isSettlementPhase = currentRound?.auction?.phase === "回合结算";
      const displayMode = isSettlementPhase ? "amount" : (room?.settings?.revealBidDisplay || "amount");
      if (displayMode === "rank") {
        const numericEntries = Object.keys(log?.bids || {}).map((pid) => ({ pid, bid: Number(log.bids?.[pid] ?? 0) }));
        const higherCount = numericEntries.filter((entry) => entry.bid > bid).length;
        return `第${higherCount + 1}`;
      }
      return status || String(bid);
    }
    if (roundNo === currentBidRound && isActionPhase) {
      if (currentRound?.auction?.submittedIds?.includes(playerId)) return "✓";
      const rtcDisplay = getRtcCurrentRoundBidDisplay(roundNo, currentBidRound, isActionPhase, playerId, rtcBidOverlayByRound);
      if (rtcDisplay !== undefined) return rtcDisplay;
      return "";
    }
    const carryStatus = getCarryStatus();
    return carryStatus || "";
  }

  function getSettlementWinnerName() {
    if (!settlement?.winnerId) return "流拍";
    return room.players.find((p: any) => p.id === settlement.winnerId)?.name || "未知修士";
  }

  function resetCatalogSort() {
    setCatalogSort({ key: "type", direction: "asc" });
  }

  function resetCatalogFilterAndSort() {
    setCatalogFocusItemId(null);
    setCatalogFilter({ type: "全部", quality: "全部", shape: "全部", min: 0, max: 99999999 });
    resetCatalogSort();
  }


  function toggleCatalogSort(key: "type" | "name" | "quality" | "shape" | "size" | "price") {
    setCatalogSort((prev) =>
      prev.key === key
        ? { key, direction: prev.direction === "asc" ? "desc" : "asc" }
        : { key, direction: "asc" }
    );
  }

  function renderSortMark(key: "type" | "name" | "quality" | "shape" | "size" | "price") {
    if (catalogSort.key !== key) return "↕";
    return catalogSort.direction === "asc" ? "↑" : "↓";
  }

  function renderSettlementActionButtons() {
    if (!settlement || !viewer?.completed) return null;
    if (game.status === "已完成" || isFinalRound) {
      return canViewStats ? (
        <button
          className="flex h-14 w-14 items-center justify-center rounded-2xl border border-fuchsia-400/30 bg-fuchsia-500/10 px-2 text-[11px] text-fuchsia-100"
          onClick={() => { if (latestResult) setShowStatsModal(true); }}
        >
          统计
        </button>
      ) : null;
    }
    return (
      <>
        <button
          className={cn(
            "flex h-14 w-14 items-center justify-center rounded-2xl border px-2 text-[11px] leading-tight",
            viewer?.readyForNextRound ? "border-emerald-400/30 bg-emerald-500/10 text-emerald-100 hover:border-amber-400/30 hover:bg-amber-500/10 hover:text-amber-100" : "border-emerald-400/30 bg-emerald-500/10 text-emerald-100"
          )}
          title={viewer?.readyForNextRound ? "点击取消准备" : "点击准备下一回合"}
          onClick={() => {
            if (frontSettlement && currentRound?.roundNo && selfId) {
              const nextReady = !viewer?.readyForNextRound;
              setFrontSettlementUiByRound((prev) => ({
                ...prev,
                [settlementRoundKey]: {
                  ...(prev[settlementRoundKey] || { mode: viewer?.mode || "delay", completed: true, readyForNextRound: false }),
                  readyForNextRound: nextReady,
                },
              }));
              const roundNo = Number(currentRound.roundNo || 0);
              const roundActions = clientAuctionStateByRound[roundNo]?.actions || [];
              const assetsSnapshot = hostRoundAssetSnapshots[roundNo] || Object.fromEntries(
                (displayedRoomPlayers || []).map((player: any) => [player.id, Number(player.spiritStone || 0)])
              );
              const assetsHash = buildAssetsHash(assetsSnapshot);
              setClientAuctionStateByRound((prev) => ({
                ...prev,
                [roundNo]: {
                  ...(prev[roundNo] || {
                    roundNo,
                    currentTurn: Number(currentBidRound || 1),
                    actions: [],
                    readyNextByPlayer: {},
                    startNextPayload: null,
                    forceStartPayload: null,
                  }),
                  readyNextByPlayer: nextReady
                    ? {
                        ...((prev[roundNo]?.readyNextByPlayer) || {}),
                        [selfId]: {
                          round: roundNo,
                          playerId: selfId,
                          assetsHash,
                          actionIds: roundActions.map((action: any) => action.actionId),
                          timestamp: Date.now(),
                        },
                      }
                    : Object.fromEntries(Object.entries((prev[roundNo]?.readyNextByPlayer) || {}).filter(([playerId]) => playerId !== selfId)),
                },
              }));
              if (nextReady && rtcPeerCount > 0) {
                void sendJsonToPeers({
                  type: "READY_NEXT",
                  payload: {
                    round: roundNo,
                    playerId: selfId,
                    assetsHash,
                    actionIds: roundActions.map((action: any) => action.actionId),
                    timestamp: Date.now(),
                  },
                });
              }
              if (isHost) {
                processGameEnvelopeAsHost(
                  buildRtcGameReadyNextEnvelope({ roundNo: currentRound.roundNo, playerId: selfId, ready: nextReady }),
                  selfId
                );
              } else if (rtcPeerCount > 0) {
                sendJsonToPeers(buildRtcGameReadyNextEnvelope({ roundNo: currentRound.roundNo, playerId: selfId, ready: nextReady }));
              }
              return;
            }
          }}
        >
          {viewer?.readyForNextRound
            ? settlement.allReadyCountdownAt
              ? `取消${allReadyCountdown}s`
              : `取消${forceCountdown}s`
            : `准备${forceCountdown}s`}
        </button>
        {isHost && (
          <button
            className="flex h-14 w-14 items-center justify-center rounded-2xl border border-rose-400/30 bg-rose-500/10 px-2 text-[11px] text-rose-100"
            onClick={() => {
              if (frontSettlement && currentRound?.roundNo && selfId) {
                const forceEnvelope = buildRtcGameForceNextEnvelope({ roundNo: currentRound.roundNo, playerId: selfId });
                if (rtcPeerCount > 0) sendJsonToPeers(forceEnvelope);
                processGameEnvelopeAsHost(forceEnvelope, selfId);
                return;
              }
            }}
          >
            强开
          </button>
        )}
      </>
    );
  }

  function getLobbyPlayerStatus(player: any) {
    if (player?.bankrupt) return "破产";
    return player.ready ? "已准备" : "未准备";
  }

  function getRolePickedNames(roleId: string) {
    return (liveRoleSelections?.[roleId] || [])
      .map((pid: string) => displayedRoomPlayers.find((p: any) => p.id === pid)?.name)
      .filter(Boolean)
      .join("、");
  }

  const gameMain = room && game;

  useEffect(() => {
    const messages = chatMessages || [];
    if (!messages.length) return;
    const latest = messages[messages.length - 1];
    if (!latest?.id || latest.id === lastChatMessageIdRef.current) return;
    lastChatMessageIdRef.current = latest.id;

    if (latest.senderId === "system" && latest.text) {
      audio.speak(latest.text, 1.02);
      return;
    }

    if (latest.text) {
      if (latest.senderId === selfId) {
        audio.speak(`你说：${latest.text}`, 1.05);
      } else {
        audio.speak(`${latest.senderName}说：${latest.text}`, 1.05);
      }
    }
  }, [chatMessages, selfId, audio]);

  useEffect(() => {
    if (!isActionPhase) {
      lastCountdownKeyRef.current = "";
      return;
    }
    if (!game || !displayedGameCurrentRoundNo) return;
    const key = `${game.id}_${displayedGameCurrentRoundNo}_${displayedCurrentBidRound}`;
    if (lastRoundAnnounceKeyRef.current === key) return;
    lastRoundAnnounceKeyRef.current = key;
    lastCountdownKeyRef.current = "";
    audio.speak(`第${displayedGameCurrentRoundNo}回合，第${displayedCurrentBidRound}轮竞拍。`, 1);
  }, [game, displayedGameCurrentRoundNo, displayedCurrentBidRound, isActionPhase, audio]);

  useEffect(() => {
    if (!isActionPhase) {
      lastCountdownKeyRef.current = "";
      return;
    }
    if (!actionCountdown || !game || !displayedGameCurrentRoundNo) return;
    const countdownKey = `${game.id}_${displayedGameCurrentRoundNo}_${displayedCurrentBidRound}_${actionCountdown}`;
    if (lastCountdownKeyRef.current === countdownKey) return;
    lastCountdownKeyRef.current = countdownKey;
    if (actionCountdown === 10) audio.speak("还剩10秒。", 1.08);
    if (actionCountdown === 5) audio.speak("还剩5秒。", 1.12);
    if (actionCountdown <= 5 && actionCountdown >= 1) audio.tick();
  }, [actionCountdown, isActionPhase, game, displayedGameCurrentRoundNo, displayedCurrentBidRound, audio]);


  useEffect(() => {
    const visibleIds = new Set<string>(visiblePlacedItems.filter((item: any) => item.viewMode === "item").map((item: any) => item.placedId));
    visibleIds.forEach((placedId) => {
      if (lastRevealedItemIdsRef.current.has(placedId)) return;
      lastRevealedItemIdsRef.current.add(placedId);
      const item = visiblePlacedItems.find((entry: any) => entry.placedId === placedId);
      audio.revealByQuality(item?.quality);
    });
  }, [visiblePlacedItems, audio]);

  useEffect(() => {
    if (!currentRound?.id) {
      lastRevealedItemIdsRef.current = new Set();
      lastCountdownKeyRef.current = "";
      setFrontHintCacheByRound({});
      return;
    }
    lastRevealedItemIdsRef.current = new Set();
    lastCountdownKeyRef.current = "";
  }, [currentRound?.id]);

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(34,197,94,0.08),_transparent_20%),radial-gradient(circle_at_top_right,_rgba(245,158,11,0.12),_transparent_24%),linear-gradient(180deg,_#05070f_0%,_#0b1020_45%,_#120d18_100%)] text-zinc-100">
      <header className="border-b border-amber-500/15 bg-black/35 backdrop-blur-xl">
        <div className="mx-auto flex max-w-[1800px] flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div>
            <p className="text-2xl font-semibold tracking-[0.32em] text-amber-100">修真拍卖行</p>
          </div>
          <div className="flex items-center gap-3 text-xs text-zinc-300">
            <div className="flex flex-wrap items-center gap-3 whitespace-nowrap">
              <span>联机状态：{connected ? `已连通灵网${connectionScopesLabel ? ` · ${connectionScopesLabel}` : ""}` : "灵网断开"}</span>
              {room?.roomId && <span>房间ID：{room.roomId}</span>}
            </div>
            {room && (
              <div className="flex items-center gap-2">
                {room && !game && (
                  <button className="rounded-xl border border-sky-400/30 bg-sky-500/10 px-3 py-1 text-sm text-sky-100" onClick={() => { audio.click(); setShowNetworkConnections(true); }}>
                    网络连接
                  </button>
                )}
                {room && !game && (
                  <button className="rounded-xl border border-violet-400/30 bg-violet-500/10 px-3 py-1 text-sm text-violet-100" onClick={() => { audio.click(); setShowSimulationPreview(true); }}>
                    模拟预览
                  </button>
                )}
                {isHost && room && !game && (
                  <>
                    <button className="rounded-xl border border-cyan-400/30 bg-cyan-500/10 px-3 py-1 text-sm text-cyan-100" onClick={() => { audio.click(); setShowParameterSettings(true); }}>
                      参数设置
                    </button>
                    <button className="rounded-xl border border-amber-400/30 bg-amber-500/10 px-3 py-1 text-sm text-amber-100" onClick={() => { audio.click(); setSettingsOpen(true); }}>
                      房间设置
                    </button>
                  </>
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
        <HomeLobbyView
          playerName={playerName}
          password={password}
          joinRoomId={joinRoomId}
          maxPlayers={settingsForm.maxPlayers}
          roomList={roomList}
          globalOnlineCount={globalOnlineCount}
          isJoiningRoom={isJoiningRoom}
          onPlayerNameChange={setPlayerName}
          onPasswordChange={setPassword}
          onJoinRoomIdChange={setJoinRoomId}
          onMaxPlayersChange={(value) =>
            setSettingsForm((s) => ({ ...s, maxPlayers: Math.max(2, Math.min(16, value || 6)) }))
          }
          onCreateRoom={() => {
            audio.click();
            createRoom();
          }}
          onJoinRoom={() => {
            audio.click();
            joinRoom();
          }}
          onJoinListedRoom={(roomId) => {
            audio.click();
            setJoinRoomId(roomId);
            joinRoom(roomId);
          }}
          onRefreshRooms={() => {
            audio.click();
            void lobby.queryRooms();
          }}
        />
      )}

      {room && !game && (
        <GamePreparationView
          room={room}
          game={game}
          isHost={isHost}
          isBankrupt={isBankrupt}
          me={me}
          effectiveRoomSettings={effectiveRoomSettings}
          displayedRoomPlayers={displayedRoomPlayers}
          roleList={roleList}
          selfId={selfId}
          canStartGame={canStartGame}
          liveRoleSelections={liveRoleSelections}
          rtcPrepOverlayByPlayer={rtcPrepOverlayByPlayer}
          latestResult={latestResult}
          chatMessages={chatMessages}
          chatInput={chatInput}
          chatListRef={chatListRef}
          onChatInputChange={setChatInput}
          onSendChat={sendChat}
          onToggleReady={() => {
            audio.click();
            updatePlayer({ ready: !me?.ready });
          }}
          onStartGame={() => {
            audio.click();
            startFrontGame();
          }}
          onSelectRole={(roleId) => {
            if (!me) return;
            updatePlayer({ roleId });
          }}
        onOpenStats={() => setShowStatsModal(true)}
        getLobbyPlayerStatus={getLobbyPlayerStatus}
        isLobbyRtcOnline={isLobbyRtcOnline}
        getRolePickedNames={getRolePickedNames}
        cn={cn}
      />
      )}

      {gameMain && (
        <AuctionGameView
          gameMain={gameMain}
          game={game}
          selfId={selfId}
          isHost={isHost}
          sortedPlayers={sortedPlayers}
          roleList={roleList}
          currentBidRound={currentBidRound}
          currentRound={currentRound}
          getRoundUsedToolMeta={getRoundUsedToolMeta}
          getRoundUsedTool={getRoundUsedTool}
          getRoundBidStatus={getRoundBidStatus}
          cn={cn}
          settlement={settlement}
          settlementRunningProfit={settlementRunningProfit}
          displayedGameCurrentRoundNo={displayedGameCurrentRoundNo}
          bagSummaryText={bagSummaryText}
          actionCountdown={actionCountdown}
          visiblePlacedItems={visiblePlacedItems}
          visibleQualityCells={visibleQualityCells}
          openWarehouseTip={openWarehouseTip}
          closeWarehouseTip={closeWarehouseTip}
          startWarehouseTipHold={startWarehouseTipHold}
          clearWarehouseTipHold={clearWarehouseTipHold}
          setCatalogFocusItemId={setCatalogFocusItemId}
          setCatalogFilter={setCatalogFilter}
          setShowCodex={setShowCodex}
          selfRole={selfRole}
          toolAnchorRef={toolAnchorRef}
          bidAnchorRef={bidAnchorRef}
          bidInput={bidInput}
          setBidInput={setBidInput}
          setShowToolPicker={setShowToolPicker}
          hasUsedToolThisRound={hasUsedToolThisRound}
          hasSubmittedBidThisRound={hasSubmittedBidThisRound}
          isActionPhase={isActionPhase}
          isBankrupt={isBankrupt}
          cannotBidThisRound={cannotBidThisRound}
          currentRoundStatus={currentRoundStatus}
          setShowKeypad={setShowKeypad}
          submitBid={submitBid}
          viewer={viewer}
          frontSettlement={frontSettlement}
          settlementRoundKey={settlementRoundKey}
          setFrontSettlementUiByRound={setFrontSettlementUiByRound}
          processGameEnvelopeAsHost={processGameEnvelopeAsHost}
          buildRtcGameRevealModeEnvelope={buildRtcGameRevealModeEnvelope}
          buildRtcGameReadyNextEnvelope={buildRtcGameReadyNextEnvelope}
          sendJsonToPeers={sendJsonToPeers}
          renderSettlementActionButtons={renderSettlementActionButtons}
          visibleSystemHints={visibleSystemHints}
          visibleSkillHints={visibleSkillHints}
          visibleToolHints={visibleToolHints}
          chatMessages={chatMessages}
          chatListRef={chatListRef}
          chatInput={chatInput}
          setChatInput={setChatInput}
          sendChat={sendChat}
          getSettlementWinnerName={getSettlementWinnerName}
        />
      )}

      <RoomSettingsModal
        open={Boolean(settingsOpen && isHost && room && !game)}
        settingsForm={settingsForm}
        setSettingsForm={setSettingsForm as React.Dispatch<React.SetStateAction<any>>}
        onClose={() => setSettingsOpen(false)}
        onSave={() => {
          updateRoomSettings();
          setSettingsOpen(false);
        }}
      />

      <NetworkConnectionsModal
        open={Boolean(showNetworkConnections && room && !game)}
        onClose={() => setShowNetworkConnections(false)}
        roomId={room?.roomId || ""}
        selfId={selfId}
        players={displayedRoomPlayers.map((player: any) => ({
          id: player.id,
          name: player.name,
          isHost: Boolean(player.isHost),
          connected: Boolean(player.connected),
        }))}
        reports={networkReportsByPlayer}
      />

      <ParameterSettingsModal
        open={showParameterSettings}
        hasRoom={Boolean(room)}
        isHost={isHost}
        game={game}
        initialSettings={settingsForm}
        defaultSettings={FRONT_DEFAULT_SETTINGS as any}
        catalog={catalog}
        onClose={() => setShowParameterSettings(false)}
        onSave={(nextSettings) => {
          updateRoomSettings(nextSettings);
          setShowParameterSettings(false);
        }}
      />

      <SimulationPreviewModal
        open={showSimulationPreview}
        settings={effectiveRoomSettings}
        catalog={catalog}
        simulation={simulationPreviewStats}
        setSimulation={setSimulationPreviewStats}
        onClose={() => setShowSimulationPreview(false)}
      />

      <CodexModal
        open={showCodex}
        codexViewMode={codexViewMode}
        setCodexViewMode={setCodexViewMode}
        catalogFilter={catalogFilter}
        setCatalogFilter={setCatalogFilter}
        filteredCatalog={filteredCatalog}
        TYPES={TYPES as string[]}
        QUALITY_TEXT_COLOR={QUALITY_TEXT_COLOR}
        shapeAnchorRef={shapeAnchorRef}
        qualityAnchorRef={qualityAnchorRef}
        onOpenShapePicker={() => setShowShapePicker(true)}
        onOpenQualityPicker={() => setShowQualityPicker(true)}
        onReset={resetCatalogSort}
        onResetFilterAndSort={resetCatalogFilterAndSort}
        onClose={() => {
          setShowCodex(false);
          setCatalogFocusItemId(null);
        }}
        renderSortMark={renderSortMark}
        toggleCatalogSort={toggleCatalogSort}
      />

      <KeypadPopover open={showKeypad} anchorRef={bidAnchorRef} value={bidInput} onClose={() => setShowKeypad(false)} onAppend={appendBidDigit} onDelete={deleteBidDigit} onClear={clearBidInput} />
      <ShapePopover
        open={showShapePicker}
        anchorRef={shapeAnchorRef}
        value={catalogFilter.shape}
        onClose={() => setShowShapePicker(false)}
        onSelect={(shape) => setCatalogFilter((f) => ({ ...f, shape }))}
        onClear={() => setCatalogFilter((f) => ({ ...f, shape: "全部" }))}
      />
      <QualityPopover
        open={showQualityPicker}
        anchorRef={qualityAnchorRef}
        value={catalogFilter.quality}
        onClose={() => setShowQualityPicker(false)}
        onSelect={(quality) => setCatalogFilter((f) => ({ ...f, quality }))}
        onClear={() => setCatalogFilter((f) => ({ ...f, quality: "全部" }))}
        QUALITY_TEXT_COLOR={QUALITY_TEXT_COLOR}
        QUALITIES={QUALITIES as readonly string[]}
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
      <ToolConfirmDialog
        open={showToolConfirm}
        selectedTool={selectedTool}
        onCancel={() => {
          setShowToolConfirm(false);
          setSelectedTool(null);
        }}
        onConfirm={confirmUseTool}
      />

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

      <StatsOverlay
        latestResult={latestResult}
        showStatsModal={showStatsModal}
        roomId={room?.roomId || ""}
        statsRoundTab={statsRoundTab}
        setStatsRoundTab={setStatsRoundTab}
        onClose={() => setShowStatsModal(false)}
        types={TYPES as string[]}
        qualities={QUALITIES as string[]}
      />
    </div>
  );
}

export default App;
