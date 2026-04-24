import { useEffect, useMemo, useRef, useState } from "react";
import { joinRoom, selfId as trysteroSelfId } from "trystero";

const TRYSTERO_APP_ID = "xzpmh_xiuxian_paimaixing";
export const GLOBAL_LOBBY_ID = "XZPMH_GLOBAL_LOBBY";
export const ROOM_ID_PREFIX = "XZPMH_ROOMID_";
const LOBBY_PEER_LIMIT = 12;
const ROOM_ANNOUNCE_HEARTBEAT_MS = 3500;
const ROOM_ANNOUNCEMENT_STALE_MS = 12000;

type TrysteroRoom = ReturnType<typeof joinRoom>;

type LobbyRoomAnnouncement = {
  roomId: string;
  ownerPeerId: string;
  ownerName: string;
  roomName?: string;
  hasPassword?: boolean;
  maxPlayers?: number;
  playerCount?: number;
  onlinePlayerCount?: number;
  phase?: string;
  currentRound?: number;
  totalRounds?: number;
  ts: number;
};

type RoomKick = {
  roomId: string;
  targetPeerId: string;
  reason?: string;
  ts: number;
};

type RoomSettingsUpdate = {
  settings: Record<string, any>;
  ts: number;
};

type RoomPlayerStatus = {
  playerId: string;
  name?: string;
  ready?: boolean;
  roleId?: string;
  ts: number;
};

type RoomChatMessage = {
  id: string;
  senderId: string;
  senderName: string;
  text: string;
  time: string;
  roomId?: string;
};

type RoomIdentitySync = {
  playerId: string;
  name: string;
  avatar?: string;
  ready?: boolean;
  roleId?: string;
  isHost?: boolean;
  connectionStatus?: "open" | "partial" | "closed" | "unknown";
  connectedPeerIds?: string[];
  ts: number;
};

type RoomMemberListEntry = {
  playerId: string;
  name: string;
  isHost?: boolean;
  joinedAt?: number;
};

type RoomMemberListSync = {
  roomId: string;
  members: RoomMemberListEntry[];
  ts: number;
};

type UseTrysteroLobbyOptions = {
  enabled: boolean;
  selfName: string;
  selfAvatar?: string;
  roomAnnouncement?: LobbyRoomAnnouncement | null;
};

type UseTrysteroRoomOptions = {
  roomId: string;
  enabled: boolean;
  isHost: boolean;
  selfName: string;
  password?: string;
  onPeerJoin?: (peerId: string) => void;
  onPeerLeave?: (peerId: string) => void;
  onDataMessage?: (fromPeerId: string, message: any) => void;
  onPeerOpen?: (peerId: string) => void;
  onSettingsUpdate?: (payload: RoomSettingsUpdate, fromPeerId: string) => void;
  onPlayerStatus?: (payload: RoomPlayerStatus, fromPeerId: string) => void;
  onChatMessage?: (payload: RoomChatMessage, fromPeerId: string) => void;
  onIdentitySync?: (payload: RoomIdentitySync, fromPeerId: string) => void;
  onMemberListSync?: (payload: RoomMemberListSync, fromPeerId: string) => void;
  onJoinError?: (error: unknown) => void;
};

type RoomHookHandlers = {
  onPeerJoin?: (peerId: string) => void;
  onPeerLeave?: (peerId: string) => void;
  onDataMessage?: (fromPeerId: string, message: any) => void;
  onPeerOpen?: (peerId: string) => void;
  onSettingsUpdate?: (payload: RoomSettingsUpdate, fromPeerId: string) => void;
  onPlayerStatus?: (payload: RoomPlayerStatus, fromPeerId: string) => void;
  onChatMessage?: (payload: RoomChatMessage, fromPeerId: string) => void;
  onIdentitySync?: (payload: RoomIdentitySync, fromPeerId: string) => void;
  onMemberListSync?: (payload: RoomMemberListSync, fromPeerId: string) => void;
  onJoinError?: (error: unknown) => void;
};

function createRoomConfig(password?: string) {
  return {
    appId: TRYSTERO_APP_ID,
    ...(password ? { password } : {}),
  };
}

function nowTs() {
  return Date.now();
}

function safePreview(value: unknown) {
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return value;
  }
}

function estimateBytes(value: unknown) {
  try {
    return new Blob([JSON.stringify(value)]).size;
  } catch {
    try {
      return String(value).length;
    } catch {
      return 0;
    }
  }
}

function logTrystero(scope: string, event: string, payload?: unknown) {
  const size = payload === undefined ? 0 : estimateBytes(payload);
  if (payload === undefined) {
    console.log(`[trystero:${scope}] ${event}`);
    return;
  }
  console.log(`[trystero:${scope}] ${event} (${size} bytes)`, safePreview(payload));
}

function isFiniteTs(ts: unknown) {
  return typeof ts === "number" && Number.isFinite(ts);
}

function normalizeAnnouncement(value: any): LobbyRoomAnnouncement | null {
  if (!value?.roomId || !value?.ownerPeerId) return null;
  return {
    roomId: String(value.roomId),
    ownerPeerId: String(value.ownerPeerId),
    ownerName: String(value.ownerName || "房主"),
    roomName: value.roomName ? String(value.roomName) : "",
    hasPassword: Boolean(value.hasPassword),
    maxPlayers: Number(value.maxPlayers || 0),
    playerCount: Number(value.playerCount || 0),
    onlinePlayerCount: Number(value.onlinePlayerCount || value.playerCount || 0),
    phase: String(value.phase || "准备中"),
    currentRound: Number(value.currentRound || 0),
    totalRounds: Number(value.totalRounds || 0),
    ts: isFiniteTs(value.ts) ? value.ts : nowTs(),
  };
}

function normalizeMemberList(value: any): RoomMemberListSync | null {
  if (!value?.roomId || !Array.isArray(value?.members)) return null;
  return {
    roomId: String(value.roomId),
    members: value.members.map((member: any) => ({
      playerId: String(member?.playerId || ""),
      name: String(member?.name || "匿名修士"),
      isHost: Boolean(member?.isHost),
      joinedAt: Number(member?.joinedAt || nowTs()),
    })).filter((member: RoomMemberListEntry) => Boolean(member.playerId)),
    ts: isFiniteTs(value.ts) ? value.ts : nowTs(),
  };
}

export function getTrysteroSelfId() {
  return String(trysteroSelfId || "");
}

export function buildTrysteroRoomId(rawRoomId: string) {
  return `${ROOM_ID_PREFIX}${String(rawRoomId || "").toUpperCase()}`;
}

export function stripTrysteroRoomId(roomId: string) {
  const value = String(roomId || "");
  return value.startsWith(ROOM_ID_PREFIX) ? value.slice(ROOM_ID_PREFIX.length) : value;
}

export function generateTrysteroShortRoomId() {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

export function useTrysteroLobby({
  enabled,
  selfName,
  selfAvatar,
  roomAnnouncement,
}: UseTrysteroLobbyOptions) {
  const roomRef = useRef<TrysteroRoom | null>(null);
  const [connected, setConnected] = useState(false);
  const [peerIds, setPeerIds] = useState<string[]>([]);
  const [roomsMap, setRoomsMap] = useState<Record<string, LobbyRoomAnnouncement>>({});
  const roomAnnouncementRef = useRef<LobbyRoomAnnouncement | null>(roomAnnouncement || null);
  const selfIdentityRef = useRef({ selfName, selfAvatar });

  const actionsRef = useRef<{
    sendQueryRooms?: (...args: any[]) => Promise<any>;
    sendRoomAnnouncement?: (...args: any[]) => Promise<any>;
  }>({});

  useEffect(() => {
    roomAnnouncementRef.current = roomAnnouncement || null;
  }, [roomAnnouncement]);

  useEffect(() => {
    selfIdentityRef.current = { selfName, selfAvatar };
  }, [selfName, selfAvatar]);

  useEffect(() => {
    if (!enabled) return;
    logTrystero("lobby", "join", { roomId: GLOBAL_LOBBY_ID, ...selfIdentityRef.current });
    const room = joinRoom(createRoomConfig(), GLOBAL_LOBBY_ID);
    roomRef.current = room;

    const [sendQueryRooms, getQueryRooms] = room.makeAction("QUERY_ROOMS");
    const [sendRoomAnnouncement, getRoomAnnouncement] = room.makeAction("ROOM_ANNOUNCEMENT");
    actionsRef.current = { sendQueryRooms, sendRoomAnnouncement };

    room.onPeerJoin((peerId) => {
      logTrystero("lobby", "peer-join", { peerId });
      setConnected(true);
      setPeerIds((prev) => (prev.includes(peerId) ? prev : [...prev, peerId].slice(-LOBBY_PEER_LIMIT)));
      const currentAnnouncement = roomAnnouncementRef.current;
      if (currentAnnouncement) {
        logTrystero("lobby", "send ROOM_ANNOUNCEMENT (direct)", { target: peerId, payload: currentAnnouncement });
        void sendRoomAnnouncement(currentAnnouncement, peerId);
      }
    });

    room.onPeerLeave((peerId) => {
      logTrystero("lobby", "peer-leave", { peerId });
      setPeerIds((prev) => prev.filter((id) => id !== peerId));
      setRoomsMap((prev) => {
        const next = { ...prev };
        Object.keys(next).forEach((roomId) => {
          if (next[roomId]?.ownerPeerId === peerId) delete next[roomId];
        });
        return next;
      });
    });

    getQueryRooms((data, peerId) => {
      logTrystero("lobby", "recv QUERY_ROOMS", { from: peerId, payload: data });
      const currentAnnouncement = roomAnnouncementRef.current;
      if (!currentAnnouncement) return;
      const payload = (data || {}) as any;
      const requester = String(payload?.requesterPeerId || peerId || "");
      if (!requester) return;
      logTrystero("lobby", "send ROOM_ANNOUNCEMENT (query-reply)", { target: requester, payload: currentAnnouncement });
      void sendRoomAnnouncement(currentAnnouncement, requester);
    });

    getRoomAnnouncement((data) => {
      logTrystero("lobby", "recv ROOM_ANNOUNCEMENT", data);
      const normalized = normalizeAnnouncement(data);
      if (!normalized) return;
      setRoomsMap((prev) => {
        const next = { ...prev };
        Object.keys(next).forEach((existingRoomId) => {
          if (existingRoomId !== normalized.roomId && next[existingRoomId]?.ownerPeerId === normalized.ownerPeerId) {
            delete next[existingRoomId];
          }
        });
        next[normalized.roomId] = normalized;
        return next;
      });
    });

    setConnected(true);
    const initialQuery = { requesterPeerId: getTrysteroSelfId(), ts: nowTs() };
    logTrystero("lobby", "send QUERY_ROOMS", initialQuery);
    void sendQueryRooms(initialQuery);

      return () => {
        logTrystero("lobby", "cleanup", { roomId: GLOBAL_LOBBY_ID });
        roomRef.current = null;
        actionsRef.current = {};
        setConnected(false);
        setPeerIds([]);
      };
    }, [enabled]);

  useEffect(() => {
    const currentAnnouncement = roomAnnouncementRef.current;
    if (!enabled || !currentAnnouncement || !actionsRef.current.sendRoomAnnouncement) return;
    setRoomsMap((prev) => ({
      ...Object.fromEntries(Object.entries(prev).filter(([, room]) => room.ownerPeerId !== currentAnnouncement.ownerPeerId || room.roomId === currentAnnouncement.roomId)),
      [currentAnnouncement.roomId]: { ...currentAnnouncement, ts: nowTs() },
    }));
    const peers = peerIds.slice(0, LOBBY_PEER_LIMIT);
    if (peers.length) {
      const payload = { ...currentAnnouncement, ts: nowTs() };
      logTrystero("lobby", "send ROOM_ANNOUNCEMENT (heartbeat)", { targets: peers, payload });
      void actionsRef.current.sendRoomAnnouncement(payload, peers);
    }
    const timer = window.setInterval(() => {
      if (!actionsRef.current.sendRoomAnnouncement) return;
      const nextAnnouncement = roomAnnouncementRef.current;
      if (!nextAnnouncement) return;
      const nextPeers = peerIds.slice(0, LOBBY_PEER_LIMIT);
      if (!nextPeers.length) return;
      const payload = { ...nextAnnouncement, ts: nowTs() };
      logTrystero("lobby", "send ROOM_ANNOUNCEMENT (heartbeat)", { targets: nextPeers, payload });
      void actionsRef.current.sendRoomAnnouncement(payload, nextPeers);
    }, ROOM_ANNOUNCE_HEARTBEAT_MS);
    return () => window.clearInterval(timer);
  }, [enabled, peerIds]);

  useEffect(() => {
    if (!enabled) return;
    const timer = window.setInterval(() => {
      const now = nowTs();
      setRoomsMap((prev) => {
        const next = Object.fromEntries(
          Object.entries(prev).filter(([, room]) => now - Number(room?.ts || 0) <= ROOM_ANNOUNCEMENT_STALE_MS)
        );
        return JSON.stringify(prev) === JSON.stringify(next) ? prev : next;
      });
    }, 2000);
    return () => window.clearInterval(timer);
  }, [enabled]);

  const rooms = useMemo(() => Object.values(roomsMap).sort((a, b) => Number(b.ts || 0) - Number(a.ts || 0)), [roomsMap]);

  const queryRooms = useMemo(() => {
    return async () => {
      if (!actionsRef.current.sendQueryRooms) return;
      const payload = { requesterPeerId: getTrysteroSelfId(), ts: nowTs() };
      logTrystero("lobby", "send QUERY_ROOMS", payload);
      await actionsRef.current.sendQueryRooms(payload);
    };
  }, []);

  const leaveLobby = useMemo(() => {
    return () => {
      try {
        roomRef.current?.leave();
      } catch {
        // noop
      }
      roomRef.current = null;
      actionsRef.current = {};
      setConnected(false);
      setPeerIds([]);
      setRoomsMap({});
    };
  }, []);

  return {
    connected,
    peerIds,
    rooms,
    queryRooms,
    leaveLobby,
  };
}

export function useTrysteroRoom({
  roomId,
  enabled,
  isHost,
  selfName,
  password,
  onPeerJoin,
  onPeerLeave,
  onDataMessage,
  onPeerOpen,
  onSettingsUpdate,
  onPlayerStatus,
  onChatMessage,
  onIdentitySync,
  onMemberListSync,
  onJoinError,
}: UseTrysteroRoomOptions) {
  const roomRef = useRef<TrysteroRoom | null>(null);
  const [connected, setConnected] = useState(false);
  const [peerIds, setPeerIds] = useState<string[]>([]);
  const [peerStates, setPeerStates] = useState<Record<string, string>>({});
  const memberListRef = useRef<RoomMemberListEntry[]>([]);
  const peerIdsRef = useRef<string[]>([]);
  const peerStatesRef = useRef<Record<string, string>>({});
  const handlersRef = useRef<RoomHookHandlers>({});

  const actionsRef = useRef<{
    sendKick?: (...args: any[]) => Promise<any>;
    sendMessage?: (...args: any[]) => Promise<any>;
    sendSettingsUpdate?: (...args: any[]) => Promise<any>;
    sendPlayerStatus?: (...args: any[]) => Promise<any>;
    sendChatMessage?: (...args: any[]) => Promise<any>;
    sendIdentitySync?: (...args: any[]) => Promise<any>;
    sendMemberListSync?: (...args: any[]) => Promise<any>;
  }>({});

  useEffect(() => {
    peerIdsRef.current = peerIds;
  }, [peerIds]);

  useEffect(() => {
    peerStatesRef.current = peerStates;
  }, [peerStates]);

  useEffect(() => {
    handlersRef.current = {
      onPeerJoin,
      onPeerLeave,
      onDataMessage,
      onPeerOpen,
      onSettingsUpdate,
      onPlayerStatus,
      onChatMessage,
      onIdentitySync,
      onMemberListSync,
      onJoinError,
    };
  }, [onPeerJoin, onPeerLeave, onDataMessage, onPeerOpen, onSettingsUpdate, onPlayerStatus, onChatMessage, onIdentitySync, onMemberListSync, onJoinError]);

  useEffect(() => {
    if (!enabled || !roomId) return;
    logTrystero("room", "join", { roomId, isHost, selfName, hasPassword: Boolean(password) });
    const room = joinRoom(createRoomConfig(password), roomId, {
      onJoinError: (error: unknown) => {
        logTrystero("room", "join-error", { roomId, error: safePreview(error) });
        setConnected(false);
        handlersRef.current.onJoinError?.(error);
      },
    });
    roomRef.current = room;

    const [sendKick, getKick] = room.makeAction("ROOM_KICK");
    const [sendMessage, getMessage] = room.makeAction("ROOM_MESSAGE");
    const [sendSettingsUpdate, getSettingsUpdate] = room.makeAction("UPDATE_SETTINGS");
    const [sendPlayerStatus, getPlayerStatus] = room.makeAction("PLAYER_STATUS");
    const [sendChatMessage, getChatMessage] = room.makeAction("CHAT_MESSAGE");
    const [sendIdentitySync, getIdentitySync] = room.makeAction("IDENTITY_SYNC");
    const [sendMemberListSync, getMemberListSync] = room.makeAction("ROOM_MEMBER_LIST_SYNC");
    actionsRef.current = { sendKick, sendMessage, sendSettingsUpdate, sendPlayerStatus, sendChatMessage, sendIdentitySync, sendMemberListSync };

    const upsertMember = (peerId: string, name?: string, isHostMember?: boolean) => {
      const exists = memberListRef.current.find((member) => member.playerId === peerId);
      const normalizedName = typeof name === "string" && name.trim() ? name.trim() : undefined;
      if (exists) {
        memberListRef.current = memberListRef.current.map((member) => {
          if (member.playerId !== peerId) return member;
          const shouldKeepExistingName = !normalizedName || (normalizedName === "匿名修士" && member.name && member.name !== "匿名修士");
          return {
            ...member,
            ...(shouldKeepExistingName ? {} : { name: normalizedName }),
            ...(typeof isHostMember === "boolean" ? { isHost: isHostMember } : {}),
          };
        });
      } else {
        memberListRef.current = [
          ...memberListRef.current,
          {
            playerId: peerId,
            name: normalizedName || (peerId === getTrysteroSelfId() ? selfName || "匿名修士" : "匿名修士"),
            isHost: typeof isHostMember === "boolean" ? isHostMember : false,
            joinedAt: nowTs(),
          },
        ];
      }
    };

    const broadcastMemberList = async (targetPeers?: string | string[] | null) => {
      if (!actionsRef.current.sendMemberListSync) return;
      if (isHost) {
        const selfPeerId = getTrysteroSelfId();
        const activeSet = new Set([selfPeerId, ...peerIdsRef.current]);
        memberListRef.current = memberListRef.current.filter((member) => {
          if (member.playerId === selfPeerId) return true;
          if (!activeSet.has(member.playerId)) return false;
          const state = peerStatesRef.current[member.playerId];
          return state === undefined || state === "open";
        });
      }
      const payload: RoomMemberListSync = {
        roomId,
        members: [...memberListRef.current],
        ts: nowTs(),
      };
      logTrystero("room", "send ROOM_MEMBER_LIST_SYNC", { targetPeers: targetPeers ?? null, payload });
      await actionsRef.current.sendMemberListSync(payload, targetPeers ?? null);
      handlersRef.current.onMemberListSync?.(payload, getTrysteroSelfId());
    };

    const sendSelfIdentity = async (targetPeers?: string | string[] | null) => {
      if (!actionsRef.current.sendIdentitySync) return;
      const connectedPeerIds = [...peerIdsRef.current];
      const payload: RoomIdentitySync = {
        playerId: getTrysteroSelfId(),
        name: selfName || "匿名修士",
        avatar: (selfName || "匿").slice(0, 1),
        isHost,
        connectionStatus: connectedPeerIds.length > 0 ? "open" : "partial",
        connectedPeerIds,
        ts: nowTs(),
      };
      logTrystero("room", "send IDENTITY_SYNC", { targetPeers: targetPeers ?? null, payload });
      await actionsRef.current.sendIdentitySync(payload, targetPeers ?? null);
    };

    upsertMember(getTrysteroSelfId(), selfName || "匿名修士", isHost);

    room.onPeerJoin((peerId) => {
      logTrystero("room", "peer-join", { roomId, peerId });
      setConnected(true);
      setPeerIds((prev) => (prev.includes(peerId) ? prev : [...prev, peerId]));
      setPeerStates((prev) => ({ ...prev, [peerId]: "open" }));
      upsertMember(peerId);
      if (isHost) {
        void broadcastMemberList();
      }
      handlersRef.current.onPeerJoin?.(peerId);
      handlersRef.current.onPeerOpen?.(peerId);
      void sendSelfIdentity();
    });

    room.onPeerLeave((peerId) => {
      logTrystero("room", "peer-leave", { roomId, peerId });
      setPeerIds((prev) => prev.filter((id) => id !== peerId));
      setPeerStates((prev) => {
        const next = { ...prev };
        delete next[peerId];
        return next;
      });
      memberListRef.current = memberListRef.current.filter((member) => member.playerId !== peerId);
      if (isHost) {
        void broadcastMemberList();
      }
      handlersRef.current.onPeerLeave?.(peerId);
      void sendSelfIdentity();
    });

    getMessage((data, peerId) => {
      logTrystero("room", "recv ROOM_MESSAGE", { from: peerId, payload: data });
      handlersRef.current.onDataMessage?.(peerId, data);
    });

    getSettingsUpdate((data, peerId) => {
      logTrystero("room", "recv UPDATE_SETTINGS", { from: peerId, payload: data });
      const payload = data as RoomSettingsUpdate;
      if (!payload || typeof payload !== "object") return;
      handlersRef.current.onSettingsUpdate?.({ settings: { ...(payload.settings || {}) }, ts: isFiniteTs(payload.ts) ? payload.ts : nowTs() }, peerId);
    });

    getPlayerStatus((data, peerId) => {
      logTrystero("room", "recv PLAYER_STATUS", { from: peerId, payload: data });
      const payload = data as RoomPlayerStatus;
      if (!payload?.playerId) return;
      if (typeof payload.name === "string" && payload.name.trim()) {
        upsertMember(String(payload.playerId), String(payload.name));
        if (isHost) {
          void broadcastMemberList();
        }
      }
      handlersRef.current.onPlayerStatus?.({
        playerId: String(payload.playerId),
        ...(typeof payload.name === "string" ? { name: String(payload.name) } : {}),
        ...(typeof payload.ready === "boolean" ? { ready: payload.ready } : {}),
        ...(typeof payload.roleId === "string" ? { roleId: payload.roleId } : {}),
        ts: isFiniteTs(payload.ts) ? payload.ts : nowTs(),
      }, peerId);
    });

    getChatMessage((data, peerId) => {
      logTrystero("room", "recv CHAT_MESSAGE", { from: peerId, payload: data });
      const payload = data as RoomChatMessage;
      if (!payload?.id || !payload?.senderId) return;
      handlersRef.current.onChatMessage?.({
        id: String(payload.id),
        senderId: String(payload.senderId),
        senderName: String(payload.senderName || "匿名修士"),
        text: String(payload.text || "").slice(0, 70),
        time: String(payload.time || ""),
        ...(payload.roomId ? { roomId: String(payload.roomId) } : {}),
      }, peerId);
    });

    getIdentitySync((data, peerId) => {
      logTrystero("room", "recv IDENTITY_SYNC", { from: peerId, payload: data });
      const payload = data as RoomIdentitySync;
      if (!payload?.playerId || !payload?.name) return;
      upsertMember(String(payload.playerId), String(payload.name || "匿名修士"), typeof payload.isHost === "boolean" ? payload.isHost : undefined);
      if (isHost) {
        void broadcastMemberList();
      }
      handlersRef.current.onIdentitySync?.({
        playerId: String(payload.playerId),
        name: String(payload.name || "匿名修士"),
        ...(payload.avatar ? { avatar: String(payload.avatar) } : {}),
        ...(typeof payload.ready === "boolean" ? { ready: payload.ready } : {}),
        ...(typeof payload.roleId === "string" ? { roleId: String(payload.roleId) } : {}),
        ...(typeof payload.isHost === "boolean" ? { isHost: payload.isHost } : {}),
        ...(typeof payload.connectionStatus === "string" ? { connectionStatus: payload.connectionStatus } : {}),
        ...(Array.isArray(payload.connectedPeerIds) ? { connectedPeerIds: payload.connectedPeerIds.map((id) => String(id)) } : {}),
        ts: isFiniteTs(payload.ts) ? payload.ts : nowTs(),
      }, peerId);
    });

    getMemberListSync((data, peerId) => {
      logTrystero("room", "recv ROOM_MEMBER_LIST_SYNC", { from: peerId, payload: data });
      const payload = normalizeMemberList(data);
      if (!payload) return;
      memberListRef.current = [...payload.members];
      handlersRef.current.onMemberListSync?.(payload, peerId);
    });

    getKick((data) => {
      logTrystero("room", "recv ROOM_KICK", data);
      const payload = data as RoomKick;
      if (!payload?.targetPeerId) return;
      if (String(payload.targetPeerId) !== getTrysteroSelfId()) return;
      try {
        room.leave();
      } catch {
        // noop
      }
      roomRef.current = null;
      setConnected(false);
      setPeerIds([]);
      setPeerStates({});
    });

    setConnected(true);
    void sendSelfIdentity();
    if (isHost) {
      void broadcastMemberList();
    }

    const heartbeat = window.setInterval(() => {
      void sendSelfIdentity();
    }, 5000);

    const memberListResync = isHost
      ? window.setInterval(() => {
          void broadcastMemberList();
        }, 10000)
      : null;

    return () => {
      logTrystero("room", "cleanup", { roomId });
      window.clearInterval(heartbeat);
      if (memberListResync) window.clearInterval(memberListResync);
      try {
        room.leave();
      } catch {
        // noop
      }
      roomRef.current = null;
      actionsRef.current = {};
      setConnected(false);
      setPeerIds([]);
      setPeerStates({});
      memberListRef.current = [];
    };
  }, [enabled, roomId, isHost, selfName, password]);

  const peers = useMemo(() => memberListRef.current.map((member) => ({
    peerId: member.playerId,
    name: member.name,
    isHost: Boolean(member.isHost),
    joinedAt: member.joinedAt,
  })), [connected, peerIds, peerStates]);

  const leaveRoom = useMemo(() => {
    return () => {
      try {
        roomRef.current?.leave();
      } catch {
        // noop
      }
      roomRef.current = null;
      actionsRef.current = {};
      setConnected(false);
      setPeerIds([]);
      setPeerStates({});
      memberListRef.current = [];
    };
  }, []);

  const kickPeer = useMemo(() => {
    return async (targetPeerId: string, reason?: string) => {
      if (!actionsRef.current.sendKick || !targetPeerId) return;
      const payload = { roomId, targetPeerId, reason, ts: nowTs() };
      logTrystero("room", "send ROOM_KICK", { target: targetPeerId, payload });
      await actionsRef.current.sendKick(payload, targetPeerId);
    };
  }, [roomId]);

  const sendJsonToPeers = useMemo(() => {
    return async (message: any, targetPeers?: string | string[] | null) => {
      if (!actionsRef.current.sendMessage) return;
      logTrystero("room", "send ROOM_MESSAGE", { targetPeers: targetPeers ?? null, payload: message });
      await actionsRef.current.sendMessage(message, targetPeers ?? null);
    };
  }, []);

  const sendSettingsUpdate = useMemo(() => {
    return async (settings: Record<string, any>, targetPeers?: string | string[] | null) => {
      if (!actionsRef.current.sendSettingsUpdate) return;
      const payload = { settings: { ...(settings || {}) }, ts: nowTs() };
      logTrystero("room", "send UPDATE_SETTINGS", { targetPeers: targetPeers ?? null, payload });
      await actionsRef.current.sendSettingsUpdate(payload, targetPeers ?? null);
    };
  }, []);

  const sendPlayerStatus = useMemo(() => {
    return async (payload: Omit<RoomPlayerStatus, "ts">, targetPeers?: string | string[] | null) => {
      if (!actionsRef.current.sendPlayerStatus) return;
      const nextPayload = { ...payload, ts: nowTs() };
      logTrystero("room", "send PLAYER_STATUS", { targetPeers: targetPeers ?? null, payload: nextPayload });
      await actionsRef.current.sendPlayerStatus(nextPayload, targetPeers ?? null);
    };
  }, []);

  const sendChatMessage = useMemo(() => {
    return async (payload: RoomChatMessage, targetPeers?: string | string[] | null) => {
      if (!actionsRef.current.sendChatMessage) return;
      logTrystero("room", "send CHAT_MESSAGE", { targetPeers: targetPeers ?? null, payload });
      await actionsRef.current.sendChatMessage(payload, targetPeers ?? null);
    };
  }, []);

  const sendIdentitySync = useMemo(() => {
    return async (payload: Omit<RoomIdentitySync, "ts">, targetPeers?: string | string[] | null) => {
      if (!actionsRef.current.sendIdentitySync) return;
      const nextPayload = { ...payload, ts: nowTs() };
      logTrystero("room", "send IDENTITY_SYNC", { targetPeers: targetPeers ?? null, payload: nextPayload });
      await actionsRef.current.sendIdentitySync(nextPayload, targetPeers ?? null);
    };
  }, []);

  const sendMemberListSync = useMemo(() => {
    return async (payload: Omit<RoomMemberListSync, "ts">, targetPeers?: string | string[] | null) => {
      if (!actionsRef.current.sendMemberListSync) return;
      const nextPayload = { ...payload, ts: nowTs() };
      logTrystero("room", "send ROOM_MEMBER_LIST_SYNC", { targetPeers: targetPeers ?? null, payload: nextPayload });
      await actionsRef.current.sendMemberListSync(nextPayload, targetPeers ?? null);
    };
  }, []);

  return {
    connected,
    peerIds,
    peerStates,
    peers,
    leaveRoom,
    kickPeer,
    sendJsonToPeers,
    sendSettingsUpdate,
    sendPlayerStatus,
    sendChatMessage,
    sendIdentitySync,
    sendMemberListSync,
    roomRef,
  };
}
