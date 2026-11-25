import React, { useEffect, useState } from "react";
import {
  ArrowRightLeft,
  CheckCircle2,
  ExternalLink,
  Plus,
  RefreshCw,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import { QUIRKS_ENCYCLOPEDIA } from "../data/quirks-encyclopedia";
import {
  apiGenerateSmbios,
  apiListSmbiosModels,
  apiMigrateCloverToOpenCore,
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
  type PlistNode,
  type SmbiosModelOption,
} from "../types/opencore";

const CLOVER_BOOT_FLAGS = [
  { flag: "-v", desc: "跑码模式排错显示" },
  { flag: "debug=0x100", desc: "遇到五国死机不自动重启" },
  { flag: "keepsyms=1", desc: "保留崩溃函数名符号" },
  { flag: "dart=0", desc: "四叶草经典屏蔽 VT-d 参数" },
  { flag: "nv_disable=1", desc: "禁用无驱动的 NVIDIA 独显加速" },
  { flag: "-wegnoegpu", desc: "WhateverGreen 彻底屏蔽全部副卡独显" },
  { flag: "agdpmod=pikera", desc: "RX 5000 / 6000 独显防黑屏必加" },
  { flag: "npci=0x2000", desc: "修复卡在 PCI configuration begin" },
  { flag: "alcid=11", desc: "AppleALC 板载声卡 Layout-ID 11" },
];

export const CloverMigrationBanner: React.FC = () => {
  const { plist, loadWorkspace, setMigrationNotes, setActiveEditorTab, pushToast } =
    useWorkspaceStore();

  const handleMigrate = async () => {
    if (!isTauriRuntime()) return;
    try {
      const [ocPayload, notes] = await apiMigrateCloverToOpenCore(plist);
      loadWorkspace(ocPayload);
      setMigrationNotes(notes);
      setActiveEditorTab("ACPI");
      pushToast("success", "已成功将四叶草配置无损迁移为 OpenCore 1.0.3 配置！");
    } catch (e) {
      pushToast("error", `迁移失败: ${String(e)}`);
    }
  };

  return (
    <div className="mb-5 bg-gradient-to-r from-emerald-950/45 via-zinc-900/80 to-teal-950/35 border border-emerald-500/35 rounded-2xl p-4 flex flex-wrap items-center justify-between gap-4">
      <div className="space-y-0.5">
        <div className="flex items-center gap-2">
          <span className="px-2 py-0.5 rounded-md bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 text-[11px] font-semibold">
            🍀 四叶草 Clover 模式
          </span>
          <span className="text-sm font-semibold text-zinc-100">
            Clover Configurator 全可视化编辑引擎 (兼容 r5123+ OpenRuntime &amp; 传统老平台)
          </span>
        </div>
        <p className="text-xs text-zinc-400">
          支持直接编辑 `EFI/CLOVER/config.plist`；若准备升级新版 macOS，可点击右侧按钮保留原机三码与设备注入一键升级到 OpenCore。
        </p>
      </div>

      <button
        type="button"
        onClick={handleMigrate}
        className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-xs font-semibold text-white shadow-lg shadow-emerald-600/20 transition"
      >
        <ArrowRightLeft className="w-3.5 h-3.5" />
        一键无损迁移转 OpenCore
      </button>
    </div>
  );
};

// 1. Clover ACPI Section
export const CloverAcpiSection: React.FC = () => {
  const { plist, updatePlistPath } = useWorkspaceStore();
  const autoMerge = getBool(plist, ["ACPI", "AutoMerge"], true);
  const fixHeaders = getBool(plist, ["ACPI", "FixHeaders"], true);
  const pluginType = getBool(plist, ["ACPI", "SSDT", "Generate", "PluginType"], true);
  const fixes = getDictEntries(plist, ["ACPI", "DSDT", "Fixes"]);
  const sortedOrder = getArray(plist, ["ACPI", "SortedOrder"]);
  const [newAml, setNewAml] = useState("");

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
        {[
          {
            label: "原生电源管理 (PluginType = True)",
            desc: "注入 plugin-type=1 开启 Intel Haswell+ XCPM 变频",
            val: pluginType,
            path: ["ACPI", "SSDT", "Generate", "PluginType"],
          },
          {
            label: "清理 ACPI 表头乱码 (FixHeaders)",
            desc: "防止老主板非 ASCII 表头导致内核崩溃",
            val: fixHeaders,
            path: ["ACPI", "FixHeaders"],
          },
          {
            label: "自动合并 SSDT 补丁表 (AutoMerge)",
            desc: "加载 ACPI/patched 目录下的热补丁表",
            val: autoMerge,
            path: ["ACPI", "AutoMerge"],
          },
        ].map((item) => (
          <label
            key={item.label}
            className="bg-zinc-900/60 border border-zinc-800/80 rounded-xl p-3.5 flex items-start justify-between gap-2 cursor-pointer"
          >
            <div>
              <div className="font-semibold text-zinc-100">{item.label}</div>
              <div className="text-[11px] text-zinc-400 mt-0.5">{item.desc}</div>
            </div>
            <input
              type="checkbox"
              checked={item.val}
              onChange={(e) =>
                updatePlistPath(item.path, { kind: "Boolean", val: e.target.checked })
              }
              className="accent-emerald-500 w-4 h-4 mt-0.5"
            />
          </label>
        ))}
      </div>

      {/* DSDT Fixes */}
      <div className="bg-zinc-900/60 border border-zinc-800/80 rounded-xl p-4 space-y-3">
        <h3 className="text-sm font-semibold text-zinc-100">
          ACPI -&gt; DSDT -&gt; Fixes (四叶草经典 DSDT 自动修复开关)
        </h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5 text-xs">
          {fixes.map(([k, node]) => {
            if (node.kind !== "Boolean") return null;
            return (
              <label
                key={k}
                className={`p-2.5 rounded-lg border flex items-center justify-between cursor-pointer ${
                  node.val
                    ? "bg-emerald-950/30 border-emerald-500/40 text-emerald-200"
                    : "bg-zinc-950 border-zinc-800 text-zinc-300"
                }`}
              >
                <span className="font-mono">{k}</span>
                <input
                  type="checkbox"
                  checked={node.val}
                  onChange={(e) =>
                    updatePlistPath(["ACPI", "DSDT", "Fixes", k], {
                      kind: "Boolean",
                      val: e.target.checked,
                    })
                  }
                  className="accent-emerald-500 w-3.5 h-3.5"
                />
              </label>
            );
          })}
        </div>
      </div>

      {/* SortedOrder */}
      <div className="bg-zinc-900/60 border border-zinc-800/80 rounded-xl p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-semibold text-zinc-100">
              ACPI -&gt; SortedOrder (`EFI/CLOVER/ACPI/patched` 加载顺序)
            </h3>
            <p className="text-xs text-zinc-400">可点击顶部「扫描同步目录」自动扫描 patched 文件夹</p>
          </div>
          <div className="flex gap-2">
            <input
              type="text"
              value={newAml}
              onChange={(e) => setNewAml(e.target.value)}
              placeholder="如 SSDT-PNLF.aml"
              className="bg-zinc-950 border border-zinc-800 rounded-lg px-2.5 py-1 text-xs font-mono text-zinc-100"
            />
            <button
              type="button"
              onClick={() => {
                if (!newAml.trim()) return;
                updatePlistPath(["ACPI", "SortedOrder"], {
                  kind: "Array",
                  val: [...sortedOrder, { kind: "String", val: newAml.trim() }],
                });
                setNewAml("");
              }}
              className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-xs text-white flex items-center gap-1"
            >
              <Plus className="w-3.5 h-3.5" /> 添加
            </button>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {sortedOrder.map((item, idx) => {
            const name = item.kind === "String" ? item.val : "";
            return (
              <span
                key={idx}
                className="px-3 py-1.5 rounded-lg bg-zinc-950 border border-zinc-800 text-xs font-mono text-zinc-200 flex items-center gap-2"
              >
                <span>{name}</span>
                <button
                  type="button"
                  onClick={() =>
                    updatePlistPath(["ACPI", "SortedOrder"], {
                      kind: "Array",
                      val: sortedOrder.filter((_, i) => i !== idx),
                    })
                  }
                  className="text-zinc-500 hover:text-rose-400"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </span>
            );
          })}
        </div>
      </div>
    </div>
  );
};

// 2. Clover Boot Section
export const CloverBootSection: React.FC = () => {
  const { plist, updatePlistPath } = useWorkspaceStore();
  const args = getStr(plist, ["Boot", "Arguments"]);
  const defaultVol = getStr(plist, ["Boot", "DefaultVolume"], "LastBootedVolume");
  const timeout = getInt(plist, ["Boot", "Timeout"], 5);
  const neverHibernate = getBool(plist, ["Boot", "NeverHibernate"], true);
  const xmp = getStr(plist, ["Boot", "XMPDetection"], "Yes");

  const tokens = args.split(/\s+/).filter(Boolean);
  const toggleFlag = (f: string) => {
    const next = tokens.includes(f) ? tokens.filter((t) => t !== f) : [...tokens, f];
    updatePlistPath(["Boot", "Arguments"], { kind: "String", val: next.join(" ") });
  };

  return (
    <div className="space-y-5">
      <div className="bg-zinc-900/60 border border-zinc-800/80 rounded-xl p-4 space-y-3">
        <h3 className="text-sm font-semibold text-zinc-100">Boot -&gt; Arguments (四叶草启动参数)</h3>
        <input
          type="text"
          value={args}
          onChange={(e) =>
            updatePlistPath(["Boot", "Arguments"], { kind: "String", val: e.target.value })
          }
          className="w-full bg-zinc-950 border border-zinc-700 rounded-xl px-3.5 py-2 text-xs font-mono text-emerald-300 outline-none focus:border-emerald-500"
        />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
          {CLOVER_BOOT_FLAGS.map((item) => {
            const on = tokens.includes(item.flag);
            return (
              <button
                key={item.flag}
                type="button"
                onClick={() => toggleFlag(item.flag)}
                className={`text-left p-2.5 rounded-lg border text-xs transition ${
                  on
                    ? "bg-emerald-950/35 border-emerald-500/50 text-emerald-200"
                    : "bg-zinc-950 border-zinc-800 text-zinc-300"
                }`}
              >
                <div className="font-mono font-semibold">{item.flag}</div>
                <div className="text-[11px] text-zinc-400 mt-0.5">{item.desc}</div>
              </button>
            );
          })}
        </div>
      </div>

      <div className="bg-zinc-900/60 border border-zinc-800/80 rounded-xl p-4 grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
        <div>
          <label className="block text-zinc-400 mb-1">默认启动卷标 (DefaultVolume)</label>
          <input
            type="text"
            value={defaultVol}
            onChange={(e) =>
              updatePlistPath(["Boot", "DefaultVolume"], { kind: "String", val: e.target.value })
            }
            className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-1.5 text-zinc-100 font-mono"
          />
        </div>
        <div>
          <label className="block text-zinc-400 mb-1">倒计时秒数 (Timeout, -1 直接进系统)</label>
          <input
            type="number"
            value={timeout}
            onChange={(e) =>
              updatePlistPath(["Boot", "Timeout"], {
                kind: "Integer",
                val: parseInt(e.target.value || "5", 10),
              })
            }
            className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-1.5 text-amber-300 font-mono"
          />
        </div>
        <div>
          <label className="block text-zinc-400 mb-1">内存 XMP 频率识别 (XMPDetection)</label>
          <select
            value={xmp}
            onChange={(e) =>
              updatePlistPath(["Boot", "XMPDetection"], { kind: "String", val: e.target.value })
            }
            className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-1.5 text-zinc-100"
          >
            <option value="Yes">Yes (自动识别 XMP 内存频率)</option>
            <option value="No">No (禁用 XMP 检测)</option>
          </select>
        </div>
        <label className="flex items-center justify-between pt-4 cursor-pointer">
          <span className="text-zinc-300">禁用深度休眠镜像以防唤醒死机 (NeverHibernate)</span>
          <input
            type="checkbox"
            checked={neverHibernate}
            onChange={(e) =>
              updatePlistPath(["Boot", "NeverHibernate"], {
                kind: "Boolean",
                val: e.target.checked,
              })
            }
            className="accent-emerald-500 w-4 h-4"
          />
        </label>
      </div>
    </div>
  );
};

// 3. Clover Devices Section
export const CloverDevicesSection: React.FC = () => {
  const { plist, updatePlistPath } = useWorkspaceStore();
  const audioId = getInt(plist, ["Devices", "Audio", "Inject"], 11);
  const resetHda = getBool(plist, ["Devices", "Audio", "ResetHDA"], true);
  const usbInject = getBool(plist, ["Devices", "USB", "Inject"], true);
  const fixOwnership = getBool(plist, ["Devices", "USB", "FixOwnership"], true);
  const addClockId = getBool(plist, ["Devices", "USB", "AddClockID"], true);

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
      <div className="bg-zinc-900/60 border border-zinc-800/80 rounded-xl p-4 space-y-3">
        <h3 className="text-sm font-semibold text-zinc-100">Devices -&gt; Audio (四叶草声卡 ID 注入)</h3>
        <div>
          <label className="block text-zinc-400 mb-1">Audio Inject (直接填写十进制 Layout-ID，如 11 / 7 / 1)</label>
          <input
            type="number"
            value={audioId}
            onChange={(e) =>
              updatePlistPath(["Devices", "Audio", "Inject"], {
                kind: "Integer",
                val: parseInt(e.target.value || "0", 10),
              })
            }
            className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-1.5 font-mono text-emerald-300"
          />
        </div>
        <label className="flex items-center justify-between cursor-pointer pt-1">
          <span className="text-zinc-300">重启从 Windows 切回时重置声卡状态 (ResetHDA)</span>
          <input
            type="checkbox"
            checked={resetHda}
            onChange={(e) =>
              updatePlistPath(["Devices", "Audio", "ResetHDA"], {
                kind: "Boolean",
                val: e.target.checked,
              })
            }
            className="accent-emerald-500 w-4 h-4"
          />
        </label>
      </div>

      <div className="bg-zinc-900/60 border border-zinc-800/80 rounded-xl p-4 space-y-3">
        <h3 className="text-sm font-semibold text-zinc-100">Devices -&gt; USB (控制器控制权与时钟修复)</h3>
        {[
          { k: "Inject", label: "注入 USB 设备属性 (Inject)", val: usbInject },
          { k: "FixOwnership", label: "接管 BIOS XHCI/EHCI 控制权防卡死 (FixOwnership)", val: fixOwnership },
          { k: "AddClockID", label: "注入 Apple Clock-ID 修复唤醒断连 (AddClockID)", val: addClockId },
        ].map((u) => (
          <label key={u.k} className="flex items-center justify-between cursor-pointer py-1">
            <span className="text-zinc-300">{u.label}</span>
            <input
              type="checkbox"
              checked={u.val}
              onChange={(e) =>
                updatePlistPath(["Devices", "USB", u.k], {
                  kind: "Boolean",
                  val: e.target.checked,
                })
              }
              className="accent-emerald-500 w-4 h-4"
            />
          </label>
        ))}
      </div>
    </div>
  );
};

// 4. Clover GUI & Graphics Section
export const CloverGuiSection: React.FC = () => {
  const { plist, updatePlistPath } = useWorkspaceStore();
  const theme = getStr(plist, ["GUI", "Theme"], "embedded");
  const resolution = getStr(plist, ["GUI", "ScreenResolution"], "1920x1080");
  const mouseEnabled = getBool(plist, ["GUI", "Mouse", "Enabled"], true);

  return (
    <div className="bg-zinc-900/60 border border-zinc-800/80 rounded-xl p-5 grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
      <div>
        <label className="block text-zinc-400 mb-1.5">四叶草主题目录名 (GUI -&gt; Theme)</label>
        <input
          type="text"
          value={theme}
          onChange={(e) =>
            updatePlistPath(["GUI", "Theme"], { kind: "String", val: e.target.value })
          }
          placeholder="embedded / Clover / Catalina / BGM"
          className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-zinc-100 font-mono"
        />
      </div>
      <div>
        <label className="block text-zinc-400 mb-1.5">引导菜单屏幕分辨率 (ScreenResolution)</label>
        <select
          value={resolution}
          onChange={(e) =>
            updatePlistPath(["GUI", "ScreenResolution"], { kind: "String", val: e.target.value })
          }
          className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-zinc-100"
        >
          <option value="1920x1080">1920x1080 (FHD)</option>
          <option value="2560x1440">2560x1440 (2K QHD)</option>
          <option value="3840x2160">3840x2160 (4K UHD)</option>
          <option value="1366x768">1366x768 (老笔记本)</option>
        </select>
      </div>
      <label className="flex items-center justify-between pt-5 cursor-pointer">
        <span className="text-zinc-300">在引导界面启用鼠标指针操作 (Mouse)</span>
        <input
          type="checkbox"
          checked={mouseEnabled}
          onChange={(e) =>
            updatePlistPath(["GUI", "Mouse", "Enabled"], {
              kind: "Boolean",
              val: e.target.checked,
            })
          }
          className="accent-emerald-500 w-4 h-4"
        />
      </label>
    </div>
  );
};

export const CloverGraphicsSection: React.FC = () => {
  const { plist, updatePlistPath } = useWorkspaceStore();
  const injectIntel = getBool(plist, ["Graphics", "Inject", "Intel"], false);
  const injectAti = getBool(plist, ["Graphics", "Inject", "ATI"], false);
  const injectNvidia = getBool(plist, ["Graphics", "Inject", "NVidia"], false);
  const igPlatform = getStr(plist, ["Graphics", "ig-platform-id"]);

  return (
    <div className="bg-zinc-900/60 border border-zinc-800/80 rounded-xl p-5 space-y-4 text-xs">
      <div>
        <h3 className="text-sm font-semibold text-zinc-100">
          Graphics (传统 Intel HD3000~HD530 / 老 A卡 / Kepler N卡快捷注入)
        </h3>
        <p className="text-zinc-400 mt-0.5">
          注意：8代及以上新显卡推荐用 WhateverGreen + Devices -&gt; Properties 注入，此处保持关闭；3~6代经典老核显可在此一键开启。
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {[
          { k: "Intel", label: "Inject Intel (老款 Intel HD 核显)", val: injectIntel },
          { k: "ATI", label: "Inject ATI (HD 5000/6000/7000 老 A卡)", val: injectAti },
          { k: "NVidia", label: "Inject NVidia (GT 600/700 老 N卡)", val: injectNvidia },
        ].map((g) => (
          <label
            key={g.k}
            className="p-3 rounded-xl border border-zinc-800 bg-zinc-950 flex items-center justify-between cursor-pointer"
          >
            <span>{g.label}</span>
            <input
              type="checkbox"
              checked={g.val}
              onChange={(e) =>
                updatePlistPath(["Graphics", "Inject", g.k], {
                  kind: "Boolean",
                  val: e.target.checked,
                })
              }
              className="accent-emerald-500 w-4 h-4"
            />
          </label>
        ))}
      </div>

      <div className="space-y-2">
        <label className="block text-zinc-400">ig-platform-id (经典核显缓冲帧快捷选择)</label>
        <div className="flex flex-wrap gap-2">
          <input
            type="text"
            value={igPlatform}
            onChange={(e) =>
              updatePlistPath(["Graphics", "ig-platform-id"], {
                kind: "String",
                val: e.target.value,
              })
            }
            placeholder="如 0x19120000"
            className="w-56 bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-1.5 font-mono text-emerald-300"
          />
          {[
            ["0x01660003", "3代 HD 4000 笔记本"],
            ["0x0d220003", "4代 HD 4600 台式机"],
            ["0x19120000", "6代 HD 530 台式机"],
            ["0x59120000", "7代 HD 630 台式机"],
          ].map(([id, name]) => (
            <button
              key={id}
              type="button"
              onClick={() => {
                updatePlistPath(["Graphics", "Inject", "Intel"], { kind: "Boolean", val: true });
                updatePlistPath(["Graphics", "ig-platform-id"], { kind: "String", val: id });
              }}
              className="px-2.5 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200"
            >
              {name} ({id})
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};

// 5. Clover KernelAndKextPatches & Quirks
export const CloverKernelPatchesSection: React.FC = () => {
  const { plist, updatePlistPath } = useWorkspaceStore();
  const entries = getDictEntries(plist, ["KernelAndKextPatches"]).filter(
    ([_, v]) => v.kind === "Boolean"
  );

  const descMap: Record<string, string> = {
    KernelPm: "解锁 4代 Haswell 及更新 Intel CPU 的 MSR 0xE2 (CFG Lock) 崩溃",
    AppleIntelCPUPM: "解锁 2/3代 Sandy/Ivy Bridge 老酷睿电源管理崩溃",
    AppleRTC: "防止重启后主板 CMOS 校验重置报错",
    KernelLapic: "修复 HP 惠普笔记本多核 APIC 内核崩溃",
    PanicNoKextDump: "死机时不刷屏打印已加载驱动列表",
    DellSMBIOSPatch: "修复戴尔机器 SMBIOS 字段被截断问题",
    EightApple: "突破老系统加载补丁上限",
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 text-xs">
      {entries.map(([k, v]) => {
        if (v.kind !== "Boolean") return null;
        return (
          <label
            key={k}
            className={`rounded-xl border p-3.5 flex flex-col justify-between gap-2 cursor-pointer ${
              v.val
                ? "bg-emerald-950/25 border-emerald-500/40"
                : "bg-zinc-900/50 border-zinc-800"
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="font-mono font-semibold text-zinc-100">{k}</span>
              <input
                type="checkbox"
                checked={v.val}
                onChange={(e) =>
                  updatePlistPath(["KernelAndKextPatches", k], {
                    kind: "Boolean",
                    val: e.target.checked,
                  })
                }
                className="accent-emerald-500 w-4 h-4"
              />
            </div>
            <p className="text-[11px] text-zinc-400">{descMap[k] ?? "四叶草内核修补项"}</p>
          </label>
        );
      })}
    </div>
  );
};

export const CloverQuirksSection: React.FC = () => {
  const { plist, updatePlistPath } = useWorkspaceStore();
  const entries = getDictEntries(plist, ["Quirks"]);

  return (
    <div className="space-y-4">
      <div className="bg-emerald-950/20 border border-emerald-500/30 rounded-xl p-4 text-xs text-emerald-200">
        <strong>Clover r5123+ 现代 OpenRuntime Quirks：</strong>新版四叶草融合了 OpenCore 的底层内存与内核引导开关，用于引导 Big Sur / Monterey / Ventura / Sonoma / Sequoia。
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3 text-xs">
        {entries.map(([k, v]) => {
          if (v.kind !== "Boolean") return null;
          const meta = QUIRKS_ENCYCLOPEDIA[k];
          return (
            <label
              key={k}
              className={`rounded-xl border p-3.5 flex flex-col justify-between gap-2 cursor-pointer ${
                v.val
                  ? "bg-emerald-950/25 border-emerald-500/40"
                  : "bg-zinc-900/50 border-zinc-800"
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="font-mono font-semibold text-zinc-100">{k}</span>
                <input
                  type="checkbox"
                  checked={v.val}
                  onChange={(e) =>
                    updatePlistPath(["Quirks", k], {
                      kind: "Boolean",
                      val: e.target.checked,
                    })
                  }
                  className="accent-emerald-500 w-4 h-4"
                />
              </div>
              <p className="text-[11px] text-zinc-400">
                {meta?.titleZh ?? "OpenRuntime 引导修复开关"}
              </p>
            </label>
          );
        })}
      </div>
    </div>
  );
};

// 6. Clover RtVariables & SystemParameters & SMBIOS
export const CloverRtAndSysSection: React.FC = () => {
  const { plist, updatePlistPath } = useWorkspaceStore();
  const csr = getStr(plist, ["RtVariables", "CsrActiveConfig"], "0x00");
  const booterCfg = getStr(plist, ["RtVariables", "BooterConfig"], "0x28");
  const injectKexts = getStr(plist, ["SystemParameters", "InjectKexts"], "Yes");
  const injectSysId = getBool(plist, ["SystemParameters", "InjectSystemID"], true);

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
      <div className="bg-zinc-900/60 border border-zinc-800/80 rounded-xl p-4 space-y-3">
        <h3 className="text-sm font-semibold text-zinc-100">RtVariables (SIP 安全保护与运行变量)</h3>
        <div>
          <label className="block text-zinc-400 mb-1">CsrActiveConfig (SIP 状态)</label>
          <select
            value={csr}
            onChange={(e) =>
              updatePlistPath(["RtVariables", "CsrActiveConfig"], {
                kind: "String",
                val: e.target.value,
              })
            }
            className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-zinc-100 font-mono"
          >
            <option value="0x00">0x00 (完全开启 SIP)</option>
            <option value="0x67">0x67 (四叶草经典关闭 SIP)</option>
            <option value="0x3E7">0x3E7 (High Sierra ~ Catalina 彻底关闭 SIP)</option>
            <option value="0x803">0x803 (Big Sur+ OCLP 根补丁模式)</option>
          </select>
        </div>
        <div>
          <label className="block text-zinc-400 mb-1">BooterConfig</label>
          <input
            type="text"
            value={booterCfg}
            onChange={(e) =>
              updatePlistPath(["RtVariables", "BooterConfig"], {
                kind: "String",
                val: e.target.value,
              })
            }
            className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-1.5 font-mono text-zinc-100"
          />
        </div>
      </div>

      <div className="bg-zinc-900/60 border border-zinc-800/80 rounded-xl p-4 space-y-3">
        <h3 className="text-sm font-semibold text-zinc-100">
          SystemParameters (`CLOVER/kexts/Other` 驱动注入开关)
        </h3>
        <div>
          <label className="block text-zinc-400 mb-1">InjectKexts (强烈建议设为 Yes)</label>
          <select
            value={injectKexts}
            onChange={(e) =>
              updatePlistPath(["SystemParameters", "InjectKexts"], {
                kind: "String",
                val: e.target.value,
              })
            }
            className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-emerald-300 font-mono"
          >
            <option value="Yes">Yes (强制注入 kexts/Other 下所有驱动)</option>
            <option value="Detect">Detect (仅当缓存无 FakeSMC 时注入)</option>
            <option value="No">No (不注入任何第三方驱动!)</option>
          </select>
        </div>
        <label className="flex items-center justify-between pt-2 cursor-pointer">
          <span className="text-zinc-300">注入固定硬件 UUID (InjectSystemID)</span>
          <input
            type="checkbox"
            checked={injectSysId}
            onChange={(e) =>
              updatePlistPath(["SystemParameters", "InjectSystemID"], {
                kind: "Boolean",
                val: e.target.checked,
              })
            }
            className="accent-emerald-500 w-4 h-4"
          />
        </label>
      </div>
    </div>
  );
};

export const CloverSmbiosSection: React.FC = () => {
  const { plist, updatePlistPath, pushToast } = useWorkspaceStore();
  const [models, setModels] = useState<SmbiosModelOption[]>([]);
  const productName = getStr(plist, ["SMBIOS", "ProductName"], "iMac20,1");
  const serial = getStr(plist, ["SMBIOS", "SerialNumber"]);
  const boardSerial = getStr(plist, ["SMBIOS", "BoardSerialNumber"]);
  const smUuid = getStr(plist, ["SMBIOS", "SmUUID"]);
  const rom = getData(plist, ["RtVariables", "ROM"]);

  useEffect(() => {
    if (isTauriRuntime()) {
      apiListSmbiosModels().then(setModels).catch(() => {});
    }
  }, []);

  const handleGenerate = async (targetModel = productName) => {
    if (!isTauriRuntime()) return;
    const gen = await apiGenerateSmbios(targetModel);
    updatePlistPath(["SMBIOS", "ProductName"], { kind: "String", val: gen.model });
    updatePlistPath(["SMBIOS", "SerialNumber"], { kind: "String", val: gen.serial });
    updatePlistPath(["SMBIOS", "BoardSerialNumber"], { kind: "String", val: gen.mlb });
    updatePlistPath(["SMBIOS", "SmUUID"], { kind: "String", val: gen.system_uuid });
    updatePlistPath(["RtVariables", "MLB"], { kind: "String", val: gen.mlb });
    updatePlistPath(["RtVariables", "ROM"], { kind: "Data", val: gen.rom_hex });
    pushToast("success", `已生成四叶草 ${gen.model} 全套三码并同步更新 RtVariables！`);
  };

  return (
    <div className="space-y-5 text-xs">
      <div className="bg-zinc-900/70 border border-emerald-500/30 rounded-2xl p-5 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-2.5">
          <ShieldCheck className="w-5 h-5 text-emerald-400" />
          <div>
            <h3 className="text-sm font-semibold text-zinc-100">
              四叶草 SMBIOS 三码生成工作站 (自动同步 RtVariables MLB &amp; ROM)
            </h3>
            <p className="text-zinc-400 mt-0.5">
              同时更新 `SMBIOS` 与 `RtVariables` 节点，确保四叶草下 iMessage 与 FaceTime 完美激活
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => handleGenerate(productName)}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 font-semibold text-white"
          >
            <RefreshCw className="w-3.5 h-3.5" /> 随机生成新三码
          </button>
          <a
            href="https://checkcoverage.apple.com/"
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1 px-3 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200"
          >
            官网验码 <ExternalLink className="w-3.5 h-3.5" />
          </a>
        </div>
      </div>

      <div className="bg-zinc-900/60 border border-zinc-800/80 rounded-xl p-5 grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-zinc-400 mb-1">机型名称 (ProductName)</label>
          <select
            value={productName}
            onChange={(e) => handleGenerate(e.target.value)}
            className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-zinc-100"
          >
            {(models.length > 0
              ? models
              : [{ model: productName, category: "", cpuFamily: "", macosSupport: "", gpuNote: "" }]
            ).map((m) => (
              <option key={m.model} value={m.model}>
                {m.model} {m.cpuFamily ? `— ${m.cpuFamily}` : ""}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-zinc-400 mb-1">整机序列号 (SerialNumber)</label>
          <input
            type="text"
            value={serial}
            onChange={(e) =>
              updatePlistPath(["SMBIOS", "SerialNumber"], {
                kind: "String",
                val: e.target.value.toUpperCase(),
              })
            }
            className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 font-mono text-emerald-300"
          />
        </div>
        <div>
          <label className="block text-zinc-400 mb-1">17位主板序列号 (BoardSerialNumber / MLB)</label>
          <input
            type="text"
            value={boardSerial}
            onChange={(e) => {
              const v = e.target.value.toUpperCase();
              updatePlistPath(["SMBIOS", "BoardSerialNumber"], { kind: "String", val: v });
              updatePlistPath(["RtVariables", "MLB"], { kind: "String", val: v });
            }}
            className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 font-mono text-zinc-100"
          />
        </div>
        <div>
          <label className="block text-zinc-400 mb-1">SmUUID</label>
          <input
            type="text"
            value={smUuid}
            onChange={(e) =>
              updatePlistPath(["SMBIOS", "SmUUID"], {
                kind: "String",
                val: e.target.value.toUpperCase(),
              })
            }
            className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 font-mono text-zinc-100"
          />
        </div>
        <div className="md:col-span-2">
          <label className="block text-zinc-400 mb-1">RtVariables -&gt; ROM (6字节网卡 HEX)</label>
          <input
            type="text"
            value={rom}
            onChange={(e) =>
              updatePlistPath(["RtVariables", "ROM"], {
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

export const MigrationNotesAlert: React.FC = () => {
  const { migrationNotes, clearMigrationNotes } = useWorkspaceStore();
  if (migrationNotes.length === 0) return null;

  return (
    <div className="mb-5 bg-blue-950/35 border border-blue-500/40 rounded-2xl p-4 space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-semibold text-blue-200">
          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          <span>四叶草 Clover -&gt; OpenCore 智能迁移报告</span>
        </div>
        <button
          type="button"
          onClick={clearMigrationNotes}
          className="text-xs text-zinc-400 hover:text-zinc-100"
        >
          知道了
        </button>
      </div>
      <ul className="list-disc list-inside text-xs text-zinc-300 space-y-1">
        {migrationNotes.map((n, i) => (
          <li key={i}>{n}</li>
        ))}
      </ul>
    </div>
  );
};
