import { invoke } from "@tauri-apps/api/core";
import { open, save } from "@tauri-apps/plugin-dialog";
import type {
  AudioCodecEntry,
  BackupSnapshot,
  BootLogDiagnosis,
  CompatibilityReport,
  EfiScanResult,
  EspPartitionInfo,
  GeneratedSmbios,
  HardwareProfile,
  LoadedWorkspacePayload,
  PlistNode,
  PresetMeta,
  SmbiosModelOption,
  ValidationIssue,
} from "../types/opencore";

export const isTauriRuntime = (): boolean =>
  typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

export async function apiListPresets(): Promise<PresetMeta[]> {
  if (!isTauriRuntime()) {
    return [
      {
        id: "intel_10th_desktop",
        name: "Intel 10代酷睿台式机 (Comet Lake)",
        subtitle: "B460 / Z490 主板 · UHD 630 核显或免驱 AMD 独显 · OpenCore 1.0.3 标准结构",
        platform: "Intel Desktop",
        recommended_smbios: "iMac20,1",
      },
      {
        id: "intel_12_14th_desktop",
        name: "Intel 12~14代酷睿台式机 (Alder / Raptor Lake)",
        subtitle: "B660 / B760 / Z690 / Z790 · 含 Comet Lake CPUID 仿冒 + 大小核修复",
        platform: "Intel Hybrid Desktop",
        recommended_smbios: "MacPro7,1",
      },
      {
        id: "amd_ryzen_desktop",
        name: "AMD Ryzen 5000 / 7000 / 9000 台式机",
        subtitle: "B550 / B650 / X670 · 含 AMD Vanilla 补丁架构 + RX 6000 pikera",
        platform: "AMD Desktop",
        recommended_smbios: "MacPro7,1",
      },
    ];
  }
  return invoke<PresetMeta[]>("cmd_list_presets");
}

export async function apiLoadPreset(presetId: string): Promise<LoadedWorkspacePayload> {
  return invoke<LoadedWorkspacePayload>("cmd_load_preset", { presetId });
}

export async function apiPickEfiFolder(): Promise<string | null> {
  const selected = await open({
    directory: true,
    multiple: false,
    title: "选择 EFI 或 EFI/OC 文件夹",
  });
  return typeof selected === "string" ? selected : null;
}

export async function apiPickPlistFile(): Promise<string | null> {
  const selected = await open({
    directory: false,
    multiple: false,
    title: "打开 OpenCore config.plist 文件",
    filters: [{ name: "OpenCore Plist", extensions: ["plist", "xml"] }],
  });
  return typeof selected === "string" ? selected : null;
}

export async function apiPickSavePlistPath(defaultName = "config.plist"): Promise<string | null> {
  const target = await save({
    title: "另存为 config.plist",
    defaultPath: defaultName,
    filters: [{ name: "OpenCore Plist", extensions: ["plist"] }],
  });
  return typeof target === "string" ? target : null;
}

export async function apiOpenEfiOrPlist(path: string): Promise<LoadedWorkspacePayload> {
  return invoke<LoadedWorkspacePayload>("cmd_open_efi_or_plist", { path });
}

export async function apiSavePlist(
  path: string,
  plist: PlistNode,
  createBackup = true
): Promise<BackupSnapshot[]> {
  return invoke<BackupSnapshot[]>("cmd_save_plist", { path, plist, createBackup });
}

export async function apiExportPlistXml(plist: PlistNode): Promise<string> {
  return invoke<string>("cmd_export_plist_xml", { plist });
}

export async function apiSyncOcDirectory(
  ocDir: string,
  plist: PlistNode
): Promise<[PlistNode, EfiScanResult, ValidationIssue[]]> {
  return invoke<[PlistNode, EfiScanResult, ValidationIssue[]]>("cmd_sync_oc_directory", {
    ocDir,
    plist,
  });
}

export async function apiValidatePlist(
  plist: PlistNode,
  ocDir?: string | null
): Promise<ValidationIssue[]> {
  return invoke<ValidationIssue[]>("cmd_validate_plist", {
    plist,
    ocDir: ocDir ?? null,
  });
}

export async function apiApplyQuickFix(
  plist: PlistNode,
  fixAction: string,
  ocDir?: string | null
): Promise<[PlistNode, string, ValidationIssue[]]> {
  return invoke<[PlistNode, string, ValidationIssue[]]>("cmd_apply_quick_fix", {
    plist,
    fixAction,
    ocDir: ocDir ?? null,
  });
}

export async function apiMigrateCloverToOpenCore(
  plist: PlistNode
): Promise<[LoadedWorkspacePayload, string[]]> {
  return invoke<[LoadedWorkspacePayload, string[]]>("cmd_migrate_clover_to_opencore", { plist });
}

export async function apiApplyAmdVanillaPatches(
  plist: PlistNode,
  coreCount: number,
  ocDir?: string | null
): Promise<[PlistNode, ValidationIssue[]]> {
  return invoke<[PlistNode, ValidationIssue[]]>("cmd_apply_amd_vanilla_patches", {
    plist,
    coreCount,
    ocDir: ocDir ?? null,
  });
}

export async function apiListSmbiosModels(): Promise<SmbiosModelOption[]> {
  return invoke<SmbiosModelOption[]>("cmd_list_smbios_models");
}

export async function apiGenerateSmbios(model: string): Promise<GeneratedSmbios> {
  return invoke<GeneratedSmbios>("cmd_generate_smbios", { model });
}

export async function apiProbeHardware(): Promise<HardwareProfile> {
  return invoke<HardwareProfile>("cmd_probe_hardware");
}

export async function apiListSampleHardware(): Promise<HardwareProfile[]> {
  return invoke<HardwareProfile[]>("cmd_list_sample_hardware");
}

export async function apiEvaluateHardware(profile: HardwareProfile): Promise<CompatibilityReport> {
  return invoke<CompatibilityReport>("cmd_evaluate_hardware", { profile });
}

export async function apiGenerateEfiFromHardware(
  profile: HardwareProfile,
  outputDir?: string | null,
  bootloader: "OpenCore" | "Clover" = "OpenCore"
): Promise<LoadedWorkspacePayload> {
  return invoke<LoadedWorkspacePayload>("cmd_generate_efi_from_hardware", {
    profile,
    outputDir: outputDir ?? null,
    bootloader,
  });
}

export async function apiAnalyzeBootLog(logText: string): Promise<BootLogDiagnosis[]> {
  return invoke<BootLogDiagnosis[]>("cmd_analyze_boot_log", { logText });
}

export async function apiSearchAppleAlc(query: string): Promise<AudioCodecEntry[]> {
  return invoke<AudioCodecEntry[]>("cmd_search_applealc", { query });
}

export async function apiListEspPartitions(): Promise<EspPartitionInfo[]> {
  return invoke<EspPartitionInfo[]>("cmd_list_esp_partitions");
}

export async function apiMountEspPartition(identifier: string): Promise<string> {
  return invoke<string>("cmd_mount_esp_partition", { identifier });
}
