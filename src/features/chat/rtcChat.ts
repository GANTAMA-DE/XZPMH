export type ChatMessage = {
  id: string;
  senderId: string;
  senderName: string;
  text: string;
  time: string;
};

export type RtcChatEnvelope = {
  type: "chat";
  payload: ChatMessage;
};

function rtcNowText() {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}:${String(
    d.getSeconds()
  ).padStart(2, "0")}`;
}

export function buildRtcChatMessage({
  senderId,
  senderName,
  text,
}: {
  senderId: string;
  senderName: string;
  text: string;
}): ChatMessage {
  return {
    id: `rtc_${senderId}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    senderId,
    senderName,
    text,
    time: rtcNowText(),
  };
}

export function appendUniqueChatMessage(prev: ChatMessage[], message: ChatMessage) {
  if (!message?.id) return prev;
  if (prev.some((msg) => msg.id === message.id)) return prev;
  return [...prev, message].slice(-80);
}

export function isRtcChatEnvelope(message: unknown): message is RtcChatEnvelope {
  return Boolean(
    message &&
      typeof message === "object" &&
      (message as { type?: unknown }).type === "chat" &&
      (message as { payload?: unknown }).payload
  );
}