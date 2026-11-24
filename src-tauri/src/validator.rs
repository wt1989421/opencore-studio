use crate::plist_engine::PlistNode;
use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::path::Path;

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct ValidationIssue {
    pub id: String,
    pub severity: String, // "error" | "warning" | "info"
    pub section: String,  // e.g. "Booter", "Kernel", "UEFI", "PlatformInfo", "NVRAM", "ACPI", "Misc"
    pub field_path: String,
    pub title: String,
    pub message: String,
    pub fix_action: Option<String>, // Optional machine-actionable fix ID
}

pub fn validate_config(plist: &PlistNode, oc_dir: Option<&Path>) -> Vec<ValidationIssue> {
    let mut issues = Vec::new();

    let required_sections = [
        "ACPI",
        "Booter",
        "DeviceProperties",
        "Kernel",
        "Misc",
        "NVRAM",
        "PlatformInfo",
        "UEFI",
    ];

    for sec in required_sections {
        if plist.get(sec).is_none() {
            issues.push(ValidationIssue {
                id: format!("missing_section_{}", sec),
                severity: "error".into(),
                section: sec.into(),
                field_path: sec.into(),
                title: format!("缺少顶级配置节点 {}", sec),
                message: format!(
                    "标准 OpenCore config.plist 必须包含 {} 字典节点，缺失会导致引导时触发 OCS Schema 报错。",
                    sec
                ),
                fix_action: None,
            });
        }
    }

    // 1. Booter Quirks conflict checks
    if let Some(booter_quirks) = plist.get("Booter").and_then(|b| b.get("Quirks")) {
        let ewu = booter_quirks
            .get("EnableWriteUnprotector")
            .and_then(|v| v.as_bool())
            .unwrap_or(false);
        let ramm = booter_quirks
            .get("RebuildAppleMemoryMap")
            .and_then(|v| v.as_bool())
            .unwrap_or(false);
        let srp = booter_quirks
            .get("SyncRuntimePermissions")
            .and_then(|v| v.as_bool())
            .unwrap_or(false);

        if ewu && ramm {
            issues.push(ValidationIssue {
                id: "booter_ewu_ramm_conflict".into(),
                severity: "error".into(),
                section: "Booter".into(),
                field_path: "Booter.Quirks.EnableWriteUnprotector".into(),
                title: "EnableWriteUnprotector 与 RebuildAppleMemoryMap 互斥冲突".into(),
                message: "这两个内存映射 Quirk 不能同时开启！10代及更新平台（以及 AMD Zen+）应关闭 EnableWriteUnprotector 并开启 RebuildAppleMemoryMap + SyncRuntimePermissions；老平台则相反。".into(),
                fix_action: Some("disable_enable_write_unprotector".into()),
            });
        }

        if ramm && !srp {
            issues.push(ValidationIssue {
                id: "booter_ramm_without_srp".into(),
                severity: "warning".into(),
                section: "Booter".into(),
                field_path: "Booter.Quirks.SyncRuntimePermissions".into(),
                title: "开启 RebuildAppleMemoryMap 时建议同步开启 SyncRuntimePermissions".into(),
                message: "现代主板固件（尤其是 300系以后 Intel 及 AMD 主板）在使用 RebuildAppleMemoryMap 时，若不开启 SyncRuntimePermissions 极易卡在 [EB|#LOG:EXITBS:START]。".into(),
                fix_action: Some("enable_sync_runtime_permissions".into()),
            });
        }
    }

    // 2. Kernel -> Add kext order & file existence checks
    if let Some(kernel) = plist.get("Kernel") {
        if let Some(kexts) = kernel.get("Add").and_then(|k| k.as_array()) {
            let mut seen_bundles = HashSet::new();
            let mut lilu_index: Option<usize> = None;
            let mut virtualsmc_index: Option<usize> = None;

            for (idx, item) in kexts.iter().enumerate() {
                let enabled = item.get("Enabled").and_then(|v| v.as_bool()).unwrap_or(false);
                let bundle = item
                    .get("BundlePath")
                    .and_then(|v| v.as_str())
                    .unwrap_or("");
                if bundle.is_empty() {
                    continue;
                }

                if !seen_bundles.insert(bundle.to_lowercase()) {
                    issues.push(ValidationIssue {
                        id: format!("dup_kext_{}", idx),
                        severity: "error".into(),
                        section: "Kernel".into(),
                        field_path: format!("Kernel.Add[{}].BundlePath", idx),
                        title: format!("重复注入驱动: {}", bundle),
                        message: "Kernel -> Add 中存在重复的 BundlePath，OpenCore 引导时会报重复加载错误。".into(),
                        fix_action: None,
                    });
                }

                if enabled {
                    let lower = bundle.to_lowercase();
                    if lower == "lilu.kext" {
                        lilu_index = Some(idx);
                    }
                    if lower == "virtualsmc.kext" {
                        virtualsmc_index = Some(idx);
                    }

                    // Check if Lilu plugin appears before Lilu.kext
                    let is_lilu_plugin = lower.contains("whatevergreen")
                        || lower.contains("applealc")
                        || lower == "virtualsmc.kext"
                        || lower.contains("nvmefix")
                        || lower.contains("restrictEvents".to_lowercase().as_str())
                        || lower.contains("cpufriend");

                    if is_lilu_plugin && lilu_index.is_none() {
                        issues.push(ValidationIssue {
                            id: format!("kext_order_before_lilu_{}", bundle),
                            severity: "error".into(),
                            section: "Kernel".into(),
                            field_path: "Kernel.Add".into(),
                            title: format!("驱动加载顺序错误：{} 排在了 Lilu.kext 之前（或缺失 Lilu）", bundle),
                            message: "Lilu.kext 必须排在所有依赖插件（VirtualSMC、WhateverGreen、AppleALC、NVMeFix 等）之前，否则驱动无法生效甚至导致五国死机。".into(),
                            fix_action: Some("sort_kexts".into()),
                        });
                    }

                    let is_smc_plugin = lower.starts_with("smc") && lower.ends_with(".kext");
                    if is_smc_plugin && virtualsmc_index.is_none() {
                        issues.push(ValidationIssue {
                            id: format!("kext_order_before_vsmc_{}", bundle),
                            severity: "error".into(),
                            section: "Kernel".into(),
                            field_path: "Kernel.Add".into(),
                            title: format!("传感器插件 {} 排在了 VirtualSMC.kext 之前", bundle),
                            message: "所有 SMC* 传感器插件必须在 VirtualSMC.kext 之后加载。可使用「拓扑排序驱动」一键修正。".into(),
                            fix_action: Some("sort_kexts".into()),
                        });
                    }

                    if let Some(oc) = oc_dir {
                        let kext_disk = oc.join("Kexts").join(bundle);
                        if !kext_disk.exists() {
                            issues.push(ValidationIssue {
                                id: format!("missing_kext_disk_{}", bundle),
                                severity: "error".into(),
                                section: "Kernel".into(),
                                field_path: format!("Kernel.Add[{}].BundlePath", idx),
                                title: format!("磁盘上缺少驱动文件: Kexts/{}", bundle),
                                message: "config.plist 已启用该驱动，但在 EFI/OC/Kexts 目录下未找到对应文件，会导致启动报错。".into(),
                                fix_action: None,
                            });
                        }
                    }
                }
            }

            if virtualsmc_index.is_none() {
                issues.push(ValidationIssue {
                    id: "missing_virtualsmc".into(),
                    severity: "error".into(),
                    section: "Kernel".into(),
                    field_path: "Kernel.Add".into(),
                    title: "未启用 VirtualSMC.kext（黑苹果必需核心驱动）".into(),
                    message: "几乎所有黑苹果都必须加载 VirtualSMC.kext 模拟苹果 SMC 芯片，否则将卡在 DSMOS has arrived 之前无法进入系统。".into(),
                    fix_action: None,
                });
            }
        }
    }

    // 3. UEFI -> Drivers essential checks
    if let Some(drivers) = plist
        .get("UEFI")
        .and_then(|u| u.get("Drivers"))
        .and_then(|d| d.as_array())
    {
        let mut has_openruntime = false;
        let mut has_hfs = false;

        for drv in drivers {
            let (path, enabled) = match drv {
                PlistNode::Dict(_) => (
                    drv.get("Path").and_then(|v| v.as_str()).unwrap_or(""),
                    drv.get("Enabled").and_then(|v| v.as_bool()).unwrap_or(true),
                ),
                PlistNode::String(s) => (s.as_str(), true),
                _ => ("", false),
            };
            if !enabled {
                continue;
            }
            let lower = path.to_lowercase();
            if lower == "openruntime.efi" {
                has_openruntime = true;
            }
            if lower.contains("hfsplus") || lower.contains("openhfsplus") || lower.contains("vboxhfs") {
                has_hfs = true;
            }
        }

        if !has_openruntime {
            issues.push(ValidationIssue {
                id: "missing_openruntime".into(),
                severity: "error".into(),
                section: "UEFI".into(),
                field_path: "UEFI.Drivers".into(),
                title: "缺少核心固件驱动 OpenRuntime.efi".into(),
                message: "OpenRuntime.efi 是 OpenCore 内存修复、NVRAM 模拟与系统引导的核心依赖，必须启用！".into(),
                fix_action: Some("add_openruntime_driver".into()),
            });
        }

        if !has_hfs {
            issues.push(ValidationIssue {
                id: "missing_hfsplus".into(),
                severity: "warning".into(),
                section: "UEFI".into(),
                field_path: "UEFI.Drivers".into(),
                title: "未检测到 HfsPlus.efi / OpenHfsPlus.efi".into(),
                message: "缺少 HFS+ 文件系统驱动会导致 OpenCore 启动菜单看不到 macOS 恢复盘/安装U盘分区。".into(),
                fix_action: Some("add_hfsplus_driver".into()),
            });
        }
    }

    // 4. PlatformInfo -> Generic SMBIOS checks
    if let Some(generic) = plist.get("PlatformInfo").and_then(|p| p.get("Generic")) {
        let serial = generic
            .get("SystemSerialNumber")
            .and_then(|v| v.as_str())
            .unwrap_or("");
        let mlb = generic.get("MLB").and_then(|v| v.as_str()).unwrap_or("");
        let uuid = generic
            .get("SystemUUID")
            .and_then(|v| v.as_str())
            .unwrap_or("");
        let rom = match generic.get("ROM") {
            Some(PlistNode::Data(hex)) => hex.as_str(),
            _ => "",
        };

        if serial.is_empty() || serial.starts_with("W0000") || serial.contains("CHANGE") {
            issues.push(ValidationIssue {
                id: "invalid_smbios_serial".into(),
                severity: "warning".into(),
                section: "PlatformInfo".into(),
                field_path: "PlatformInfo.Generic.SystemSerialNumber".into(),
                title: "SMBIOS 三码仍为默认占位值或为空".into(),
                message: "请前往「PlatformInfo / 三码生成器」生成合规的序列号、MLB 与 SystemUUID，否则无法登录 Apple ID / iMessage / FaceTime。".into(),
                fix_action: Some("generate_smbios".into()),
            });
        } else if mlb.is_empty() || uuid.is_empty() {
            issues.push(ValidationIssue {
                id: "incomplete_smbios".into(),
                severity: "warning".into(),
                section: "PlatformInfo".into(),
                field_path: "PlatformInfo.Generic".into(),
                title: "MLB 主板序列号或 SystemUUID 不完整".into(),
                message: "三码（SystemSerialNumber、MLB、SystemUUID）缺一不可，建议一键重新生成完整三码。".into(),
                fix_action: Some("generate_smbios".into()),
            });
        }

        if rom == "112233445566" || rom.is_empty() {
            issues.push(ValidationIssue {
                id: "default_rom_mac".into(),
                severity: "info".into(),
                section: "PlatformInfo".into(),
                field_path: "PlatformInfo.Generic.ROM".into(),
                title: "ROM 地址为默认测试值 (112233445566)".into(),
                message: "若需要使用 iMessage / FaceTime 等苹果连续互通服务，建议填入本机有线网卡真实 MAC 地址或生成 Apple OUI 随机 ROM。".into(),
                fix_action: Some("generate_smbios".into()),
            });
        }
    }

    // 5. Misc -> Security Vault check (Vault = Optional is required unless signed!)
    if let Some(security) = plist.get("Misc").and_then(|m| m.get("Security")) {
        let vault = security
            .get("Vault")
            .and_then(|v| v.as_str())
            .unwrap_or("Optional");
        if vault != "Optional" {
            issues.push(ValidationIssue {
                id: "misc_vault_not_optional".into(),
                severity: "error".into(),
                section: "Misc".into(),
                field_path: "Misc.Security.Vault".into(),
                title: format!("Misc -> Security -> Vault 当前为 '{}'，未签名会直接无法开机！", vault),
                message: "除非你手动使用 CreateVault 对 EFI 进行了 RSA 签名，否则 Vault 必须设为 'Optional'，否则开机直接黑屏报错 `OC: Invalid Vault mode`！".into(),
                fix_action: Some("set_vault_optional".into()),
            });
        }
    }

    // 6. ACPI Disk existence check
    if let (Some(oc), Some(acpi_add)) = (
        oc_dir,
        plist
            .get("ACPI")
            .and_then(|a| a.get("Add"))
            .and_then(|a| a.as_array()),
    ) {
        for (idx, item) in acpi_add.iter().enumerate() {
            let enabled = item.get("Enabled").and_then(|v| v.as_bool()).unwrap_or(false);
            let path = item.get("Path").and_then(|v| v.as_str()).unwrap_or("");
            if enabled && !path.is_empty() && !oc.join("ACPI").join(path).is_file() {
                issues.push(ValidationIssue {
                    id: format!("missing_acpi_{}", path),
                    severity: "error".into(),
                    section: "ACPI".into(),
                    field_path: format!("ACPI.Add[{}].Path", idx),
                    title: format!("磁盘缺少 ACPI 表文件: ACPI/{}", path),
                    message: "config.plist 中已启用该 SSDT/DSDT 文件，但 EFI/OC/ACPI 目录中不存在该文件。".into(),
                    fix_action: None,
                });
            }
        }
    }

    issues
}

/// Applies a one-click automated fix to `config.plist` for known `fix_action` IDs.
pub fn apply_quick_fix(plist: &mut PlistNode, fix_action: &str) -> Result<String, String> {
    match fix_action {
        "disable_enable_write_unprotector" => {
            if let Some(quirks) = plist.get_mut("Booter").and_then(|b| b.get_mut("Quirks")) {
                quirks.set_key("EnableWriteUnprotector", PlistNode::Boolean(false));
                quirks.set_key("RebuildAppleMemoryMap", PlistNode::Boolean(true));
                quirks.set_key("SyncRuntimePermissions", PlistNode::Boolean(true));
                return Ok("已关闭 EnableWriteUnprotector 并启用 RebuildAppleMemoryMap + SyncRuntimePermissions".into());
            }
        }
        "enable_sync_runtime_permissions" => {
            if let Some(quirks) = plist.get_mut("Booter").and_then(|b| b.get_mut("Quirks")) {
                quirks.set_key("SyncRuntimePermissions", PlistNode::Boolean(true));
                return Ok("已启用 Booter -> Quirks -> SyncRuntimePermissions".into());
            }
        }
        "set_vault_optional" => {
            if let Some(sec) = plist.get_mut("Misc").and_then(|m| m.get_mut("Security")) {
                sec.set_key("Vault", PlistNode::String("Optional".into()));
                return Ok("已将 Misc -> Security -> Vault 设为 Optional".into());
            }
        }
        "add_openruntime_driver" => {
            if let Some(uefi) = plist.get_mut("UEFI") {
                let mut arr = uefi
                    .get("Drivers")
                    .and_then(|d| d.as_array())
                    .map(|s| s.to_vec())
                    .unwrap_or_default();
                arr.insert(
                    0,
                    PlistNode::Dict(vec![
                        ("Arguments".into(), PlistNode::String(String::new())),
                        ("Comment".into(), PlistNode::String("OpenCore Runtime Services".into())),
                        ("Enabled".into(), PlistNode::Boolean(true)),
                        ("LoadEarly".into(), PlistNode::Boolean(false)),
                        ("Path".into(), PlistNode::String("OpenRuntime.efi".into())),
                    ]),
                );
                uefi.set_key("Drivers", PlistNode::Array(arr));
                return Ok("已添加并启用 OpenRuntime.efi".into());
            }
        }
        "add_hfsplus_driver" => {
            if let Some(uefi) = plist.get_mut("UEFI") {
                let mut arr = uefi
                    .get("Drivers")
                    .and_then(|d| d.as_array())
                    .map(|s| s.to_vec())
                    .unwrap_or_default();
                arr.push(PlistNode::Dict(vec![
                    ("Arguments".into(), PlistNode::String(String::new())),
                    ("Comment".into(), PlistNode::String("HFS+ File System Driver".into())),
                    ("Enabled".into(), PlistNode::Boolean(true)),
                    ("LoadEarly".into(), PlistNode::Boolean(false)),
                    ("Path".into(), PlistNode::String("OpenHfsPlus.efi".into())),
                ]));
                uefi.set_key("Drivers", PlistNode::Array(arr));
                return Ok("已添加并启用 OpenHfsPlus.efi".into());
            }
        }
        "sort_kexts" => {
            if let Some(kernel) = plist.get_mut("Kernel") {
                if let Some(arr) = kernel.get("Add").and_then(|a| a.as_array()) {
                    let mut items = arr.to_vec();
                    items.sort_by_key(|item| {
                        let bp = item
                            .get("BundlePath")
                            .and_then(|v| v.as_str())
                            .unwrap_or("")
                            .to_lowercase();
                        if bp == "lilu.kext" {
                            0
                        } else if bp == "virtualsmc.kext" {
                            1
                        } else if bp.contains("whatevergreen") || bp.contains("applealc") || bp.contains("nvmefix") {
                            2
                        } else if bp.starts_with("smc") {
                            3
                        } else if bp.contains("/plugins/") {
                            5
                        } else {
                            4
                        }
                    });
                    kernel.set_key("Add", PlistNode::Array(items));
                    return Ok("已按依赖层级重排 Kernel -> Add 驱动顺序（Lilu -> VirtualSMC -> 插件）".into());
                }
            }
        }
        "generate_smbios" => {
            let model = plist
                .get("PlatformInfo")
                .and_then(|p| p.get("Generic"))
                .and_then(|g| g.get("SystemProductName"))
                .and_then(|s| s.as_str())
                .unwrap_or("iMac20,1")
                .to_string();
            let generated = crate::smbios::generate_smbios_for_model(&model);
            if let Some(generic) = plist
                .get_mut("PlatformInfo")
                .and_then(|p| p.get_mut("Generic"))
            {
                generic.set_key("SystemProductName", PlistNode::String(generated.model.clone()));
                generic.set_key("SystemSerialNumber", PlistNode::String(generated.serial));
                generic.set_key("MLB", PlistNode::String(generated.mlb));
                generic.set_key("SystemUUID", PlistNode::String(generated.system_uuid));
                generic.set_key("ROM", PlistNode::Data(generated.rom_hex));
                return Ok(format!("已为机型 {} 生成全新合规三码与 ROM", generated.model));
            }
        }
        _ => {}
    }
    Err(format!("暂不支持自动执行修复动作: {}", fix_action))
}
