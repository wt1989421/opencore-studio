import React, { useEffect, useState } from "react";
import {
  ArrowRight,
  HardDrive,
  RefreshCw,
  Search,
  Sparkles,
  Volume2,
} from "lucide-react";
import {
  apiAnalyzeBootLog,
  apiApplyQuickFix,
  apiListEspPartitions,
  apiMountEspPartition,
  apiOpenEfiOrPlist,
  apiSearchAppleAlc,
  isTauriRuntime,
} from "../lib/tauri-bridge";
import { useWorkspaceStore, type EditorTab } from "../store/workspaceStore";
import {
  getStr,
  littleEndianHexToU32,
  u32ToLittleEndianHex,
  type AudioCodecEntry,
  type BootLogDiagnosis,
  type EspPartitionInfo,
} from "../types/opencore";
import {
  SegmentedControl,
  SettingsGroup,
  SettingsRow,
  appleInputCls,
  applePrimaryBtnCls,
  appleSecondaryBtnCls,
} from "./AppleUI";

const SAMPLE_STUCK_LOG = `00:142 00:018 AAPL: #[EB|LOG:EXITBS:START] 2026-11-25T01:20:11
Panic(cpu 0 caller 0xffffff80123): AppleIntelCPUPowerManagement / XCPM MSR 0xE2 locked!
IONVMeFamily: AppleNVMe Assert failed on SAMSUNG PM981a`;

export const ToolboxPanel: React.FC = () => {
  const {
    toolboxTab,
    setToolboxTab,
    plist,
    ocDir,
    updatePlistPath,
    replacePlist,
    setIssues,
    loadWorkspace,
    setActiveModule,
    setActiveEditorTab,
    pushToast,
  } = useWorkspaceStore();

  const [logInput, setLogInput] = useState("");
  const [diagnoses, setDiagnoses] = useState<BootLogDiagnosis[]>([]);
  const [audioQuery, setAudioQuery] = useState("");
  const [codecs, setCodecs] = useState<AudioCodecEntry[]>([]);
  const [esps, setEsps] = useState<EspPartitionInfo[]>([]);
  const [loadingEsp, setLoadingEsp] = useState(false);
  const [decNum, setDecNum] = useState("11");
  const [leHex, setLeHex] = useState("0B000000");

  useEffect(() => {
    if (!isTauriRuntime()) return;
    apiSearchAppleAlc("").then(setCodecs).catch(() => {});
    apiListEspPartitions().then(setEsps).catch(() => {});
  }, []);

  const handleRunLogAnalysis = async (txt = logInput) => {
    if (!isTauriRuntime() || !txt.trim()) return;
    const res = await apiAnalyzeBootLog(txt);
    setDiagnoses(res);
    if (res.length === 0) {
      pushToast("info", "未发现已知致命卡代码特征，可粘贴屏幕最后 15 行重试");
    }
  };

  const handleInjectAlcid = (id: number) => {
    const bootGuid = "7C436110-AB2A-4BBB-A880-FE41995C9F82";
    const currentArgs = getStr(plist, ["NVRAM", "Add", bootGuid, "boot-args"]);
    const cleaned = currentArgs
      .split(/\s+/)
      .filter((tok) => Boolean(tok) && !tok.startsWith("alcid="));
    cleaned.push(`alcid=${id}`);
    updatePlistPath(["NVRAM", "Add", bootGuid, "boot-args"], {
      kind: "String",
      val: cleaned.join(" "),
    });
    updatePlistPath(
      ["DeviceProperties", "Add", "PciRoot(0x0)/Pci(0x1b,0x0)", "layout-id"],
      {
        kind: "Data",
        val: u32ToLittleEndianHex(id),
      }
    );
    pushToast("success", `已注入声卡 alcid=${id} 到启动参数与设备属性！`);
  };

  const refreshEsps = async () => {
    if (!isTauriRuntime()) return;
    setLoadingEsp(true);
    try {
      const list = await apiListEspPartitions();
      setEsps(list);
    } catch (e) {
      pushToast("error", String(e));
    } finally {
      setLoadingEsp(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <SegmentedControl
          value={toolboxTab}
          onChange={(v) => setToolboxTab(v as typeof toolboxTab)}
          options={[
            { id: "log", label: "卡代码与日志排错" },
            { id: "audio", label: "声卡 ID 速查" },
            { id: "esp", label: "ESP 分区挂载" },
            { id: "converter", label: "字节序换算" },
          ]}
        />
      </div>

      {toolboxTab === "log" && (
        <div className="space-y-5">
          <SettingsGroup
            title="开机卡代码与 Kernel Panic 诊断器"
            description="粘贴 opencore.txt 日志或报错文字，自动识别原因并提供一键修复"
            action={
              <button
                type="button"
                onClick={() => {
                  setLogInput(SAMPLE_STUCK_LOG);
                  handleRunLogAnalysis(SAMPLE_STUCK_LOG);
                }}
                className={appleSecondaryBtnCls}
              >
                填入示例报错测试
              </button>
            }
          >
            <div className="p-4 space-y-3 bg-[#FAFAFC]">
              <textarea
                rows={5}
                value={logInput}
                onChange={(e) => setLogInput(e.target.value)}
                placeholder="粘贴屏幕报错文字，例如：[EB|#LOG:EXITBS:START]、XCPM、PCI configuration begin..."
                className={`${appleInputCls} w-full bg-white font-mono text-[12px]`}
              />
              <button
                type="button"
                onClick={() => handleRunLogAnalysis()}
                className={applePrimaryBtnCls}
              >
                <Sparkles className="w-3.5 h-3.5" />
                开始智能诊断
              </button>
            </div>
          </SettingsGroup>

          {diagnoses.map((d, idx) => (
            <SettingsGroup
              key={idx}
              title={d.title}
              description={`命中特征: ${d.code_pattern}`}
              action={
                <div className="flex gap-2">
                  {d.fix_action && (
                    <button
                      type="button"
                      onClick={async () => {
                        if (!d.fix_action) return;
                        const [fixedPlist, msg, issues] = await apiApplyQuickFix(
                          plist,
                          d.fix_action,
                          ocDir
                        );
                        replacePlist(fixedPlist);
                        setIssues(issues);
                        pushToast("success", msg);
                      }}
                      className={applePrimaryBtnCls}
                    >
                      一键修复
                    </button>
                  )}
                  {d.jump_section && (
                    <button
                      type="button"
                      onClick={() => {
                        setActiveModule("editor");
                        setActiveEditorTab(d.jump_section as EditorTab);
                      }}
                      className={appleSecondaryBtnCls}
                    >
                      前往 {d.jump_section} <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              }
            >
              <SettingsRow title="故障根因分析" subtitle={d.root_cause} />
              {d.solution_steps.map((s, sIdx) => (
                <SettingsRow key={sIdx} title={`解决步骤 ${sIdx + 1}`} subtitle={s} />
              ))}
            </SettingsGroup>
          ))}
        </div>
      )}

      {toolboxTab === "audio" && (
        <div className="space-y-5">
          <div className="relative">
            <Search className="w-4 h-4 text-[#86868B] absolute left-3.5 top-2.5" />
            <input
              type="text"
              value={audioQuery}
              onChange={(e) => {
                setAudioQuery(e.target.value);
                if (isTauriRuntime()) apiSearchAppleAlc(e.target.value).then(setCodecs);
              }}
              placeholder="搜索声卡芯片型号，例如 ALC897、ALC256、ALC1220..."
              className={`${appleInputCls} w-full bg-white pl-9 py-2`}
            />
          </div>

          <SettingsGroup
            title="AppleALC 声卡推荐 Layout-ID 数据库"
            description="点击任意 ID 胶囊即可一键写入当前配置的启动参数与设备属性"
          >
            {codecs.map((c) => (
              <SettingsRow
                key={c.codec}
                title={
                  <span className="flex items-center gap-2">
                    <Volume2 className="w-4 h-4 text-[#007AFF]" />
                    <span>{c.codec}</span>
                    <code className="text-[11px] font-mono px-1.5 py-0.5 rounded bg-[#F5F5F7] text-[#86868B]">
                      {c.vendor_hex}
                    </code>
                  </span>
                }
                subtitle={c.notes}
                right={
                  <div className="flex flex-wrap gap-1.5 justify-end max-w-xs">
                    {c.recommended_ids.map((id) => (
                      <button
                        key={id}
                        type="button"
                        onClick={() => handleInjectAlcid(id)}
                        className="px-2.5 py-1 rounded-full bg-[#007AFF]/10 hover:bg-[#007AFF] text-[#0066CC] hover:text-white text-[11.5px] font-mono font-medium transition"
                      >
                        ID {id}
                      </button>
                    ))}
                  </div>
                }
              />
            ))}
          </SettingsGroup>
        </div>
      )}

      {toolboxTab === "esp" && (
        <SettingsGroup
          title="本机磁盘 EFI 引导分区管理"
          description="挂载后可直接读取并修改磁盘内的 EFI/OC 或 EFI/CLOVER 配置"
          action={
            <button type="button" onClick={refreshEsps} className={appleSecondaryBtnCls}>
              <RefreshCw className={`w-3.5 h-3.5 ${loadingEsp ? "animate-spin" : ""}`} />
              刷新磁盘
            </button>
          }
        >
          {esps.map((esp) => (
            <SettingsRow
              key={esp.identifier}
              title={
                <span className="flex items-center gap-2">
                  <HardDrive className="w-4 h-4 text-[#007AFF]" />
                  <span>{esp.disk_name}</span>
                  <code className="font-mono text-[11.5px] text-[#86868B]">{esp.identifier}</code>
                </span>
              }
              subtitle={
                esp.is_mounted
                  ? `容量 ${esp.size_display} · 已挂载于 ${esp.mount_point}`
                  : `容量 ${esp.size_display} · 当前未挂载`
              }
              right={
                !esp.is_mounted ? (
                  <button
                    type="button"
                    onClick={async () => {
                      try {
                        const msg = await apiMountEspPartition(esp.identifier);
                        pushToast("success", msg || "已挂载 ESP 分区");
                        await refreshEsps();
                      } catch (e) {
                        pushToast("error", String(e));
                      }
                    }}
                    className={applePrimaryBtnCls}
                  >
                    挂载分区
                  </button>
                ) : (
                  esp.mount_point && (
                    <button
                      type="button"
                      onClick={async () => {
                        try {
                          const payload = await apiOpenEfiOrPlist(esp.mount_point!);
                          loadWorkspace(payload);
                          setActiveModule("editor");
                          pushToast("success", `已加载 ${esp.mount_point} 中的配置`);
                        } catch (err) {
                          pushToast("error", String(err));
                        }
                      }}
                      className={appleSecondaryBtnCls}
                    >
                      打开分区内 EFI
                    </button>
                  )
                )
              }
            />
          ))}
          {esps.length === 0 && (
            <div className="py-8 text-center text-[12.5px] text-[#86868B]">
              暂未检测到独立 EFI 系统分区
            </div>
          )}
        </SettingsGroup>
      )}

      {toolboxTab === "converter" && (
        <SettingsGroup
          title="32位整数 <-> 小端字节序 (Little-Endian Data) 换算"
          description="用于换算声卡 layout-id 与显卡寄存器十六进制字节倒序"
        >
          <SettingsRow
            title="十进制数字 (例如 layout-id = 11)"
            right={
              <input
                type="number"
                value={decNum}
                onChange={(e) => {
                  setDecNum(e.target.value);
                  const n = parseInt(e.target.value || "0", 10);
                  if (!Number.isNaN(n)) setLeHex(u32ToLittleEndianHex(n));
                }}
                className={`${appleInputCls} w-44 font-mono`}
              />
            }
          />
          <SettingsRow
            title="对应 4字节小端序 HEX (Data)"
            right={
              <input
                type="text"
                value={leHex}
                onChange={(e) => {
                  const v = e.target.value.toUpperCase();
                  setLeHex(v);
                  const parsed = littleEndianHexToU32(v);
                  if (parsed !== null) setDecNum(String(parsed));
                }}
                className={`${appleInputCls} w-44 font-mono text-[#0066CC]`}
              />
            }
          />
        </SettingsGroup>
      )}
    </div>
  );
};
