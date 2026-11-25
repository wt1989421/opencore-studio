import React, { useEffect, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Cpu,
  ExternalLink,
  FolderOutput,
  Globe,
  RefreshCw,
  Search,
  Sparkles,
  Star,
  XCircle,
} from "lucide-react";
import {
  apiEvaluateHardware,
  apiGenerateEfiFromHardware,
  apiListSampleHardware,
  apiLoadPreset,
  apiPickEfiFolder,
  apiProbeHardware,
  apiSearchCommunityCases,
  isTauriRuntime,
} from "../lib/tauri-bridge";
import { useWorkspaceStore } from "../store/workspaceStore";
import type {
  CommunityEfiCase,
  CompatibilityReport,
  HardwareProfile,
} from "../types/opencore";
import {
  SegmentedControl,
  SettingsGroup,
  SettingsRow,
  appleInputCls,
  applePrimaryBtnCls,
  appleSecondaryBtnCls,
} from "./AppleUI";

export const HardwareWizard: React.FC = () => {
  const { loadWorkspace, setActiveModule, pushToast } = useWorkspaceStore();
  const [samples, setSamples] = useState<HardwareProfile[]>([]);
  const [profile, setProfile] = useState<HardwareProfile | null>(null);
  const [report, setReport] = useState<CompatibilityReport | null>(null);
  const [cases, setCases] = useState<CommunityEfiCase[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchingCases, setSearchingCases] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [targetBootloader, setTargetBootloader] = useState<"OpenCore" | "Clover">("OpenCore");

  const runFullAnalysis = async (hw: HardwareProfile, customQ?: string) => {
    setProfile(hw);
    if (!isTauriRuntime()) return;
    const rep = await apiEvaluateHardware(hw);
    setReport(rep);
    setSearchingCases(true);
    try {
      const [usedQuery, found] = await apiSearchCommunityCases(customQ ?? null, hw);
      setSearchQuery(usedQuery);
      setCases(found);
    } finally {
      setSearchingCases(false);
    }
  };

  useEffect(() => {
    if (!isTauriRuntime()) return;
    Promise.all([apiProbeHardware(), apiListSampleHardware()])
      .then(async ([live, presetList]) => {
        setSamples([live, ...presetList]);
        await runFullAnalysis(live);
      })
      .catch(() => {});
  }, []);

  const handleRescanLive = async () => {
    if (!isTauriRuntime()) return;
    setScanning(true);
    try {
      const live = await apiProbeHardware();
      await runFullAnalysis(live);
      pushToast("success", "已重新扫描本机硬件并更新全网同款成功案例！");
    } finally {
      setScanning(false);
    }
  };

  const handleManualCaseSearch = async (q = searchQuery) => {
    if (!isTauriRuntime()) return;
    setSearchingCases(true);
    try {
      const [usedQ, found] = await apiSearchCommunityCases(q, profile);
      setSearchQuery(usedQ);
      setCases(found);
      pushToast("info", `已检索 "${usedQ}" 相关成功案例 (${found.length} 条)`);
    } finally {
      setSearchingCases(false);
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
        ? `已在 ${outDir}/EFI 生成全套 ${targetBootloader} 目录与配置！`
        : `已根据本机硬件生成专属 ${targetBootloader} 配置！`
    );
  };

  return (
    <div className="space-y-6">
      {/* 1. Apple "About This Mac" Style Real Machine Hardware Overview */}
      <div className="bg-white rounded-[16px] border border-black/[0.07] shadow-[0_2px_10px_rgba(0,0,0,0.03)] overflow-hidden">
        <div className="p-5 border-b border-black/[0.06] flex flex-wrap items-center justify-between gap-4 bg-gradient-to-b from-white to-[#FAFAFC]">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-[14px] bg-gradient-to-b from-[#0A84FF] to-[#005BB5] text-white flex items-center justify-center shadow-md shrink-0">
              <Cpu className="w-7 h-7" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-[16px] font-bold text-[#1D1D1F] tracking-tight">
                  {profile?.cpu_model ?? "正在读取本机处理器信息..."}
                </h2>
                <span className="px-2 py-0.5 rounded-full bg-[#007AFF]/10 text-[#0066CC] text-[11px] font-semibold">
                  {profile?.source ?? "本机检测"}
                </span>
              </div>
              <p className="text-[12px] text-[#86868B] mt-0.5">
                {profile
                  ? `${profile.board_model} · ${profile.cpu_cores}核${
                      profile.cpu_threads ? ` ${profile.cpu_threads}线程` : ""
                    }${profile.memory_gb ? ` · ${profile.memory_gb} GB 内存` : ""}${
                      profile.os_version ? ` · ${profile.os_version}` : ""
                    }`
                  : "自动采集本机 CPU、主板、内存、显卡、声卡、网卡与固态硬盘型号"}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {samples.length > 1 && (
              <select
                value={profile?.profile_name ?? ""}
                onChange={(e) => {
                  const found = samples.find((s) => s.profile_name === e.target.value);
                  if (found) runFullAnalysis(found);
                }}
                className={`${appleInputCls} max-w-[210px] font-medium`}
              >
                {samples.map((s, idx) => (
                  <option key={idx} value={s.profile_name}>
                    {idx === 0 ? `🖥 本机：${s.cpu_model}` : `🧪 测试：${s.profile_name}`}
                  </option>
                ))}
              </select>
            )}
            <button
              type="button"
              onClick={handleRescanLive}
              disabled={scanning}
              className={appleSecondaryBtnCls}
            >
              <RefreshCw className={`w-3.5 h-3.5 text-[#007AFF] ${scanning ? "animate-spin" : ""}`} />
              {scanning ? "检测中" : "重新检测本机"}
            </button>
          </div>
        </div>

        {/* Clean 2-Column Hardware Spec Grid */}
        {profile && (
          <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-black/[0.06] text-[12.5px]">
            <div className="divide-y divide-black/[0.05]">
              <div className="px-5 py-2.5 flex justify-between gap-3">
                <span className="text-[#86868B]">处理器 (CPU)</span>
                <span className="font-medium text-[#1D1D1F] text-right truncate">
                  {profile.cpu_model} ({profile.cpu_cores}核
                  {profile.cpu_threads ? `/${profile.cpu_threads}线程` : ""})
                </span>
              </div>
              <div className="px-5 py-2.5 flex justify-between gap-3">
                <span className="text-[#86868B]">主板 / 机型</span>
                <span className="font-medium text-[#1D1D1F] text-right truncate">
                  {profile.board_model}
                </span>
              </div>
              <div className="px-5 py-2.5 flex justify-between gap-3">
                <span className="text-[#86868B]">物理内存</span>
                <span className="font-medium text-[#1D1D1F]">
                  {profile.memory_gb ? `${profile.memory_gb} GB` : "已识别"}
                </span>
              </div>
            </div>

            <div className="divide-y divide-black/[0.05]">
              <div className="px-5 py-2.5 flex justify-between gap-3">
                <span className="text-[#86868B] shrink-0">图形显卡</span>
                <span className="font-medium text-[#1D1D1F] text-right truncate">
                  {profile.gpus.join(" + ")}
                </span>
              </div>
              <div className="px-5 py-2.5 flex justify-between gap-3">
                <span className="text-[#86868B] shrink-0">板载声卡</span>
                <span className="font-medium text-[#1D1D1F] text-right truncate">
                  {profile.audio_codec}
                </span>
              </div>
              <div className="px-5 py-2.5 flex justify-between gap-3">
                <span className="text-[#86868B] shrink-0">磁盘与网络</span>
                <span className="font-medium text-[#1D1D1F] text-right truncate">
                  {profile.storage_drives[0] ?? "NVMe SSD"} · {profile.network_cards[0] ?? "LAN"}
                </span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 2. Internet Successful Hackintosh EFI Case Collector */}
      <SettingsGroup
        title="全网同款硬件成功案例库 (GitHub 实时采集 + 验证标杆)"
        description="根据上方检测到的本机处理器与主板型号，自动从互联网检索别人已经装成功的开源 EFI 案例供你参考或一键套用"
        action={
          <span className="inline-flex items-center gap-1 text-[11.5px] text-[#0066CC] font-medium">
            <Globe className="w-3.5 h-3.5" />
            {searchingCases ? "正在联网检索 GitHub..." : `共匹配 ${cases.length} 个成功案例`}
          </span>
        }
      >
        {/* Search Bar Row */}
        <div className="p-3.5 bg-[#FAFAFC] space-y-2.5">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="w-3.5 h-3.5 text-[#86868B] absolute left-3 top-2.5" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleManualCaseSearch()}
                placeholder="输入本机主板或 CPU 搜索全网成功案例，如 Z270 7700K、B760M、X870 9900X..."
                className={`${appleInputCls} w-full bg-white pl-8`}
              />
            </div>
            <button
              type="button"
              onClick={() => handleManualCaseSearch()}
              disabled={searchingCases}
              className={applePrimaryBtnCls}
            >
              {searchingCases ? "搜索中..." : "全网搜索案例"}
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-1.5 text-[11.5px]">
            <span className="text-[#86868B]">热门同款速查：</span>
            {["7700K Z270", "B760M 13600K", "Ryzen 9900X", "B650 Ryzen", "Y7000P"].map((kw) => (
              <button
                key={kw}
                type="button"
                onClick={() => {
                  setSearchQuery(`${kw} Hackintosh EFI`);
                  handleManualCaseSearch(`${kw} Hackintosh EFI`);
                }}
                className="px-2.5 py-0.5 rounded-full bg-white hover:bg-[#007AFF]/10 border border-black/[0.08] text-[#424245] hover:text-[#0066CC] transition"
              >
                {kw}
              </button>
            ))}
          </div>
        </div>

        {/* Matched Community Cases List */}
        {cases.map((c, idx) => (
          <SettingsRow
            key={`${c.repo_full_name}-${idx}`}
            title={
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-semibold text-[#1D1D1F]">{c.repo_full_name}</span>
                <span className="inline-flex items-center gap-0.5 px-2 py-0.2 rounded-full bg-[#FFD60A]/25 text-[#946800] text-[11px] font-semibold">
                  <Star className="w-3 h-3 fill-current" /> {c.stars}
                </span>
                <span
                  className={`px-2 py-0.2 rounded-full text-[11px] font-medium ${
                    c.source_kind.includes("实时")
                      ? "bg-[#007AFF]/10 text-[#0066CC]"
                      : "bg-[#34C759]/12 text-[#248A3D]"
                  }`}
                >
                  {c.match_badge}
                </span>
                <span className="text-[11px] text-[#86868B]">{c.macos_tested}</span>
              </div>
            }
            subtitle={c.description}
            right={
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={async () => {
                    if (!isTauriRuntime()) return;
                    const payload = await apiLoadPreset(c.recommended_preset_id);
                    loadWorkspace({
                      ...payload,
                      title: `参考案例：${c.repo_full_name}`,
                    });
                    setActiveModule("editor");
                    pushToast("success", `已按案例 ${c.repo_full_name} 架构生成基础配置（三码已自动重新随机生成）`);
                  }}
                  className={appleSecondaryBtnCls}
                >
                  套用同款配置
                </button>
                <a
                  href={c.html_url}
                  target="_blank"
                  rel="noreferrer"
                  className={applePrimaryBtnCls}
                >
                  查看原库 <ExternalLink className="w-3 h-3" />
                </a>
              </div>
            }
          />
        ))}
      </SettingsGroup>

      {/* 3. Dortania Per-Component Compatibility & One-Click Generate */}
      {report && profile && (
        <>
          <div className="bg-white rounded-[14px] border border-black/[0.08] p-4 flex flex-wrap items-center justify-between gap-4 shadow-2xs">
            <div className="space-y-0.5 max-w-lg">
              <div className="flex items-center gap-2 text-[13.5px] font-bold text-[#1D1D1F]">
                {report.overall_status === "blocked" ? (
                  <XCircle className="w-4.5 h-4.5 text-[#FF3B30]" />
                ) : report.overall_status === "caution" ? (
                  <AlertTriangle className="w-4.5 h-4.5 text-[#FF9500]" />
                ) : (
                  <CheckCircle2 className="w-4.5 h-4.5 text-[#34C759]" />
                )}
                <span>{report.summary_headline}</span>
              </div>
              <div className="text-[12px] text-[#86868B]">
                推荐机型：<strong className="font-mono text-[#1D1D1F]">{report.recommended_smbios}</strong> ·
                启动参数：<code className="font-mono text-[#0066CC]">{report.recommended_boot_args}</code>
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
                根据本机生成配置
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

          <SettingsGroup title="本机硬件逐项兼容性诊断建议">
            {report.items.map((item, idx) => (
              <SettingsRow
                key={idx}
                title={`${item.category}：${item.hardware_name}`}
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
