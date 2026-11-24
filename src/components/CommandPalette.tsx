import React, { useEffect, useMemo, useState } from "react";
import { Search, ArrowRight, Cpu, Wrench, FileCode2 } from "lucide-react";
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
    const items: {
      id: string;
      title: string;
      subtitle: string;
      category: string;
      action: () => void;
    }[] = [
      {
        id: "mod-hw",
        title: "硬件检测与一键生成专属 EFI 向导",
        subtitle: "扫描本机 CPU/显卡/NVMe/声卡并输出 Dortania 兼容性诊断与建议",
        category: "模块跳转",
        action: () => setActiveModule("hardware"),
      },
      {
        id: "tool-log",
        title: "OpenCore 启动日志与卡代码分析器",
        subtitle: "排查 EXITBS:START、CFG Lock、PCI configuration begin 等报错",
        category: "排错工具箱",
        action: () => {
          setActiveModule("toolbox");
          setToolboxTab("log");
        },
      },
      {
        id: "tool-audio",
        title: "AppleALC 声卡 Layout-ID 速查与一键注入",
        subtitle: "查询 ALC897 / ALC256 / ALC1220 等芯片全部可用 alcid",
        category: "排错工具箱",
        action: () => {
          setActiveModule("toolbox");
          setToolboxTab("audio");
        },
      },
      {
        id: "tool-esp",
        title: "ESP 系统引导分区安全挂载器",
        subtitle: "列出磁盘 EFI 分区并一键提权挂载",
        category: "排错工具箱",
        action: () => {
          setActiveModule("toolbox");
          setToolboxTab("esp");
        },
      },
    ];

    Object.values(QUIRKS_ENCYCLOPEDIA).forEach((q) => {
      items.push({
        id: `quirk-${q.section}-${q.key}`,
        title: `${q.key} (${q.section} -> Quirks)`,
        subtitle: `${q.titleZh} — ${q.dortaniaTip}`,
        category: "配置项百科",
        action: () => {
          setActiveModule("editor");
          setActiveEditorTab(q.section as EditorTab);
        },
      });
    });

    const qLower = query.trim().toLowerCase();
    if (!qLower) return items.slice(0, 12);
    return items
      .filter(
        (it) =>
          it.title.toLowerCase().includes(qLower) ||
          it.subtitle.toLowerCase().includes(qLower)
      )
      .slice(0, 16);
  }, [query, setActiveModule, setActiveEditorTab, setToolboxTab]);

  if (!showCommandPalette) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/65 backdrop-blur-xs flex items-start justify-center pt-24 px-4"
      onClick={() => setShowCommandPalette(false)}
    >
      <div
        className="w-full max-w-2xl bg-zinc-900 border border-zinc-700/80 rounded-2xl shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 px-4 py-3.5 border-b border-zinc-800">
          <Search className="w-4 h-4 text-blue-400" />
          <input
            autoFocus
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="搜索任意 OpenCore Quirk 开关、中英释义、三码或排错工具 (Esc 关闭)..."
            className="w-full bg-transparent text-sm text-zinc-100 placeholder:text-zinc-500 outline-none"
          />
        </div>

        <div className="max-h-96 overflow-y-auto divide-y divide-zinc-800/60">
          {results.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                item.action();
                setShowCommandPalette(false);
                setQuery("");
              }}
              className="w-full text-left px-4 py-3 hover:bg-zinc-800/70 flex items-center justify-between gap-4 transition"
            >
              <div className="flex items-start gap-3 min-w-0">
                <div className="mt-0.5 p-1.5 rounded-lg bg-zinc-800 text-blue-400">
                  {item.category === "模块跳转" ? (
                    <Cpu className="w-4 h-4" />
                  ) : item.category === "排错工具箱" ? (
                    <Wrench className="w-4 h-4" />
                  ) : (
                    <FileCode2 className="w-4 h-4" />
                  )}
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-zinc-100 truncate">
                      {item.title}
                    </span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400">
                      {item.category}
                    </span>
                  </div>
                  <p className="text-xs text-zinc-400 truncate mt-0.5">{item.subtitle}</p>
                </div>
              </div>
              <ArrowRight className="w-4 h-4 text-zinc-500 shrink-0" />
            </button>
          ))}
          {results.length === 0 && (
            <div className="py-10 text-center text-xs text-zinc-500">
              未找到匹配的配置项或工具，请尝试输入如 RebuildAppleMemoryMap、CFG Lock、ALC897
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
