import React, { useEffect, useMemo, useState } from "react";
import { ArrowRight, Search } from "lucide-react";
import { QUIRKS_ENCYCLOPEDIA } from "../data/quirks-encyclopedia";
import { useWorkspaceStore, type EditorTab } from "../store/workspaceStore";

export const CommandPalette: React.FC = () => {
  const {
    showCommandPalette,
    setShowCommandPalette,
    setActiveModule,
    setActiveEditorTab,
    setToolboxTab,
  } = useWorkspaceStore();
  const [query, setQuery] = useState("");

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setShowCommandPalette(!showCommandPalette);
      } else if (e.key === "Escape" && showCommandPalette) {
        setShowCommandPalette(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [showCommandPalette, setShowCommandPalette]);

  const results = useMemo(() => {
    const items = [
      {
        id: "mod-hw",
        title: "硬件检测与一键生成 EFI",
        subtitle: "探测 CPU/显卡/硬盘并生成专属配置",
        action: () => setActiveModule("hardware"),
      },
      {
        id: "tool-log",
        title: "启动卡代码与日志诊断器",
        subtitle: "排查 EXITBS:START、CFG Lock 等报错",
        action: () => {
          setActiveModule("toolbox");
          setToolboxTab("log");
        },
      },
      {
        id: "tool-audio",
        title: "AppleALC 声卡 Layout-ID 速查",
        subtitle: "查询 ALC897 / ALC256 / ALC1220 推荐 ID",
        action: () => {
          setActiveModule("toolbox");
          setToolboxTab("audio");
        },
      },
      ...Object.values(QUIRKS_ENCYCLOPEDIA).map((q) => ({
        id: `q-${q.section}-${q.key}`,
        title: `${q.titleZh} (${q.key})`,
        subtitle: `${q.section} -> Quirks · ${q.dortaniaTip}`,
        action: () => {
          setActiveModule("editor");
          setActiveEditorTab(q.section as EditorTab);
        },
      })),
    ];

    const qLower = query.trim().toLowerCase();
    if (!qLower) return items.slice(0, 10);
    return items
      .filter(
        (it) =>
          it.title.toLowerCase().includes(qLower) ||
          it.subtitle.toLowerCase().includes(qLower)
      )
      .slice(0, 14);
  }, [query, setActiveModule, setActiveEditorTab, setToolboxTab]);

  if (!showCommandPalette) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/25 backdrop-blur-xs flex items-start justify-center pt-20 px-4"
      onClick={() => setShowCommandPalette(false)}
    >
      <div
        className="w-full max-w-xl bg-white/95 backdrop-blur-xl border border-black/[0.1] rounded-[16px] shadow-[0_20px_50px_rgba(0,0,0,0.18)] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 px-4 py-3.5 border-b border-black/[0.07]">
          <Search className="w-4 h-4 text-[#007AFF]" />
          <input
            autoFocus
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="搜索任意设置项、Quirk 开关或声卡排错工具..."
            className="w-full bg-transparent text-[13.5px] text-[#1D1D1F] placeholder:text-[#86868B] outline-none"
          />
        </div>
        <div className="max-h-80 overflow-y-auto divide-y divide-black/[0.05]">
          {results.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                item.action();
                setShowCommandPalette(false);
                setQuery("");
              }}
              className="w-full text-left px-4 py-2.5 hover:bg-[#007AFF] group flex items-center justify-between gap-3 transition-colors"
            >
              <div className="min-w-0">
                <div className="text-[13px] font-medium text-[#1D1D1F] group-hover:text-white truncate">
                  {item.title}
                </div>
                <div className="text-[11.5px] text-[#86868B] group-hover:text-white/85 truncate">
                  {item.subtitle}
                </div>
              </div>
              <ArrowRight className="w-4 h-4 text-[#86868B] group-hover:text-white shrink-0" />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};
