pub mod efi_scanner;
pub mod hw_advisor;
pub mod plist_engine;
pub mod presets;
pub mod smbios;
pub mod toolbox;
pub mod validator;

use efi_scanner::{
    create_snapshot_backup, list_snapshot_backups, resolve_efi_paths, scan_oc_directory,
    sync_scan_into_plist, BackupSnapshot, EfiScanResult,
};
use hw_advisor::{
    evaluate_hardware_compatibility, generate_tailored_efi, list_sample_hardware_profiles,
    probe_current_machine, CompatibilityReport, HardwareProfile,
};
use plist_engine::{load_plist_file, save_plist_file, serialize_plist_xml_string, PlistNode};
use presets::{build_preset_plist, list_presets, PresetMeta};
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
    pub config_path: Option<String>,
    pub oc_dir: Option<String>,
    pub plist: PlistNode,
    pub scan: Option<EfiScanResult>,
    pub issues: Vec<ValidationIssue>,
    pub backups: Vec<BackupSnapshot>,
}

#[tauri::command]
fn cmd_list_presets() -> Vec<PresetMeta> {
    list_presets()
}

#[tauri::command]
fn cmd_load_preset(preset_id: String) -> LoadedWorkspacePayload {
    let presets = list_presets();
    let title = presets
        .iter()
        .find(|p| p.id == preset_id)
        .map(|p| p.name.clone())
        .unwrap_or_else(|| "OpenCore 标准预设".into());
    let plist = build_preset_plist(&preset_id);
    let issues = validate_config(&plist, None);
    LoadedWorkspacePayload {
        title,
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
    let (oc_dir, config_path) = resolve_efi_paths(&input)?;
    let plist = load_plist_file(&config_path)?;
    let scan = match &oc_dir {
        Some(dir) => Some(scan_oc_directory(dir)?),
        None => None,
    };
    let issues = validate_config(&plist, oc_dir.as_deref());
    let backups = list_snapshot_backups(&config_path);
    let title = oc_dir
        .as_ref()
        .map(|d| d.to_string_lossy().to_string())
        .unwrap_or_else(|| config_path.to_string_lossy().to_string());

    Ok(LoadedWorkspacePayload {
        title,
        config_path: Some(config_path.to_string_lossy().to_string()),
        oc_dir: oc_dir.map(|d| d.to_string_lossy().to_string()),
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
    let scan = scan_oc_directory(&dir)?;
    sync_scan_into_plist(&mut plist, &scan);
    let issues = validate_config(&plist, Some(&dir));
    Ok((plist, scan, issues))
}

#[tauri::command]
fn cmd_validate_plist(plist: PlistNode, oc_dir: Option<String>) -> Vec<ValidationIssue> {
    let dir = oc_dir.map(PathBuf::from);
    validate_config(&plist, dir.as_deref())
}

#[tauri::command]
fn cmd_apply_quick_fix(
    mut plist: PlistNode,
    fix_action: String,
    oc_dir: Option<String>,
) -> Result<(PlistNode, String, Vec<ValidationIssue>), String> {
    let msg = apply_quick_fix(&mut plist, &fix_action)?;
    let dir = oc_dir.map(PathBuf::from);
    let issues = validate_config(&plist, dir.as_deref());
    Ok((plist, msg, issues))
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
fn cmd_generate_efi_from_hardware(
    profile: HardwareProfile,
    output_dir: Option<String>,
) -> Result<LoadedWorkspacePayload, String> {
    let out_path = output_dir.as_ref().map(PathBuf::from);
    let (plist, saved_cfg) = generate_tailored_efi(&profile, out_path.as_deref())?;
    let oc_dir_buf = out_path.as_ref().map(|r| r.join("EFI").join("OC"));
    let issues = validate_config(&plist, None);

    Ok(LoadedWorkspacePayload {
        title: format!("智能生成 — {}", profile.profile_name),
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
            cmd_list_smbios_models,
            cmd_generate_smbios,
            cmd_probe_hardware,
            cmd_list_sample_hardware,
            cmd_evaluate_hardware,
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
        // 07009B3E in Base64 is BwCbPg==
        assert!(xml.contains("BwCbPg=="));

        let parsed = load_plist_bytes(xml.as_bytes()).expect("parse back xml");
        assert_eq!(
            parsed.get("#CustomUserNote").and_then(|v| v.as_str()),
            Some("Keep me intact!")
        );
        let ig_hex = parsed
            .get("DeviceProperties")
            .and_then(|d| d.get("Add"))
            .and_then(|a| a.get("PciRoot(0x0)/Pci(0x2,0x0)"))
            .and_then(|p| p.get("AAPL,ig-platform-id"));
        assert_eq!(ig_hex, Some(&PlistNode::Data("07009B3E".into())));
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
                bundle_path: "WhateverGreen.kext".into(),
                executable_path: "Contents/MacOS/WhateverGreen".into(),
                plist_path: "Contents/Info.plist".into(),
                bundle_id: "as.vit9696.WhateverGreen".into(),
                version: "1.6.9".into(),
                dependencies: vec!["as.vit9696.Lilu".into()],
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
        let smc_pos = sorted.iter().position(|k| k.bundle_path == "SMCProcessor.kext").unwrap();
        let vsmc_pos = sorted.iter().position(|k| k.bundle_path == "VirtualSMC.kext").unwrap();
        assert!(vsmc_pos < smc_pos);
    }

    #[test]
    fn test_hardware_advisor_and_validator_clean() {
        let samples = list_sample_hardware_profiles();
        let legion = &samples[1]; // i7-10750H + RTX 4060 + PM981a
        let report = evaluate_hardware_compatibility(legion);
        assert_eq!(report.overall_status, "caution");
        assert!(report.recommended_boot_args.contains("-wegnoegpu"));

        let (generated_plist, _) = generate_tailored_efi(legion, None).expect("generate efi");
        let errors: Vec<_> = validate_config(&generated_plist, None)
            .into_iter()
            .filter(|i| i.severity == "error")
            .collect();
        assert!(errors.is_empty(), "Expected 0 validation errors, got: {:?}", errors);
    }
}

