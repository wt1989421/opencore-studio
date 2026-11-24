import React, { useEffect, useState } from "react";
import {
  ArrowRight,
  Binary,
  FileWarning,
  HardDrive,
  Headphones,
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

const SAMPLE_STUCK_LOG = `00:000 00:000 AAPL: #[EB.H.IS|!] Err(0xE) <- RT.GV boot-signature
00:142 00:018 AAPL: #[EB|LOG:EXITBS:START] 2026-11-25T01:20:11
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

  // 1. Log Analyzer State
  const [logInput, setLogInput] = useState("");
  const [diagnoses, setDiagnoses] = useState<BootLogDiagnosis[]>([]);

  // 2. Audio Codec State
  const [audioQuery, setAudioQuery] = useState("");
  const [codecs, setCodecs] = useState<AudioCodecEntry[]>([]);

  // 3. ESP Partitions State
  const [esps, setEsps] = useState<EspPartitionInfo[]>([]);
  const [loadingEsp, setLoadingEsp] = useState(false);

  // 4. Data Converter State
  const [decNum, setDecNum] = useState("11");
  const [leHex, setLeHex] = useState("0B000000");
  const [asciiText, setAsciiText] = useState("pikera");

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
      pushToast("info", "未匹配到已知致命卡代码特征，可尝试粘贴报错最后 15 行");
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
    pushToast(
      "success",
      `已注入 alcid=${id} 到 boot-args 及 DeviceProperties (${u32ToLittleEndianHex(id)})`
    );
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

  const handleMountEsp = async (id: string) => {
    try {
      const msg = await apiMountEspPartition(id);
      pushToast("success", msg || `已挂载 ${id}`);
      await refreshEsps();
    } catch (e) {
      pushToast("error", `挂载失败: ${String(e)}`);
    }
  };

  return (
    <div className="space-y-5">
      {/* Sub-navigation tabs */}
      <div className="flex flex-wrap gap-2 bg-zinc-900/70 border border-zinc-800/80 p-1.5 rounded-xl w-fit">
        {[
          { id: "log", label: "启动日志 & 卡代码诊断", icon: FileWarning },
          { id: "audio", label: "AppleALC 声卡 ID 速查", icon: Headphones },
          { id: "esp", label: "ESP 引导分区挂载", icon: HardDrive },
          { id: "converter", label: "Hex / 小端序换算器", icon: Binary },
        ].map((t) => {
          const Icon = t.icon;
          const active = toolboxTab === t.id;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setToolboxTab(t.id as typeof toolboxTab)}
              className={`flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-medium transition ${
                active
                  ? "bg-blue-600 text-white shadow"
                  : "text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/60"
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {t.label}
            </button>
          );
        })}
      </div>

      {/* 1. Boot Log Troubleshooter */}
      {toolboxTab === "log" && (
        <div className="space-y-4">
          <div className="bg-zinc-900/60 border border-zinc-800/80 rounded-xl p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-semibold text-zinc-100">
                  OpenCore 启动卡代码 / Kernel Panic 智能排错分析器
                </h3>
                <p className="text-xs text-zinc-400">
                  粘贴 <code className="text-zinc-300">opencore-YYYY-MM-DD.txt</code> 日志内容或屏幕卡住的英文报错关键字，自动定位根因并给出中文修复步骤
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setLogInput(SAMPLE_STUCK_LOG);
                  handleRunLogAnalysis(SAMPLE_STUCK_LOG);
                }}
                className="px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-xs text-zinc-200"
              >
                填入示例报错日志测试
              </button>
            </div>

            <textarea
              rows={6}
              value={logInput}
              onChange={(e) => setLogInput(e.target.value)}
              placeholder="在此粘贴启动日志或报错屏幕文字，例如：[EB|#LOG:EXITBS:START]、PCI configuration begin、AppleIntelCPUPowerManagement、Invalid Vault mode..."
              className="w-full bg-zinc-950 border border-zinc-800 focus:border-blue-500 rounded-xl p-3 text-xs font-mono text-zinc-200 outline-none"
            />

            <button
              type="button"
              onClick={() => handleRunLogAnalysis()}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-xs font-semibold text-white"
            >
              <Sparkles className="w-4 h-4" />
              立即智能诊断卡点
            </button>
          </div>

          {diagnoses.length > 0 && (
            <div className="space-y-3">
              {diagnoses.map((d, idx) => (
                <div
                  key={idx}
                  className="bg-zinc-900/70 border border-rose-500/35 rounded-xl p-4 space-y-3"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <span className="px-2 py-0.5 rounded bg-rose-500/20 text-rose-300 font-mono text-[11px]">
                        {d.code_pattern}
                      </span>
                      <h4 className="text-sm font-semibold text-zinc-100 mt-1.5">{d.title}</h4>
                      <p className="text-xs text-zinc-400 font-mono mt-0.5 truncate max-w-2xl">
                        命中特征行: {d.matched_line}
                      </p>
                    </div>
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
                          className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-xs font-medium text-white"
                        >
                          <Sparkles className="w-3.5 h-3.5" /> 一键修复此项
                        </button>
                      )}
                      {d.jump_section && (
                        <button
                          type="button"
                          onClick={() => {
                            setActiveModule("editor");
                            setActiveEditorTab(d.jump_section as EditorTab);
                          }}
                          className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-xs text-zinc-200"
                        >
                          定位到 {d.jump_section} <ArrowRight className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>

                  <p className="text-xs text-amber-200/90 bg-amber-950/25 border border-amber-500/20 rounded-lg p-2.5">
                    <strong>故障根因：</strong>
                    {d.root_cause}
                  </p>

                  <ul className="space-y-1 text-xs text-zinc-300 list-disc list-inside">
                    {d.solution_steps.map((step, sIdx) => (
                      <li key={sIdx}>{step}</li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 2. AppleALC Codec Lookup */}
      {toolboxTab === "audio" && (
        <div className="space-y-4">
          <div className="bg-zinc-900/60 border border-zinc-800/80 rounded-xl p-4 flex flex-wrap items-center justify-between gap-4">
            <div>
              <h3 className="text-sm font-semibold text-zinc-100">
                AppleALC 板载声卡 Layout-ID 速查与一键注入
              </h3>
              <p className="text-xs text-zinc-400">
                点击任意推荐数字即可自动写入当前配置的 <code className="text-zinc-300">boot-args (alcid=XX)</code> 与 <code className="text-zinc-300">DeviceProperties</code>
              </p>
            </div>
            <div className="relative w-72">
              <Search className="w-4 h-4 text-zinc-500 absolute left-3 top-2.5" />
              <input
                type="text"
                value={audioQuery}
                onChange={(e) => {
                  setAudioQuery(e.target.value);
                  if (isTauriRuntime()) {
                    apiSearchAppleAlc(e.target.value).then(setCodecs);
                  }
                }}
                placeholder="搜索如 ALC897、ALC256、1220..."
                className="w-full bg-zinc-950 border border-zinc-800 focus:border-blue-500 rounded-lg pl-9 pr-3 py-2 text-xs text-zinc-100 outline-none"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {codecs.map((c) => (
              <div
                key={c.codec}
                className="bg-zinc-900/60 border border-zinc-800/80 rounded-xl p-4 space-y-3"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Volume2 className="w-4 h-4 text-blue-400" />
                    <span className="text-xs font-semibold text-zinc-100">{c.codec}</span>
                  </div>
                  <span className="font-mono text-[11px] px-2 py-0.5 rounded bg-zinc-800 text-zinc-300">
                    {c.vendor_hex}
                  </span>
                </div>
                <p className="text-xs text-zinc-400">{c.notes}</p>
                {c.recommended_ids.length > 0 && (
                  <div className="space-y-1.5">
                    <div className="text-[11px] text-zinc-400">高频推荐 ID（点击直接注入）：</div>
                    <div className="flex flex-wrap gap-1.5">
                      {c.recommended_ids.map((id) => (
                        <button
                          key={id}
                          type="button"
                          onClick={() => handleInjectAlcid(id)}
                          className="px-2.5 py-1 rounded-lg bg-blue-600/20 hover:bg-blue-600 border border-blue-500/40 text-xs font-mono text-blue-200 hover:text-white transition"
                        >
                          alcid={id}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 3. ESP Partition Mounter */}
      {toolboxTab === "esp" && (
        <div className="bg-zinc-900/60 border border-zinc-800/80 rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-zinc-100">
                本机磁盘 ESP (EFI 系统引导分区) 扫描与安全挂载
              </h3>
              <p className="text-xs text-zinc-400">
                挂载后可直接一键载入分区内的 <code className="text-zinc-300">EFI/OC/config.plist</code>，保存时会自动创建历史备份快照
              </p>
            </div>
            <button
              type="button"
              onClick={refreshEsps}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-xs text-zinc-200"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loadingEsp ? "animate-spin" : ""}`} />
              刷新磁盘列表
            </button>
          </div>

          <div className="divide-y divide-zinc-800">
            {esps.map((esp) => (
              <div
                key={esp.identifier}
                className="py-3 flex flex-wrap items-center justify-between gap-4 text-xs"
              >
                <div className="flex items-center gap-3">
                  <HardDrive className="w-5 h-5 text-blue-400" />
                  <div>
                    <div className="font-semibold text-zinc-100">
                      {esp.disk_name} — <span className="font-mono text-blue-300">{esp.identifier}</span>
                    </div>
                    <div className="text-zinc-400 mt-0.5">
                      容量: {esp.size_display} ·{" "}
                      {esp.is_mounted ? (
                        <span className="text-emerald-400">已挂载于 {esp.mount_point}</span>
                      ) : (
                        <span className="text-zinc-500">当前未挂载</span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {!esp.is_mounted ? (
                    <button
                      type="button"
                      onClick={() => handleMountEsp(esp.identifier)}
                      className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-medium"
                    >
                      提权挂载 ESP
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
                            pushToast("success", `已从 ${esp.mount_point} 加载 EFI 配置`);
                          } catch (err) {
                            pushToast("error", String(err));
                          }
                        }}
                        className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-medium"
                      >
                        打开此分区中的 EFI
                      </button>
                    )
                  )}
                </div>
              </div>
            ))}
            {esps.length === 0 && (
              <div className="py-8 text-center text-xs text-zinc-500">
                暂未检测到独立 EFI 分区，点击右上方「刷新磁盘列表」重试
              </div>
            )}
          </div>
        </div>
      )}

      {/* 4. Hex / Little-Endian / ASCII Converter */}
      {toolboxTab === "converter" && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-zinc-900/60 border border-zinc-800/80 rounded-xl p-4 space-y-3 text-xs">
            <h3 className="text-sm font-semibold text-zinc-100">
              32位十进制整数 &lt;-&gt; 小端序 Data (Little-Endian Hex)
            </h3>
            <p className="text-zinc-400">
              用于计算声卡 <code className="text-zinc-200">layout-id</code> 或核显寄存器数值字节倒序
            </p>
            <div>
              <label className="block text-zinc-400 mb-1">十进制整数 (如 layout-id = 11)</label>
              <input
                type="number"
                value={decNum}
                onChange={(e) => {
                  setDecNum(e.target.value);
                  const n = parseInt(e.target.value || "0", 10);
                  if (!Number.isNaN(n)) setLeHex(u32ToLittleEndianHex(n));
                }}
                className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 font-mono text-amber-300"
              />
            </div>
            <div>
              <label className="block text-zinc-400 mb-1">对应 Plist Data (4字节小端 HEX)</label>
              <input
                type="text"
                value={leHex}
                onChange={(e) => {
                  const v = e.target.value.toUpperCase();
                  setLeHex(v);
                  const parsed = littleEndianHexToU32(v);
                  if (parsed !== null) setDecNum(String(parsed));
                }}
                className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 font-mono text-pink-300"
              />
            </div>
          </div>

          <div className="bg-zinc-900/60 border border-zinc-800/80 rounded-xl p-4 space-y-3 text-xs">
            <h3 className="text-sm font-semibold text-zinc-100">
              ASCII 字符串 / ACPI 表名 -&gt; 十六进制编码
            </h3>
            <p className="text-zinc-400">
              用于编写 ACPI 重命名补丁（如 <code className="text-zinc-200">EC0_</code> -&gt; <code className="text-zinc-200">4543305F</code>）
            </p>
            <div>
              <label className="block text-zinc-400 mb-1">输入 ASCII 文本 (如 _OSI / XOSI / EC0_)</label>
              <input
                type="text"
                value={asciiText}
                onChange={(e) => setAsciiText(e.target.value)}
                className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 font-mono text-zinc-100"
              />
            </div>
            <div>
              <label className="block text-zinc-400 mb-1">十六进制结果 (HEX)</label>
              <div className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 font-mono text-emerald-300 select-all">
                {Array.from(new TextEncoder().encode(asciiText))
                  .map((b) => b.toString(16).padStart(2, "0").toUpperCase())
                  .join("") || "—"}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
