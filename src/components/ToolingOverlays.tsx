import { createPortal } from "react-dom";
import { useEffect, useState } from "react";

type RefEl = React.RefObject<HTMLElement | null>;

function cn(...arr: Array<string | false | null | undefined>) {
  return arr.filter(Boolean).join(" ");
}

export function KeypadPopover({
  open,
  anchorRef,
  value,
  onClose,
  onAppend,
  onDelete,
  onClear,
}: {
  open: boolean;
  anchorRef: RefEl;
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
      style={{ left: pos.left, top: pos.top, width: pos.width, transform: "translate(-50%, -100%)" }}
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

export function ShapePopover({
  open,
  anchorRef,
  value,
  onClose,
  onSelect,
  onClear,
}: {
  open: boolean;
  anchorRef: RefEl;
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
      style={{ left: pos.left, top: pos.top, width: pos.width, transform: "translate(-50%, 0)" }}
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

export function QualityPopover({
  open,
  anchorRef,
  value,
  onClose,
  onSelect,
  onClear,
  QUALITY_TEXT_COLOR,
  QUALITIES,
}: {
  open: boolean;
  anchorRef: RefEl;
  value: string;
  onClose: () => void;
  onSelect: (quality: string) => void;
  onClear: () => void;
  QUALITY_TEXT_COLOR: Record<string, string>;
  QUALITIES: readonly string[];
}) {
  const [pos, setPos] = useState({ left: 0, top: 0, width: 320 });

  useEffect(() => {
    if (!open) return;
    const updatePosition = () => {
      const rect = anchorRef.current?.getBoundingClientRect();
      if (!rect) return;
      const width = Math.min(320, window.innerWidth - 16);
      const left = Math.min(Math.max(rect.left + rect.width / 2, width / 2 + 8), window.innerWidth - width / 2 - 8);
      const top = Math.min(rect.bottom + 8, window.innerHeight - 420);
      setPos({ left, top, width });
    };
    const closeByOutside = (event: PointerEvent) => {
      if (!anchorRef.current?.contains(event.target as Node)) {
        const target = event.target as HTMLElement;
        if (!target.closest?.("[data-quality-panel='1']")) onClose();
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
      data-quality-panel="1"
      className="fixed z-[130] rounded-3xl border border-white/10 bg-[#0b1020]/96 p-2 shadow-2xl backdrop-blur-xl"
      style={{ left: pos.left, top: pos.top, width: pos.width, transform: "translate(-50%, 0)" }}
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <div>
          <p className="text-xs text-amber-100">品级筛选</p>
          <p className="text-[10px] text-zinc-400">当前：{value === "全部" ? "全部品级" : value}</p>
        </div>
        <div className="flex items-center gap-1.5">
          <button className="rounded-lg border border-white/10 px-2 py-1 text-[10px] text-zinc-300" onClick={onClear}>清空</button>
          <button className="rounded-lg border border-white/10 px-2 py-1 text-[10px] text-zinc-300" onClick={onClose}>关闭</button>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-2">
        {QUALITIES.map((quality) => {
          const active = value === quality;
          return (
            <button
              key={quality}
              onClick={() => {
                onSelect(quality);
                onClose();
              }}
              className={cn(
                "rounded-xl border px-3 py-2 text-sm font-medium",
                active ? "border-cyan-300 bg-cyan-500/10 text-cyan-100" : "border-white/10 bg-slate-950/60",
                QUALITY_TEXT_COLOR[quality]
              )}
            >
              {quality}
            </button>
          );
        })}
      </div>
    </div>,
    document.body
  );
}

export function ToolPopover({
  open,
  anchorRef,
  tools,
  disabledToolIds,
  unaffordableToolIds,
  onClose,
  onSelect,
}: {
  open: boolean;
  anchorRef: RefEl;
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
          <p className="text-xs text-cyan-100">选择推演</p>
          <p className="text-[10px] text-zinc-400">同一推演每回合仅可施展一次</p>
        </div>
        <button className="rounded-lg border border-white/10 px-2 py-1 text-[10px] text-zinc-300" onClick={onClose}>关闭</button>
      </div>
      <div className="grid max-h-[72vh] grid-cols-8 gap-2 overflow-y-auto pr-1">
        {tools.map((tool) => {
          const used = disabledToolIds.has(tool.id);
          const noMoney = unaffordableToolIds.has(tool.id);
          const disabled = used || noMoney;
          return (
            <button
              key={tool.id}
              disabled={disabled}
              onClick={() => !disabled && onSelect(tool)}
              className={cn(
                "relative h-16 w-16 rounded-xl border p-1 text-center sm:h-18 sm:w-18",
                disabled ? "border-slate-700/60 bg-slate-800/50 text-zinc-600" : "border-white/10 bg-slate-950/60 text-zinc-100 hover:border-cyan-300/40"
              )}
              title={`${tool.name}｜${tool.desc}｜价格：${tool.cost} 灵石/次`}
            >
              <div className="flex h-full items-center justify-center">
                <span className="text-sm font-semibold leading-tight text-cyan-50 sm:text-base">{tool.short || tool.name}</span>
              </div>
              {used && <span className="absolute right-1 top-1 text-xs text-emerald-200">✓</span>}
              {!used && noMoney && <span className="absolute right-1 top-1 text-xs text-rose-300">×</span>}
            </button>
          );
        })}
      </div>
    </div>,
    document.body
  );
}

export function ToolConfirmDialog({
  open,
  selectedTool,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  selectedTool: any | null;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  if (!open || !selectedTool) return null;

  return (
    <div className="fixed inset-0 z-[150] flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-sm rounded-3xl border border-white/10 bg-[#0b1020] p-5 shadow-2xl">
        <p className="text-lg text-cyan-100">确认施展推演</p>
        <p className="mt-3 text-zinc-200">是否使用【{selectedTool.name}】？</p>
        <p className="mt-1 text-sm text-zinc-400">{selectedTool.desc}</p>
        <p className="mt-1 text-sm text-amber-200">消耗：{selectedTool.cost} 灵石</p>
        <div className="mt-4 flex gap-2">
          <button className="flex-1 rounded-xl border border-white/10 bg-black/20 py-2 text-zinc-300" onClick={onCancel}>取消</button>
          <button className="flex-1 rounded-xl border border-cyan-400/30 bg-cyan-500/10 py-2 text-cyan-100" onClick={onConfirm}>确认使用</button>
        </div>
      </div>
    </div>
  );
}
