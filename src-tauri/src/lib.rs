pub mod clover;
pub mod community_cases;
pub mod efi_scanner;
pub mod hw_advisor;
pub mod plist_engine;
pub mod presets;
pub mod smbios;
pub mod toolbox;
pub mod validator;

use clover::{
    apply_clover_quick_fix, build_clover_preset_plist, detect_bootloader_kind,
    generate_tailored_clover_efi, list_clover_presets, migrate_clover_to_opencore,
    scan_and_sync_clover_dir, validate_clover_config, BootloaderKind, MigrationSummary,
};
use community_cases::{search_community_cases, CommunityEfiCase};
use efi_scanner::{
    create_snapshot_backup, list_snapshot_backups, resolve_efi_paths, scan_oc_directory,
    sync_scan_into_plist, BackupSnapshot, EfiScanResult,
};
use hw_advisor::{
    evaluate_hardware_compatibility, generate_tailored_efi, list_sample_hardware_profiles,
    probe_current_machine, CompatibilityReport, HardwareProfile,
};
use plist_engine::{load_plist_file, save_plist_file, serialize_plist_xml_string, PlistNode};
use presets::{
    apply_amd_core_patches_to_plist, build_preset_plist, list_presets, PresetMeta,
};
use serde::{Deserialize, Serialize};
use smbios::{generate_smbios_for_model, list_smbios_models, GeneratedSmbios};
use std::path::PathBuf;
use toolbox::{
    analyze_boot_log, list_esp_partitions, mount_esp_partition, search_applealc_codecs,
    AudioCodecEntry, BootLogDiagnosis, EspPartitionInfo,
};
use validator::{apply_quick_fix, validate_config, ValidationIssue};

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct LoadedWorkspacePayload {
    pub title: String,
    pub bootloader: String, // "OpenCore" | "Clover"
    pub config_path: Option<String>,
    pub oc_dir: Option<String>,
    pub plist: PlistNode,
    pub scan: Option<EfiScanResult>,
    pub issues: Vec<ValidationIssue>,
    pub backups: Vec<BackupSnapshot>,
}

#[tauri::command]
fn cmd_list_presets() -> Vec<PresetMeta> {
    let mut all = list_presets();
    all.extend(list_clover_presets());
    all
}

#[tauri::command]
fn cmd_load_preset(preset_id: String) -> LoadedWorkspacePayload {
    let is_clover = preset_id.starts_with("clover_");
    let all = cmd_list_presets();
    let title = all
        .iter()
        .find(|p| p.id == preset_id)
        .map(|p| p.name.clone())
        .unwrap_or_else(|| "标准预设配置".into());

    let plist = if is_clover {
        build_clover_preset_plist(&preset_id)
    } else {
        build_preset_plist(&preset_id)
    };
    let issues = if is_clover {
        validate_clover_config(&plist, None)
    } else {
        validate_config(&plist, None)
    };

    LoadedWorkspacePayload {
        title,
        bootloader: if is_clover { "Clover".into() } else { "OpenCore".into() },
        config_path: None,
        oc_dir: None,
        plist,
        scan: None,
        issues,
        backups: vec![],
    }
}

#[tauri::command]
fn cmd_open_efi_or_plist(path: String) -> Result<LoadedWorkspacePayload, String> {
    let input = PathBuf::from(&path);
    let (bl_dir, config_path) = resolve_efi_paths(&input)?;
    let mut plist = load_plist_file(&config_path)?;
    let kind = detect_bootloader_kind(&plist);

    let (scan, issues) = match kind {
        BootloaderKind::OpenCore => {
            let s = match &bl_dir {
                Some(dir) => Some(scan_oc_directory(dir)?),
                None => None,
            };
            let iss = validate_config(&plist, bl_dir.as_deref());
            (s, iss)
        }
        BootloaderKind::Clover => {
            let s = if let Some(dir) = &bl_dir {
                let (acpi_files, driver_files, kexts) = scan_and_sync_clover_dir(dir, &mut plist)?;
                Some(EfiScanResult {
                    oc_dir: dir.to_string_lossy().to_string(),
                    config_path: config_path.to_string_lossy().to_string(),
                    acpi_files,
                    driver_files,
                    tool_files: vec![],
                    kexts,
                })
            } else {
                None
            };
            let iss = validate_clover_config(&plist, bl_dir.as_deref());
            (s, iss)
        }
    };

    let backups = list_snapshot_backups(&config_path);
    let title = bl_dir
        .as_ref()
        .map(|d| format!("[{}] {}", kind.as_str(), d.to_string_lossy()))
        .unwrap_or_else(|| format!("[{}] {}", kind.as_str(), config_path.to_string_lossy()));

    Ok(LoadedWorkspacePayload {
        title,
        bootloader: kind.as_str().into(),
        config_path: Some(config_path.to_string_lossy().to_string()),
        oc_dir: bl_dir.map(|d| d.to_string_lossy().to_string()),
        plist,
        scan,
        issues,
        backups,
    })
}

#[tauri::command]
fn cmd_save_plist(
    path: String,
    plist: PlistNode,
    create_backup: bool,
) -> Result<Vec<BackupSnapshot>, String> {
    let target = PathBuf::from(&path);
    if create_backup && target.is_file() {
        let _ = create_snapshot_backup(&target)?;
    }
    save_plist_file(&target, &plist)?;
    Ok(list_snapshot_backups(&target))
}

#[tauri::command]
fn cmd_export_plist_xml(plist: PlistNode) -> Result<String, String> {
    serialize_plist_xml_string(&plist)
}

#[tauri::command]
fn cmd_sync_oc_directory(
    oc_dir: String,
    mut plist: PlistNode,
) -> Result<(PlistNode, EfiScanResult, Vec<ValidationIssue>), String> {
    let dir = PathBuf::from(&oc_dir);
    let kind = detect_bootloader_kind(&plist);
    if kind == BootloaderKind::Clover {
        let (acpi_files, driver_files, kexts) = scan_and_sync_clover_dir(&dir, &mut plist)?;
        let scan = EfiScanResult {
            oc_dir: oc_dir.clone(),
            config_path: dir.join("config.plist").to_string_lossy().to_string(),
            acpi_files,
            driver_files,
            tool_files: vec![],
            kexts,
        };
        let issues = validate_clover_config(&plist, Some(&dir));
        return Ok((plist, scan, issues));
    }

    let scan = scan_oc_directory(&dir)?;
    sync_scan_into_plist(&mut plist, &scan);
    let issues = validate_config(&plist, Some(&dir));
    Ok((plist, scan, issues))
}

#[tauri::command]
fn cmd_validate_plist(plist: PlistNode, oc_dir: Option<String>) -> Vec<ValidationIssue> {
    let dir = oc_dir.map(PathBuf::from);
    if detect_bootloader_kind(&plist) == BootloaderKind::Clover {
        validate_clover_config(&plist, dir.as_deref())
    } else {
        validate_config(&plist, dir.as_deref())
    }
}

#[tauri::command]
fn cmd_apply_quick_fix(
    mut plist: PlistNode,
    fix_action: String,
    oc_dir: Option<String>,
) -> Result<(PlistNode, String, Vec<ValidationIssue>), String> {
    let dir = oc_dir.map(PathBuf::from);
    if detect_bootloader_kind(&plist) == BootloaderKind::Clover || fix_action.starts_with("clover_") {
        let msg = apply_clover_quick_fix(&mut plist, &fix_action)?;
        let issues = validate_clover_config(&plist, dir.as_deref());
        return Ok((plist, msg, issues));
    }
    let msg = apply_quick_fix(&mut plist, &fix_action)?;
    let issues = validate_config(&plist, dir.as_deref());
    Ok((plist, msg, issues))
}

#[tauri::command]
fn cmd_apply_amd_vanilla_patches(
    mut plist: PlistNode,
    core_count: u32,
    oc_dir: Option<String>,
) -> (PlistNode, Vec<ValidationIssue>) {
    apply_amd_core_patches_to_plist(&mut plist, core_count);
    let dir = oc_dir.map(PathBuf::from);
    let issues = validate_config(&plist, dir.as_deref());
    (plist, issues)
}

#[tauri::command]
fn cmd_migrate_clover_to_opencore(plist: PlistNode) -> Result<(LoadedWorkspacePayload, Vec<String>), String> {
    let MigrationSummary {
        opencore_plist,
        migrated_notes,
    } = migrate_clover_to_opencore(&plist);
    let issues = validate_config(&opencore_plist, None);
    let payload = LoadedWorkspacePayload {
        title: "[OpenCore] 由四叶草配置无损迁移生成".into(),
        bootloader: "OpenCore".into(),
        config_path: None,
        oc_dir: None,
        plist: opencore_plist,
        scan: None,
        issues,
        backups: vec![],
    };
    Ok((payload, migrated_notes))
}

#[tauri::command]
fn cmd_list_smbios_models() -> Vec<serde_json::Value> {
    list_smbios_models()
}

#[tauri::command]
fn cmd_generate_smbios(model: String) -> GeneratedSmbios {
    generate_smbios_for_model(&model)
}

#[tauri::command]
fn cmd_probe_hardware() -> HardwareProfile {
    probe_current_machine()
}

#[tauri::command]
fn cmd_list_sample_hardware() -> Vec<HardwareProfile> {
    list_sample_hardware_profiles()
}

#[tauri::command]
fn cmd_evaluate_hardware(profile: HardwareProfile) -> CompatibilityReport {
    evaluate_hardware_compatibility(&profile)
}

#[tauri::command]
fn cmd_search_community_cases(
    custom_query: Option<String>,
    profile: Option<HardwareProfile>,
) -> (String, Vec<CommunityEfiCase>) {
    search_community_cases(custom_query.as_deref(), profile.as_ref())
}

#[tauri::command]
fn cmd_generate_efi_from_hardware(
    profile: HardwareProfile,
    output_dir: Option<String>,
    bootloader: Option<String>,
) -> Result<LoadedWorkspacePayload, String> {
    let out_path = output_dir.as_ref().map(PathBuf::from);
    let use_clover = bootloader
        .as_deref()
        .map(|b| b.eq_ignore_ascii_case("clover"))
        .unwrap_or(false);

    if use_clover {
        let (plist, saved_cfg) = generate_tailored_clover_efi(&profile, out_path.as_deref())?;
        let clv_dir_buf = out_path.as_ref().map(|r| r.join("EFI").join("CLOVER"));
        let issues = validate_clover_config(&plist, None);
        return Ok(LoadedWorkspacePayload {
            title: format!("[Clover] 智能生成 — {}", profile.profile_name),
            bootloader: "Clover".into(),
            config_path: saved_cfg,
            oc_dir: clv_dir_buf.map(|d| d.to_string_lossy().to_string()),
            plist,
            scan: None,
            issues,
            backups: vec![],
        });
    }

    let (plist, saved_cfg) = generate_tailored_efi(&profile, out_path.as_deref())?;
    let oc_dir_buf = out_path.as_ref().map(|r| r.join("EFI").join("OC"));
    let issues = validate_config(&plist, None);

    Ok(LoadedWorkspacePayload {
        title: format!("[OpenCore] 智能生成 — {}", profile.profile_name),
        bootloader: "OpenCore".into(),
        config_path: saved_cfg,
        oc_dir: oc_dir_buf.map(|d| d.to_string_lossy().to_string()),
        plist,
        scan: None,
        issues,
        backups: vec![],
    })
}

#[tauri::command]
fn cmd_analyze_boot_log(log_text: String) -> Vec<BootLogDiagnosis> {
    analyze_boot_log(&log_text)
}

#[tauri::command]
fn cmd_search_applealc(query: String) -> Vec<AudioCodecEntry> {
    search_applealc_codecs(&query)
}

#[tauri::command]
fn cmd_list_esp_partitions() -> Result<Vec<EspPartitionInfo>, String> {
    list_esp_partitions()
}

#[tauri::command]
fn cmd_mount_esp_partition(identifier: String) -> Result<String, String> {
    mount_esp_partition(&identifier)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![
            cmd_list_presets,
            cmd_load_preset,
            cmd_open_efi_or_plist,
            cmd_save_plist,
            cmd_export_plist_xml,
            cmd_sync_oc_directory,
            cmd_validate_plist,
            cmd_apply_quick_fix,
            cmd_apply_amd_vanilla_patches,
            cmd_migrate_clover_to_opencore,
            cmd_list_smbios_models,
            cmd_generate_smbios,
            cmd_probe_hardware,
            cmd_list_sample_hardware,
            cmd_evaluate_hardware,
            cmd_search_community_cases,
            cmd_generate_efi_from_hardware,
            cmd_analyze_boot_log,
            cmd_search_applealc,
            cmd_list_esp_partitions,
            cmd_mount_esp_partition,
        ])
        .run(tauri::generate_context!())
        .expect("error while running OpenCore Studio");
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::efi_scanner::{topological_sort_kexts, ScannedKext};
    use crate::plist_engine::{load_plist_bytes, serialize_plist_xml_string};

    #[test]
    fn test_lossless_plist_roundtrip_and_custom_keys() {
        let mut preset = build_preset_plist("intel_10th_desktop");
        preset.set_key(
            "#CustomUserNote".into(),
            PlistNode::String("Keep me intact!".into()),
        );
        let xml = serialize_plist_xml_string(&preset).expect("serialize xml");
        assert!(xml.contains("<key>#CustomUserNote</key>"));
        assert!(xml.contains("BwCbPg=="));

        let parsed = load_plist_bytes(xml.as_bytes()).expect("parse back xml");
        assert_eq!(
            parsed.get("#CustomUserNote").and_then(|v| v.as_str()),
            Some("Keep me intact!")
        );
    }

    #[test]
    fn test_kext_dag_topological_sort() {
        let disordered = vec![
            ScannedKext {
                bundle_path: "SMCProcessor.kext".into(),
                executable_path: "Contents/MacOS/SMCProcessor".into(),
                plist_path: "Contents/Info.plist".into(),
                bundle_id: "as.vit9696.SMCProcessor".into(),
                version: "1.3.4".into(),
                dependencies: vec!["as.vit9696.Lilu".into(), "as.vit9696.VirtualSMC".into()],
            },
            ScannedKext {
                bundle_path: "VirtualSMC.kext".into(),
                executable_path: "Contents/MacOS/VirtualSMC".into(),
                plist_path: "Contents/Info.plist".into(),
                bundle_id: "as.vit9696.VirtualSMC".into(),
                version: "1.3.4".into(),
                dependencies: vec!["as.vit9696.Lilu".into()],
            },
            ScannedKext {
                bundle_path: "Lilu.kext".into(),
                executable_path: "Contents/MacOS/Lilu".into(),
                plist_path: "Contents/Info.plist".into(),
                bundle_id: "as.vit9696.Lilu".into(),
                version: "1.7.0".into(),
                dependencies: vec![],
            },
        ];

        let sorted = topological_sort_kexts(disordered);
        assert_eq!(sorted[0].bundle_path, "Lilu.kext");
        assert_eq!(sorted[1].bundle_path, "VirtualSMC.kext");
    }

    #[test]
    fn test_clover_preset_detect_and_migrate_to_opencore() {
        let mut clover_cfg = build_clover_preset_plist("clover_intel_modern");
        if let Some(boot) = clover_cfg.get_mut("Boot") {
            boot.set_key(
                "Arguments".into(),
                PlistNode::String("-v dart=0 slide=0 -wegnoegpu".into()),
            );
        }
        assert_eq!(detect_bootloader_kind(&clover_cfg), BootloaderKind::Clover);
        let clv_errors: Vec<_> = validate_clover_config(&clover_cfg, None)
            .into_iter()
            .filter(|i| i.severity == "error")
            .collect();
        assert!(clv_errors.is_empty());

        let summary = migrate_clover_to_opencore(&clover_cfg);
        assert_eq!(
            detect_bootloader_kind(&summary.opencore_plist),
            BootloaderKind::OpenCore
        );
        let oc_args = summary
            .opencore_plist
            .get("NVRAM")
            .and_then(|n| n.get("Add"))
            .and_then(|a| a.get("7C436110-AB2A-4BBB-A880-FE41995C9F82"))
            .and_then(|g| g.get("boot-args"))
            .and_then(|s| s.as_str())
            .unwrap_or("");
        assert!(!oc_args.contains("dart=0"));
        assert!(oc_args.contains("-wegnoegpu"));
        assert!(oc_args.contains("alcid=11"));
    }

    #[test]
    fn test_amd_9900x_zen5_preset_and_12_core_patches() {
        let plist = build_preset_plist("amd_ryzen_9900x_zen5");
        let patches = plist
            .get("Kernel")
            .and_then(|k| k.get("Patch"))
            .and_then(|p| p.as_array())
            .expect("Kernel.Patch array");
        assert!(patches.len() >= 4);
        // Verify 12-core (0x0C) Sequoia/Sonoma patch BA0C00000090
        let has_12core_hex = patches.iter().any(|item| {
            item.get("Replace") == Some(&PlistNode::Data("BA0C00000090".into()))
        });
        assert!(has_12core_hex, "9900X preset must contain BA0C00000090 12-core patch");

        let kexts = plist
            .get("Kernel")
            .and_then(|k| k.get("Add"))
            .and_then(|a| a.as_array())
            .expect("Kernel.Add array");
        let has_mce_disabler = kexts.iter().any(|k| {
            k.get("BundlePath").and_then(|b| b.as_str()) == Some("AppleMCEReporterDisabler.kext")
        });
        assert!(has_mce_disabler, "9900X preset must include AppleMCEReporterDisabler.kext");
    }
}
