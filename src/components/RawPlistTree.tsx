import React, { useEffect, useState } from "react";
import { Check, ChevronDown, ChevronRight, Copy, Plus, Trash2 } from "lucide-react";
import { apiExportPlistXml, isTauriRuntime } from "../lib/tauri-bridge";
import { useWorkspaceStore } from "../store/workspaceStore";
import type { PlistNode } from "../types/opencore";
import {
  SegmentedControl,
  SettingsGroup,
  appleInputCls,
  appleSecondaryBtnCls,
} from "./AppleUI";

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

  return (
    <div>
      <div
        className="group flex items-center gap-2 py-2 px-3 hover:bg-[#F5F5F7] border-b border-black/[0.05] text-[12px]"
        style={{ paddingLeft: `${depth * 18 + 12}px` }}
      >
        {isContainer ? (
          <button
            type="button"
            onClick={() => setOpen(!open)}
            className="p-0.5 text-[#86868B] hover:text-[#1D1D1F]"
          >
            {open ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
          </button>
        ) : (
          <span className="w-4" />
        )}

        <span className="font-mono font-medium text-[#1D1D1F] min-w-[160px] truncate">
          {label}
        </span>

        <span className="px-1.5 py-0.5 text-[10.5px] font-mono rounded bg-[#F2F2F7] text-[#6E6E73]">
          {node.kind}
        </span>

        <div className="flex-1 ml-2">
          {node.kind === "Boolean" && (
            <button
              type="button"
              onClick={() => onChange({ kind: "Boolean", val: !node.val })}
              className={`px-2.5 py-0.5 rounded-full font-mono text-[11.5px] font-medium ${
                node.val
                  ? "bg-[#007AFF]/12 text-[#0066CC]"
                  : "bg-[#F2F2F7] text-[#86868B]"
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
              className={`${appleInputCls} w-full py-1 font-mono`}
            />
          )}
          {node.kind === "Data" && (
            <input
              type="text"
              value={node.val}
              onChange={(e) => onChange({ kind: "Data", val: e.target.value.toUpperCase() })}
              className={`${appleInputCls} w-full py-1 font-mono text-[#0066CC]`}
            />
          )}
          {node.kind === "Integer" && (
            <input
              type="number"
              value={node.val}
              onChange={(e) =>
                onChange({ kind: "Integer", val: parseInt(e.target.value || "0", 10) })
              }
              className={`${appleInputCls} w-36 py-1 font-mono`}
            />
          )}
          {(node.kind === "Dict" || node.kind === "Array") && (
            <span className="text-[#86868B]">({node.val.length} 项)</span>
          )}
        </div>

        <div className="opacity-0 group-hover:opacity-100 flex items-center gap-1 transition">
          {isContainer && (
            <button
              type="button"
              onClick={() => {
                if (node.kind === "Dict") {
                  onChange({
                    kind: "Dict",
                    val: [...node.val, [`NewKey_${node.val.length + 1}`, { kind: "String", val: "" }]],
                  });
                } else if (node.kind === "Array") {
                  onChange({ kind: "Array", val: [...node.val, { kind: "String", val: "" }] });
                }
                setOpen(true);
              }}
              className="p-1 text-[#007AFF] hover:bg-white rounded"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
          )}
          {onDelete && (
            <button
              type="button"
              onClick={onDelete}
              className="p-1 text-[#86868B] hover:text-[#FF3B30] rounded"
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
  const { plist, replacePlist, pushToast } = useWorkspaceStore();
  const [viewMode, setViewMode] = useState<"tree" | "xml">("tree");
  const [xml, setXml] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (viewMode === "xml") {
      if (isTauriRuntime()) {
        apiExportPlistXml(plist).then(setXml).catch((e) => setXml(String(e)));
      } else {
        setXml(JSON.stringify(plist, null, 2));
      }
    }
  }, [viewMode, plist]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <SegmentedControl
          value={viewMode}
          onChange={(v) => setViewMode(v as "tree" | "xml")}
          options={[
            { id: "tree", label: "Plist 键值树编辑器" },
            { id: "xml", label: "Apple XML 源码预览" },
          ]}
        />
        {viewMode === "xml" && (
          <button
            type="button"
            onClick={async () => {
              await navigator.clipboard.writeText(xml);
              setCopied(true);
              pushToast("success", "已复制完整 XML 源码");
              setTimeout(() => setCopied(false), 1800);
            }}
            className={appleSecondaryBtnCls}
          >
            {copied ? <Check className="w-3.5 h-3.5 text-[#34C759]" /> : <Copy className="w-3.5 h-3.5" />}
            {copied ? "已复制" : "复制 XML"}
          </button>
        )}
      </div>

      {viewMode === "tree" ? (
        <SettingsGroup
          title="无损 Plist 树形节点"
          description="保留全部原始字段与自定义注释，Data 类型自动以十六进制展示"
        >
          <TreeRow
            label="Root (config.plist)"
            node={plist}
            depth={0}
            defaultOpen
            onChange={(next) => replacePlist(next)}
          />
        </SettingsGroup>
      ) : (
        <pre className="bg-white border border-black/[0.08] rounded-[12px] p-4 text-[12px] font-mono text-[#1D1D1F] overflow-auto max-h-[70vh] leading-relaxed shadow-sm">
          {xml}
        </pre>
      )}
    </div>
  );
};

export const XmlSourcePreview = RawPlistTreeView;
