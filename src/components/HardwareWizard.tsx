import React, { useEffect, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Cpu,
  FolderOutput,
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
import {
  SegmentedControl,
  SettingsGroup,
  SettingsRow,
  applePrimaryBtnCls,
  appleSecondaryBtnCls,
} from "./AppleUI";

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
      pushToast("success", "已完成本机底层硬件扫描");
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
        ? `已在 ${outDir}/EFI 生成全套 ${targetBootloader} 配置！`
        : `已生成专属 ${targetBootloader} 配置并载入左侧设置面板！`
    );
  };

  return (
    <div className="space-y-6">
      {/* Hero Banner Card */}
      <div className="bg-white rounded-[16px] border border-black/[0.07] shadow-[0_2px_10px_rgba(0,0,0,0.03)] p-5 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <div className="w-12 h-12 rounded-[12px] bg-gradient-to-b from-[#FF9F0A] to-[#FF6B00] text-white flex items-center justify-center shadow-sm">
            <Radar className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-[15px] font-bold text-[#1D1D1F]">
              硬件检测与智能生成 EFI
            </h2>
            <p className="text-[12px] text-[#86868B] mt-0.5">
              自动探测本机硬件（或切换目标装机方案），排查无驱动独显与黑名单固态并一键生成专属配置
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={handleRescanLive}
          disabled={scanning}
          className={appleSecondaryBtnCls}
        >
          <Cpu className="w-4 h-4 text-[#FF6B00]" />
          {scanning ? "扫描中..." : "重新扫描本机"}
        </button>
      </div>

      {/* Hardware Profile Picker Group */}
      {samples.length > 0 && (
        <SettingsGroup
          title="选择目标硬件配置"
          description="支持本机实时硬件或切换典型装机方案（含 AMD Ryzen 9 9900X 旗舰与笔记本排雷示例）"
        >
          {samples.map((s, idx) => {
            const active = profile?.profile_name === s.profile_name;
            return (
              <SettingsRow
                key={idx}
                title={
                  <span className="flex items-center gap-2">
                    {s.is_laptop ? (
                      <Laptop className="w-4 h-4 text-[#007AFF]" />
                    ) : (
                      <Monitor className="w-4 h-4 text-[#5E5CE6]" />
                    )}
                    <span className={active ? "font-semibold text-[#0066CC]" : ""}>
                      {s.profile_name}
                    </span>
                  </span>
                }
                subtitle={`${s.cpu_model} · ${s.gpus.join(" / ")}`}
                right={
                  <button
                    type="button"
                    onClick={() => handleSelectProfile(s)}
                    className={
                      active
                        ? "px-3 py-1 rounded-full bg-[#007AFF]/12 text-[#0066CC] text-[12px] font-semibold"
                        : appleSecondaryBtnCls
                    }
                  >
                    {active ? "当前选中" : "选用此配置"}
                  </button>
                }
              />
            );
          })}
        </SettingsGroup>
      )}

      {/* Compatibility Result & Action Bar */}
      {report && profile && (
        <>
          <div className="bg-white rounded-[14px] border border-black/[0.08] p-5 space-y-4 shadow-[0_1px_3px_rgba(0,0,0,0.02)]">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="space-y-1 max-w-xl">
                <div className="flex items-center gap-2 text-[14px] font-bold text-[#1D1D1F]">
                  {report.overall_status === "blocked" ? (
                    <XCircle className="w-5 h-5 text-[#FF3B30]" />
                  ) : report.overall_status === "caution" ? (
                    <AlertTriangle className="w-5 h-5 text-[#FF9500]" />
                  ) : (
                    <CheckCircle2 className="w-5 h-5 text-[#34C759]" />
                  )}
                  <span>{report.summary_headline}</span>
                </div>
                <div className="text-[12px] text-[#86868B]">
                  推荐机型：<strong className="font-mono text-[#1D1D1F]">{report.recommended_smbios}</strong> ·
                  推荐系统：<strong className="text-[#1D1D1F]">{report.recommended_macos}</strong>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <SegmentedControl
                  value={targetBootloader}
                  onChange={(v) => setTargetBootloader(v as "OpenCore" | "Clover")}
                  options={[
                    { id: "OpenCore", label: "OpenCore" },
                    { id: "Clover", label: "🍀 四叶草" },
                  ]}
                />
                <button
                  type="button"
                  onClick={() => handleGenerateIntoEditor(false)}
                  className={applePrimaryBtnCls}
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  一键生成配置
                </button>
                <button
                  type="button"
                  onClick={() => handleGenerateIntoEditor(true)}
                  className={appleSecondaryBtnCls}
                >
                  <FolderOutput className="w-3.5 h-3.5 text-[#007AFF]" />
                  导出完整 EFI...
                </button>
              </div>
            </div>
          </div>

          {/* Per-Component Diagnostic Rows */}
          <SettingsGroup title="硬件兼容性逐项评估建议">
            {report.items.map((item, idx) => (
              <SettingsRow
                key={idx}
                title={
                  <span className="flex items-center gap-2">
                    <span className="text-[#86868B] font-normal">{item.category}：</span>
                    <span>{item.hardware_name}</span>
                  </span>
                }
                subtitle={item.advice}
                right={
                  <span
                    className={`px-2.5 py-1 rounded-full text-[11.5px] font-semibold ${
                      item.status === "supported"
                        ? "bg-[#34C759]/12 text-[#248A3D]"
                        : item.status === "partial"
                        ? "bg-[#FF9500]/15 text-[#C93400]"
                        : "bg-[#FF3B30]/12 text-[#D70015]"
                    }`}
                  >
                    {item.badge_text}
                  </span>
                }
              />
            ))}
          </SettingsGroup>
        </>
      )}
    </div>
  );
};
