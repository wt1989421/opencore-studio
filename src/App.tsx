import React, { useEffect, useState } from "react";
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Code2,
  Cpu,
  Disc,
  FilePlus2,
  FolderOpen,
  FolderSync,
  HardDrive,
  Laptop,
  Layers,
  Monitor,
  Palette,
  Radar,
  Redo2,
  Save,
  Search,
  Settings,
  Shield,
  Sliders,
  Sparkles,
  Terminal,
  Undo2,
  Wrench,
  X,
  Zap,
  type LucideIcon,
} from "lucide-react";
import {
  SegmentedControl,
  SquircleIcon,
  applePrimaryBtnCls,
  appleSecondaryBtnCls,
} from "./components/AppleUI";
import {
  CloverAcpiSection,
  CloverBootSection,
  CloverDevicesSection,
  CloverGraphicsSection,
  CloverGuiSection,
  CloverKernelPatchesSection,
  CloverMigrationBanner,
  CloverQuirksSection,
  CloverRtAndSysSection,
  CloverSmbiosSection,
  MigrationNotesAlert,
} from "./components/CloverSections";
import { CommandPalette } from "./components/CommandPalette";
import {
  AcpiSection,
  BooterSection,
  DevicePropertiesSection,
  KernelSection,
  MiscSection,
  NvramSection,
  PlatformInfoSection,
  UefiSection,
} from "./components/EditorSections";
import { HardwareWizard } from "./components/HardwareWizard";
import { RawPlistTreeView } from "./components/RawPlistTree";
import { ToolboxPanel } from "./components/ToolboxPanel";
import {
  apiApplyQuickFix,
  apiListPresets,
  apiLoadPreset,
  apiOpenEfiOrPlist,
  apiPickEfiFolder,
  apiPickPlistFile,
  apiPickSavePlistPath,
  apiSavePlist,
  apiSyncOcDirectory,
  isTauriRuntime,
} from "./lib/tauri-bridge";
import {
  useWorkspaceStore,
  type CloverTab,
  type EditorTab,
} from "./store/workspaceStore";
import { getStr, type PresetMeta } from "./types/opencore";

const OC_MENU: {
  id: EditorTab;
  label: string;
  icon: LucideIcon;
  color: "blue" | "indigo" | "teal" | "orange" | "slate" | "green" | "purple" | "amber" | "pink";
}[] = [
  { id: "PlatformInfo", label: "机型与三码信息", icon: Laptop, color: "blue" },
  { id: "ACPI", label: "ACPI 电源与补丁", icon: Zap, color: "orange" },
  { id: "Booter", label: "Booter 内存映射", icon: Layers, color: "indigo" },
  { id: "DeviceProperties", label: "显卡与声卡注入", icon: Monitor, color: "teal" },
  { id: "Kernel", label: "内核驱动与锐龙补丁", icon: Cpu, color: "red" as "pink" },
  { id: "NVRAM", label: "启动参数与 SIP", icon: Terminal, color: "green" },
  { id: "Misc", label: "启动菜单与安全", icon: Shield, color: "slate" },
  { id: "UEFI", label: "UEFI 固件驱动", icon: Disc, color: "amber" },
  { id: "RawTree", label: "Plist 键值树与源码", icon: Code2, color: "purple" },
];

const CLOVER_MENU: {
  id: CloverTab;
  label: string;
  icon: LucideIcon;
  color: "blue" | "indigo" | "teal" | "orange" | "slate" | "green" | "purple" | "amber" | "pink";
}[] = [
  { id: "SMBIOS", label: "四叶草机型与三码", icon: Laptop, color: "green" },
  { id: "ACPI", label: "ACPI (DSDT/SSDT)", icon: Zap, color: "orange" },
  { id: "Boot", label: "Boot 启动参数", icon: Terminal, color: "blue" },
  { id: "Devices", label: "声卡与 USB 修复", icon: HardDrive, color: "teal" },
  { id: "GUI", label: "主题与屏幕分辨率", icon: Palette, color: "purple" },
  { id: "Graphics", label: "传统老显卡注入", icon: Monitor, color: "indigo" },
  { id: "KernelAndKextPatches", label: "内核与 CFG 解锁", icon: Cpu, color: "pink" },
  { id: "Quirks", label: "Quirks (r5123+)", icon: Sliders, color: "amber" },
  { id: "RtVariables", label: "SIP 与驱动开关", icon: Settings, color: "slate" },
  { id: "RawTree", label: "Plist 键值树与源码", icon: Code2, color: "indigo" },
];

export const App: React.FC = () => {
  const {
    bootloader,
    activeModule,
    activeEditorTab,
    activeCloverTab,
    workspaceTitle,
    configPath,
    ocDir,
    plist,
    past,
    future,
    isDirty,
    issues,
    showIssuesDrawer,
    toasts,
    setActiveModule,
    setActiveEditorTab,
    setActiveCloverTab,
    setShowIssuesDrawer,
    setShowCommandPalette,
    loadWorkspace,
    replacePlist,
    undo,
    redo,
    markSaved,
    setScanAndIssues,
    setIssues,
    pushToast,
  } = useWorkspaceStore();

  const [presets, setPresets] = useState<PresetMeta[]>([]);
  const [showPresetPopover, setShowPresetPopover] = useState(false);

  useEffect(() => {
    apiListPresets().then(setPresets).catch(() => {});
    if (isTauriRuntime()) {
      apiLoadPreset("amd_ryzen_9900x_zen5")
        .then((payload) => loadWorkspace(payload))
        .catch(() => {});
    }
  }, [loadWorkspace]);

  const isClover = bootloader === "Clover";
  const errorCount = issues.filter((i) => i.severity === "error").length;
  const warnCount = issues.filter((i) => i.severity === "warning").length;

  const currentModelName = isClover
    ? getStr(plist, ["SMBIOS", "ProductName"], "iMac20,1")
    : getStr(plist, ["PlatformInfo", "Generic", "SystemProductName"], "MacPro7,1");

  const activeTitle =
    activeModule === "hardware"
      ? "硬件检测与智能生成 EFI"
      : activeModule === "toolbox"
      ? "排错诊断与声卡工具箱"
      : isClover
      ? CLOVER_MENU.find((m) => m.id === activeCloverTab)?.label ?? "四叶草设置"
      : OC_MENU.find((m) => m.id === activeEditorTab)?.label ?? "OpenCore 设置";

  const handleSwitchBootloader = async (next: string) => {
    if (!isTauriRuntime()) return;
    const presetId = next === "Clover" ? "clover_intel_modern" : "amd_ryzen_9900x_zen5";
    const payload = await apiLoadPreset(presetId);
    loadWorkspace(payload);
    setActiveModule("editor");
  };

  const handleSave = async (saveAs = false) => {
    try {
      let targetPath = saveAs ? null : configPath;
      if (!targetPath) {
        targetPath = await apiPickSavePlistPath("config.plist");
        if (!targetPath) return;
      }
      const snaps = await apiSavePlist(targetPath, plist, true);
      markSaved(targetPath, snaps);
      pushToast("success", `已保存配置并自动创建快照备份`);
    } catch (e) {
      pushToast("error", String(e));
    }
  };

  return (
    <div className="h-screen w-screen flex bg-[#F5F5F7] text-[#1D1D1F] overflow-hidden">
      {/* Left macOS Sequoia "System Settings" Frosted Sidebar */}
      <aside className="w-[262px] shrink-0 bg-[#EFEFF4]/90 backdrop-blur-2xl border-r border-black/[0.08] flex flex-col p-3 overflow-y-auto">
        {/* Search Input (macOS Settings style) */}
        <button
          type="button"
          onClick={() => setShowCommandPalette(true)}
          className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-[8px] bg-black/[0.055] hover:bg-black/[0.08] text-[12.5px] text-[#6E6E73] transition mb-3"
        >
          <Search className="w-3.5 h-3.5 text-[#86868B]" />
          <span>搜索设置项</span>
          <span className="ml-auto text-[11px] text-[#86868B]">⌘K</span>
        </button>

        {/* Top Apple-ID-Style Machine Profile Card */}
        <div className="bg-white/80 rounded-[12px] border border-black/[0.06] p-3 mb-3 space-y-2.5 shadow-[0_1px_2px_rgba(0,0,0,0.03)]">
          <div className="flex items-center gap-2.5">
            <div
              className={`w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-[13px] shadow-sm shrink-0 ${
                isClover
                  ? "bg-gradient-to-b from-[#34C759] to-[#248A3D]"
                  : "bg-gradient-to-b from-[#0A84FF] to-[#005BB5]"
              }`}
            >
              {isClover ? "🍀" : "OC"}
            </div>
            <div className="min-w-0">
              <div className="text-[13px] font-bold text-[#1D1D1F] truncate">
                {currentModelName}
              </div>
              <div className="text-[11px] text-[#86868B] truncate" title={workspaceTitle}>
                {isDirty ? "● 有未保存更改" : workspaceTitle}
              </div>
            </div>
          </div>

          <div className="w-full flex justify-center">
            <SegmentedControl
              value={bootloader}
              onChange={handleSwitchBootloader}
              options={[
                { id: "OpenCore", label: "OpenCore" },
                { id: "Clover", label: "🍀 四叶草" },
              ]}
            />
          </div>
        </div>

        {/* Group 1: Smart Assistants */}
        <div className="space-y-0.5 mb-3">
          <button
            type="button"
            onClick={() => setActiveModule("hardware")}
            className={`w-full flex items-center gap-2.5 px-2.5 py-[6px] rounded-[8px] text-[13px] font-medium transition ${
              activeModule === "hardware"
                ? "bg-[#007AFF] text-white shadow-xs"
                : "text-[#1D1D1F] hover:bg-black/[0.045]"
            }`}
          >
            <SquircleIcon icon={Radar} color="orange" />
            <span>硬件检测与一键生成</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveModule("toolbox")}
            className={`w-full flex items-center gap-2.5 px-2.5 py-[6px] rounded-[8px] text-[13px] font-medium transition ${
              activeModule === "toolbox"
                ? "bg-[#007AFF] text-white shadow-xs"
                : "text-[#1D1D1F] hover:bg-black/[0.045]"
            }`}
          >
            <SquircleIcon icon={Wrench} color="purple" />
            <span>排错与声卡工具箱</span>
          </button>
        </div>

        <div className="px-2.5 pb-1 text-[11px] font-semibold text-[#86868B]">
          {isClover ? "四叶草配置项" : "OpenCore 配置项"}
        </div>

        {/* Group 2: Bootloader Settings Rows */}
        <div className="space-y-0.5 flex-1">
          {!isClover
            ? OC_MENU.map((item) => {
                const selected = activeModule === "editor" && activeEditorTab === item.id;
                const secErrors = issues.filter(
                  (i) => i.section === item.id && i.severity === "error"
                ).length;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      setActiveModule("editor");
                      setActiveEditorTab(item.id);
                    }}
                    className={`w-full flex items-center gap-2.5 px-2.5 py-[6px] rounded-[8px] text-[13px] font-medium transition ${
                      selected
                        ? "bg-[#007AFF] text-white shadow-xs"
                        : "text-[#1D1D1F] hover:bg-black/[0.045]"
                    }`}
                  >
                    <SquircleIcon icon={item.icon} color={item.color} />
                    <span className="truncate">{item.label}</span>
                    {secErrors > 0 && (
                      <span
                        className={`ml-auto px-1.5 py-0.2 rounded-full text-[10.5px] font-semibold ${
                          selected ? "bg-white/25 text-white" : "bg-[#FF3B30] text-white"
                        }`}
                      >
                        {secErrors}
                      </span>
                    )}
                  </button>
                );
              })
            : CLOVER_MENU.map((item) => {
                const selected = activeModule === "editor" && activeCloverTab === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      setActiveModule("editor");
                      setActiveCloverTab(item.id);
                    }}
                    className={`w-full flex items-center gap-2.5 px-2.5 py-[6px] rounded-[8px] text-[13px] font-medium transition ${
                      selected
                        ? "bg-[#34C759] text-white shadow-xs"
                        : "text-[#1D1D1F] hover:bg-black/[0.045]"
                    }`}
                  >
                    <SquircleIcon icon={item.icon} color={item.color} />
                    <span className="truncate">{item.label}</span>
                  </button>
                );
              })}
        </div>

        {/* Bottom File Operations */}
        <div className="pt-3 mt-2 border-t border-black/[0.07] grid grid-cols-2 gap-1.5">
          <button
            type="button"
            onClick={async () => {
              const folder = await apiPickEfiFolder();
              if (!folder) return;
              const payload = await apiOpenEfiOrPlist(folder);
              loadWorkspace(payload);
              setActiveModule("editor");
              pushToast("success", "已打开 EFI 目录");
            }}
            className="flex items-center justify-center gap-1.5 py-1.5 rounded-[8px] bg-white hover:bg-black/[0.03] border border-black/[0.08] text-[12px] font-medium text-[#1D1D1F] shadow-2xs"
          >
            <FolderOpen className="w-3.5 h-3.5 text-[#007AFF]" />
            打开 EFI
          </button>
          <button
            type="button"
            onClick={async () => {
              const file = await apiPickPlistFile();
              if (!file) return;
              const payload = await apiOpenEfiOrPlist(file);
              loadWorkspace(payload);
              setActiveModule("editor");
              pushToast("success", "已打开 Plist 文件");
            }}
            className="flex items-center justify-center gap-1.5 py-1.5 rounded-[8px] bg-white hover:bg-black/[0.03] border border-black/[0.08] text-[12px] font-medium text-[#1D1D1F] shadow-2xs"
          >
            <FilePlus2 className="w-3.5 h-3.5 text-[#5E5CE6]" />
            打开文件
          </button>
        </div>
      </aside>

      {/* Right macOS System Settings Content Area */}
      <div className="flex-1 flex flex-col min-w-0 bg-[#F5F5F7]">
        {/* Crisp Translucent Top Titlebar */}
        <header className="h-[52px] shrink-0 bg-[#F5F5F7]/85 backdrop-blur-xl border-b border-black/[0.07] px-6 flex items-center justify-between gap-4 z-10">
          <div className="flex items-center gap-3">
            <h1 className="text-[15px] font-bold text-[#1D1D1F] tracking-tight">
              {activeTitle}
            </h1>
            <div className="flex items-center gap-1 ml-2">
              <button
                type="button"
                disabled={past.length === 0}
                onClick={undo}
                title="撤销"
                className="p-1.5 rounded-[6px] hover:bg-black/[0.05] text-[#6E6E73] disabled:opacity-30"
              >
                <Undo2 className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                disabled={future.length === 0}
                onClick={redo}
                title="重做"
                className="p-1.5 rounded-[6px] hover:bg-black/[0.05] text-[#6E6E73] disabled:opacity-30"
              >
                <Redo2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          <div className="flex items-center gap-2 relative">
            {/* Presets Popover Button */}
            <button
              type="button"
              onClick={() => setShowPresetPopover(!showPresetPopover)}
              className={appleSecondaryBtnCls}
            >
              切换机型预设
            </button>
            {showPresetPopover && (
              <div className="absolute right-44 top-10 w-80 bg-white/95 backdrop-blur-xl border border-black/[0.1] rounded-[12px] shadow-[0_12px_32px_rgba(0,0,0,0.14)] p-1.5 z-30 max-h-80 overflow-y-auto">
                {presets.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={async () => {
                      const payload = await apiLoadPreset(p.id);
                      loadWorkspace(payload);
                      setActiveModule("editor");
                      setShowPresetPopover(false);
                      pushToast("info", `已套用预设：${p.name}`);
                    }}
                    className="w-full text-left px-3 py-2 rounded-[8px] hover:bg-[#007AFF] group transition"
                  >
                    <div className="text-[12.5px] font-semibold text-[#1D1D1F] group-hover:text-white">
                      {p.name}
                    </div>
                    <div className="text-[11px] text-[#86868B] group-hover:text-white/85 line-clamp-1">
                      {p.subtitle}
                    </div>
                  </button>
                ))}
              </div>
            )}

            {/* Validation Status Pill */}
            <button
              type="button"
              onClick={() => setShowIssuesDrawer(!showIssuesDrawer)}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-semibold transition ${
                errorCount > 0
                  ? "bg-[#FF3B30]/12 text-[#D70015]"
                  : warnCount > 0
                  ? "bg-[#FF9500]/15 text-[#C93400]"
                  : "bg-[#34C759]/12 text-[#248A3D]"
              }`}
            >
              {errorCount > 0 ? (
                <AlertCircle className="w-3.5 h-3.5" />
              ) : warnCount > 0 ? (
                <AlertTriangle className="w-3.5 h-3.5" />
              ) : (
                <CheckCircle2 className="w-3.5 h-3.5" />
              )}
              <span>
                {errorCount === 0 && warnCount === 0
                  ? "配置无误"
                  : `${errorCount} 错误 · ${warnCount} 提醒`}
              </span>
            </button>

            <button
              type="button"
              onClick={async () => {
                try {
                  let targetDir = ocDir;
                  if (!targetDir) {
                    targetDir = await apiPickEfiFolder();
                    if (!targetDir) return;
                  }
                  const [syncedPlist, scanRes, nextIssues] = await apiSyncOcDirectory(
                    targetDir,
                    plist
                  );
                  replacePlist(syncedPlist);
                  setScanAndIssues(scanRes, nextIssues);
                  pushToast("success", `已同步 ${scanRes.kexts.length} 项驱动`);
                } catch (e) {
                  pushToast("error", String(e));
                }
              }}
              className={appleSecondaryBtnCls}
            >
              <FolderSync className="w-3.5 h-3.5 text-[#007AFF]" />
              同步目录
            </button>

            <button
              type="button"
              onClick={() => handleSave(false)}
              className={applePrimaryBtnCls}
            >
              <Save className="w-3.5 h-3.5" />
              保存
            </button>
          </div>
        </header>

        {/* Centered Clean macOS Settings Scrollable Column */}
        <main className="flex-1 overflow-y-auto px-8 py-6">
          <div className="max-w-3xl mx-auto pb-10">
            {activeModule === "editor" && !isClover && (
              <>
                <MigrationNotesAlert />
                {activeEditorTab === "ACPI" && <AcpiSection />}
                {activeEditorTab === "Booter" && <BooterSection />}
                {activeEditorTab === "DeviceProperties" && <DevicePropertiesSection />}
                {activeEditorTab === "Kernel" && <KernelSection />}
                {activeEditorTab === "Misc" && <MiscSection />}
                {activeEditorTab === "NVRAM" && <NvramSection />}
                {activeEditorTab === "PlatformInfo" && <PlatformInfoSection />}
                {activeEditorTab === "UEFI" && <UefiSection />}
                {activeEditorTab === "RawTree" && <RawPlistTreeView />}
              </>
            )}

            {activeModule === "editor" && isClover && (
              <>
                <CloverMigrationBanner />
                {activeCloverTab === "ACPI" && <CloverAcpiSection />}
                {activeCloverTab === "Boot" && <CloverBootSection />}
                {activeCloverTab === "Devices" && <CloverDevicesSection />}
                {activeCloverTab === "GUI" && <CloverGuiSection />}
                {activeCloverTab === "Graphics" && <CloverGraphicsSection />}
                {activeCloverTab === "KernelAndKextPatches" && <CloverKernelPatchesSection />}
                {activeCloverTab === "Quirks" && <CloverQuirksSection />}
                {activeCloverTab === "RtVariables" && <CloverRtAndSysSection />}
                {activeCloverTab === "SMBIOS" && <CloverSmbiosSection />}
                {activeCloverTab === "RawTree" && <RawPlistTreeView />}
              </>
            )}

            {activeModule === "hardware" && <HardwareWizard />}
            {activeModule === "toolbox" && <ToolboxPanel />}
          </div>
        </main>
      </div>

      {/* Right Clean Validation Sheet */}
      {showIssuesDrawer && (
        <div className="w-88 shrink-0 border-l border-black/[0.08] bg-white/95 backdrop-blur-xl p-4 flex flex-col shadow-xl">
          <div className="flex items-center justify-between pb-3 border-b border-black/[0.07]">
            <h3 className="text-[13.5px] font-bold text-[#1D1D1F]">
              配置合法性检查 ({issues.length})
            </h3>
            <button
              type="button"
              onClick={() => setShowIssuesDrawer(false)}
              className="p-1 text-[#86868B] hover:text-[#1D1D1F]"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto py-3 space-y-2.5">
            {issues.length === 0 ? (
              <div className="py-14 text-center space-y-2">
                <CheckCircle2 className="w-8 h-8 text-[#34C759] mx-auto" />
                <div className="text-[13px] font-semibold text-[#1D1D1F]">所有配置项检查无误</div>
              </div>
            ) : (
              issues.map((iss) => (
                <div
                  key={iss.id}
                  className="rounded-[12px] border border-black/[0.08] bg-[#F5F5F7]/70 p-3 space-y-2 text-[12px]"
                >
                  <div className="flex items-center justify-between">
                    <span
                      className={`font-semibold ${
                        iss.severity === "error" ? "text-[#D70015]" : "text-[#C93400]"
                      }`}
                    >
                      {iss.severity === "error" ? "错误" : "建议提醒"}
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setActiveModule("editor");
                        if (isClover) {
                          setActiveCloverTab(iss.section as CloverTab);
                        } else {
                          setActiveEditorTab(iss.section as EditorTab);
                        }
                      }}
                      className="text-[#0066CC] hover:underline"
                    >
                      定位
                    </button>
                  </div>
                  <div className="font-semibold text-[#1D1D1F]">{iss.title}</div>
                  <p className="text-[#6E6E73] leading-relaxed">{iss.message}</p>
                  {iss.fix_action && (
                    <button
                      type="button"
                      onClick={async () => {
                        if (!iss.fix_action) return;
                        const [fixedPlist, msg, nextIssues] = await apiApplyQuickFix(
                          plist,
                          iss.fix_action,
                          ocDir
                        );
                        replacePlist(fixedPlist);
                        setIssues(nextIssues);
                        pushToast("success", msg);
                      }}
                      className={`${applePrimaryBtnCls} w-full justify-center`}
                    >
                      <Sparkles className="w-3.5 h-3.5" /> 一键自动修正
                    </button>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      )}

      <CommandPalette />

      {/* Crisp Floating Apple Pill Toasts */}
      <div className="fixed bottom-5 right-5 z-50 space-y-2 pointer-events-none">
        {toasts.map((t) => (
          <div
            key={t.id}
            className="px-4 py-2.5 rounded-full bg-white/95 backdrop-blur-xl border border-black/[0.08] shadow-[0_8px_24px_rgba(0,0,0,0.12)] text-[12.5px] font-medium text-[#1D1D1F] flex items-center gap-2 pointer-events-auto"
          >
            <span
              className={`w-2 h-2 rounded-full ${
                t.type === "error"
                  ? "bg-[#FF3B30]"
                  : t.type === "success"
                  ? "bg-[#34C759]"
                  : "bg-[#007AFF]"
              }`}
            />
            {t.text}
          </div>
        ))}
      </div>
    </div>
  );
};

export default App;
