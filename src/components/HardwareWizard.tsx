import React, { useEffect, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Cpu,
  FolderOutput,
  HardDrive,
  Laptop,
  Monitor,
  Radar,
  Sparkles,
  XCircle,
} from "lucide-react";
import {
  apiEvaluateHardware,
  apiGenerateEfiFromHardware,
  apiListSampleHardware,
  apiPickEfiFolder,
  apiProbeHardware,
  isTauriRuntime,
} from "../lib/tauri-bridge";
import { useWorkspaceStore } from "../store/workspaceStore";
import type { CompatibilityReport, HardwareProfile } from "../types/opencore";

export const HardwareWizard: React.FC = () => {
  const { loadWorkspace, setActiveModule, pushToast } = useWorkspaceStore();
  const [samples, setSamples] = useState<HardwareProfile[]>([]);
  const [profile, setProfile] = useState<HardwareProfile | null>(null);
  const [report, setReport] = useState<CompatibilityReport | null>(null);
  const [scanning, setScanning] = useState(false);
  const [targetBootloader, setTargetBootloader] = useState<"OpenCore" | "Clover">("OpenCore");

  useEffect(() => {
    if (!isTauriRuntime()) return;
    Promise.all([apiProbeHardware(), apiListSampleHardware()])
      .then(async ([live, presetList]) => {
        setSamples([live, ...presetList]);
        setProfile(live);
        const rep = await apiEvaluateHardware(live);
        setReport(rep);
      })
      .catch(() => {});
  }, []);

  const handleSelectProfile = async (next: HardwareProfile) => {
    setProfile(next);
    if (isTauriRuntime()) {
      const rep = await apiEvaluateHardware(next);
      setReport(rep);
    }
  };

  const handleRescanLive = async () => {
    if (!isTauriRuntime()) return;
    setScanning(true);
    try {
      const live = await apiProbeHardware();
      setProfile(live);
      const rep = await apiEvaluateHardware(live);
      setReport(rep);
      pushToast("success", "已完成本机底层硬件扫描与规则匹配");
    } finally {
      setScanning(false);
    }
  };

  const handleGenerateIntoEditor = async (saveToFolder: boolean) => {
    if (!profile || !isTauriRuntime()) return;
    let outDir: string | null = null;
    if (saveToFolder) {
      outDir = await apiPickEfiFolder();
      if (!outDir) return;
    }
    const payload = await apiGenerateEfiFromHardware(profile, outDir, targetBootloader);
    loadWorkspace(payload);
    setActiveModule("editor");
    pushToast(
      "success",
      outDir
        ? `已在 ${outDir}/EFI 生成全套 ${targetBootloader} 目录结构与专属 config.plist！`
        : `已按当前硬件规则生成专属 ${targetBootloader} 配置并载入可视化编辑器！`
    );
  };

  return (
    <div className="space-y-6">
      {/* Top Bar: Scan Live or Pick Reference Machine */}
      <div className="bg-zinc-900/70 border border-zinc-800/80 rounded-2xl p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold text-zinc-100 flex items-center gap-2">
              <Radar className="w-5 h-5 text-blue-400" />
              硬件嗅探 + Dortania 兼容性诊断 + 一键生成 EFI
            </h2>
            <p className="text-xs text-zinc-400 mt-1">
              自动探测本机硬件（或切换测试目标装机配置），精准排查黑名单固态、无驱动 RTX 独显并自动组装匹配的 SSDT、Kext 与 Quirks
            </p>
          </div>
          <button
            type="button"
            onClick={handleRescanLive}
            disabled={scanning}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-xs font-semibold text-white transition"
          >
            <Cpu className="w-4 h-4" />
            {scanning ? "扫描硬件中..." : "重新扫描本机硬件"}
          </button>
        </div>

        {/* Profile Selector Pills */}
        {samples.length > 0 && (
          <div className="space-y-1.5">
            <span className="text-[11px] text-zinc-400">
              切换本机硬件或典型装机测试画像（方便跨机器制作 EFI）：
            </span>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {samples.map((s, idx) => {
                const active = profile?.profile_name === s.profile_name;
                return (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => handleSelectProfile(s)}
                    className={`text-left px-3.5 py-2.5 rounded-xl border text-xs transition flex items-center justify-between gap-2 ${
                      active
                        ? "bg-blue-950/35 border-blue-500/50 text-blue-100"
                        : "bg-zinc-950/70 border-zinc-800 text-zinc-300 hover:border-zinc-700"
                    }`}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      {s.is_laptop ? (
                        <Laptop className="w-4 h-4 text-blue-400 shrink-0" />
                      ) : (
                        <Monitor className="w-4 h-4 text-indigo-400 shrink-0" />
                      )}
                      <span className="truncate font-medium">{s.profile_name}</span>
                    </div>
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400 shrink-0">
                      {s.source}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Compatibility Summary Banner */}
      {report && profile && (
        <>
          <div
            className={`rounded-2xl border p-5 flex flex-wrap items-center justify-between gap-4 ${
              report.overall_status === "blocked"
                ? "bg-rose-950/25 border-rose-500/40"
                : report.overall_status === "caution"
                ? "bg-amber-950/25 border-amber-500/40"
                : "bg-emerald-950/25 border-emerald-500/40"
            }`}
          >
            <div className="space-y-1.5 max-w-2xl">
              <div className="flex items-center gap-2 text-sm font-semibold text-zinc-100">
                {report.overall_status === "blocked" ? (
                  <XCircle className="w-5 h-5 text-rose-400" />
                ) : report.overall_status === "caution" ? (
                  <AlertTriangle className="w-5 h-5 text-amber-400" />
                ) : (
                  <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                )}
                <span>{report.summary_headline}</span>
              </div>
              <div className="flex flex-wrap gap-3 text-xs text-zinc-300">
                <span>
                  推荐系统: <strong className="text-white">{report.recommended_macos}</strong>
                </span>
                <span>
                  推荐 SMBIOS: <strong className="text-blue-300 font-mono">{report.recommended_smbios}</strong>
                </span>
                <span>
                  推荐参数: <code className="text-emerald-300 font-mono">{report.recommended_boot_args}</code>
                </span>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2.5">
              {/* Target Bootloader Selector */}
              <div className="flex rounded-xl bg-zinc-900/90 border border-zinc-700 p-1 text-xs">
                <button
                  type="button"
                  onClick={() => setTargetBootloader("OpenCore")}
                  className={`px-3 py-1.5 rounded-lg font-medium transition ${
                    targetBootloader === "OpenCore"
                      ? "bg-blue-600 text-white"
                      : "text-zinc-400 hover:text-zinc-200"
                  }`}
                >
                  OpenCore (推荐)
                </button>
                <button
                  type="button"
                  onClick={() => setTargetBootloader("Clover")}
                  className={`px-3 py-1.5 rounded-lg font-medium transition ${
                    targetBootloader === "Clover"
                      ? "bg-emerald-600 text-white"
                      : "text-zinc-400 hover:text-zinc-200"
                  }`}
                >
                  🍀 四叶草 Clover
                </button>
              </div>

              <button
                type="button"
                onClick={() => handleGenerateIntoEditor(false)}
                className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-xs font-semibold text-white shadow-lg shadow-emerald-600/20 transition"
              >
                <Sparkles className="w-4 h-4" />
                一键生成 {targetBootloader} 配置
              </button>
              <button
                type="button"
                onClick={() => handleGenerateIntoEditor(true)}
                className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-xs font-semibold text-zinc-100 transition"
              >
                <FolderOutput className="w-4 h-4 text-blue-400" />
                导出完整 EFI 目录...
              </button>
            </div>
          </div>

          {/* Per-Component Diagnostic Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {report.items.map((item, idx) => (
              <div
                key={idx}
                className="bg-zinc-900/60 border border-zinc-800/80 rounded-xl p-4 space-y-2"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <span className="text-[11px] text-zinc-400">{item.category}</span>
                    <h4 className="text-xs font-semibold text-zinc-100 mt-0.5">
                      {item.hardware_name}
                    </h4>
                  </div>
                  <span
                    className={`px-2 py-0.5 rounded-full text-[11px] font-medium shrink-0 border ${
                      item.status === "supported"
                        ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/30"
                        : item.status === "partial"
                        ? "bg-amber-500/15 text-amber-300 border-amber-500/30"
                        : "bg-rose-500/15 text-rose-300 border-rose-500/30"
                    }`}
                  >
                    {item.badge_text}
                  </span>
                </div>
                <p className="text-xs text-zinc-300/90 leading-relaxed">{item.advice}</p>
              </div>
            ))}
          </div>

          {/* Required SSDT & Kext Blueprint */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-zinc-900/50 border border-zinc-800/80 rounded-xl p-4">
              <h4 className="text-xs font-semibold text-zinc-200 mb-2.5 flex items-center gap-1.5">
                <HardDrive className="w-4 h-4 text-purple-400" />
                自动规划所需 ACPI 热补丁 (SSDT)
              </h4>
              <div className="flex flex-wrap gap-1.5">
                {report.required_ssdts.map((s) => (
                  <span
                    key={s}
                    className="px-2.5 py-1 rounded-lg bg-purple-500/10 border border-purple-500/30 font-mono text-xs text-purple-200"
                  >
                    {s}
                  </span>
                ))}
              </div>
            </div>

            <div className="bg-zinc-900/50 border border-zinc-800/80 rounded-xl p-4">
              <h4 className="text-xs font-semibold text-zinc-200 mb-2.5 flex items-center gap-1.5">
                <Cpu className="w-4 h-4 text-blue-400" />
                自动规划所需核心驱动包 (Kexts)
              </h4>
              <div className="flex flex-wrap gap-1.5">
                {report.required_kexts.map((k) => (
                  <span
                    key={k}
                    className="px-2.5 py-1 rounded-lg bg-blue-500/10 border border-blue-500/30 font-mono text-xs text-blue-200"
                  >
                    {k}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
};
