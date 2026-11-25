import React, { useEffect, useState } from "react";
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Cpu,
  FileCode2,
  FilePlus2,
  FolderOpen,
  FolderSync,
  Layers,
  Redo2,
  Save,
  Search,
  Sparkles,
  Undo2,
  Wrench,
  X,
} from "lucide-react";
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
import { RawPlistTreeView, XmlSourcePreview } from "./components/RawPlistTree";
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
import type { PresetMeta } from "./types/opencore";

const EDITOR_TABS: { id: EditorTab; label: string }[] = [
  { id: "ACPI", label: "ACPI" },
  { id: "Booter", label: "Booter" },
  { id: "DeviceProperties", label: "DeviceProperties" },
  { id: "Kernel", label: "Kernel" },
  { id: "Misc", label: "Misc" },
  { id: "NVRAM", label: "NVRAM" },
  { id: "PlatformInfo", label: "PlatformInfo (三码)" },
  { id: "UEFI", label: "UEFI" },
  { id: "RawTree", label: "原始 Plist 树" },
  { id: "XmlPreview", label: "XML 源码" },
];

const CLOVER_TABS: { id: CloverTab; label: string }[] = [
  { id: "ACPI", label: "ACPI (DSDT/SSDT)" },
  { id: "Boot", label: "Boot (引导参数)" },
  { id: "Devices", label: "Devices (声卡/USB)" },
  { id: "GUI", label: "GUI (主题/分辨率)" },
  { id: "Graphics", label: "Graphics (显卡注入)" },
  { id: "KernelAndKextPatches", label: "KernelPatches" },
  { id: "Quirks", label: "Quirks (r5123+)" },
  { id: "RtVariables", label: "RtVariables & 驱动注入" },
  { id: "SMBIOS", label: "SMBIOS (四叶草三码)" },
  { id: "RawTree", label: "原始 Plist 树" },
  { id: "XmlPreview", label: "XML 源码" },
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
    backups,
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
  const [showPresetMenu, setShowPresetMenu] = useState(false);

  useEffect(() => {
    apiListPresets().then(setPresets).catch(() => {});
    if (isTauriRuntime()) {
      apiLoadPreset("intel_10th_desktop")
        .then((payload) => loadWorkspace(payload))
        .catch(() => {});
    }
  }, [loadWorkspace]);

  const errorCount = issues.filter((i) => i.severity === "error").length;
  const warnCount = issues.filter((i) => i.severity === "warning").length;

  const handleSwitchBootloaderPreset = async (target: "OpenCore" | "Clover") => {
    if (!isTauriRuntime()) return;
    const presetId = target === "Clover" ? "clover_intel_modern" : "intel_10th_desktop";
    const payload = await apiLoadPreset(presetId);
    loadWorkspace(payload);
    setActiveModule("editor");
    pushToast(
      "info",
      target === "Clover"
        ? "已切换至四叶草 Clover 配置模式"
        : "已切换至 OpenCore 配置模式"
    );
  };

  const handleOpenEfiFolder = async () => {
    try {
      const folder = await apiPickEfiFolder();
      if (!folder) return;
      const payload = await apiOpenEfiOrPlist(folder);
      loadWorkspace(payload);
      setActiveModule("editor");
      pushToast(
        "success",
        `已自动识别为 ${payload.bootloader ?? "OpenCore"} 并加载目录: ${folder}`
      );
    } catch (e) {
      pushToast("error", String(e));
    }
  };

  const handleOpenPlistFile = async () => {
    try {
      const file = await apiPickPlistFile();
      if (!file) return;
      const payload = await apiOpenEfiOrPlist(file);
      loadWorkspace(payload);
      setActiveModule("editor");
      pushToast(
        "success",
        `已自动识别为 ${payload.bootloader ?? "OpenCore"} 配置: ${file}`
      );
    } catch (e) {
      pushToast("error", String(e));
    }
  };

  const handleSyncOcFolder = async () => {
    try {
      let targetDir = ocDir;
      if (!targetDir) {
        targetDir = await apiPickEfiFolder();
        if (!targetDir) return;
      }
      const [syncedPlist, scanRes, nextIssues] = await apiSyncOcDirectory(targetDir, plist);
      replacePlist(syncedPlist);
      setScanAndIssues(scanRes, nextIssues);
      pushToast(
        "success",
        `已扫描同步 ${scanRes.acpi_files.length} 个 ACPI、${scanRes.kexts.length} 个驱动`
      );
    } catch (e) {
      pushToast("error", String(e));
    }
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
      pushToast("success", `已无损保存至 ${targetPath}（已自动生成历史快照备份）`);
    } catch (e) {
      pushToast("error", String(e));
    }
  };

  const isClover = bootloader === "Clover";

  return (
    <div className="h-screen w-screen flex bg-zinc-950 text-zinc-100 overflow-hidden">
      {/* Left macOS Translucent Sidebar */}
      <aside className="w-64 shrink-0 bg-zinc-900/80 border-r border-zinc-800/80 flex flex-col justify-between p-3.5 overflow-y-auto">
        <div className="space-y-5">
          {/* App Brand Header */}
          <div className="flex items-center gap-3 px-2 pt-1">
            <div
              className={`w-9 h-9 rounded-xl flex items-center justify-center shadow-lg ${
                isClover
                  ? "bg-gradient-to-br from-emerald-500 to-teal-600 shadow-emerald-600/25"
                  : "bg-gradient-to-br from-blue-500 to-indigo-600 shadow-blue-600/25"
              }`}
            >
              <Layers className="w-5 h-5 text-white" />
            </div>
            <div>
              <div className="text-sm font-bold tracking-tight text-white">OpenCore Studio</div>
              <div className="text-[11px] text-zinc-400">OC + 四叶草双引擎工作台</div>
            </div>
          </div>

          {/* Dual Bootloader Mode Switcher */}
          <div className="bg-zinc-950/90 border border-zinc-800 p-1 rounded-xl grid grid-cols-2 gap-1 text-xs">
            <button
              type="button"
              onClick={() => handleSwitchBootloaderPreset("OpenCore")}
              className={`py-1.5 rounded-lg font-semibold transition ${
                !isClover
                  ? "bg-blue-600 text-white shadow"
                  : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              OpenCore
            </button>
            <button
              type="button"
              onClick={() => handleSwitchBootloaderPreset("Clover")}
              className={`py-1.5 rounded-lg font-semibold transition ${
                isClover
                  ? "bg-emerald-600 text-white shadow"
                  : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              🍀 四叶草 Clover
            </button>
          </div>

          {/* Primary 3 Pillars Navigation */}
          <nav className="space-y-1">
            <div className="px-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
              核心工作流
            </div>
            <button
              type="button"
              onClick={() => setActiveModule("editor")}
              className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-xs font-medium transition ${
                activeModule === "editor"
                  ? isClover
                    ? "bg-emerald-600 text-white shadow-md shadow-emerald-600/20"
                    : "bg-blue-600 text-white shadow-md shadow-blue-600/20"
                  : "text-zinc-300 hover:bg-zinc-800/70"
              }`}
            >
              <FileCode2 className="w-4 h-4" />
              <span>可视化编辑与管理 EFI</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveModule("hardware")}
              className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-xs font-medium transition ${
                activeModule === "hardware"
                  ? "bg-blue-600 text-white shadow-md shadow-blue-600/20"
                  : "text-zinc-300 hover:bg-zinc-800/70"
              }`}
            >
              <Cpu className="w-4 h-4" />
              <span>硬件检测与智能生成 EFI</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveModule("toolbox")}
              className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-xs font-medium transition ${
                activeModule === "toolbox"
                  ? "bg-blue-600 text-white shadow-md shadow-blue-600/20"
                  : "text-zinc-300 hover:bg-zinc-800/70"
              }`}
            >
              <Wrench className="w-4 h-4" />
              <span>排错诊断与辅助工具箱</span>
            </button>
          </nav>

          {/* Quick Open / Presets Panel */}
          <div className="space-y-2 pt-2 border-t border-zinc-800/80">
            <div className="px-2 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
              文件与标准模板 (自动识别 OC / 四叶草)
            </div>
            <button
              type="button"
              onClick={handleOpenEfiFolder}
              className="w-full flex items-center gap-2 px-3 py-2 rounded-lg bg-zinc-800/70 hover:bg-zinc-800 text-xs text-zinc-200 transition"
            >
              <FolderOpen className="w-4 h-4 text-blue-400" />
              打开 EFI 文件夹 (OC/Clover)...
            </button>
            <button
              type="button"
              onClick={handleOpenPlistFile}
              className="w-full flex items-center gap-2 px-3 py-2 rounded-lg bg-zinc-800/70 hover:bg-zinc-800 text-xs text-zinc-200 transition"
            >
              <FileCode2 className="w-4 h-4 text-emerald-400" />
              打开单个 config.plist...
            </button>

            <div className="relative">
              <button
                type="button"
                onClick={() => setShowPresetMenu(!showPresetMenu)}
                className="w-full flex items-center justify-between px-3 py-2 rounded-lg bg-zinc-800/40 hover:bg-zinc-800 border border-zinc-800 text-xs text-zinc-300 transition"
              >
                <span className="flex items-center gap-2">
                  <FilePlus2 className="w-4 h-4 text-purple-400" />
                  新建 OpenCore / 四叶草预设
                </span>
              </button>
              {showPresetMenu && (
                <div className="mt-1.5 bg-zinc-950 border border-zinc-700 rounded-xl p-1.5 space-y-1 shadow-xl max-h-64 overflow-y-auto">
                  {presets.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={async () => {
                        const payload = await apiLoadPreset(p.id);
                        loadWorkspace(payload);
                        setActiveModule("editor");
                        setShowPresetMenu(false);
                        pushToast("info", `已载入预设模板: ${p.name}`);
                      }}
                      className="w-full text-left px-2.5 py-2 rounded-lg hover:bg-zinc-800 transition"
                    >
                      <div className="text-xs font-medium text-zinc-100">{p.name}</div>
                      <div className="text-[10px] text-zinc-400 line-clamp-1">{p.subtitle}</div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Bottom Workspace & Snapshot Status */}
        <div className="mt-4 bg-zinc-950/70 border border-zinc-800/80 rounded-xl p-3 space-y-1.5 text-[11px]">
          <div className="flex items-center justify-between text-zinc-400">
            <span
              className={`px-1.5 py-0.5 rounded font-semibold ${
                isClover
                  ? "bg-emerald-500/15 text-emerald-300"
                  : "bg-blue-500/15 text-blue-300"
              }`}
            >
              {isClover ? "🍀 Clover" : "OpenCore"}
            </span>
            {isDirty && <span className="text-amber-400 font-medium">● 未保存修改</span>}
          </div>
          <div className="text-zinc-200 font-medium truncate" title={workspaceTitle}>
            {workspaceTitle}
          </div>
          {backups.length > 0 && (
            <div className="text-emerald-400/90">已保存 {backups.length} 份本地安全快照</div>
          )}
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Action Bar */}
        <header className="h-14 shrink-0 border-b border-zinc-800/80 bg-zinc-900/40 px-5 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowCommandPalette(true)}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-zinc-900 border border-zinc-800 hover:border-zinc-700 text-xs text-zinc-400 w-64"
            >
              <Search className="w-3.5 h-3.5" />
              <span>全局搜索配置项 / 工具...</span>
              <kbd className="ml-auto text-[10px] px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400">
                ⌘K
              </kbd>
            </button>

            <button
              type="button"
              disabled={past.length === 0}
              onClick={undo}
              title="撤销修改"
              className="p-2 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-300 disabled:opacity-35 hover:bg-zinc-800"
            >
              <Undo2 className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              disabled={future.length === 0}
              onClick={redo}
              title="重做修改"
              className="p-2 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-300 disabled:opacity-35 hover:bg-zinc-800"
            >
              <Redo2 className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="flex items-center gap-2.5">
            {/* Validation Status Pill */}
            <button
              type="button"
              onClick={() => setShowIssuesDrawer(!showIssuesDrawer)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition ${
                errorCount > 0
                  ? "bg-rose-950/40 border-rose-500/40 text-rose-300"
                  : warnCount > 0
                  ? "bg-amber-950/40 border-amber-500/40 text-amber-300"
                  : "bg-emerald-950/40 border-emerald-500/40 text-emerald-300"
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
                {isClover ? "四叶草校验" : "OC 校验"}:{" "}
                {errorCount === 0 && warnCount === 0
                  ? "全部通过"
                  : `${errorCount} 错误 · ${warnCount} 提醒`}
              </span>
            </button>

            <button
              type="button"
              onClick={handleSyncOcFolder}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-xs text-zinc-200 transition"
            >
              <FolderSync className="w-3.5 h-3.5 text-blue-400" />
              扫描同步 {isClover ? "CLOVER" : "OC"} 目录
            </button>

            <button
              type="button"
              onClick={() => handleSave(false)}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold text-white transition ${
                isClover
                  ? "bg-emerald-600 hover:bg-emerald-500"
                  : "bg-blue-600 hover:bg-blue-500"
              }`}
            >
              <Save className="w-3.5 h-3.5" />
              保存配置
            </button>

            <button
              type="button"
              onClick={() => handleSave(true)}
              className="px-2.5 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-xs text-zinc-300 transition"
            >
              另存为
            </button>
          </div>
        </header>

        {/* Subbar Tabs in Editor Module */}
        {activeModule === "editor" && !isClover && (
          <div className="px-5 pt-3 pb-2 border-b border-zinc-900 bg-zinc-950/80 flex items-center gap-1.5 overflow-x-auto shrink-0">
            {EDITOR_TABS.map((tab) => {
              const tabIssues = issues.filter(
                (i) => i.section === tab.id && i.severity === "error"
              ).length;
              const active = activeEditorTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveEditorTab(tab.id)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap flex items-center gap-1.5 transition ${
                    active
                      ? "bg-zinc-800 text-white border border-zinc-700"
                      : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900"
                  }`}
                >
                  <span>{tab.label}</span>
                  {tabIssues > 0 && (
                    <span className="px-1.5 py-0.2 rounded-full bg-rose-500/25 text-rose-300 text-[10px]">
                      {tabIssues}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        )}

        {activeModule === "editor" && isClover && (
          <div className="px-5 pt-3 pb-2 border-b border-zinc-900 bg-zinc-950/80 flex items-center gap-1.5 overflow-x-auto shrink-0">
            {CLOVER_TABS.map((tab) => {
              const active = activeCloverTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveCloverTab(tab.id)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition ${
                    active
                      ? "bg-emerald-950/60 text-emerald-200 border border-emerald-500/40"
                      : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900"
                  }`}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>
        )}

        {/* Scrollable Workspace Body */}
        <main className="flex-1 overflow-y-auto p-6">
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
              {activeEditorTab === "XmlPreview" && <XmlSourcePreview />}
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
              {activeCloverTab === "XmlPreview" && <XmlSourcePreview />}
            </>
          )}

          {activeModule === "hardware" && <HardwareWizard />}
          {activeModule === "toolbox" && <ToolboxPanel />}
        </main>
      </div>

      {/* Right Slide-Over Validator Drawer */}
      {showIssuesDrawer && (
        <div className="w-96 shrink-0 border-l border-zinc-800 bg-zinc-900/95 p-4 flex flex-col">
          <div className="flex items-center justify-between pb-3 border-b border-zinc-800">
            <h3 className="text-sm font-semibold text-zinc-100">
              {isClover ? "四叶草 Clover" : "OpenCore"} 配置校验报告 ({issues.length})
            </h3>
            <button
              type="button"
              onClick={() => setShowIssuesDrawer(false)}
              className="p-1 text-zinc-400 hover:text-zinc-100"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto py-3 space-y-3">
            {issues.length === 0 ? (
              <div className="py-12 text-center space-y-2">
                <CheckCircle2 className="w-8 h-8 text-emerald-400 mx-auto" />
                <div className="text-xs font-medium text-zinc-200">所有核心规则校验全部通过！</div>
              </div>
            ) : (
              issues.map((iss) => (
                <div
                  key={iss.id}
                  className={`rounded-xl border p-3 space-y-2 text-xs ${
                    iss.severity === "error"
                      ? "bg-rose-950/25 border-rose-500/35"
                      : iss.severity === "warning"
                      ? "bg-amber-950/25 border-amber-500/35"
                      : "bg-zinc-800/40 border-zinc-700"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-zinc-950 text-zinc-300">
                      {iss.field_path}
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
                      className="text-[11px] text-blue-400 hover:underline"
                    >
                      跳转查看
                    </button>
                  </div>
                  <div className="font-semibold text-zinc-100">{iss.title}</div>
                  <p className="text-[11px] text-zinc-300 leading-relaxed">{iss.message}</p>
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
                      className="w-full py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-medium flex items-center justify-center gap-1"
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

      {/* Toast Notifications */}
      <div className="fixed bottom-5 right-5 z-50 space-y-2 pointer-events-none">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`px-4 py-2.5 rounded-xl border shadow-xl text-xs font-medium backdrop-blur-md pointer-events-auto ${
              t.type === "error"
                ? "bg-rose-950/90 border-rose-500/50 text-rose-200"
                : t.type === "success"
                ? "bg-emerald-950/90 border-emerald-500/50 text-emerald-200"
                : "bg-zinc-900/95 border-zinc-700 text-zinc-100"
            }`}
          >
            {t.text}
          </div>
        ))}
      </div>
    </div>
  );
};

export default App;
