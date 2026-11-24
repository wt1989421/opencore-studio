import React, { useEffect, useState } from "react";
import { ChevronDown, ChevronRight, Code2, Copy, Check, Plus, Trash2 } from "lucide-react";
import { useWorkspaceStore } from "../store/workspaceStore";
import type { PlistNode } from "../types/opencore";
import { apiExportPlistXml, isTauriRuntime } from "../lib/tauri-bridge";

const KIND_BADGE: Record<PlistNode["kind"], { label: string; cls: string }> = {
  Dict: { label: "Dict", cls: "bg-purple-500/15 text-purple-300 border-purple-500/30" },
  Array: { label: "Array", cls: "bg-indigo-500/15 text-indigo-300 border-indigo-500/30" },
  String: { label: "String", cls: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30" },
  Integer: { label: "Number", cls: "bg-amber-500/15 text-amber-300 border-amber-500/30" },
  Real: { label: "Real", cls: "bg-amber-500/15 text-amber-300 border-amber-500/30" },
  Boolean: { label: "Bool", cls: "bg-sky-500/15 text-sky-300 border-sky-500/30" },
  Data: { label: "Data (Hex)", cls: "bg-pink-500/15 text-pink-300 border-pink-500/30" },
  Date: { label: "Date", cls: "bg-zinc-500/15 text-zinc-300 border-zinc-500/30" },
};

interface TreeRowProps {
  label: string;
  node: PlistNode;
  depth: number;
  defaultOpen?: boolean;
  onChange: (next: PlistNode) => void;
  onDelete?: () => void;
}

const TreeRow: React.FC<TreeRowProps> = ({
  label,
  node,
  depth,
  defaultOpen = false,
  onChange,
  onDelete,
}) => {
  const [open, setOpen] = useState(defaultOpen || depth < 1);
  const isContainer = node.kind === "Dict" || node.kind === "Array";
  const badge = KIND_BADGE[node.kind];

  const handleAddChild = () => {
    if (node.kind === "Dict") {
      const keyName = `CustomKey_${node.val.length + 1}`;
      onChange({
        kind: "Dict",
        val: [...node.val, [keyName, { kind: "String", val: "" }]],
      });
      setOpen(true);
    } else if (node.kind === "Array") {
      onChange({
        kind: "Array",
        val: [...node.val, { kind: "String", val: "" }],
      });
      setOpen(true);
    }
  };

  return (
    <div className="select-none">
      <div
        className="group flex items-center gap-2 py-1.5 px-2 rounded-md hover:bg-zinc-800/60 border-b border-zinc-900/60 text-xs"
        style={{ paddingLeft: `${depth * 18 + 8}px` }}
      >
        {isContainer ? (
          <button
            type="button"
            onClick={() => setOpen(!open)}
            className="p-0.5 text-zinc-400 hover:text-zinc-100"
          >
            {open ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
          </button>
        ) : (
          <span className="w-4" />
        )}

        <span className="font-mono font-medium text-zinc-200 min-w-[160px] truncate" title={label}>
          {label}
        </span>

        <span className={`px-1.5 py-0.5 text-[10px] font-mono rounded border ${badge.cls}`}>
          {badge.label}
        </span>

        <div className="flex-1 ml-2">
          {node.kind === "Boolean" && (
            <button
              type="button"
              onClick={() => onChange({ kind: "Boolean", val: !node.val })}
              className={`px-2.5 py-0.5 rounded font-mono text-xs transition ${
                node.val
                  ? "bg-blue-600/30 text-blue-300 border border-blue-500/40"
                  : "bg-zinc-800 text-zinc-400 border border-zinc-700"
              }`}
            >
              {node.val ? "True" : "False"}
            </button>
          )}
          {node.kind === "String" && (
            <input
              type="text"
              value={node.val}
              onChange={(e) => onChange({ kind: "String", val: e.target.value })}
              className="w-full bg-zinc-900/90 border border-zinc-800 focus:border-blue-500 rounded px-2 py-0.5 font-mono text-zinc-200 outline-none"
            />
          )}
          {node.kind === "Data" && (
            <input
              type="text"
              value={node.val}
              placeholder="HEX 字节 (如 07009B3E)"
              onChange={(e) =>
                onChange({ kind: "Data", val: e.target.value.toUpperCase() })
              }
              className="w-full bg-zinc-900/90 border border-pink-900/40 focus:border-pink-500 rounded px-2 py-0.5 font-mono text-pink-200 outline-none"
            />
          )}
          {node.kind === "Integer" && (
            <input
              type="number"
              value={node.val}
              onChange={(e) =>
                onChange({ kind: "Integer", val: parseInt(e.target.value || "0", 10) })
              }
              className="w-40 bg-zinc-900/90 border border-zinc-800 focus:border-amber-500 rounded px-2 py-0.5 font-mono text-amber-200 outline-none"
            />
          )}
          {(node.kind === "Dict" || node.kind === "Array") && (
            <span className="text-zinc-500 font-mono">
              ({node.val.length} 项)
            </span>
          )}
        </div>

        <div className="opacity-0 group-hover:opacity-100 flex items-center gap-1 transition">
          {isContainer && (
            <button
              type="button"
              onClick={handleAddChild}
              title="添加子项"
              className="p-1 text-zinc-400 hover:text-emerald-400 rounded hover:bg-zinc-800"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
          )}
          {onDelete && (
            <button
              type="button"
              onClick={onDelete}
              title="删除此项"
              className="p-1 text-zinc-400 hover:text-rose-400 rounded hover:bg-zinc-800"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {isContainer && open && (
        <div>
          {node.kind === "Dict" &&
            node.val.map(([k, child], idx) => (
              <TreeRow
                key={`${k}-${idx}`}
                label={k}
                node={child}
                depth={depth + 1}
                onChange={(updatedChild) => {
                  const next = [...node.val];
                  next[idx] = [k, updatedChild];
                  onChange({ kind: "Dict", val: next });
                }}
                onDelete={() => {
                  const next = node.val.filter((_, i) => i !== idx);
                  onChange({ kind: "Dict", val: next });
                }}
              />
            ))}
          {node.kind === "Array" &&
            node.val.map((child, idx) => (
              <TreeRow
                key={idx}
                label={`Item [${idx}]`}
                node={child}
                depth={depth + 1}
                onChange={(updatedChild) => {
                  const next = [...node.val];
                  next[idx] = updatedChild;
                  onChange({ kind: "Array", val: next });
                }}
                onDelete={() => {
                  const next = node.val.filter((_, i) => i !== idx);
                  onChange({ kind: "Array", val: next });
                }}
              />
            ))}
        </div>
      )}
    </div>
  );
};

export const RawPlistTreeView: React.FC = () => {
  const { plist, replacePlist } = useWorkspaceStore();
  const [filter, setFilter] = useState("");

  const filteredRoot: PlistNode =
    !filter.trim() || plist.kind !== "Dict"
      ? plist
      : {
          kind: "Dict",
          val: plist.val.filter(([k, v]) =>
            JSON.stringify([k, v]).toLowerCase().includes(filter.toLowerCase())
          ),
        };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4 bg-zinc-900/70 border border-zinc-800/80 rounded-xl p-4">
        <div>
          <h3 className="text-sm font-semibold text-zinc-100">
            无损 Plist 键值树编辑器 (ProperTree / OCAT 模式)
          </h3>
          <p className="text-xs text-zinc-400 mt-0.5">
            完整保留所有未知自定义键（如 #WARNING、自定义 NVRAM GUID），Data 类型自动以大写十六进制展示并在保存时无损编码为标准 Base64 &lt;data&gt;。
          </p>
        </div>
        <input
          type="text"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="过滤节点或键名..."
          className="w-64 bg-zinc-950 border border-zinc-800 focus:border-blue-500 rounded-lg px-3 py-1.5 text-xs text-zinc-200 outline-none"
        />
      </div>

      <div className="bg-zinc-900/50 border border-zinc-800/80 rounded-xl p-2 overflow-x-auto">
        <TreeRow
          label="Root (config.plist)"
          node={filteredRoot}
          depth={0}
          defaultOpen
          onChange={(next) => {
            if (!filter.trim()) replacePlist(next);
          }}
        />
      </div>
    </div>
  );
};

export const XmlSourcePreview: React.FC = () => {
  const { plist, pushToast } = useWorkspaceStore();
  const [xml, setXml] = useState<string>("正在渲染标准 Apple XML Plist...");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (isTauriRuntime()) {
      apiExportPlistXml(plist)
        .then(setXml)
        .catch((err) => setXml(`序列化预览失败: ${String(err)}`));
    } else {
      setXml(JSON.stringify(plist, null, 2));
    }
  }, [plist]);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(xml);
    setCopied(true);
    pushToast("success", "已复制完整 XML config.plist 到剪贴板");
    setTimeout(() => setCopied(false), 1800);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between bg-zinc-900/70 border border-zinc-800/80 rounded-xl p-4">
        <div className="flex items-center gap-2.5">
          <Code2 className="w-5 h-5 text-blue-400" />
          <div>
            <h3 className="text-sm font-semibold text-zinc-100">实时 Apple XML Plist 源码预览</h3>
            <p className="text-xs text-zinc-400">
              由 Rust <code className="text-zinc-300">plist</code> 引擎实时序列化的标准输出，可直接用于 OpenCore 引导
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={handleCopy}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-xs text-zinc-200 transition"
        >
          {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
          {copied ? "已复制" : "复制 XML"}
        </button>
      </div>

      <pre className="bg-zinc-950 border border-zinc-800/90 rounded-xl p-4 text-xs font-mono text-zinc-300 overflow-auto max-h-[68vh] leading-relaxed">
        {xml}
      </pre>
    </div>
  );
};
