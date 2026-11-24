import React, { useEffect, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  ExternalLink,
  HelpCircle,
  Plus,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Trash2,
} from "lucide-react";
import {
  COMMON_BOOT_ARGS,
  QUIRKS_ENCYCLOPEDIA,
  SIP_PRESETS,
} from "../data/quirks-encyclopedia";
import {
  apiApplyQuickFix,
  apiGenerateSmbios,
  apiListSmbiosModels,
  isTauriRuntime,
} from "../lib/tauri-bridge";
import { useWorkspaceStore } from "../store/workspaceStore";
import {
  getArray,
  getBool,
  getData,
  getDictEntries,
  getInt,
  getStr,
  littleEndianHexToU32,
  u32ToLittleEndianHex,
  type PlistNode,
  type SmbiosModelOption,
} from "../types/opencore";

const QuirkSwitchGrid: React.FC<{ section: string; path: string[] }> = ({ section, path }) => {
  const { plist, updatePlistPath } = useWorkspaceStore();
  const entries = getDictEntries(plist, path);

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
      {entries.map(([key, node]) => {
        const meta = QUIRKS_ENCYCLOPEDIA[key];
        if (node.kind === "Boolean") {
          return (
            <div
              key={key}
              className={`rounded-xl border p-3.5 transition ${
                node.val
                  ? "bg-blue-950/20 border-blue-500/40"
                  : "bg-zinc-900/50 border-zinc-800/80 hover:border-zinc-700"
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="font-mono text-xs font-semibold text-zinc-100 truncate">
                    {key}
                  </div>
                  <div className="text-[11px] text-zinc-400 mt-0.5">
                    {meta?.titleZh ?? `${section} 配置开关`}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    updatePlistPath([...path, key], { kind: "Boolean", val: !node.val })
                  }
                  className={`w-10 h-5.5 rounded-full transition relative shrink-0 ${
                    node.val ? "bg-blue-600" : "bg-zinc-700"
                  }`}
                >
                  <span
                    className={`block w-4 h-4 rounded-full bg-white transition-transform mt-0.5 ${
                      node.val ? "translate-x-5" : "translate-x-1"
                    }`}
                  />
                </button>
              </div>
              {meta && (
                <div className="mt-2.5 pt-2 border-t border-zinc-800/70 text-[11px] text-zinc-400 space-y-1">
                  <p>{meta.desc}</p>
                  <p className="text-blue-300/90 flex items-start gap-1">
                    <HelpCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                    <span>{meta.dortaniaTip}</span>
                  </p>
                </div>
              )}
            </div>
          );
        }

        if (node.kind === "Integer") {
          return (
            <div
              key={key}
              className="rounded-xl border border-zinc-800/80 bg-zinc-900/50 p-3.5 flex flex-col justify-between"
            >
              <div>
                <div className="font-mono text-xs font-semibold text-zinc-100">{key}</div>
                <div className="text-[11px] text-zinc-400 mt-0.5">
                  {key === "ResizeAppleGpuBars"
                    ? "Resizable BAR 显存大小 (未开设为 -1，已开设为 0)"
                    : "数值参数配置"}
                </div>
              </div>
              <input
                type="number"
                value={node.val}
                onChange={(e) =>
                  updatePlistPath([...path, key], {
                    kind: "Integer",
                    val: parseInt(e.target.value || "0", 10),
                  })
                }
                className="mt-2 bg-zinc-950 border border-zinc-800 focus:border-blue-500 rounded-lg px-2.5 py-1 text-xs font-mono text-amber-300 outline-none"
              />
            </div>
          );
        }
        return null;
      })}
    </div>
  );
};

// ---------------- 1. ACPI Section ----------------
export const AcpiSection: React.FC = () => {
  const { plist, updatePlistPath } = useWorkspaceStore();
  const addItems = getArray(plist, ["ACPI", "Add"]);

  const addSsdtPreset = (filename: string, comment: string) => {
    if (addItems.some((i) => getStr(i, ["Path"]) === filename)) return;
    const next: PlistNode[] = [
      ...addItems,
      {
        kind: "Dict",
        val: [
          ["Comment", { kind: "String", val: comment }],
          ["Enabled", { kind: "Boolean", val: true }],
          ["Path", { kind: "String", val: filename }],
        ],
      },
    ];
    updatePlistPath(["ACPI", "Add"], { kind: "Array", val: next });
  };

  return (
    <div className="space-y-6">
      <div className="bg-zinc-900/60 border border-zinc-800/80 rounded-xl p-4 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-semibold text-zinc-100">ACPI -&gt; Add (SSDT / DSDT 补丁表)</h3>
            <p className="text-xs text-zinc-400">管理 EFI/OC/ACPI 目录加载的电源管理、EC 控制器、背光与触控板热补丁</p>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {[
              ["SSDT-EC-USBX.aml", "桌面/笔记本通用伪造 EC 与 USB 供电"],
              ["SSDT-PLUG.aml", "Intel 原生 XCPM 处理器电源管理"],
              ["SSDT-AWAC.aml", "300系及以上主板系统时钟修复"],
              ["SSDT-PNLF.aml", "笔记本内屏亮度滑块驱动"],
              ["SSDT-dGPU-Off.aml", "笔记本彻底断电屏蔽独显省电"],
            ].map(([file, desc]) => (
              <button
                key={file}
                type="button"
                onClick={() => addSsdtPreset(file, desc)}
                className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-xs text-zinc-200 transition"
              >
                <Plus className="w-3 h-3 text-blue-400" />
                {file.replace(".aml", "")}
              </button>
            ))}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead>
              <tr className="border-b border-zinc-800 text-zinc-400">
                <th className="py-2 px-3 w-16">启用</th>
                <th className="py-2 px-3">文件名 (Path)</th>
                <th className="py-2 px-3">功能备注 (Comment)</th>
                <th className="py-2 px-3 w-16 text-right">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/60">
              {addItems.map((item, idx) => {
                const enabled = getBool(item, ["Enabled"], true);
                const path = getStr(item, ["Path"]);
                const comment = getStr(item, ["Comment"]);
                return (
                  <tr key={idx} className="hover:bg-zinc-800/30">
                    <td className="py-2 px-3">
                      <input
                        type="checkbox"
                        checked={enabled}
                        onChange={(e) => {
                          const next = [...addItems];
                          next[idx] = {
                            kind: "Dict",
                            val: [
                              ["Comment", { kind: "String", val: comment }],
                              ["Enabled", { kind: "Boolean", val: e.target.checked }],
                              ["Path", { kind: "String", val: path }],
                            ],
                          };
                          updatePlistPath(["ACPI", "Add"], { kind: "Array", val: next });
                        }}
                        className="accent-blue-500 w-4 h-4"
                      />
                    </td>
                    <td className="py-2 px-3">
                      <input
                        type="text"
                        value={path}
                        onChange={(e) => {
                          const next = [...addItems];
                          next[idx] = {
                            kind: "Dict",
                            val: [
                              ["Comment", { kind: "String", val: comment }],
                              ["Enabled", { kind: "Boolean", val: enabled }],
                              ["Path", { kind: "String", val: e.target.value }],
                            ],
                          };
                          updatePlistPath(["ACPI", "Add"], { kind: "Array", val: next });
                        }}
                        className="w-full bg-zinc-950 border border-zinc-800 rounded px-2.5 py-1 font-mono text-zinc-100 outline-none focus:border-blue-500"
                      />
                    </td>
                    <td className="py-2 px-3">
                      <input
                        type="text"
                        value={comment}
                        onChange={(e) => {
                          const next = [...addItems];
                          next[idx] = {
                            kind: "Dict",
                            val: [
                              ["Comment", { kind: "String", val: e.target.value }],
                              ["Enabled", { kind: "Boolean", val: enabled }],
                              ["Path", { kind: "String", val: path }],
                            ],
                          };
                          updatePlistPath(["ACPI", "Add"], { kind: "Array", val: next });
                        }}
                        className="w-full bg-zinc-950 border border-zinc-800 rounded px-2.5 py-1 text-zinc-300 outline-none focus:border-blue-500"
                      />
                    </td>
                    <td className="py-2 px-3 text-right">
                      <button
                        type="button"
                        onClick={() => {
                          const next = addItems.filter((_, i) => i !== idx);
                          updatePlistPath(["ACPI", "Add"], { kind: "Array", val: next });
                        }}
                        className="p-1 text-zinc-500 hover:text-rose-400"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                );
              })}
              {addItems.length === 0 && (
                <tr>
                  <td colSpan={4} className="py-6 text-center text-zinc-500">
                    暂无 ACPI 补丁文件，点击右上方预设按钮快速添加或扫描 EFI 目录同步
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div>
        <h3 className="text-sm font-semibold text-zinc-100 mb-3">ACPI -&gt; Quirks</h3>
        <QuirkSwitchGrid section="ACPI" path={["ACPI", "Quirks"]} />
      </div>
    </div>
  );
};

// ---------------- 2. Booter Section ----------------
export const BooterSection: React.FC = () => (
  <div className="space-y-4">
    <div className="bg-blue-950/20 border border-blue-500/30 rounded-xl p-4">
      <h3 className="text-sm font-semibold text-blue-200">
        Booter -&gt; Quirks (OpenRuntime 早期引导与内存映射修复)
      </h3>
      <p className="text-xs text-blue-300/80 mt-1">
        90% 卡在 <code className="bg-blue-950 px-1.5 py-0.5 rounded">[EB|#LOG:EXITBS:START]</code> 的问题都由这里的开关决定。注意 <code className="font-mono">EnableWriteUnprotector</code> 与 <code className="font-mono">RebuildAppleMemoryMap</code> 严禁同时开启。
      </p>
    </div>
    <QuirkSwitchGrid section="Booter" path={["Booter", "Quirks"]} />
  </div>
);

// ---------------- 3. DeviceProperties Section ----------------
export const DevicePropertiesSection: React.FC = () => {
  const { plist, updatePlistPath, pushToast } = useWorkspaceStore();
  const devices = getDictEntries(plist, ["DeviceProperties", "Add"]);
  const [newPciPath, setNewPciPath] = useState("");

  const injectPreset = (pciPath: string, props: [string, PlistNode][], label: string) => {
    updatePlistPath(["DeviceProperties", "Add", pciPath], { kind: "Dict", val: props });
    pushToast("success", `已注入 ${label}`);
  };

  return (
    <div className="space-y-5">
      <div className="bg-zinc-900/60 border border-zinc-800/80 rounded-xl p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-semibold text-zinc-100">
              DeviceProperties -&gt; Add (核显缓冲帧 / 声卡 / 网卡 PCIe 属性注入)
            </h3>
            <p className="text-xs text-zinc-400">
              内置小端字节序（Little-Endian）自动转换，无需手动倒序换算十六进制
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() =>
                injectPreset(
                  "PciRoot(0x0)/Pci(0x2,0x0)",
                  [
                    ["AAPL,ig-platform-id", { kind: "Data", val: "07009B3E" }],
                    ["framebuffer-patch-enable", { kind: "Data", val: "01000000" }],
                    ["framebuffer-stolenmem", { kind: "Data", val: "00003001" }],
                  ],
                  "桌面端 UHD 630 多屏核显驱动 (07009B3E)"
                )
              }
              className="px-2.5 py-1.5 rounded-lg bg-blue-600/20 border border-blue-500/40 hover:bg-blue-600/30 text-xs text-blue-200"
            >
              + 注入台式机 UHD 630 核显
            </button>
            <button
              type="button"
              onClick={() =>
                injectPreset(
                  "PciRoot(0x0)/Pci(0x2,0x0)",
                  [
                    ["AAPL,ig-platform-id", { kind: "Data", val: "0300913E" }],
                  ],
                  "桌面端 UHD 630 无头计算卡模式 (搭配 AMD 独显)"
                )
              }
              className="px-2.5 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-xs text-zinc-200"
            >
              + 注入核显无头加速模式 (0300913E)
            </button>
            <button
              type="button"
              onClick={() =>
                injectPreset(
                  "PciRoot(0x0)/Pci(0x1b,0x0)",
                  [["layout-id", { kind: "Data", val: u32ToLittleEndianHex(11) }]],
                  "板载声卡 layout-id = 11 (0B000000)"
                )
              }
              className="px-2.5 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-xs text-zinc-200"
            >
              + 注入板载声卡 (layout-id=11)
            </button>
          </div>
        </div>

        <div className="flex gap-2 pt-1">
          <input
            type="text"
            value={newPciPath}
            onChange={(e) => setNewPciPath(e.target.value)}
            placeholder="输入自定义 PCI 路径，如 PciRoot(0x0)/Pci(0x1c,0x0)/Pci(0x0,0x0)"
            className="flex-1 bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-1.5 text-xs font-mono text-zinc-200 outline-none focus:border-blue-500"
          />
          <button
            type="button"
            onClick={() => {
              if (!newPciPath.trim()) return;
              updatePlistPath(["DeviceProperties", "Add", newPciPath.trim()], {
                kind: "Dict",
                val: [["built-in", { kind: "Data", val: "01" }]],
              });
              setNewPciPath("");
            }}
            className="px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-xs text-zinc-100"
          >
            添加设备路径
          </button>
        </div>
      </div>

      <div className="space-y-4">
        {devices.map(([pciPath, dictNode]) => {
          const propEntries = dictNode.kind === "Dict" ? dictNode.val : [];
          return (
            <div
              key={pciPath}
              className="bg-zinc-900/50 border border-zinc-800/80 rounded-xl p-4 space-y-3"
            >
              <div className="flex items-center justify-between border-b border-zinc-800 pb-2.5">
                <span className="font-mono text-xs font-semibold text-blue-300">{pciPath}</span>
                <button
                  type="button"
                  onClick={() => {
                    const filtered = devices.filter(([k]) => k !== pciPath);
                    updatePlistPath(["DeviceProperties", "Add"], {
                      kind: "Dict",
                      val: filtered,
                    });
                  }}
                  className="text-xs text-zinc-500 hover:text-rose-400 flex items-center gap-1"
                >
                  <Trash2 className="w-3.5 h-3.5" /> 移除此设备
                </button>
              </div>
              <div className="space-y-2">
                {propEntries.map(([propKey, propVal], pIdx) => {
                  const decodedU32 =
                    propVal.kind === "Data" ? littleEndianHexToU32(propVal.val) : null;
                  return (
                    <div key={pIdx} className="grid grid-cols-12 gap-2 items-center text-xs">
                      <div className="col-span-4 font-mono text-zinc-200 truncate">{propKey}</div>
                      <div className="col-span-2 text-[11px] text-zinc-400 font-mono">
                        {propVal.kind}
                      </div>
                      <div className="col-span-5 flex items-center gap-2">
                        <input
                          type="text"
                          value={String(propVal.val)}
                          onChange={(e) => {
                            const nextVal: PlistNode =
                              propVal.kind === "Data"
                                ? { kind: "Data", val: e.target.value.toUpperCase() }
                                : propVal.kind === "Integer"
                                ? { kind: "Integer", val: parseInt(e.target.value || "0", 10) }
                                : { kind: "String", val: e.target.value };
                            updatePlistPath(["DeviceProperties", "Add", pciPath, propKey], nextVal);
                          }}
                          className="w-full bg-zinc-950 border border-zinc-800 rounded px-2.5 py-1 font-mono text-pink-200 outline-none focus:border-blue-500"
                        />
                        {propKey === "layout-id" && decodedU32 !== null && (
                          <span className="text-[11px] text-emerald-400 shrink-0 font-mono">
                            (= ID {decodedU32})
                          </span>
                        )}
                      </div>
                      <div className="col-span-1 text-right">
                        <button
                          type="button"
                          onClick={() => {
                            const nextProps = propEntries.filter((_, i) => i !== pIdx);
                            updatePlistPath(["DeviceProperties", "Add", pciPath], {
                              kind: "Dict",
                              val: nextProps,
                            });
                          }}
                          className="text-zinc-500 hover:text-rose-400"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

// ---------------- 4. Kernel Section ----------------
export const KernelSection: React.FC = () => {
  const { plist, ocDir, updatePlistPath, replacePlist, setIssues, pushToast } =
    useWorkspaceStore();
  const kexts = getArray(plist, ["Kernel", "Add"]);
  const cpuidData = getData(plist, ["Kernel", "Emulate", "Cpuid1Data"]);

  const moveKext = (idx: number, delta: number) => {
    const target = idx + delta;
    if (target < 0 || target >= kexts.length) return;
    const next = [...kexts];
    const [removed] = next.splice(idx, 1);
    next.splice(target, 0, removed);
    updatePlistPath(["Kernel", "Add"], { kind: "Array", val: next });
  };

  const handleSortKexts = async () => {
    if (isTauriRuntime()) {
      const [sortedPlist, msg, issues] = await apiApplyQuickFix(plist, "sort_kexts", ocDir);
      replacePlist(sortedPlist);
      setIssues(issues);
      pushToast("success", msg);
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-zinc-900/60 border border-zinc-800/80 rounded-xl p-4 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-zinc-100">
              Kernel -&gt; Add (内核驱动 Kext 注入顺序管理)
            </h3>
            <p className="text-xs text-zinc-400">
              严格遵循依赖加载顺序：<code className="text-zinc-200">Lilu.kext</code> 置顶 -&gt; <code className="text-zinc-200">VirtualSMC.kext</code> -&gt; 显卡/声卡/传感器插件
            </p>
          </div>
          <button
            type="button"
            onClick={handleSortKexts}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-xs font-medium text-white transition"
          >
            <Sparkles className="w-3.5 h-3.5" />
            一键按依赖拓扑排序驱动
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead>
              <tr className="border-b border-zinc-800 text-zinc-400">
                <th className="py-2 px-2 w-12">顺序</th>
                <th className="py-2 px-2 w-14">启用</th>
                <th className="py-2 px-2">驱动包路径 (BundlePath)</th>
                <th className="py-2 px-2">二进制可执行路径</th>
                <th className="py-2 px-2 w-28">Min / MaxKernel</th>
                <th className="py-2 px-2 w-24 text-right">排序/移除</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/60">
              {kexts.map((item, idx) => {
                const enabled = getBool(item, ["Enabled"], true);
                const bundle = getStr(item, ["BundlePath"]);
                const exec = getStr(item, ["ExecutablePath"]);
                const minK = getStr(item, ["MinKernel"]);
                const maxK = getStr(item, ["MaxKernel"]);
                return (
                  <tr key={idx} className="hover:bg-zinc-800/30">
                    <td className="py-2 px-2 font-mono text-zinc-500">#{idx + 1}</td>
                    <td className="py-2 px-2">
                      <input
                        type="checkbox"
                        checked={enabled}
                        onChange={(e) => {
                          if (item.kind !== "Dict") return;
                          const updated: PlistNode = {
                            kind: "Dict",
                            val: item.val.map(([k, v]) =>
                              k === "Enabled" ? [k, { kind: "Boolean", val: e.target.checked }] : [k, v]
                            ),
                          };
                          const next = [...kexts];
                          next[idx] = updated;
                          updatePlistPath(["Kernel", "Add"], { kind: "Array", val: next });
                        }}
                        className="accent-blue-500 w-4 h-4"
                      />
                    </td>
                    <td className="py-2 px-2 font-mono font-medium text-zinc-100">{bundle}</td>
                    <td className="py-2 px-2 font-mono text-zinc-400">{exec || "(仅 Info.plist 无二进制)"}</td>
                    <td className="py-2 px-2 font-mono text-zinc-400">
                      {minK || "*"} ~ {maxK || "*"}
                    </td>
                    <td className="py-2 px-2">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          type="button"
                          onClick={() => moveKext(idx, -1)}
                          className="p-1 text-zinc-400 hover:text-zinc-100"
                        >
                          <ArrowUp className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => moveKext(idx, 1)}
                          className="p-1 text-zinc-400 hover:text-zinc-100"
                        >
                          <ArrowDown className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            const next = kexts.filter((_, i) => i !== idx);
                            updatePlistPath(["Kernel", "Add"], { kind: "Array", val: next });
                          }}
                          className="p-1 text-zinc-500 hover:text-rose-400"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* CPUID Spoofing Helper */}
      <div className="bg-zinc-900/60 border border-zinc-800/80 rounded-xl p-4 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h3 className="text-sm font-semibold text-zinc-100">
            Kernel -&gt; Emulate (11~14代酷睿 CPUID 仿冒预设)
          </h3>
          <p className="text-xs text-zinc-400 mt-0.5">
            当前 Cpuid1Data: <code className="text-pink-300 font-mono">{cpuidData || "(未启用原生 CPUID)"}</code>
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => {
              updatePlistPath(["Kernel", "Emulate", "Cpuid1Data"], {
                kind: "Data",
                val: "55060A00000000000000000000000000",
              });
              updatePlistPath(["Kernel", "Emulate", "Cpuid1Mask"], {
                kind: "Data",
                val: "FFFFFFFF000000000000000000000000",
              });
              pushToast("success", "已填入 Intel 12~14代酷睿仿冒 Comet Lake CPUID (55060A00)");
            }}
            className="px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-xs text-zinc-200"
          >
            填入 12~14代酷睿仿冒 (55060A00)
          </button>
          <button
            type="button"
            onClick={() => {
              updatePlistPath(["Kernel", "Emulate", "Cpuid1Data"], { kind: "Data", val: "" });
              updatePlistPath(["Kernel", "Emulate", "Cpuid1Mask"], { kind: "Data", val: "" });
            }}
            className="px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-xs text-zinc-400"
          >
            清空仿冒 (4~10代原生)
          </button>
        </div>
      </div>

      <div>
        <h3 className="text-sm font-semibold text-zinc-100 mb-3">Kernel -&gt; Quirks</h3>
        <QuirkSwitchGrid section="Kernel" path={["Kernel", "Quirks"]} />
      </div>
    </div>
  );
};

// ---------------- 5. Misc Section ----------------
export const MiscSection: React.FC = () => {
  const { plist, updatePlistPath } = useWorkspaceStore();
  const pickerMode = getStr(plist, ["Misc", "Boot", "PickerMode"], "External");
  const timeout = getInt(plist, ["Misc", "Boot", "Timeout"], 5);
  const showPicker = getBool(plist, ["Misc", "Boot", "ShowPicker"], true);
  const vault = getStr(plist, ["Misc", "Security", "Vault"], "Optional");
  const secureBootModel = getStr(plist, ["Misc", "Security", "SecureBootModel"], "Disabled");
  const scanPolicy = getInt(plist, ["Misc", "Security", "ScanPolicy"], 0);
  const debugTarget = getInt(plist, ["Misc", "Debug", "Target"], 3);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
      <div className="bg-zinc-900/60 border border-zinc-800/80 rounded-xl p-4 space-y-4">
        <h3 className="text-sm font-semibold text-zinc-100">Misc -&gt; Boot (引导界面与倒计时)</h3>
        <div className="space-y-3 text-xs">
          <div className="flex items-center justify-between">
            <span className="text-zinc-300">引导菜单模式 (PickerMode)</span>
            <select
              value={pickerMode}
              onChange={(e) =>
                updatePlistPath(["Misc", "Boot", "PickerMode"], {
                  kind: "String",
                  val: e.target.value,
                })
              }
              className="bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-1.5 text-zinc-100"
            >
              <option value="External">External (OpenCanopy 图形主题界面)</option>
              <option value="Builtin">Builtin (纯文字极简引导菜单)</option>
              <option value="Apple">Apple (调用主板原生 BootPicker)</option>
            </select>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-zinc-300">自动进系统倒计时秒数 (Timeout)</span>
            <input
              type="number"
              min={0}
              max={60}
              value={timeout}
              onChange={(e) =>
                updatePlistPath(["Misc", "Boot", "Timeout"], {
                  kind: "Integer",
                  val: parseInt(e.target.value || "5", 10),
                })
              }
              className="w-28 bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-1.5 font-mono text-amber-300"
            />
          </div>

          <div className="flex items-center justify-between">
            <span className="text-zinc-300">开机显示系统选择菜单 (ShowPicker)</span>
            <input
              type="checkbox"
              checked={showPicker}
              onChange={(e) =>
                updatePlistPath(["Misc", "Boot", "ShowPicker"], {
                  kind: "Boolean",
                  val: e.target.checked,
                })
              }
              className="accent-blue-500 w-4 h-4"
            />
          </div>
        </div>
      </div>

      <div className="bg-zinc-900/60 border border-zinc-800/80 rounded-xl p-4 space-y-4">
        <h3 className="text-sm font-semibold text-zinc-100">
          Misc -&gt; Security &amp; Debug (安全策略与启动日志)
        </h3>
        <div className="space-y-3 text-xs">
          <div className="flex items-center justify-between">
            <span className="text-zinc-300">EFI 签名校验锁 (Vault — 必须为 Optional)</span>
            <select
              value={vault}
              onChange={(e) =>
                updatePlistPath(["Misc", "Security", "Vault"], {
                  kind: "String",
                  val: e.target.value,
                })
              }
              className={`bg-zinc-950 border rounded-lg px-3 py-1.5 font-mono ${
                vault === "Optional"
                  ? "border-emerald-500/40 text-emerald-300"
                  : "border-rose-500 text-rose-300"
              }`}
            >
              <option value="Optional">Optional (推荐安全值)</option>
              <option value="Basic">Basic (未签名会无法开机!)</option>
              <option value="Secure">Secure (需 RSA 私钥签名!)</option>
            </select>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-zinc-300">苹果安全启动模型 (SecureBootModel)</span>
            <select
              value={secureBootModel}
              onChange={(e) =>
                updatePlistPath(["Misc", "Security", "SecureBootModel"], {
                  kind: "String",
                  val: e.target.value,
                })
              }
              className="bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-1.5 text-zinc-100"
            >
              <option value="Disabled">Disabled (安装 Sonoma/Sequoia 必选防重启)</option>
              <option value="Default">Default (启用 T2 安全启动模型)</option>
              <option value="j160">j160 (MacPro7,1 对应型号)</option>
              <option value="j185">j185 (iMac20,1 对应型号)</option>
            </select>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-zinc-300">磁盘扫描策略 (ScanPolicy: 0 = 扫描全部引导分区)</span>
            <button
              type="button"
              onClick={() =>
                updatePlistPath(["Misc", "Security", "ScanPolicy"], {
                  kind: "Integer",
                  val: scanPolicy === 0 ? 17760515 : 0,
                })
              }
              className="px-3 py-1 rounded-lg bg-zinc-800 hover:bg-zinc-700 font-mono text-zinc-200"
            >
              当前: {scanPolicy} ({scanPolicy === 0 ? "全部显示" : "仅 APFS/ESP"})
            </button>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-zinc-300">生成 EFI 根目录启动日志文件 (Debug Target)</span>
            <select
              value={debugTarget}
              onChange={(e) =>
                updatePlistPath(["Misc", "Debug", "Target"], {
                  kind: "Integer",
                  val: parseInt(e.target.value, 10),
                })
              }
              className="bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-1.5 text-zinc-100"
            >
              <option value={3}>3 (仅屏幕输出，不写 U盘/ESP 日志文件)</option>
              <option value={67}>67 (排错模式：自动在 EFI 根目录生成 opencore.txt!)</option>
            </select>
          </div>
        </div>
      </div>
    </div>
  );
};

// ---------------- 6. NVRAM Section ----------------
export const NvramSection: React.FC = () => {
  const { plist, updatePlistPath } = useWorkspaceStore();
  const bootGuid = "7C436110-AB2A-4BBB-A880-FE41995C9F82";
  const bootArgs = getStr(plist, ["NVRAM", "Add", bootGuid, "boot-args"]);
  const csrHex = getData(plist, ["NVRAM", "Add", bootGuid, "csr-active-config"], "00000000");
  const prevLang = getStr(plist, ["NVRAM", "Add", bootGuid, "prev-lang:kbd"], "zh-Hans:252");

  const activeTokens = bootArgs.split(/\s+/).filter(Boolean);

  const toggleFlag = (flag: string) => {
    const exists = activeTokens.includes(flag);
    const nextTokens = exists
      ? activeTokens.filter((t) => t !== flag)
      : [...activeTokens, flag];
    updatePlistPath(["NVRAM", "Add", bootGuid, "boot-args"], {
      kind: "String",
      val: nextTokens.join(" "),
    });
  };

  return (
    <div className="space-y-5">
      <div className="bg-zinc-900/60 border border-zinc-800/80 rounded-xl p-4 space-y-4">
        <div>
          <h3 className="text-sm font-semibold text-zinc-100">
            NVRAM -&gt; boot-args (内核启动参数可视化编辑器)
          </h3>
          <p className="text-xs text-zinc-400">
            点击下方快捷标签即可开关对应内核标志，也可直接在输入框自由编辑
          </p>
        </div>

        <input
          type="text"
          value={bootArgs}
          onChange={(e) =>
            updatePlistPath(["NVRAM", "Add", bootGuid, "boot-args"], {
              kind: "String",
              val: e.target.value,
            })
          }
          className="w-full bg-zinc-950 border border-zinc-700 focus:border-blue-500 rounded-xl px-3.5 py-2.5 text-sm font-mono text-emerald-300 outline-none"
          placeholder="例如: -v keepsyms=1 debug=0x100 agdpmod=pikera alcid=11"
        />

        <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5">
          {COMMON_BOOT_ARGS.map((spec) => {
            const active = activeTokens.includes(spec.flag);
            return (
              <button
                key={spec.flag}
                type="button"
                onClick={() => toggleFlag(spec.flag)}
                className={`text-left p-3 rounded-xl border transition ${
                  active
                    ? "bg-emerald-950/30 border-emerald-500/50 text-emerald-200"
                    : "bg-zinc-950/60 border-zinc-800 hover:border-zinc-700 text-zinc-300"
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-mono text-xs font-semibold">{spec.flag}</span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-300">
                    {spec.label}
                  </span>
                </div>
                <p className="text-[11px] text-zinc-400 mt-1">{spec.desc}</p>
              </button>
            );
          })}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-zinc-900/60 border border-zinc-800/80 rounded-xl p-4 space-y-3">
          <h3 className="text-sm font-semibold text-zinc-100">
            SIP 系统完整性保护 (csr-active-config)
          </h3>
          <div className="space-y-2">
            {SIP_PRESETS.map((preset) => (
              <button
                key={preset.hex}
                type="button"
                onClick={() =>
                  updatePlistPath(["NVRAM", "Add", bootGuid, "csr-active-config"], {
                    kind: "Data",
                    val: preset.hex,
                  })
                }
                className={`w-full text-left p-2.5 rounded-lg border text-xs transition ${
                  csrHex.toUpperCase() === preset.hex
                    ? "bg-blue-950/30 border-blue-500/50 text-blue-200"
                    : "bg-zinc-950 border-zinc-800 text-zinc-300 hover:border-zinc-700"
                }`}
              >
                <div className="font-semibold">{preset.name}</div>
                <div className="text-[11px] text-zinc-400">{preset.desc}</div>
              </button>
            ))}
          </div>
        </div>

        <div className="bg-zinc-900/60 border border-zinc-800/80 rounded-xl p-4 space-y-3">
          <h3 className="text-sm font-semibold text-zinc-100">
            安装器默认语言 (prev-lang:kbd)
          </h3>
          <p className="text-xs text-zinc-400">
            解决首次进入 macOS 恢复盘安装界面默认变成俄语或英文的问题（推荐 String 类型）
          </p>
          <select
            value={prevLang}
            onChange={(e) =>
              updatePlistPath(["NVRAM", "Add", bootGuid, "prev-lang:kbd"], {
                kind: "String",
                val: e.target.value,
              })
            }
            className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-zinc-100"
          >
            <option value="zh-Hans:252">简体中文 — ABC 键盘 (zh-Hans:252)</option>
            <option value="zh-Hant:0">繁体中文 (zh-Hant:0)</option>
            <option value="en-US:0">English US (en-US:0)</option>
          </select>
        </div>
      </div>
    </div>
  );
};

// ---------------- 7. PlatformInfo (SMBIOS Studio) ----------------
export const PlatformInfoSection: React.FC = () => {
  const { plist, updatePlistPath, pushToast } = useWorkspaceStore();
  const [models, setModels] = useState<SmbiosModelOption[]>([]);
  const currentModel = getStr(plist, ["PlatformInfo", "Generic", "SystemProductName"], "iMac20,1");
  const serial = getStr(plist, ["PlatformInfo", "Generic", "SystemSerialNumber"]);
  const mlb = getStr(plist, ["PlatformInfo", "Generic", "MLB"]);
  const uuid = getStr(plist, ["PlatformInfo", "Generic", "SystemUUID"]);
  const rom = getData(plist, ["PlatformInfo", "Generic", "ROM"]);

  useEffect(() => {
    if (isTauriRuntime()) {
      apiListSmbiosModels().then(setModels).catch(() => {});
    }
  }, []);

  const handleGenerate = async (targetModel = currentModel) => {
    if (!isTauriRuntime()) return;
    const gen = await apiGenerateSmbios(targetModel);
    updatePlistPath(["PlatformInfo", "Generic", "SystemProductName"], {
      kind: "String",
      val: gen.model,
    });
    updatePlistPath(["PlatformInfo", "Generic", "SystemSerialNumber"], {
      kind: "String",
      val: gen.serial,
    });
    updatePlistPath(["PlatformInfo", "Generic", "MLB"], {
      kind: "String",
      val: gen.mlb,
    });
    updatePlistPath(["PlatformInfo", "Generic", "SystemUUID"], {
      kind: "String",
      val: gen.system_uuid,
    });
    updatePlistPath(["PlatformInfo", "Generic", "ROM"], {
      kind: "Data",
      val: gen.rom_hex,
    });
    pushToast("success", `已生成 ${gen.model} 全套三码与 Apple OUI ROM`);
  };

  const activeSpec = models.find((m) => m.model === currentModel);

  return (
    <div className="space-y-5">
      <div className="bg-gradient-to-r from-blue-950/40 via-zinc-900/80 to-indigo-950/30 border border-blue-500/30 rounded-2xl p-5 flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-blue-400" />
            <h3 className="text-base font-semibold text-zinc-100">
              SMBIOS 机型与三码生成工作站 (macserial 算法兼容)
            </h3>
          </div>
          <p className="text-xs text-zinc-300 mt-1">
            {activeSpec
              ? `${activeSpec.cpuFamily} · 支持 ${activeSpec.macosSupport} · ${activeSpec.gpuNote}`
              : "自动生成符合苹果工厂编码规范的 12位序列号、17位主板码 MLB、UUID 与 Apple OUI 网卡 ROM"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => handleGenerate(currentModel)}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-xs font-semibold text-white shadow-lg shadow-blue-600/20 transition"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            一键随机生成新三码
          </button>
          <a
            href="https://checkcoverage.apple.com/"
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1 px-3 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-xs text-zinc-200"
          >
            苹果官网验码 <ExternalLink className="w-3.5 h-3.5" />
          </a>
        </div>
      </div>

      <div className="bg-zinc-900/60 border border-zinc-800/80 rounded-xl p-5 grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
        <div>
          <label className="block text-zinc-400 mb-1.5">目标苹果机型 (SystemProductName)</label>
          <select
            value={currentModel}
            onChange={(e) => handleGenerate(e.target.value)}
            className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-zinc-100 font-medium"
          >
            {(models.length > 0
              ? models
              : [{ model: currentModel, category: "Desktop", cpuFamily: "", macosSupport: "", gpuNote: "" }]
            ).map((m) => (
              <option key={m.model} value={m.model}>
                {m.model} — {m.cpuFamily}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-zinc-400 mb-1.5">整机序列号 (SystemSerialNumber · 12位)</label>
          <input
            type="text"
            value={serial}
            onChange={(e) =>
              updatePlistPath(["PlatformInfo", "Generic", "SystemSerialNumber"], {
                kind: "String",
                val: e.target.value.toUpperCase(),
              })
            }
            className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 font-mono text-emerald-300"
          />
        </div>

        <div>
          <label className="block text-zinc-400 mb-1.5">主板逻辑序列号 (MLB · 17位)</label>
          <input
            type="text"
            value={mlb}
            onChange={(e) =>
              updatePlistPath(["PlatformInfo", "Generic", "MLB"], {
                kind: "String",
                val: e.target.value.toUpperCase(),
              })
            }
            className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 font-mono text-zinc-100"
          />
        </div>

        <div>
          <label className="block text-zinc-400 mb-1.5">硬件唯一标识 (SystemUUID)</label>
          <input
            type="text"
            value={uuid}
            onChange={(e) =>
              updatePlistPath(["PlatformInfo", "Generic", "SystemUUID"], {
                kind: "String",
                val: e.target.value.toUpperCase(),
              })
            }
            className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 font-mono text-zinc-100"
          />
        </div>

        <div className="md:col-span-2">
          <label className="block text-zinc-400 mb-1.5">
            网卡物理地址 ROM (6字节 12位 HEX，登录 iMessage / FaceTime 关键项)
          </label>
          <input
            type="text"
            value={rom}
            onChange={(e) =>
              updatePlistPath(["PlatformInfo", "Generic", "ROM"], {
                kind: "Data",
                val: e.target.value.replace(/[^0-9a-fA-F]/g, "").toUpperCase(),
              })
            }
            className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 font-mono text-pink-300"
          />
        </div>
      </div>
    </div>
  );
};

// ---------------- 8. UEFI Section ----------------
export const UefiSection: React.FC = () => {
  const { plist, updatePlistPath } = useWorkspaceStore();
  const drivers = getArray(plist, ["UEFI", "Drivers"]);

  const addDriverPreset = (filename: string, comment: string) => {
    if (drivers.some((d) => getStr(d, ["Path"]) === filename)) return;
    updatePlistPath(["UEFI", "Drivers"], {
      kind: "Array",
      val: [
        ...drivers,
        {
          kind: "Dict",
          val: [
            ["Arguments", { kind: "String", val: "" }],
            ["Comment", { kind: "String", val: comment }],
            ["Enabled", { kind: "Boolean", val: true }],
            ["LoadEarly", { kind: "Boolean", val: false }],
            ["Path", { kind: "String", val: filename }],
          ],
        },
      ],
    });
  };

  return (
    <div className="space-y-6">
      <div className="bg-zinc-900/60 border border-zinc-800/80 rounded-xl p-4 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-semibold text-zinc-100">
              UEFI -&gt; Drivers (.efi 固件驱动管理)
            </h3>
            <p className="text-xs text-zinc-400">
              至少需包含 <code className="text-zinc-200">OpenRuntime.efi</code> 与 <code className="text-zinc-200">OpenHfsPlus.efi / HfsPlus.efi</code>
            </p>
          </div>
          <div className="flex gap-1.5">
            {[
              ["OpenRuntime.efi", "OpenCore 必需核心内存与变量运行时"],
              ["OpenHfsPlus.efi", "HFS+ 安装盘分区识别驱动"],
              ["OpenCanopy.efi", "图形化主题选择菜单驱动"],
              ["ResetNvramEntry.efi", "启动菜单清空重置 NVRAM 按钮"],
              ["ToggleSipEntry.efi", "启动菜单一键切换 SIP 开关按钮"],
            ].map(([name, desc]) => (
              <button
                key={name}
                type="button"
                onClick={() => addDriverPreset(name, desc)}
                className="px-2.5 py-1 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-xs text-zinc-200"
              >
                + {name.replace(".efi", "")}
              </button>
            ))}
          </div>
        </div>

        <div className="divide-y divide-zinc-800/60">
          {drivers.map((drv, idx) => {
            const path = drv.kind === "String" ? drv.val : getStr(drv, ["Path"]);
            const enabled = drv.kind === "String" ? true : getBool(drv, ["Enabled"], true);
            const comment = drv.kind === "String" ? "" : getStr(drv, ["Comment"]);
            return (
              <div key={idx} className="py-2.5 flex items-center justify-between gap-4 text-xs">
                <div className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    checked={enabled}
                    onChange={(e) => {
                      const next = [...drivers];
                      next[idx] = {
                        kind: "Dict",
                        val: [
                          ["Arguments", { kind: "String", val: "" }],
                          ["Comment", { kind: "String", val: comment }],
                          ["Enabled", { kind: "Boolean", val: e.target.checked }],
                          ["LoadEarly", { kind: "Boolean", val: false }],
                          ["Path", { kind: "String", val: path }],
                        ],
                      };
                      updatePlistPath(["UEFI", "Drivers"], { kind: "Array", val: next });
                    }}
                    className="accent-blue-500 w-4 h-4"
                  />
                  <span className="font-mono font-medium text-zinc-100">{path}</span>
                  <span className="text-zinc-500">{comment}</span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    const next = drivers.filter((_, i) => i !== idx);
                    updatePlistPath(["UEFI", "Drivers"], { kind: "Array", val: next });
                  }}
                  className="text-zinc-500 hover:text-rose-400"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            );
          })}
        </div>
      </div>

      <div>
        <h3 className="text-sm font-semibold text-zinc-100 mb-3">UEFI -&gt; Quirks</h3>
        <QuirkSwitchGrid section="UEFI" path={["UEFI", "Quirks"]} />
      </div>
    </div>
  );
};
