import React from "react";

type CatalogSortKey = "type" | "name" | "quality" | "shape" | "size" | "price";

type HoverTipProps = {
  label: React.ReactNode;
  content: React.ReactNode;
  className?: string;
  side?: "bottom" | "top";
  style?: React.CSSProperties;
};

function cn(...arr: Array<string | false | null | undefined>) {
  return arr.filter(Boolean).join(" ");
}

function HoverTip({ label, content, className = "", side = "bottom", style }: HoverTipProps) {
  const [open, setOpen] = React.useState(false);
  const [pos, setPos] = React.useState({ left: 0, top: 0, width: 320, transform: "translate(-50%, 0)" as string, ready: false });
  const anchorRef = React.useRef<HTMLDivElement | null>(null);
  const tipRef = React.useRef<HTMLDivElement | null>(null);
  const canHover = typeof window !== "undefined" && !!window.matchMedia?.("(hover: hover) and (pointer: fine)")?.matches;

  React.useEffect(() => {
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
      const safeTop = useTop ? Math.max(tipHeight + 12, rawTop) : Math.min(viewportHeight - tipHeight - 12, rawTop);
      setPos({ left, top: safeTop, width: maxWidth, transform: useTop ? "translate(-50%, -100%)" : "translate(-50%, 0)", ready: true });
    };
    const raf = window.requestAnimationFrame(updatePosition);
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.cancelAnimationFrame(raf);
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [open, side, content]);

  return (
    <div
      ref={anchorRef}
      className={cn("relative", className)}
      style={style}
      onMouseEnter={() => canHover && setOpen(true)}
      onMouseLeave={() => canHover && setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
    >
      {label}
      {open && typeof document !== "undefined" && (
        <div className="pointer-events-none fixed inset-0 z-[2147483647]">
          <div
            ref={tipRef}
            className="absolute rounded-2xl border border-white/10 bg-[#0a0f1b]/98 p-3 text-xs text-zinc-200 shadow-2xl backdrop-blur-xl"
            style={{ left: pos.left, top: pos.top, width: pos.width, maxWidth: pos.width, transform: pos.transform, opacity: pos.ready ? 1 : 0 }}
          >
            {content}
          </div>
        </div>
      )}
    </div>
  );
}

export function CodexModal({
  open,
  codexViewMode,
  setCodexViewMode,
  catalogFilter,
  setCatalogFilter,
  filteredCatalog,
  TYPES,
  QUALITY_TEXT_COLOR,
  shapeAnchorRef,
  qualityAnchorRef,
  onOpenShapePicker,
  onOpenQualityPicker,
  onReset,
  onResetFilterAndSort,
  onClose,
  renderSortMark,
  toggleCatalogSort,
}: {
  open: boolean;
  codexViewMode: "list" | "card";
  setCodexViewMode: React.Dispatch<React.SetStateAction<"list" | "card">>;
  catalogFilter: { type: string; quality: string; shape: string; min: number; max: number };
  setCatalogFilter: React.Dispatch<React.SetStateAction<{ type: string; quality: string; shape: string; min: number; max: number }>>;
  filteredCatalog: any[];
  TYPES: string[];
  QUALITY_TEXT_COLOR: Record<string, string>;
  shapeAnchorRef: React.RefObject<HTMLButtonElement | null>;
  qualityAnchorRef: React.RefObject<HTMLButtonElement | null>;
  onOpenShapePicker: () => void;
  onOpenQualityPicker: () => void;
  onReset: () => void;
  onResetFilterAndSort: () => void;
  onClose: () => void;
  renderSortMark: (key: CatalogSortKey) => string;
  toggleCatalogSort: (key: CatalogSortKey) => void;
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-40 bg-black/70 p-4">
      <div className="mx-auto max-h-[92vh] max-w-[1100px] overflow-y-auto rounded-3xl border border-white/10 bg-[#0b1020] p-5 shadow-2xl">
        <div className="mb-3 flex items-center justify-between gap-3">
          <p className="text-lg text-fuchsia-100">万物图鉴</p>
          <div className="flex items-center gap-2">
            <button className="rounded-xl border border-white/10 px-3 py-1 text-sm text-zinc-300" onClick={onResetFilterAndSort}>重置</button>
            <button className={cn("rounded-xl border px-3 py-1 text-sm", codexViewMode === "list" ? "border-cyan-300 bg-cyan-500/10 text-cyan-100" : "border-white/10 text-zinc-300")} onClick={() => { onReset(); setCodexViewMode("list"); }}>列表</button>
            <button className={cn("rounded-xl border px-3 py-1 text-sm", codexViewMode === "card" ? "border-cyan-300 bg-cyan-500/10 text-cyan-100" : "border-white/10 text-zinc-300")} onClick={() => setCodexViewMode("card")}>卡片</button>
            <button className="rounded-xl border border-white/10 px-3 py-1" onClick={onClose}>关闭</button>
          </div>
        </div>
        <div className="grid gap-2 md:grid-cols-5">
          <select value={catalogFilter.type} onChange={(e) => setCatalogFilter((f) => ({ ...f, type: e.target.value }))} className="rounded-xl border border-white/10 bg-slate-950/80 px-3 py-2"><option value="全部">全部类型</option>{TYPES.map((t: string) => <option key={t} value={t}>{t}</option>)}</select>
          <button ref={qualityAnchorRef} className={cn("rounded-xl border border-white/10 bg-slate-950/80 px-3 py-2 text-left", catalogFilter.quality !== "全部" ? QUALITY_TEXT_COLOR[catalogFilter.quality] : "text-zinc-300")} onClick={onOpenQualityPicker}>
            {catalogFilter.quality === "全部" ? "选择品级" : `品级：${catalogFilter.quality}`}
          </button>
          <button ref={shapeAnchorRef} className="rounded-xl border border-white/10 bg-slate-950/80 px-3 py-2 text-left text-zinc-300" onClick={onOpenShapePicker}>
            {catalogFilter.shape === "全部" ? "选择形状" : `形状：${catalogFilter.shape}`}
          </button>
          <input type="number" className="rounded-xl border border-white/10 bg-slate-950/80 px-3 py-2" value={catalogFilter.min} onChange={(e) => setCatalogFilter((f) => ({ ...f, min: Number(e.target.value) || 0 }))} placeholder="最低价" />
          <input type="number" className="rounded-xl border border-white/10 bg-slate-950/80 px-3 py-2" value={catalogFilter.max} onChange={(e) => setCatalogFilter((f) => ({ ...f, max: Number(e.target.value) || 99999999 }))} placeholder="最高价" />
        </div>

        {codexViewMode === "list" ? (
          <div className="mt-4 overflow-x-auto rounded-2xl border border-white/10 bg-slate-950/35 pb-1">
            <div className="min-w-[860px] w-full text-sm">
              <div className="grid w-full grid-cols-[1.15fr_1.8fr_0.9fr_1fr_0.8fr_1fr] bg-black/30 text-fuchsia-100">
                <button type="button" className="px-3 py-2 whitespace-nowrap text-left hover:bg-white/5" onClick={() => toggleCatalogSort("type")}>类型 {renderSortMark("type")}</button>
                <button type="button" className="px-3 py-2 whitespace-nowrap text-left hover:bg-white/5" onClick={() => toggleCatalogSort("name")}>名称 {renderSortMark("name")}</button>
                <button type="button" className="px-3 py-2 whitespace-nowrap text-left hover:bg-white/5" onClick={() => toggleCatalogSort("quality")}>品级 {renderSortMark("quality")}</button>
                <button type="button" className="px-3 py-2 whitespace-nowrap text-left hover:bg-white/5" onClick={() => toggleCatalogSort("shape")}>形状 {renderSortMark("shape")}</button>
                <button type="button" className="px-3 py-2 whitespace-nowrap text-left hover:bg-white/5" onClick={() => toggleCatalogSort("size")}>格数 {renderSortMark("size")}</button>
                <button type="button" className="px-3 py-2 whitespace-nowrap text-left hover:bg-white/5" onClick={() => toggleCatalogSort("price")}>价格 {renderSortMark("price")}</button>
              </div>
              {filteredCatalog.map((it: any) => (
                <HoverTip
                  key={it.id}
                  side="top"
                  content={<><p className="text-amber-100">{it.name}</p><p className="mt-1 text-zinc-300">类型：{it.type}｜品级：{it.quality}</p><p className="mt-1 text-zinc-300">形状：{it.shape}｜尺寸：{it.width} × {it.height}（{it.size}格）</p><p className="mt-1 text-amber-200">价格：{it.price} 灵石</p><p className="mt-2 text-zinc-400">{it.desc}</p></>}
                  label={<div className="grid w-full grid-cols-[1.15fr_1.8fr_0.9fr_1fr_0.8fr_1fr] border-t border-white/10 text-zinc-300 transition hover:bg-white/5"><div className="px-3 py-2 whitespace-nowrap">{it.type}</div><div className="px-3 py-2 whitespace-nowrap text-zinc-100">{it.name}</div><div className="px-3 py-2 whitespace-nowrap">{it.quality}</div><div className="px-3 py-2 whitespace-nowrap">{it.shape}</div><div className="px-3 py-2 whitespace-nowrap">{it.size}</div><div className="px-3 py-2 whitespace-nowrap text-amber-100">{it.price}</div></div>}
                />
              ))}
            </div>
          </div>
        ) : (
          <div className="mt-4 grid gap-2 grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
            {filteredCatalog.map((it: any) => (
              <HoverTip
                key={it.id}
                side="top"
                content={<><p className="text-amber-100">{it.name}</p><p className="mt-1 text-zinc-300">类型：{it.type}｜品级：{it.quality}</p><p className="mt-1 text-zinc-300">形状：{it.shape}｜尺寸：{it.width} × {it.height}（{it.size}格）</p><p className="mt-1 text-amber-200">价格：{it.price} 灵石</p><p className="mt-2 text-zinc-400">{it.desc}</p></>}
                label={<div className="rounded-xl border border-white/10 bg-slate-950/50 p-2.5 text-left"><div className="flex items-start justify-between gap-2"><p className="text-sm text-zinc-100">{it.name}</p><span className="text-xs text-zinc-400">{it.quality}</span></div><p className="mt-1 text-[11px] text-zinc-400">{it.type}｜{it.shape}｜{it.size}格</p><p className="mt-1 text-xs text-amber-100">{it.price} 灵石</p></div>}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
