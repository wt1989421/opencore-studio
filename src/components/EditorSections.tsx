import React, { useEffect, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  ExternalLink,
  Plus,
  RefreshCw,
  Sparkles,
  Trash2,
} from "lucide-react";
import {
  COMMON_BOOT_ARGS,
  QUIRKS_ENCYCLOPEDIA,
  SIP_PRESETS,
} from "../data/quirks-encyclopedia";
import {
  apiApplyAmdVanillaPatches,
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
import {
  AppleSwitch,
  SegmentedControl,
  SettingsGroup,
  SettingsRow,
  appleInputCls,
  applePrimaryBtnCls,
  appleSecondaryBtnCls,
} from "./AppleUI";

const QuirkSettingsList: React.FC<{
  title: string;
  description?: string;
  section: string;
  path: string[];
}> = ({ title, description, path }) => {
  const { plist, updatePlistPath } = useWorkspaceStore();
  const entries = getDictEntries(plist, path);

  return (
    <SettingsGroup title={title} description={description}>
      {entries.map(([key, node]) => {
        const meta = QUIRKS_ENCYCLOPEDIA[key];
        if (node.kind === "Boolean") {
          return (
            <SettingsRow
              key={key}
              title={
                <span className="flex items-center gap-2">
                  <span>{meta?.titleZh ?? key}</span>
                  <code className="text-[11px] font-mono px-1.5 py-0.5 rounded bg-[#F5F5F7] text-[#6E6E73]">
                    {key}
                  </code>
                </span>
              }
              subtitle={meta?.desc}
              tip={meta?.dortaniaTip}
              right={
                <AppleSwitch
                  checked={node.val}
                  onChange={(next) =>
                    updatePlistPath([...path, key], { kind: "Boolean", val: next })
                  }
                />
              }
            />
          );
        }
        if (node.kind === "Integer") {
          return (
            <SettingsRow
              key={key}
              title={
                <span className="flex items-center gap-2">
                  <span>
                    {key === "ResizeAppleGpuBars"
                      ? "Resizable BAR 显存映射大小"
                      : key}
                  </span>
                  <code className="text-[11px] font-mono px-1.5 py-0.5 rounded bg-[#F5F5F7] text-[#6E6E73]">
                    {key}
                  </code>
                </span>
              }
              subtitle={
                key === "ResizeAppleGpuBars"
                  ? "主板未开启 ReBAR 填 -1；已开启 ReBAR 推荐填 0"
                  : "整数型引导参数"
              }
              right={
                <input
                  type="number"
                  value={node.val}
                  onChange={(e) =>
                    updatePlistPath([...path, key], {
                      kind: "Integer",
                      val: parseInt(e.target.value || "0", 10),
                    })
                  }
                  className={`${appleInputCls} w-24 text-right font-mono`}
                />
              }
            />
          );
        }
        return null;
      })}
    </SettingsGroup>
  );
};

// ---------------- 1. ACPI Section ----------------
export const AcpiSection: React.FC = () => {
  const { plist, updatePlistPath } = useWorkspaceStore();
  const addItems = getArray(plist, ["ACPI", "Add"]);

  const addSsdtPreset = (filename: string, comment: string) => {
    if (addItems.some((i) => getStr(i, ["Path"]) === filename)) return;
    updatePlistPath(["ACPI", "Add"], {
      kind: "Array",
      val: [
        ...addItems,
        {
          kind: "Dict",
          val: [
            ["Comment", { kind: "String", val: comment }],
            ["Enabled", { kind: "Boolean", val: true }],
            ["Path", { kind: "String", val: filename }],
          ],
        },
      ],
    });
  };

  return (
    <div className="space-y-6">
      <SettingsGroup
        title="SSDT / DSDT 热补丁表 (ACPI -> Add)"
        description="管理 EFI/OC/ACPI 目录加载的电源管理、嵌入式控制器、背光与触控板补丁"
        action={
          <div className="flex flex-wrap gap-1.5">
            {[
              ["SSDT-EC-USBX.aml", "EC 与 USB 供电修复"],
              ["SSDT-PLUG.aml", "CPU 原生电源管理"],
              ["SSDT-AWAC.aml", "300系+ 系统时钟修复"],
              ["SSDT-PNLF.aml", "笔记本屏幕亮度滑块"],
            ].map(([file, desc]) => (
              <button
                key={file}
                type="button"
                onClick={() => addSsdtPreset(file, desc)}
                className={appleSecondaryBtnCls}
              >
                <Plus className="w-3.5 h-3.5 text-[#007AFF]" />
                {file.replace(".aml", "")}
              </button>
            ))}
          </div>
        }
      >
        {addItems.map((item, idx) => {
          const enabled = getBool(item, ["Enabled"], true);
          const path = getStr(item, ["Path"]);
          const comment = getStr(item, ["Comment"]);
          return (
            <SettingsRow
              key={idx}
              title={<span className="font-mono font-semibold">{path}</span>}
              subtitle={
                <input
                  type="text"
                  value={comment}
                  placeholder="添加备注说明..."
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
                  className="w-full bg-transparent text-[12px] text-[#86868B] focus:text-[#1D1D1F] outline-none"
                />
              }
              right={
                <>
                  <AppleSwitch
                    checked={enabled}
                    onChange={(val) => {
                      const next = [...addItems];
                      next[idx] = {
                        kind: "Dict",
                        val: [
                          ["Comment", { kind: "String", val: comment }],
                          ["Enabled", { kind: "Boolean", val: val }],
                          ["Path", { kind: "String", val: path }],
                        ],
                      };
                      updatePlistPath(["ACPI", "Add"], { kind: "Array", val: next });
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => {
                      const next = addItems.filter((_, i) => i !== idx);
                      updatePlistPath(["ACPI", "Add"], { kind: "Array", val: next });
                    }}
                    className="p-1.5 text-[#86868B] hover:text-[#FF3B30] transition"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </>
              }
            />
          );
        })}
        {addItems.length === 0 && (
          <div className="py-8 text-center text-[12.5px] text-[#86868B]">
            暂无 ACPI 补丁文件，可点击上方按钮快速添加常用 SSDT
          </div>
        )}
      </SettingsGroup>

      <QuirkSettingsList
        title="ACPI 底层兼容开关 (Quirks)"
        description="通常只需开启 ResetLogoStatus 防止开机苹果 Logo 画面闪烁"
        section="ACPI"
        path={["ACPI", "Quirks"]}
      />
    </div>
  );
};

// ---------------- 2. Booter Section ----------------
export const BooterSection: React.FC = () => (
  <div className="space-y-6">
    <QuirkSettingsList
      title="OpenRuntime 早期引导与内存映射 (Booter -> Quirks)"
      description="解决卡 [EB|#LOG:EXITBS:START] 的核心设置区。注意 EnableWriteUnprotector 与 RebuildAppleMemoryMap 互斥不可同开。"
      section="Booter"
      path={["Booter", "Quirks"]}
    />
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
    <div className="space-y-6">
      <SettingsGroup
        title="快捷硬件属性注入预设"
        description="一键注入常见 Intel 核显缓冲帧与板载声卡属性（自动完成小端字节序倒序换算）"
      >
        <SettingsRow
          title="Intel UHD 630 台式机核显驱动 (07009B3E)"
          subtitle="适用于 8/9/10代酷睿单核显多屏输出"
          right={
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
                  "台式机 UHD 630 核显输出驱动"
                )
              }
              className={appleSecondaryBtnCls}
            >
              一键注入
            </button>
          }
        />
        <SettingsRow
          title="Intel UHD 630 无头计算加速模式 (0300913E)"
          subtitle="适用于搭配免驱 AMD 独显时让核显后台参与视频剪辑加速"
          right={
            <button
              type="button"
              onClick={() =>
                injectPreset(
                  "PciRoot(0x0)/Pci(0x2,0x0)",
                  [["AAPL,ig-platform-id", { kind: "Data", val: "0300913E" }]],
                  "UHD 630 无头加速模式"
                )
              }
              className={appleSecondaryBtnCls}
            >
              一键注入
            </button>
          }
        />
        <SettingsRow
          title="添加自定义 PCIe 设备路径"
          subtitle="例如 PciRoot(0x0)/Pci(0x1c,0x0)/Pci(0x0,0x0)"
          right={
            <div className="flex gap-2">
              <input
                type="text"
                value={newPciPath}
                onChange={(e) => setNewPciPath(e.target.value)}
                placeholder="PciRoot(0x0)/Pci(...)"
                className={`${appleInputCls} w-56 font-mono`}
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
                className={applePrimaryBtnCls}
              >
                添加
              </button>
            </div>
          }
        />
      </SettingsGroup>

      {devices.map(([pciPath, dictNode]) => {
        const propEntries = dictNode.kind === "Dict" ? dictNode.val : [];
        return (
          <SettingsGroup
            key={pciPath}
            title={pciPath}
            action={
              <button
                type="button"
                onClick={() => {
                  const filtered = devices.filter(([k]) => k !== pciPath);
                  updatePlistPath(["DeviceProperties", "Add"], {
                    kind: "Dict",
                    val: filtered,
                  });
                }}
                className="text-[12px] text-[#FF3B30] hover:underline"
              >
                移除此设备
              </button>
            }
          >
            {propEntries.map(([propKey, propVal], pIdx) => {
              const decodedU32 =
                propVal.kind === "Data" ? littleEndianHexToU32(propVal.val) : null;
              return (
                <SettingsRow
                  key={pIdx}
                  title={<span className="font-mono">{propKey}</span>}
                  subtitle={
                    decodedU32 !== null && propKey === "layout-id"
                      ? `类型: Data (HEX) · 对应十进制声卡 ID = ${decodedU32}`
                      : `类型: ${propVal.kind}`
                  }
                  right={
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
                      className={`${appleInputCls} w-48 font-mono`}
                    />
                  }
                />
              );
            })}
          </SettingsGroup>
        );
      })}
    </div>
  );
};

// ---------------- 4. Kernel Section (with AMD 9900X Calculator) ----------------
export const KernelSection: React.FC = () => {
  const { plist, ocDir, updatePlistPath, replacePlist, setIssues, pushToast } =
    useWorkspaceStore();
  const kexts = getArray(plist, ["Kernel", "Add"]);
  const kernelPatches = getArray(plist, ["Kernel", "Patch"]);
  const cpuidData = getData(plist, ["Kernel", "Emulate", "Cpuid1Data"]);
  const [amdCores, setAmdCores] = useState<string>("12");

  const moveKext = (idx: number, delta: number) => {
    const target = idx + delta;
    if (target < 0 || target >= kexts.length) return;
    const next = [...kexts];
    const [removed] = next.splice(idx, 1);
    next.splice(target, 0, removed);
    updatePlistPath(["Kernel", "Add"], { kind: "Array", val: next });
  };

  return (
    <div className="space-y-6">
      {/* Kexts List */}
      <SettingsGroup
        title="内核扩展驱动加载顺序 (Kernel -> Add)"
        description="Lilu.kext 必须位于第一位，VirtualSMC 必须排在传感器与声卡显卡插件之前"
        action={
          <button
            type="button"
            onClick={async () => {
              if (!isTauriRuntime()) return;
              const [sortedPlist, msg, issues] = await apiApplyQuickFix(
                plist,
                "sort_kexts",
                ocDir
              );
              replacePlist(sortedPlist);
              setIssues(issues);
              pushToast("success", msg);
            }}
            className={applePrimaryBtnCls}
          >
            <Sparkles className="w-3.5 h-3.5" />
            按依赖自动排序
          </button>
        }
      >
        {kexts.map((item, idx) => {
          const enabled = getBool(item, ["Enabled"], true);
          const bundle = getStr(item, ["BundlePath"]);
          const comment = getStr(item, ["Comment"]);
          return (
            <SettingsRow
              key={idx}
              title={
                <span className="flex items-center gap-2">
                  <span className="text-[11px] font-mono px-1.5 py-0.5 rounded bg-[#F5F5F7] text-[#86868B]">
                    #{idx + 1}
                  </span>
                  <span className="font-mono font-semibold">{bundle}</span>
                </span>
              }
              subtitle={comment || getStr(item, ["ExecutablePath"]) || "Info.plist 驱动包"}
              right={
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => moveKext(idx, -1)}
                    className="p-1 rounded hover:bg-[#F5F5F7] text-[#86868B] hover:text-[#1D1D1F]"
                  >
                    <ArrowUp className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => moveKext(idx, 1)}
                    className="p-1 rounded hover:bg-[#F5F5F7] text-[#86868B] hover:text-[#1D1D1F]"
                  >
                    <ArrowDown className="w-3.5 h-3.5" />
                  </button>
                  <AppleSwitch
                    checked={enabled}
                    onChange={(val) => {
                      if (item.kind !== "Dict") return;
                      const updated: PlistNode = {
                        kind: "Dict",
                        val: item.val.map(([k, v]) =>
                          k === "Enabled" ? [k, { kind: "Boolean", val }] : [k, v]
                        ),
                      };
                      const next = [...kexts];
                      next[idx] = updated;
                      updatePlistPath(["Kernel", "Add"], { kind: "Array", val: next });
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => {
                      const next = kexts.filter((_, i) => i !== idx);
                      updatePlistPath(["Kernel", "Add"], { kind: "Array", val: next });
                    }}
                    className="p-1 text-[#86868B] hover:text-[#FF3B30]"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              }
            />
          );
        })}
      </SettingsGroup>

      {/* AMD Ryzen 9900X Core Patch Calculator */}
      <SettingsGroup
        title="AMD 锐龙处理器核心补丁换算器 (含 Ryzen 9 9900X / Zen 5)"
        description={`自动写入 AMD_Vanilla 内核补丁 (BA ${parseInt(amdCores, 10)
          .toString(16)
          .padStart(2, "0")
          .toUpperCase()} 00 00 00 90)，12核及以上双 CCD 自动注入 AppleMCEReporterDisabler`}
      >
        <SettingsRow
          title="选择你的 AMD 处理器物理核心数"
          subtitle={`当前已启用 ${kernelPatches.length} 条内核二进制补丁`}
          right={
            <div className="flex items-center gap-2">
              <SegmentedControl
                value={amdCores}
                onChange={setAmdCores}
                options={[
                  { id: "6", label: "6核" },
                  { id: "8", label: "8核" },
                  { id: "12", label: "12核 (9900X)" },
                  { id: "16", label: "16核 (9950X)" },
                ]}
              />
              <button
                type="button"
                onClick={async () => {
                  if (!isTauriRuntime()) return;
                  const c = parseInt(amdCores, 10);
                  const [nextPlist, nextIssues] = await apiApplyAmdVanillaPatches(
                    plist,
                    c,
                    ocDir
                  );
                  replacePlist(nextPlist);
                  setIssues(nextIssues);
                  pushToast("success", `已生成并写入 ${c} 核 AMD_Vanilla 补丁！`);
                }}
                className={applePrimaryBtnCls}
              >
                一键应用
              </button>
            </div>
          }
        />
        <SettingsRow
          title="Intel 12~14代酷睿大小核 CPUID 仿冒 (Emulate)"
          subtitle={cpuidData ? `已启用仿冒: ${cpuidData.slice(0, 8)}...` : "当前未开启 (4~10代原生酷睿无需开启)"}
          right={
            <AppleSwitch
              checked={Boolean(cpuidData)}
              onChange={(on) => {
                updatePlistPath(["Kernel", "Emulate", "Cpuid1Data"], {
                  kind: "Data",
                  val: on ? "55060A00000000000000000000000000" : "",
                });
                updatePlistPath(["Kernel", "Emulate", "Cpuid1Mask"], {
                  kind: "Data",
                  val: on ? "FFFFFFFF000000000000000000000000" : "",
                });
              }}
            />
          }
        />
      </SettingsGroup>

      <QuirkSettingsList
        title="内核层兼容修复开关 (Kernel -> Quirks)"
        description="包含主板 CFG Lock 防死机保护、VT-d 隔离修复与双路核心信息注入"
        section="Kernel"
        path={["Kernel", "Quirks"]}
      />
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
  const debugTarget = getInt(plist, ["Misc", "Debug", "Target"], 3);

  return (
    <div className="space-y-6">
      <SettingsGroup title="开机启动菜单与倒计时 (Misc -> Boot)">
        <SettingsRow
          title="启动界面视觉模式 (PickerMode)"
          subtitle="External 使用 OpenCanopy 苹果原生图形图标菜单"
          right={
            <SegmentedControl
              value={pickerMode}
              onChange={(v) =>
                updatePlistPath(["Misc", "Boot", "PickerMode"], { kind: "String", val: v })
              }
              options={[
                { id: "External", label: "图形主题" },
                { id: "Builtin", label: "简洁文字" },
              ]}
            />
          }
        />
        <SettingsRow
          title="开机显示系统选择菜单 (ShowPicker)"
          subtitle="关闭后将直接引导默认系统（仍可按住 Option 呼出菜单）"
          right={
            <AppleSwitch
              checked={showPicker}
              onChange={(v) =>
                updatePlistPath(["Misc", "Boot", "ShowPicker"], { kind: "Boolean", val: v })
              }
            />
          }
        />
        <SettingsRow
          title="自动进入默认系统等待秒数 (Timeout)"
          right={
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
              className={`${appleInputCls} w-20 text-right font-mono`}
            />
          }
        />
      </SettingsGroup>

      <SettingsGroup title="安全校验与排错日志 (Misc -> Security & Debug)">
        <SettingsRow
          title="EFI 签名安全锁 (Vault)"
          subtitle="未手动签名的 EFI 必须保持 Optional，否则开机黑屏报错 Invalid Vault mode"
          right={
            <select
              value={vault}
              onChange={(e) =>
                updatePlistPath(["Misc", "Security", "Vault"], {
                  kind: "String",
                  val: e.target.value,
                })
              }
              className={appleInputCls}
            >
              <option value="Optional">Optional (推荐安全值)</option>
              <option value="Basic">Basic (需哈希校验)</option>
              <option value="Secure">Secure (需 RSA 签名)</option>
            </select>
          }
        />
        <SettingsRow
          title="苹果 T2 安全启动模型 (SecureBootModel)"
          subtitle="安装 macOS Sonoma / Sequoia 时建议先设为 Disabled 防止循环重启"
          right={
            <SegmentedControl
              value={secureBootModel === "Disabled" ? "Disabled" : "Default"}
              onChange={(v) =>
                updatePlistPath(["Misc", "Security", "SecureBootModel"], {
                  kind: "String",
                  val: v,
                })
              }
              options={[
                { id: "Disabled", label: "Disabled (推荐)" },
                { id: "Default", label: "Default" },
              ]}
            />
          }
        />
        <SettingsRow
          title="自动保存开机排错日志到 EFI 分区根目录"
          subtitle="开启后将 Debug -> Target 设为 67，方便卡住时导入本工具箱诊断"
          right={
            <AppleSwitch
              checked={debugTarget === 67}
              onChange={(on) =>
                updatePlistPath(["Misc", "Debug", "Target"], {
                  kind: "Integer",
                  val: on ? 67 : 3,
                })
              }
            />
          }
        />
      </SettingsGroup>
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
    <div className="space-y-6">
      <SettingsGroup
        title="内核启动参数 (boot-args)"
        description="可直接输入自定义参数，或在下方列表一键开关常用引导标志"
      >
        <div className="p-4 bg-[#FAFAFC]">
          <input
            type="text"
            value={bootArgs}
            onChange={(e) =>
              updatePlistPath(["NVRAM", "Add", bootGuid, "boot-args"], {
                kind: "String",
                val: e.target.value,
              })
            }
            className={`${appleInputCls} w-full font-mono text-[13px] py-2 bg-white`}
            placeholder="-v keepsyms=1 debug=0x100 agdpmod=pikera alcid=11"
          />
        </div>
        {COMMON_BOOT_ARGS.map((spec) => (
          <SettingsRow
            key={spec.flag}
            title={
              <span className="flex items-center gap-2">
                <span>{spec.label}</span>
                <code className="font-mono text-[11.5px] px-1.5 py-0.5 rounded bg-[#F5F5F7] text-[#0066CC]">
                  {spec.flag}
                </code>
              </span>
            }
            subtitle={spec.desc}
            right={
              <AppleSwitch
                checked={activeTokens.includes(spec.flag)}
                onChange={() => toggleFlag(spec.flag)}
              />
            }
          />
        ))}
      </SettingsGroup>

      <SettingsGroup title="系统完整性保护 (SIP) 与安装器语言">
        <SettingsRow
          title="SIP 安全策略 (csr-active-config)"
          subtitle="使用 OCLP 老网卡补丁需选择 03080000"
          right={
            <select
              value={csrHex.toUpperCase()}
              onChange={(e) =>
                updatePlistPath(["NVRAM", "Add", bootGuid, "csr-active-config"], {
                  kind: "Data",
                  val: e.target.value,
                })
              }
              className={appleInputCls}
            >
              {SIP_PRESETS.map((p) => (
                <option key={p.hex} value={p.hex}>
                  {p.name}
                </option>
              ))}
            </select>
          }
        />
        <SettingsRow
          title="恢复盘与安装界面默认语言 (prev-lang:kbd)"
          subtitle="避免首次进安装界面变成俄文或英文"
          right={
            <select
              value={prevLang}
              onChange={(e) =>
                updatePlistPath(["NVRAM", "Add", bootGuid, "prev-lang:kbd"], {
                  kind: "String",
                  val: e.target.value,
                })
              }
              className={appleInputCls}
            >
              <option value="zh-Hans:252">简体中文 (zh-Hans:252)</option>
              <option value="zh-Hant:0">繁体中文 (zh-Hant:0)</option>
              <option value="en-US:0">English (en-US:0)</option>
            </select>
          }
        />
      </SettingsGroup>
    </div>
  );
};

// ---------------- 7. PlatformInfo ("About This Mac" Style!) ----------------
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
    pushToast("success", `已生成 ${gen.model} 全套三码与网卡 ROM`);
  };

  const activeSpec = models.find((m) => m.model === currentModel);

  return (
    <div className="space-y-6">
      {/* Apple "About This Mac" Style Hero Card */}
      <div className="bg-white rounded-[16px] border border-black/[0.07] shadow-[0_2px_8px_rgba(0,0,0,0.03)] p-6 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-b from-[#0A84FF] to-[#005BB5] text-white flex items-center justify-center font-bold text-lg shadow-md">
            Mac
          </div>
          <div>
            <div className="text-lg font-bold text-[#1D1D1F] tracking-tight">{currentModel}</div>
            <div className="text-[12px] text-[#86868B] mt-0.5">
              {activeSpec
                ? `${activeSpec.cpuFamily} · ${activeSpec.macosSupport}`
                : "SMBIOS 硬件身份与 Apple ID / iMessage 激活三码"}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => handleGenerate(currentModel)}
            className={applePrimaryBtnCls}
          >
            <RefreshCw className="w-3.5 h-3.5" />
            随机生成新三码
          </button>
          <a
            href="https://checkcoverage.apple.com/"
            target="_blank"
            rel="noreferrer"
            className={appleSecondaryBtnCls}
          >
            官网验码 <ExternalLink className="w-3.5 h-3.5 text-[#86868B]" />
          </a>
        </div>
      </div>

      <SettingsGroup title="机型与三码信息明细 (PlatformInfo -> Generic)">
        <SettingsRow
          title="模拟苹果机型 (SystemProductName)"
          subtitle={activeSpec?.gpuNote}
          right={
            <select
              value={currentModel}
              onChange={(e) => handleGenerate(e.target.value)}
              className={`${appleInputCls} w-64 font-medium`}
            >
              {(models.length > 0
                ? models
                : [{ model: currentModel, category: "", cpuFamily: "", macosSupport: "", gpuNote: "" }]
              ).map((m) => (
                <option key={m.model} value={m.model}>
                  {m.model} {m.cpuFamily ? `— ${m.cpuFamily}` : ""}
                </option>
              ))}
            </select>
          }
        />
        <SettingsRow
          title="序列号 (SystemSerialNumber)"
          subtitle="12位整机出厂序列号，官网查询提示“未能验证购买日期”或“无效”即为可用好码"
          right={
            <input
              type="text"
              value={serial}
              onChange={(e) =>
                updatePlistPath(["PlatformInfo", "Generic", "SystemSerialNumber"], {
                  kind: "String",
                  val: e.target.value.toUpperCase(),
                })
              }
              className={`${appleInputCls} w-56 font-mono`}
            />
          }
        />
        <SettingsRow
          title="主板序列号 (MLB)"
          subtitle="17位逻辑主板编码，与整机序列号配对校验"
          right={
            <input
              type="text"
              value={mlb}
              onChange={(e) =>
                updatePlistPath(["PlatformInfo", "Generic", "MLB"], {
                  kind: "String",
                  val: e.target.value.toUpperCase(),
                })
              }
              className={`${appleInputCls} w-56 font-mono`}
            />
          }
        />
        <SettingsRow
          title="硬件唯一识别码 (SystemUUID)"
          right={
            <input
              type="text"
              value={uuid}
              onChange={(e) =>
                updatePlistPath(["PlatformInfo", "Generic", "SystemUUID"], {
                  kind: "String",
                  val: e.target.value.toUpperCase(),
                })
              }
              className={`${appleInputCls} w-72 font-mono text-[11.5px]`}
            />
          }
        />
        <SettingsRow
          title="网卡物理地址 (ROM)"
          subtitle="6字节 12位十六进制 MAC 地址，登录 iMessage / FaceTime 必填项"
          right={
            <input
              type="text"
              value={rom}
              onChange={(e) =>
                updatePlistPath(["PlatformInfo", "Generic", "ROM"], {
                  kind: "Data",
                  val: e.target.value.replace(/[^0-9a-fA-F]/g, "").toUpperCase(),
                })
              }
              className={`${appleInputCls} w-56 font-mono`}
            />
          }
        />
      </SettingsGroup>
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
      <SettingsGroup
        title="UEFI 固件驱动 (UEFI -> Drivers)"
        description="OpenRuntime.efi 与 OpenHfsPlus.efi 为引导 macOS 恢复盘必需驱动"
        action={
          <div className="flex flex-wrap gap-1.5">
            {[
              ["OpenRuntime.efi", "核心内存与变量服务"],
              ["OpenHfsPlus.efi", "HFS+ 安装盘识别"],
              ["OpenCanopy.efi", "图形化引导菜单"],
              ["ResetNvramEntry.efi", "重置 NVRAM 按钮"],
            ].map(([name, desc]) => (
              <button
                key={name}
                type="button"
                onClick={() => addDriverPreset(name, desc)}
                className={appleSecondaryBtnCls}
              >
                <Plus className="w-3.5 h-3.5 text-[#007AFF]" />
                {name.replace(".efi", "")}
              </button>
            ))}
          </div>
        }
      >
        {drivers.map((drv, idx) => {
          const path = drv.kind === "String" ? drv.val : getStr(drv, ["Path"]);
          const enabled = drv.kind === "String" ? true : getBool(drv, ["Enabled"], true);
          const comment = drv.kind === "String" ? "" : getStr(drv, ["Comment"]);
          return (
            <SettingsRow
              key={idx}
              title={<span className="font-mono font-semibold">{path}</span>}
              subtitle={comment || "UEFI 引导驱动模块"}
              right={
                <>
                  <AppleSwitch
                    checked={enabled}
                    onChange={(val) => {
                      const next = [...drivers];
                      next[idx] = {
                        kind: "Dict",
                        val: [
                          ["Arguments", { kind: "String", val: "" }],
                          ["Comment", { kind: "String", val: comment }],
                          ["Enabled", { kind: "Boolean", val: val }],
                          ["LoadEarly", { kind: "Boolean", val: false }],
                          ["Path", { kind: "String", val: path }],
                        ],
                      };
                      updatePlistPath(["UEFI", "Drivers"], { kind: "Array", val: next });
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => {
                      const next = drivers.filter((_, i) => i !== idx);
                      updatePlistPath(["UEFI", "Drivers"], { kind: "Array", val: next });
                    }}
                    className="p-1 text-[#86868B] hover:text-[#FF3B30]"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </>
              }
            />
          );
        })}
      </SettingsGroup>

      <QuirkSettingsList
        title="UEFI 协议与引导兼容开关 (UEFI -> Quirks)"
        section="UEFI"
        path={["UEFI", "Quirks"]}
      />
    </div>
  );
};
