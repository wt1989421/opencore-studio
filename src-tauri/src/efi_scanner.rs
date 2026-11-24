use crate::plist_engine::PlistNode;
use plist::Value;
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct ScannedKext {
    pub bundle_path: String,        // Relative to Kexts/, e.g. "Lilu.kext" or "VoodooI2C.kext/Contents/PlugIns/VoodooInput.kext"
    pub executable_path: String,    // e.g. "Contents/MacOS/Lilu" or ""
    pub plist_path: String,         // e.g. "Contents/Info.plist" or "Info.plist"
    pub bundle_id: String,          // CFBundleIdentifier
    pub version: String,            // CFBundleShortVersionString
    pub dependencies: Vec<String>,  // OSBundleLibraries keys
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct EfiScanResult {
    pub oc_dir: String,
    pub config_path: String,
    pub acpi_files: Vec<String>,
    pub driver_files: Vec<String>,
    pub tool_files: Vec<String>,
    pub kexts: Vec<ScannedKext>,
}

/// Resolves either an `EFI` root folder, an `EFI/OC` folder, or a direct `config.plist` path
/// into `(Option<PathBuf> oc_dir, PathBuf config_path)`.
pub fn resolve_efi_paths(input_path: &Path) -> Result<(Option<PathBuf>, PathBuf), String> {
    if input_path.is_file() {
        let oc_dir = input_path.parent().and_then(|p| {
            if p.join("Kexts").is_dir() || p.join("ACPI").is_dir() || p.join("Drivers").is_dir() {
                Some(p.to_path_buf())
            } else {
                None
            }
        });
        return Ok((oc_dir, input_path.to_path_buf()));
    }

    if input_path.is_dir() {
        // Case 1: Selected folder contains EFI/OC/config.plist
        let candidate1 = input_path.join("EFI").join("OC");
        if candidate1.join("config.plist").is_file() {
            let cfg = candidate1.join("config.plist");
            return Ok((Some(candidate1), cfg));
        }
        // Case 2: Selected folder contains OC/config.plist
        let candidate2 = input_path.join("OC");
        if candidate2.join("config.plist").is_file() {
            let cfg = candidate2.join("config.plist");
            return Ok((Some(candidate2), cfg));
        }
        // Case 3: Selected folder IS OC/
        if input_path.join("config.plist").is_file() {
            let cfg = input_path.join("config.plist");
            return Ok((Some(input_path.to_path_buf()), cfg));
        }
        return Err(format!(
            "在所选目录中未找到 EFI/OC/config.plist 或 config.plist: {}",
            input_path.display()
        ));
    }

    Err(format!("路径不存在: {}", input_path.display()))
}

pub fn scan_oc_directory(oc_dir: &Path) -> Result<EfiScanResult, String> {
    let mut acpi_files = Vec::new();
    let acpi_dir = oc_dir.join("ACPI");
    if acpi_dir.is_dir() {
        if let Ok(entries) = std::fs::read_dir(&acpi_dir) {
            for entry in entries.flatten() {
                let name = entry.file_name().to_string_lossy().to_string();
                if !name.starts_with('.')
                    && (name.ends_with(".aml") || name.ends_with(".bin"))
                    && entry.path().is_file()
                {
                    acpi_files.push(name);
                }
            }
        }
    }
    acpi_files.sort();

    let mut driver_files = Vec::new();
    let drivers_dir = oc_dir.join("Drivers");
    if drivers_dir.is_dir() {
        if let Ok(entries) = std::fs::read_dir(&drivers_dir) {
            for entry in entries.flatten() {
                let name = entry.file_name().to_string_lossy().to_string();
                if !name.starts_with('.') && name.ends_with(".efi") && entry.path().is_file() {
                    driver_files.push(name);
                }
            }
        }
    }
    driver_files.sort();

    let mut tool_files = Vec::new();
    let tools_dir = oc_dir.join("Tools");
    if tools_dir.is_dir() {
        if let Ok(entries) = std::fs::read_dir(&tools_dir) {
            for entry in entries.flatten() {
                let name = entry.file_name().to_string_lossy().to_string();
                if !name.starts_with('.') && name.ends_with(".efi") && entry.path().is_file() {
                    tool_files.push(name);
                }
            }
        }
    }
    tool_files.sort();

    let kexts_dir = oc_dir.join("Kexts");
    let mut raw_kexts = Vec::new();
    if kexts_dir.is_dir() {
        collect_kexts_in_dir(&kexts_dir, &kexts_dir, &mut raw_kexts);
    }

    let sorted_kexts = topological_sort_kexts(raw_kexts);

    Ok(EfiScanResult {
        oc_dir: oc_dir.to_string_lossy().to_string(),
        config_path: oc_dir.join("config.plist").to_string_lossy().to_string(),
        acpi_files,
        driver_files,
        tool_files,
        kexts: sorted_kexts,
    })
}

fn collect_kexts_in_dir(base_kexts_dir: &Path, current_dir: &Path, out: &mut Vec<ScannedKext>) {
    let Ok(entries) = std::fs::read_dir(current_dir) else {
        return;
    };
    let mut paths: Vec<PathBuf> = entries.flatten().map(|e| e.path()).collect();
    paths.sort();

    for path in paths {
        let Some(name) = path.file_name().map(|n| n.to_string_lossy().to_string()) else {
            continue;
        };
        if name.starts_with('.') || !name.ends_with(".kext") || !path.is_dir() {
            continue;
        }
        if let Some(scanned) = inspect_kext_bundle(base_kexts_dir, &path) {
            out.push(scanned);
        }
        // Check nested PlugIns directory inside the .kext
        let plugins_dir = path.join("Contents").join("PlugIns");
        if plugins_dir.is_dir() {
            collect_kexts_in_dir(base_kexts_dir, &plugins_dir, out);
        }
    }
}

fn inspect_kext_bundle(base_kexts_dir: &Path, kext_path: &Path) -> Option<ScannedKext> {
    let rel_bundle = kext_path
        .strip_prefix(base_kexts_dir)
        .ok()?
        .to_string_lossy()
        .replace('\\', "/");

    let (plist_rel, plist_full) = if kext_path.join("Contents").join("Info.plist").is_file() {
        (
            "Contents/Info.plist".to_string(),
            kext_path.join("Contents").join("Info.plist"),
        )
    } else if kext_path.join("Info.plist").is_file() {
        ("Info.plist".to_string(), kext_path.join("Info.plist"))
    } else {
        return None;
    };

    let val = Value::from_file(&plist_full).ok()?;
    let dict = val.as_dictionary()?;

    let bundle_id = dict
        .get("CFBundleIdentifier")
        .and_then(|v| v.as_string())
        .unwrap_or("")
        .to_string();

    let version = dict
        .get("CFBundleShortVersionString")
        .or_else(|| dict.get("CFBundleVersion"))
        .and_then(|v| v.as_string())
        .unwrap_or("Unknown")
        .to_string();

    let exec_name = dict
        .get("CFBundleExecutable")
        .and_then(|v| v.as_string())
        .unwrap_or("");

    let executable_path = if !exec_name.is_empty() {
        let candidate_contents = kext_path.join("Contents").join("MacOS").join(exec_name);
        let candidate_root = kext_path.join(exec_name);
        if candidate_contents.is_file() {
            format!("Contents/MacOS/{}", exec_name)
        } else if candidate_root.is_file() {
            exec_name.to_string()
        } else {
            String::new()
        }
    } else {
        String::new()
    };

    let mut dependencies = Vec::new();
    if let Some(libs) = dict.get("OSBundleLibraries").and_then(|v| v.as_dictionary()) {
        for dep_bundle_id in libs.keys() {
            if !dep_bundle_id.starts_with("com.apple.") {
                dependencies.push(dep_bundle_id.clone());
            }
        }
    }

    // Ensure nested plugin kext depends on its parent kext if parent has a bundle ID
    Some(ScannedKext {
        bundle_path: rel_bundle,
        executable_path,
        plist_path: plist_rel,
        bundle_id,
        version,
        dependencies,
    })
}

/// Priority tier for core Hackintosh kexts + Kahn/DFS topological sort on `OSBundleLibraries`.
pub fn topological_sort_kexts(kexts: Vec<ScannedKext>) -> Vec<ScannedKext> {
    fn priority_score(bundle_path: &str, bundle_id: &str) -> i32 {
        let lower = bundle_path.to_lowercase();
        if lower == "lilu.kext" || bundle_id == "as.vit9696.Lilu" {
            return 0;
        }
        if lower == "virtualsmc.kext" || bundle_id == "as.vit9696.VirtualSMC" {
            return 10;
        }
        if lower.contains("whatevergreen") {
            return 20;
        }
        if lower.contains("applealc") {
            return 25;
        }
        if lower.starts_with("smc") || lower.contains("virtualsmc") {
            return 30;
        }
        if lower.contains("voodooinput") || lower.contains("voodoops2controller.kext") || lower.contains("voodooi2c.kext") && !lower.contains("/plugins/") {
            return 40;
        }
        if lower.contains("/plugins/") {
            return 60;
        }
        50
    }

    let mut items = kexts;
    items.sort_by(|a, b| {
        priority_score(&a.bundle_path, &a.bundle_id)
            .cmp(&priority_score(&b.bundle_path, &b.bundle_id))
            .then_with(|| a.bundle_path.cmp(&b.bundle_path))
    });

    let id_to_idx: HashMap<String, usize> = items
        .iter()
        .enumerate()
        .filter(|(_, k)| !k.bundle_id.is_empty())
        .map(|(i, k)| (k.bundle_id.clone(), i))
        .collect();

    let path_to_idx: HashMap<String, usize> = items
        .iter()
        .enumerate()
        .map(|(i, k)| (k.bundle_path.clone(), i))
        .collect();

    let n = items.len();
    let mut visited = vec![0u8; n]; // 0 = unvisited, 1 = visiting, 2 = visited
    let mut result_indices = Vec::with_capacity(n);

    fn dfs(
        idx: usize,
        items: &[ScannedKext],
        id_to_idx: &HashMap<String, usize>,
        path_to_idx: &HashMap<String, usize>,
        visited: &mut [u8],
        out: &mut Vec<usize>,
    ) {
        if visited[idx] == 2 || visited[idx] == 1 {
            return;
        }
        visited[idx] = 1;

        // Parent bundle must precede nested PlugIn bundle
        if let Some((parent_prefix, _)) = items[idx].bundle_path.split_once("/Contents/PlugIns/") {
            if let Some(&parent_idx) = path_to_idx.get(parent_prefix) {
                dfs(parent_idx, items, id_to_idx, path_to_idx, visited, out);
            }
        }

        // Declared OSBundleLibraries dependencies must precede this kext
        for dep_id in &items[idx].dependencies {
            if let Some(&dep_idx) = id_to_idx.get(dep_id) {
                dfs(dep_idx, items, id_to_idx, path_to_idx, visited, out);
            }
        }

        visited[idx] = 2;
        out.push(idx);
    }

    for i in 0..n {
        if visited[i] == 0 {
            dfs(i, &items, &id_to_idx, &path_to_idx, &mut visited, &mut result_indices);
        }
    }

    result_indices.into_iter().map(|i| items[i].clone()).collect()
}

/// Synchronizes scanned EFI directory files (`ACPI`, `Drivers`, `Kexts`, `Tools`) into `config.plist`
/// while preserving any user-configured comments/arguments/kernel ranges on already-existing items.
pub fn sync_scan_into_plist(plist: &mut PlistNode, scan: &EfiScanResult) {
    // 1. Sync ACPI -> Add
    if let Some(acpi) = plist.get_mut("ACPI") {
        let existing_map: HashMap<String, PlistNode> = acpi
            .get("Add")
            .and_then(|n| n.as_array())
            .map(|arr| {
                arr.iter()
                    .filter_map(|item| {
                        let p = item.get("Path")?.as_str()?.to_string();
                        Some((p, item.clone()))
                    })
                    .collect()
            })
            .unwrap_or_default();

        let mut new_add = Vec::new();
        let mut seen = HashSet::new();
        for file in &scan.acpi_files {
            seen.insert(file.clone());
            if let Some(existing) = existing_map.get(file) {
                new_add.push(existing.clone());
            } else {
                new_add.push(PlistNode::Dict(vec![
                    ("Comment".into(), PlistNode::String(format!("Auto-synced {}", file))),
                    ("Enabled".into(), PlistNode::Boolean(true)),
                    ("Path".into(), PlistNode::String(file.clone())),
                ]));
            }
        }
        acpi.set_key("Add", PlistNode::Array(new_add));
    }

    // 2. Sync Kernel -> Add (in topological dependency order!)
    if let Some(kernel) = plist.get_mut("Kernel") {
        let existing_map: HashMap<String, PlistNode> = kernel
            .get("Add")
            .and_then(|n| n.as_array())
            .map(|arr| {
                arr.iter()
                    .filter_map(|item| {
                        let p = item.get("BundlePath")?.as_str()?.to_string();
                        Some((p, item.clone()))
                    })
                    .collect()
            })
            .unwrap_or_default();

        let mut new_kexts = Vec::new();
        for k in &scan.kexts {
            if let Some(mut existing) = existing_map.get(&k.bundle_path).cloned() {
                existing.set_key("ExecutablePath", PlistNode::String(k.executable_path.clone()));
                existing.set_key("PlistPath", PlistNode::String(k.plist_path.clone()));
                new_kexts.push(existing);
            } else {
                new_kexts.push(PlistNode::Dict(vec![
                    ("Arch".into(), PlistNode::String("Any".into())),
                    ("BundlePath".into(), PlistNode::String(k.bundle_path.clone())),
                    ("Comment".into(), PlistNode::String(format!("{} ({})", k.bundle_id, k.version))),
                    ("Enabled".into(), PlistNode::Boolean(true)),
                    ("ExecutablePath".into(), PlistNode::String(k.executable_path.clone())),
                    ("MaxKernel".into(), PlistNode::String(String::new())),
                    ("MinKernel".into(), PlistNode::String(String::new())),
                    ("PlistPath".into(), PlistNode::String(k.plist_path.clone())),
                ]));
            }
        }
        kernel.set_key("Add", PlistNode::Array(new_kexts));
    }

    // 3. Sync UEFI -> Drivers
    if let Some(uefi) = plist.get_mut("UEFI") {
        let existing_map: HashMap<String, PlistNode> = uefi
            .get("Drivers")
            .and_then(|n| n.as_array())
            .map(|arr| {
                arr.iter()
                    .filter_map(|item| match item {
                        PlistNode::Dict(_) => {
                            let p = item.get("Path")?.as_str()?.to_string();
                            Some((p, item.clone()))
                        }
                        PlistNode::String(s) => Some((
                            s.clone(),
                            PlistNode::Dict(vec![
                                ("Arguments".into(), PlistNode::String(String::new())),
                                ("Comment".into(), PlistNode::String(s.clone())),
                                ("Enabled".into(), PlistNode::Boolean(true)),
                                ("LoadEarly".into(), PlistNode::Boolean(false)),
                                ("Path".into(), PlistNode::String(s.clone())),
                            ]),
                        )),
                        _ => None,
                    })
                    .collect()
            })
            .unwrap_or_default();

        let mut new_drivers = Vec::new();
        for drv in &scan.driver_files {
            if let Some(existing) = existing_map.get(drv) {
                new_drivers.push(existing.clone());
            } else {
                new_drivers.push(PlistNode::Dict(vec![
                    ("Arguments".into(), PlistNode::String(String::new())),
                    ("Comment".into(), PlistNode::String(drv.clone())),
                    ("Enabled".into(), PlistNode::Boolean(true)),
                    ("LoadEarly".into(), PlistNode::Boolean(false)),
                    ("Path".into(), PlistNode::String(drv.clone())),
                ]));
            }
        }
        uefi.set_key("Drivers", PlistNode::Array(new_drivers));
    }

    // 4. Sync Misc -> Tools
    if let Some(misc) = plist.get_mut("Misc") {
        let existing_map: HashMap<String, PlistNode> = misc
            .get("Tools")
            .and_then(|n| n.as_array())
            .map(|arr| {
                arr.iter()
                    .filter_map(|item| {
                        let p = item.get("Path")?.as_str()?.to_string();
                        Some((p, item.clone()))
                    })
                    .collect()
            })
            .unwrap_or_default();

        let mut new_tools = Vec::new();
        for tool in &scan.tool_files {
            if let Some(existing) = existing_map.get(tool) {
                new_tools.push(existing.clone());
            } else {
                new_tools.push(PlistNode::Dict(vec![
                    ("Arguments".into(), PlistNode::String(String::new())),
                    ("Auxiliary".into(), PlistNode::Boolean(true)),
                    ("Comment".into(), PlistNode::String(tool.clone())),
                    ("Enabled".into(), PlistNode::Boolean(true)),
                    ("Flavour".into(), PlistNode::String("Auto".into())),
                    ("FullNvramAccess".into(), PlistNode::Boolean(false)),
                    ("Name".into(), PlistNode::String(tool.trim_end_matches(".efi").into())),
                    ("Path".into(), PlistNode::String(tool.clone())),
                    ("RealPath".into(), PlistNode::Boolean(false)),
                    ("TextMode".into(), PlistNode::Boolean(false)),
                ]));
            }
        }
        misc.set_key("Tools", PlistNode::Array(new_tools));
    }
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct BackupSnapshot {
    pub filename: String,
    pub full_path: String,
    pub created_at: String,
    pub size_bytes: u64,
}

pub fn create_snapshot_backup(config_path: &Path) -> Result<Option<BackupSnapshot>, String> {
    if !config_path.is_file() {
        return Ok(None);
    }
    let parent = config_path.parent().ok_or("无效的配置文件目录")?;
    let backup_dir = parent.join(".ocstudio-backups");
    std::fs::create_dir_all(&backup_dir)
        .map_err(|e| format!("创建备份目录失败: {}", e))?;

    let now = chrono::Local::now();
    let filename = format!("config_{}.plist", now.format("%Y%m%d_%H%M%S"));
    let dest = backup_dir.join(&filename);
    std::fs::copy(config_path, &dest).map_err(|e| format!("备份配置文件失败: {}", e))?;
    let size_bytes = std::fs::metadata(&dest).map(|m| m.len()).unwrap_or(0);

    Ok(Some(BackupSnapshot {
        filename,
        full_path: dest.to_string_lossy().to_string(),
        created_at: now.format("%Y-%m-%d %H:%M:%S").to_string(),
        size_bytes,
    }))
}

pub fn list_snapshot_backups(config_path: &Path) -> Vec<BackupSnapshot> {
    let Some(parent) = config_path.parent() else {
        return Vec::new();
    };
    let backup_dir = parent.join(".ocstudio-backups");
    let Ok(entries) = std::fs::read_dir(&backup_dir) else {
        return Vec::new();
    };

    let mut list = Vec::new();
    for entry in entries.flatten() {
        let p = entry.path();
        let name = entry.file_name().to_string_lossy().to_string();
        if name.ends_with(".plist") && p.is_file() {
            let meta = std::fs::metadata(&p).ok();
            let size_bytes = meta.as_ref().map(|m| m.len()).unwrap_or(0);
            let created_at = name
                .trim_start_matches("config_")
                .trim_end_matches(".plist")
                .replace('_', " ");
            list.push(BackupSnapshot {
                filename: name,
                full_path: p.to_string_lossy().to_string(),
                created_at,
                size_bytes,
            });
        }
    }
    list.sort_by(|a, b| b.filename.cmp(&a.filename));
    list
}
