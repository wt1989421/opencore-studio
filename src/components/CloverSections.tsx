import React, { useEffect, useState } from "react";
import {
  ArrowRightLeft,
  CheckCircle2,
  ExternalLink,
  Plus,
  RefreshCw,
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
  type SmbiosModelOption,
} from "../types/opencore";
import {
  AppleSwitch,
  SettingsGroup,
  SettingsRow,
  appleInputCls,
  applePrimaryBtnCls,
  appleSecondaryBtnCls,
} from "./AppleUI";

const CLOVER_BOOT_FLAGS = [
  { flag: "-v", label: "跑码模式 (-v)", desc: "显示文字启动日志排错" },
  { flag: "debug=0x100", label: "死机不重启", desc: "保留五国报错屏幕" },
  { flag: "keepsyms=1", label: "保留崩溃符号", desc: "打印内核报错函数名" },
  { flag: "dart=0", label: "屏蔽 VT-d (dart=0)", desc: "四叶草经典防卡死参数" },
  { flag: "nv_disable=1", label: "禁用无驱动 N 卡", desc: "跳过 NVIDIA 独显加载" },
  { flag: "-wegnoegpu", label: "彻底屏蔽副卡独显", desc: "笔记本仅使用核显输出" },
  { flag: "agdpmod=pikera", label: "RX 5000/6000 防黑屏", desc: "Navi 独显必加参数" },
  { flag: "npci=0x2000", label: "PCI 总线枚举修复", desc: "修复 PCI configuration begin" },
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
      pushToast("success", "已将四叶草配置无损迁移为 OpenCore 配置！");
    } catch (e) {
      pushToast("error", `迁移失败: ${String(e)}`);
    }
  };

  return (
    <div className="mb-6 bg-white rounded-[14px] border border-[#34C759]/30 shadow-[0_2px_8px_rgba(52,199,89,0.06)] p-4 flex flex-wrap items-center justify-between gap-4">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-[10px] bg-gradient-to-b from-[#34C759] to-[#248A3D] text-white flex items-center justify-center text-lg shadow-sm">
          🍀
        </div>
        <div>
          <div className="text-[13.5px] font-semibold text-[#1D1D1F]">
            当前处于四叶草 Clover 配置模式
          </div>
          <p className="text-[12px] text-[#86868B] mt-0.5">
            准备升级新系统？可一键保留原机三码、声卡与显卡注入无损转换为 OpenCore 配置
          </p>
        </div>
      </div>

      <button
        type="button"
        onClick={handleMigrate}
        className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-[9px] bg-[#34C759] hover:bg-[#2DB84D] text-white text-[12.5px] font-medium shadow-sm transition"
      >
        <ArrowRightLeft className="w-3.5 h-3.5" />
        一键无损转 OpenCore
      </button>
    </div>
  );
};

export const CloverAcpiSection: React.FC = () => {
  const { plist, updatePlistPath } = useWorkspaceStore();
  const autoMerge = getBool(plist, ["ACPI", "AutoMerge"], true);
  const fixHeaders = getBool(plist, ["ACPI", "FixHeaders"], true);
  const pluginType = getBool(plist, ["ACPI", "SSDT", "Generate", "PluginType"], true);
  const fixes = getDictEntries(plist, ["ACPI", "DSDT", "Fixes"]);
  const sortedOrder = getArray(plist, ["ACPI", "SortedOrder"]);
  const [newAml, setNewAml] = useState("");

  return (
    <div className="space-y-6">
      <SettingsGroup title="电源管理与表头修复 (Clover ACPI)">
        <SettingsRow
          title="开启原生 CPU 电源管理 (PluginType)"
          subtitle="自动注入 plugin-type=1 开启 Intel 4代及以上处理器原生变频"
          right={
            <AppleSwitch
              accent="green"
              checked={pluginType}
              onChange={(v) =>
                updatePlistPath(["ACPI", "SSDT", "Generate", "PluginType"], {
                  kind: "Boolean",
                  val: v,
                })
              }
            />
          }
        />
        <SettingsRow
          title="清理 ACPI 表头非法字符 (FixHeaders)"
          right={
            <AppleSwitch
              accent="green"
              checked={fixHeaders}
              onChange={(v) =>
                updatePlistPath(["ACPI", "FixHeaders"], { kind: "Boolean", val: v })
              }
            />
          }
        />
        <SettingsRow
          title="自动合并 patched 补丁表 (AutoMerge)"
          right={
            <AppleSwitch
              accent="green"
              checked={autoMerge}
              onChange={(v) =>
                updatePlistPath(["ACPI", "AutoMerge"], { kind: "Boolean", val: v })
              }
            />
          }
        />
      </SettingsGroup>

      <SettingsGroup title="DSDT 经典自动修复补丁 (DSDT -> Fixes)">
        {fixes.map(([k, node]) =>
          node.kind === "Boolean" ? (
            <SettingsRow
              key={k}
              title={<span className="font-mono">{k}</span>}
              right={
                <AppleSwitch
                  accent="green"
                  checked={node.val}
                  onChange={(v) =>
                    updatePlistPath(["ACPI", "DSDT", "Fixes", k], {
                      kind: "Boolean",
                      val: v,
                    })
                  }
                />
              }
            />
          ) : null
        )}
      </SettingsGroup>

      <SettingsGroup
        title="ACPI/patched 补丁加载顺序 (SortedOrder)"
        action={
          <div className="flex gap-1.5">
            <input
              type="text"
              value={newAml}
              onChange={(e) => setNewAml(e.target.value)}
              placeholder="SSDT-PNLF.aml"
              className={`${appleInputCls} w-40 font-mono`}
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
              className={appleSecondaryBtnCls}
            >
              <Plus className="w-3.5 h-3.5 text-[#34C759]" /> 添加
            </button>
          </div>
        }
      >
        {sortedOrder.map((item, idx) => (
          <SettingsRow
            key={idx}
            title={<span className="font-mono">{item.kind === "String" ? item.val : ""}</span>}
            right={
              <button
                type="button"
                onClick={() =>
                  updatePlistPath(["ACPI", "SortedOrder"], {
                    kind: "Array",
                    val: sortedOrder.filter((_, i) => i !== idx),
                  })
                }
                className="p-1 text-[#86868B] hover:text-[#FF3B30]"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            }
          />
        ))}
      </SettingsGroup>
    </div>
  );
};

export const CloverBootSection: React.FC = () => {
  const { plist, updatePlistPath } = useWorkspaceStore();
  const args = getStr(plist, ["Boot", "Arguments"]);
  const defaultVol = getStr(plist, ["Boot", "DefaultVolume"], "LastBootedVolume");
  const timeout = getInt(plist, ["Boot", "Timeout"], 5);
  const neverHibernate = getBool(plist, ["Boot", "NeverHibernate"], true);

  const tokens = args.split(/\s+/).filter(Boolean);
  const toggleFlag = (f: string) => {
    const next = tokens.includes(f) ? tokens.filter((t) => t !== f) : [...tokens, f];
    updatePlistPath(["Boot", "Arguments"], { kind: "String", val: next.join(" ") });
  };

  return (
    <div className="space-y-6">
      <SettingsGroup title="四叶草启动参数 (Boot -> Arguments)">
        <div className="p-4 bg-[#FAFAFC]">
          <input
            type="text"
            value={args}
            onChange={(e) =>
              updatePlistPath(["Boot", "Arguments"], { kind: "String", val: e.target.value })
            }
            className={`${appleInputCls} w-full font-mono bg-white`}
          />
        </div>
        {CLOVER_BOOT_FLAGS.map((item) => (
          <SettingsRow
            key={item.flag}
            title={
              <span className="flex items-center gap-2">
                <span>{item.label}</span>
                <code className="font-mono text-[11.5px] px-1.5 py-0.5 rounded bg-[#F5F5F7] text-[#248A3D]">
                  {item.flag}
                </code>
              </span>
            }
            subtitle={item.desc}
            right={
              <AppleSwitch
                accent="green"
                checked={tokens.includes(item.flag)}
                onChange={() => toggleFlag(item.flag)}
              />
            }
          />
        ))}
      </SettingsGroup>

      <SettingsGroup title="引导卷与休眠选项">
        <SettingsRow
          title="默认启动卷标 (DefaultVolume)"
          right={
            <input
              type="text"
              value={defaultVol}
              onChange={(e) =>
                updatePlistPath(["Boot", "DefaultVolume"], {
                  kind: "String",
                  val: e.target.value,
                })
              }
              className={`${appleInputCls} w-48 font-mono`}
            />
          }
        />
        <SettingsRow
          title="倒计时秒数 (Timeout)"
          right={
            <input
              type="number"
              value={timeout}
              onChange={(e) =>
                updatePlistPath(["Boot", "Timeout"], {
                  kind: "Integer",
                  val: parseInt(e.target.value || "5", 10),
                })
              }
              className={`${appleInputCls} w-24 text-right font-mono`}
            />
          }
        />
        <SettingsRow
          title="禁用深度休眠镜像防止唤醒黑屏 (NeverHibernate)"
          right={
            <AppleSwitch
              accent="green"
              checked={neverHibernate}
              onChange={(v) =>
                updatePlistPath(["Boot", "NeverHibernate"], { kind: "Boolean", val: v })
              }
            />
          }
        />
      </SettingsGroup>
    </div>
  );
};

export const CloverDevicesSection: React.FC = () => {
  const { plist, updatePlistPath } = useWorkspaceStore();
  const audioId = getInt(plist, ["Devices", "Audio", "Inject"], 11);
  const resetHda = getBool(plist, ["Devices", "Audio", "ResetHDA"], true);
  const usbInject = getBool(plist, ["Devices", "USB", "Inject"], true);
  const fixOwnership = getBool(plist, ["Devices", "USB", "FixOwnership"], true);
  const addClockId = getBool(plist, ["Devices", "USB", "AddClockID"], true);

  return (
    <div className="space-y-6">
      <SettingsGroup title="声卡注入 (Devices -> Audio)">
        <SettingsRow
          title="板载声卡十进制 Layout-ID (Audio Inject)"
          subtitle="直接输入数字如 11、7、1、21（无需转十六进制）"
          right={
            <input
              type="number"
              value={audioId}
              onChange={(e) =>
                updatePlistPath(["Devices", "Audio", "Inject"], {
                  kind: "Integer",
                  val: parseInt(e.target.value || "0", 10),
                })
              }
              className={`${appleInputCls} w-28 text-right font-mono`}
            />
          }
        />
        <SettingsRow
          title="启动时重置声卡控制器状态 (ResetHDA)"
          subtitle="解决从 Windows 重启切回 macOS 无声问题"
          right={
            <AppleSwitch
              accent="green"
              checked={resetHda}
              onChange={(v) =>
                updatePlistPath(["Devices", "Audio", "ResetHDA"], { kind: "Boolean", val: v })
              }
            />
          }
        />
      </SettingsGroup>

      <SettingsGroup title="USB 控制器修复 (Devices -> USB)">
        <SettingsRow
          title="注入 USB 属性 (Inject)"
          right={
            <AppleSwitch
              accent="green"
              checked={usbInject}
              onChange={(v) =>
                updatePlistPath(["Devices", "USB", "Inject"], { kind: "Boolean", val: v })
              }
            />
          }
        />
        <SettingsRow
          title="接管主板 XHCI/EHCI 控制权防卡死 (FixOwnership)"
          right={
            <AppleSwitch
              accent="green"
              checked={fixOwnership}
              onChange={(v) =>
                updatePlistPath(["Devices", "USB", "FixOwnership"], { kind: "Boolean", val: v })
              }
            />
          }
        />
        <SettingsRow
          title="注入 Apple Clock-ID (AddClockID)"
          right={
            <AppleSwitch
              accent="green"
              checked={addClockId}
              onChange={(v) =>
                updatePlistPath(["Devices", "USB", "AddClockID"], { kind: "Boolean", val: v })
              }
            />
          }
        />
      </SettingsGroup>
    </div>
  );
};

export const CloverGuiSection: React.FC = () => {
  const { plist, updatePlistPath } = useWorkspaceStore();
  const theme = getStr(plist, ["GUI", "Theme"], "embedded");
  const resolution = getStr(plist, ["GUI", "ScreenResolution"], "1920x1080");
  const mouseEnabled = getBool(plist, ["GUI", "Mouse", "Enabled"], true);

  return (
    <SettingsGroup title="四叶草主题与界面分辨率 (GUI)">
      <SettingsRow
        title="主题文件夹名称 (Theme)"
        subtitle="对应 EFI/CLOVER/themes/ 下的文件夹名"
        right={
          <input
            type="text"
            value={theme}
            onChange={(e) =>
              updatePlistPath(["GUI", "Theme"], { kind: "String", val: e.target.value })
            }
            className={`${appleInputCls} w-44 font-mono`}
          />
        }
      />
      <SettingsRow
        title="引导界面分辨率 (ScreenResolution)"
        right={
          <select
            value={resolution}
            onChange={(e) =>
              updatePlistPath(["GUI", "ScreenResolution"], {
                kind: "String",
                val: e.target.value,
              })
            }
            className={appleInputCls}
          >
            <option value="1920x1080">1920x1080</option>
            <option value="2560x1440">2560x1440</option>
            <option value="3840x2160">3840x2160</option>
            <option value="1366x768">1366x768</option>
          </select>
        }
      />
      <SettingsRow
        title="允许使用鼠标点击选择引导盘 (Mouse)"
        right={
          <AppleSwitch
            accent="green"
            checked={mouseEnabled}
            onChange={(v) =>
              updatePlistPath(["GUI", "Mouse", "Enabled"], { kind: "Boolean", val: v })
            }
          />
        }
      />
    </SettingsGroup>
  );
};

export const CloverGraphicsSection: React.FC = () => {
  const { plist, updatePlistPath } = useWorkspaceStore();
  const injectIntel = getBool(plist, ["Graphics", "Inject", "Intel"], false);
  const injectAti = getBool(plist, ["Graphics", "Inject", "ATI"], false);
  const injectNvidia = getBool(plist, ["Graphics", "Inject", "NVidia"], false);
  const igPlatform = getStr(plist, ["Graphics", "ig-platform-id"]);

  return (
    <SettingsGroup
      title="传统老显卡注入 (Graphics)"
      description="适用于 3~7代酷睿老核显或经典老显卡；8代及以上请使用 WhateverGreen"
    >
      <SettingsRow
        title="Inject Intel (注入 Intel 传统核显)"
        right={
          <AppleSwitch
            accent="green"
            checked={injectIntel}
            onChange={(v) =>
              updatePlistPath(["Graphics", "Inject", "Intel"], { kind: "Boolean", val: v })
            }
          />
        }
      />
      <SettingsRow
        title="Inject ATI (注入老款 AMD HD 显卡)"
        right={
          <AppleSwitch
            accent="green"
            checked={injectAti}
            onChange={(v) =>
              updatePlistPath(["Graphics", "Inject", "ATI"], { kind: "Boolean", val: v })
            }
          />
        }
      />
      <SettingsRow
        title="Inject NVidia (注入 GT 600/700 老 N卡)"
        right={
          <AppleSwitch
            accent="green"
            checked={injectNvidia}
            onChange={(v) =>
              updatePlistPath(["Graphics", "Inject", "NVidia"], { kind: "Boolean", val: v })
            }
          />
        }
      />
      <SettingsRow
        title="核显缓冲帧 ID (ig-platform-id)"
        subtitle="例如 HD4000 填 0x01660003，HD4600 填 0x0d220003，HD530 填 0x19120000"
        right={
          <input
            type="text"
            value={igPlatform}
            onChange={(e) =>
              updatePlistPath(["Graphics", "ig-platform-id"], {
                kind: "String",
                val: e.target.value,
              })
            }
            placeholder="0x19120000"
            className={`${appleInputCls} w-44 font-mono`}
          />
        }
      />
    </SettingsGroup>
  );
};

export const CloverKernelPatchesSection: React.FC = () => {
  const { plist, updatePlistPath } = useWorkspaceStore();
  const entries = getDictEntries(plist, ["KernelAndKextPatches"]).filter(
    ([_, v]) => v.kind === "Boolean"
  );

  const descMap: Record<string, string> = {
    KernelPm: "解锁 4代 Haswell+ 处理器 CFG Lock 寄存器写保护防崩溃",
    AppleIntelCPUPM: "解锁 2/3代老酷睿电源管理崩溃",
    AppleRTC: "阻止改写主板 CMOS 防止重启 BIOS 重置",
    KernelLapic: "修复惠普笔记本多核 APIC 内核崩溃",
    PanicNoKextDump: "死机保留报错堆栈不刷屏驱动列表",
  };

  return (
    <SettingsGroup title="内核与驱动补丁开关 (KernelAndKextPatches)">
      {entries.map(([k, v]) =>
        v.kind === "Boolean" ? (
          <SettingsRow
            key={k}
            title={<span className="font-mono">{k}</span>}
            subtitle={descMap[k] ?? "四叶草内核修补开关"}
            right={
              <AppleSwitch
                accent="green"
                checked={v.val}
                onChange={(next) =>
                  updatePlistPath(["KernelAndKextPatches", k], {
                    kind: "Boolean",
                    val: next,
                  })
                }
              />
            }
          />
        ) : null
      )}
    </SettingsGroup>
  );
};

export const CloverQuirksSection: React.FC = () => {
  const { plist, updatePlistPath } = useWorkspaceStore();
  const entries = getDictEntries(plist, ["Quirks"]);

  return (
    <SettingsGroup
      title="Clover r5123+ 现代引导开关 (OpenRuntime Quirks)"
      description="新版四叶草引导 Big Sur ~ Sequoia 必需的内存与内核兼容选项"
    >
      {entries.map(([k, v]) =>
        v.kind === "Boolean" ? (
          <SettingsRow
            key={k}
            title={
              <span className="flex items-center gap-2">
                <span>{QUIRKS_ENCYCLOPEDIA[k]?.titleZh ?? k}</span>
                <code className="font-mono text-[11px] px-1.5 py-0.5 rounded bg-[#F5F5F7] text-[#6E6E73]">
                  {k}
                </code>
              </span>
            }
            subtitle={QUIRKS_ENCYCLOPEDIA[k]?.desc}
            right={
              <AppleSwitch
                accent="green"
                checked={v.val}
                onChange={(next) =>
                  updatePlistPath(["Quirks", k], { kind: "Boolean", val: next })
                }
              />
            }
          />
        ) : null
      )}
    </SettingsGroup>
  );
};

export const CloverRtAndSysSection: React.FC = () => {
  const { plist, updatePlistPath } = useWorkspaceStore();
  const csr = getStr(plist, ["RtVariables", "CsrActiveConfig"], "0x00");
  const injectKexts = getStr(plist, ["SystemParameters", "InjectKexts"], "Yes");
  const injectSysId = getBool(plist, ["SystemParameters", "InjectSystemID"], true);

  return (
    <SettingsGroup title="SIP 状态与第三方驱动注入 (RtVariables & SystemParameters)">
      <SettingsRow
        title="SIP 完整性保护配置 (CsrActiveConfig)"
        right={
          <select
            value={csr}
            onChange={(e) =>
              updatePlistPath(["RtVariables", "CsrActiveConfig"], {
                kind: "String",
                val: e.target.value,
              })
            }
            className={appleInputCls}
          >
            <option value="0x00">0x00 (开启 SIP)</option>
            <option value="0x67">0x67 (经典关闭 SIP)</option>
            <option value="0x3E7">0x3E7 (彻底关闭 SIP)</option>
            <option value="0x803">0x803 (OCLP 兼容模式)</option>
          </select>
        }
      />
      <SettingsRow
        title="注入 CLOVER/kexts/Other 驱动 (InjectKexts)"
        subtitle="必须设为 Yes 才能加载 VirtualSMC / Lilu 等核心驱动"
        right={
          <select
            value={injectKexts}
            onChange={(e) =>
              updatePlistPath(["SystemParameters", "InjectKexts"], {
                kind: "String",
                val: e.target.value,
              })
            }
            className={appleInputCls}
          >
            <option value="Yes">Yes (推荐)</option>
            <option value="Detect">Detect</option>
            <option value="No">No (禁用驱动!)</option>
          </select>
        }
      />
      <SettingsRow
        title="注入硬件 System-ID (InjectSystemID)"
        right={
          <AppleSwitch
            accent="green"
            checked={injectSysId}
            onChange={(v) =>
              updatePlistPath(["SystemParameters", "InjectSystemID"], {
                kind: "Boolean",
                val: v,
              })
            }
          />
        }
      />
    </SettingsGroup>
  );
};

export const CloverSmbiosSection: React.FC = () => {
  const { plist, updatePlistPath, pushToast } = useWorkspaceStore();
  const [models, setModels] = useState<SmbiosModelOption[]>([]);
  const productName = getStr(plist, ["SMBIOS", "ProductName"], "iMac20,1");
  const serial = getStr(plist, ["SMBIOS", "SerialNumber"]);
  const boardSerial = getStr(plist, ["SMBIOS", "BoardSerialNumber"]);
  const smUuid = getStr(plist, ["SMBIOS", "SmUUID"]);

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
    pushToast("success", `已生成四叶草 ${gen.model} 全套三码！`);
  };

  return (
    <SettingsGroup
      title="四叶草机型与三码信息 (SMBIOS)"
      action={
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => handleGenerate(productName)}
            className={applePrimaryBtnCls}
          >
            <RefreshCw className="w-3.5 h-3.5" /> 随机刷新三码
          </button>
          <a
            href="https://checkcoverage.apple.com/"
            target="_blank"
            rel="noreferrer"
            className={appleSecondaryBtnCls}
          >
            官网验码 <ExternalLink className="w-3.5 h-3.5" />
          </a>
        </div>
      }
    >
      <SettingsRow
        title="机型名称 (ProductName)"
        right={
          <select
            value={productName}
            onChange={(e) => handleGenerate(e.target.value)}
            className={`${appleInputCls} w-56`}
          >
            {(models.length > 0
              ? models
              : [{ model: productName, category: "", cpuFamily: "", macosSupport: "", gpuNote: "" }]
            ).map((m) => (
              <option key={m.model} value={m.model}>
                {m.model}
              </option>
            ))}
          </select>
        }
      />
      <SettingsRow
        title="整机序列号 (SerialNumber)"
        right={
          <input
            type="text"
            value={serial}
            onChange={(e) =>
              updatePlistPath(["SMBIOS", "SerialNumber"], {
                kind: "String",
                val: e.target.value.toUpperCase(),
              })
            }
            className={`${appleInputCls} w-56 font-mono`}
          />
        }
      />
      <SettingsRow
        title="主板序列号 (BoardSerialNumber / MLB)"
        right={
          <input
            type="text"
            value={boardSerial}
            onChange={(e) => {
              const v = e.target.value.toUpperCase();
              updatePlistPath(["SMBIOS", "BoardSerialNumber"], { kind: "String", val: v });
              updatePlistPath(["RtVariables", "MLB"], { kind: "String", val: v });
            }}
            className={`${appleInputCls} w-56 font-mono`}
          />
        }
      />
      <SettingsRow
        title="硬件 UUID (SmUUID)"
        right={
          <input
            type="text"
            value={smUuid}
            onChange={(e) =>
              updatePlistPath(["SMBIOS", "SmUUID"], {
                kind: "String",
                val: e.target.value.toUpperCase(),
              })
            }
            className={`${appleInputCls} w-64 font-mono text-[11.5px]`}
          />
        }
      />
    </SettingsGroup>
  );
};

export const MigrationNotesAlert: React.FC = () => {
  const { migrationNotes, clearMigrationNotes } = useWorkspaceStore();
  if (migrationNotes.length === 0) return null;

  return (
    <div className="mb-6 bg-white rounded-[14px] border border-[#007AFF]/25 p-4 space-y-2 shadow-sm">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-[13px] font-semibold text-[#0066CC]">
          <CheckCircle2 className="w-4 h-4 text-[#34C759]" />
          <span>四叶草 Clover -&gt; OpenCore 迁移完成报告</span>
        </div>
        <button
          type="button"
          onClick={clearMigrationNotes}
          className="text-[12px] text-[#86868B] hover:text-[#1D1D1F]"
        >
          关闭
        </button>
      </div>
      <ul className="list-disc list-inside text-[12px] text-[#424245] space-y-1">
        {migrationNotes.map((n, i) => (
          <li key={i}>{n}</li>
        ))}
      </ul>
    </div>
  );
};
