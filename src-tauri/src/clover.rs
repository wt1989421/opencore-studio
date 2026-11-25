use crate::efi_scanner::ScannedKext;
use crate::hw_advisor::{evaluate_hardware_compatibility, HardwareProfile};
use crate::plist_engine::{save_plist_file, PlistNode};
use crate::presets::{build_preset_plist, PresetMeta};
use crate::smbios::generate_smbios_for_model;
use crate::validator::ValidationIssue;
use serde::{Deserialize, Serialize};
use std::path::Path;

#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq)]
pub enum BootloaderKind {
    OpenCore,
    Clover,
}

impl BootloaderKind {
    pub fn as_str(&self) -> &'static str {
        match self {
            BootloaderKind::OpenCore => "OpenCore",
            BootloaderKind::Clover => "Clover",
        }
    }
}

/// Automatically detects whether a `config.plist` belongs to Clover or OpenCore.
pub fn detect_bootloader_kind(plist: &PlistNode) -> BootloaderKind {
    let has_clover_keys = plist.get("KernelAndKextPatches").is_some()
        || plist.get("RtVariables").is_some()
        || plist.get("SystemParameters").is_some()
        || (plist.get("Boot").is_some() && plist.get("GUI").is_some());

    if has_clover_keys && plist.get("Booter").is_none() && plist.get("PlatformInfo").is_none() {
        BootloaderKind::Clover
    } else {
        BootloaderKind::OpenCore
    }
}

pub fn list_clover_presets() -> Vec<PresetMeta> {
    vec![
        PresetMeta {
            id: "clover_intel_modern".into(),
            name: "[四叶草 Clover] Intel 8~10代酷睿台式机 (r5159+)".into(),
            subtitle: "含现代 OpenRuntime Quirks + UHD 630 + 原生电源管理 PluginType".into(),
            platform: "Clover Desktop".into(),
            recommended_smbios: "iMac20,1".into(),
        },
        PresetMeta {
            id: "clover_intel_legacy".into(),
            name: "[四叶草 Clover] Intel 3~7代经典老主板 (Legacy / UEFI)".into(),
            subtitle: "H61 / B75 / B85 / Z97 / B150 / Z170 · 含 Graphics 显卡注入与 KernelPm".into(),
            platform: "Clover Legacy".into(),
            recommended_smbios: "iMac19,1".into(),
        },
        PresetMeta {
            id: "clover_intel_laptop".into(),
            name: "[四叶草 Clover] Intel 酷睿笔记本通用配置".into(),
            subtitle: "含 PNLF 亮度、PS2 键盘、电池状态与独显屏蔽 (-wegnoegpu)".into(),
            platform: "Clover Laptop".into(),
            recommended_smbios: "MacBookPro16,1".into(),
        },
    ]
}

pub fn build_clover_preset_plist(preset_id: &str) -> PlistNode {
    let is_legacy = preset_id == "clover_intel_legacy";
    let is_laptop = preset_id == "clover_intel_laptop";

    let model = if is_laptop {
        "MacBookPro16,1"
    } else if is_legacy {
        "iMac19,1"
    } else {
        "iMac20,1"
    };
    let smb = generate_smbios_for_model(model);

    // 1. ACPI
    let mut sorted_order = vec![
        PlistNode::String("SSDT-EC-USBX.aml".into()),
        PlistNode::String("SSDT-PLUG.aml".into()),
    ];
    if !is_legacy {
        sorted_order.push(PlistNode::String("SSDT-AWAC.aml".into()));
    }
    if is_laptop {
        sorted_order.push(PlistNode::String("SSDT-PNLF.aml".into()));
    }

    let acpi = PlistNode::Dict(vec![
        ("AutoMerge".into(), PlistNode::Boolean(true)),
        (
            "DSDT".into(),
            PlistNode::Dict(vec![
                (
                    "Fixes".into(),
                    PlistNode::Dict(vec![
                        ("AddDTGP".into(), PlistNode::Boolean(is_legacy)),
                        ("AddMCHC".into(), PlistNode::Boolean(false)),
                        ("AddPNLF".into(), PlistNode::Boolean(is_laptop && is_legacy)),
                        ("FixHPET".into(), PlistNode::Boolean(is_legacy)),
                        ("FixIPIC".into(), PlistNode::Boolean(is_legacy)),
                        ("FixMutex".into(), PlistNode::Boolean(false)),
                        ("FixRTC".into(), PlistNode::Boolean(is_legacy)),
                        ("FixShutdown".into(), PlistNode::Boolean(false)),
                        ("FixTMR".into(), PlistNode::Boolean(is_legacy)),
                    ]),
                ),
                (
                    "Patches".into(),
                    PlistNode::Array(vec![PlistNode::Dict(vec![
                        ("Comment".into(), PlistNode::String("Change EC0 to EC".into())),
                        ("Disabled".into(), PlistNode::Boolean(false)),
                        ("Find".into(), PlistNode::Data("4543305F".into())),
                        ("Replace".into(), PlistNode::Data("45435F5F".into())),
                    ])]),
                ),
            ]),
        ),
        ("FixHeaders".into(), PlistNode::Boolean(true)),
        ("HaltEnabler".into(), PlistNode::Boolean(true)),
        (
            "SSDT".into(),
            PlistNode::Dict(vec![
                (
                    "Generate".into(),
                    PlistNode::Dict(vec![
                        ("PluginType".into(), PlistNode::Boolean(true)),
                        ("PStates".into(), PlistNode::Boolean(false)),
                        ("CStates".into(), PlistNode::Boolean(false)),
                    ]),
                ),
                ("NoOemTableId".into(), PlistNode::Boolean(false)),
            ]),
        ),
        ("SortedOrder".into(), PlistNode::Array(sorted_order)),
    ]);

    // 2. Boot
    let boot_args = if is_laptop {
        "-v debug=0x100 keepsyms=1 -wegnoegpu alcid=21"
    } else {
        "-v debug=0x100 keepsyms=1 alcid=11"
    };

    let boot = PlistNode::Dict(vec![
        ("Arguments".into(), PlistNode::String(boot_args.into())),
        ("DefaultVolume".into(), PlistNode::String("LastBootedVolume".into())),
        ("Fast".into(), PlistNode::Boolean(false)),
        ("Legacy".into(), PlistNode::String("PBR".into())),
        ("NeverDoRecovery".into(), PlistNode::Boolean(false)),
        ("NeverHibernate".into(), PlistNode::Boolean(true)),
        ("NoEarlyProgress".into(), PlistNode::Boolean(false)),
        ("Timeout".into(), PlistNode::Integer(5)),
        ("XMPDetection".into(), PlistNode::String("Yes".into())),
    ]);

    // 3. CPU
    let cpu = PlistNode::Dict(vec![
        ("HWPEnable".into(), PlistNode::Boolean(!is_legacy)),
        ("QEMU".into(), PlistNode::Boolean(false)),
        ("UseARTFrequency".into(), PlistNode::Boolean(false)),
    ]);

    // 4. Devices
    let devices = PlistNode::Dict(vec![
        (
            "Audio".into(),
            PlistNode::Dict(vec![
                ("AFGLowPowerState".into(), PlistNode::Boolean(true)),
                ("Inject".into(), PlistNode::Integer(if is_laptop { 21 } else { 11 })),
                ("ResetHDA".into(), PlistNode::Boolean(true)),
            ]),
        ),
        (
            "Properties".into(),
            PlistNode::Dict(vec![(
                "PciRoot(0x0)/Pci(0x2,0x0)".into(),
                PlistNode::Dict(vec![(
                    "AAPL,ig-platform-id".into(),
                    PlistNode::Data(if is_laptop {
                        "0900A53E".into()
                    } else {
                        "07009B3E".into()
                    }),
                )]),
            )]),
        ),
        (
            "USB".into(),
            PlistNode::Dict(vec![
                ("AddClockID".into(), PlistNode::Boolean(true)),
                ("FixOwnership".into(), PlistNode::Boolean(true)),
                ("HighCurrent".into(), PlistNode::Boolean(false)),
                ("Inject".into(), PlistNode::Boolean(true)),
            ]),
        ),
    ]);

    // 5. GUI
    let gui = PlistNode::Dict(vec![
        ("EmbeddedThemeType".into(), PlistNode::String("Dark".into())),
        (
            "Hide".into(),
            PlistNode::Array(vec![
                PlistNode::String("Preboot".into()),
                PlistNode::String("VM".into()),
            ]),
        ),
        ("Language".into(), PlistNode::String("zh_CN:0".into())),
        (
            "Mouse".into(),
            PlistNode::Dict(vec![
                ("DoubleClick".into(), PlistNode::Integer(500)),
                ("Enabled".into(), PlistNode::Boolean(true)),
                ("Speed".into(), PlistNode::Integer(8)),
            ]),
        ),
        (
            "Scan".into(),
            PlistNode::Dict(vec![
                ("Entries".into(), PlistNode::Boolean(true)),
                ("Legacy".into(), PlistNode::Boolean(false)),
                ("Linux".into(), PlistNode::Boolean(true)),
                ("Tool".into(), PlistNode::Boolean(true)),
            ]),
        ),
        ("ScreenResolution".into(), PlistNode::String("1920x1080".into())),
        ("Theme".into(), PlistNode::String("embedded".into())),
    ]);

    // 6. Graphics
    let graphics = PlistNode::Dict(vec![
        (
            "Inject".into(),
            PlistNode::Dict(vec![
                ("ATI".into(), PlistNode::Boolean(false)),
                ("Intel".into(), PlistNode::Boolean(is_legacy)),
                ("NVidia".into(), PlistNode::Boolean(false)),
            ]),
        ),
        ("LoadVBios".into(), PlistNode::Boolean(false)),
        (
            "ig-platform-id".into(),
            PlistNode::String(if is_legacy { "0x19120000".into() } else { String::new() }),
        ),
    ]);

    // 7. KernelAndKextPatches
    let kkp = PlistNode::Dict(vec![
        ("AppleIntelCPUPM".into(), PlistNode::Boolean(is_legacy)),
        ("AppleRTC".into(), PlistNode::Boolean(true)),
        ("Debug".into(), PlistNode::Boolean(false)),
        ("DellSMBIOSPatch".into(), PlistNode::Boolean(false)),
        ("EightApple".into(), PlistNode::Boolean(true)),
        ("KernelCpu".into(), PlistNode::Boolean(false)),
        ("KernelLapic".into(), PlistNode::Boolean(false)),
        ("KernelPm".into(), PlistNode::Boolean(true)),
        ("KernelXCPM".into(), PlistNode::Boolean(false)),
        ("PanicNoKextDump".into(), PlistNode::Boolean(true)),
        ("KextsToPatch".into(), PlistNode::Array(vec![])),
    ]);

    // 8. Quirks (Clover r5123+ OpenRuntime integration)
    let quirks = PlistNode::Dict(vec![
        ("AvoidRuntimeDefrag".into(), PlistNode::Boolean(true)),
        ("DevirtualiseMmio".into(), PlistNode::Boolean(!is_legacy)),
        ("DisableIoMapper".into(), PlistNode::Boolean(true)),
        ("DisableLinkeditJettison".into(), PlistNode::Boolean(true)),
        ("DisableSingleUser".into(), PlistNode::Boolean(false)),
        ("DisableVariableWrite".into(), PlistNode::Boolean(false)),
        ("DiscardHibernateMap".into(), PlistNode::Boolean(false)),
        ("EnableSafeModeSlide".into(), PlistNode::Boolean(true)),
        ("EnableWriteUnprotector".into(), PlistNode::Boolean(is_legacy)),
        ("ForceExitBootServices".into(), PlistNode::Boolean(false)),
        ("FuzzyMatch".into(), PlistNode::Boolean(true)),
        ("PowerTimeoutKernelPanic".into(), PlistNode::Boolean(true)),
        ("ProtectMemoryRegions".into(), PlistNode::Boolean(false)),
        ("ProtectSecureBoot".into(), PlistNode::Boolean(false)),
        ("ProtectUefiServices".into(), PlistNode::Boolean(!is_legacy)),
        ("ProvideConsoleGopEnable".into(), PlistNode::Boolean(true)),
        ("ProvideCustomSlide".into(), PlistNode::Boolean(true)),
        ("RebuildAppleMemoryMap".into(), PlistNode::Boolean(!is_legacy)),
        ("ResizeAppleGpuBars".into(), PlistNode::Integer(-1)),
        ("SetupVirtualMap".into(), PlistNode::Boolean(true)),
        ("SyncRuntimePermissions".into(), PlistNode::Boolean(!is_legacy)),
        ("XhciPortLimit".into(), PlistNode::Boolean(false)),
    ]);

    // 9. RtVariables & SystemParameters & SMBIOS
    let rt_vars = PlistNode::Dict(vec![
        ("BooterConfig".into(), PlistNode::String("0x28".into())),
        ("CsrActiveConfig".into(), PlistNode::String("0x00".into())),
        ("MLB".into(), PlistNode::String(smb.mlb.clone())),
        ("ROM".into(), PlistNode::Data(smb.rom_hex)),
    ]);

    let smbios = PlistNode::Dict(vec![
        ("BoardSerialNumber".into(), PlistNode::String(smb.mlb)),
        ("ProductName".into(), PlistNode::String(smb.model)),
        ("SerialNumber".into(), PlistNode::String(smb.serial)),
        ("SmUUID".into(), PlistNode::String(smb.system_uuid)),
        ("Trust".into(), PlistNode::Boolean(true)),
    ]);

    let sys_params = PlistNode::Dict(vec![
        ("InjectKexts".into(), PlistNode::String("Yes".into())),
        ("InjectSystemID".into(), PlistNode::Boolean(true)),
        ("NoCaches".into(), PlistNode::Boolean(false)),
    ]);

    PlistNode::Dict(vec![
        ("ACPI".into(), acpi),
        ("Boot".into(), boot),
        ("CPU".into(), cpu),
        ("Devices".into(), devices),
        ("GUI".into(), gui),
        ("Graphics".into(), graphics),
        ("KernelAndKextPatches".into(), kkp),
        ("Quirks".into(), quirks),
        ("RtVariables".into(), rt_vars),
        ("SMBIOS".into(), smbios),
        ("SystemParameters".into(), sys_params),
    ])
}

/// Validates a Clover `config.plist` and checks Clover-specific pitfalls.
pub fn validate_clover_config(plist: &PlistNode, clover_dir: Option<&Path>) -> Vec<ValidationIssue> {
    let mut issues = Vec::new();

    // 1. Quirks check (Clover r5123+ requires OpenRuntime Quirks)
    if let Some(quirks) = plist.get("Quirks") {
        let ewu = quirks
            .get("EnableWriteUnprotector")
            .and_then(|v| v.as_bool())
            .unwrap_or(false);
        let ramm = quirks
            .get("RebuildAppleMemoryMap")
            .and_then(|v| v.as_bool())
            .unwrap_or(false);
        if ewu && ramm {
            issues.push(ValidationIssue {
                id: "clover_ewu_ramm_conflict".into(),
                severity: "error".into(),
                section: "Quirks".into(),
                field_path: "Quirks.EnableWriteUnprotector".into(),
                title: "四叶草 Quirks 冲突：EnableWriteUnprotector 与 RebuildAppleMemoryMap 同时开启".into(),
                message: "Clover r5123+ 内嵌了 OpenRuntime，这两个内存映射开关不能同时设为 True！现代平台请关闭 EnableWriteUnprotector。".into(),
                fix_action: Some("clover_fix_quirks_conflict".into()),
            });
        }
    } else {
        issues.push(ValidationIssue {
            id: "clover_missing_quirks".into(),
            severity: "warning".into(),
            section: "Quirks".into(),
            field_path: "Quirks".into(),
            title: "未检测到 Clover r5123+ Quirks 节点（旧版四叶草配置）".into(),
            message: "若你使用的是 Clover r5123 及以上新版引导支持 Big Sur ~ Sequoia，必须补充 Quirks 字典并配合 OpenRuntime.efi；或者可点击顶部按钮一键迁移至 OpenCore！".into(),
            fix_action: None,
        });
    }

    // 2. SystemParameters -> InjectKexts
    if let Some(sys) = plist.get("SystemParameters") {
        let ik = sys
            .get("InjectKexts")
            .and_then(|v| v.as_str())
            .unwrap_or("Detect");
        if ik.eq_ignore_ascii_case("no") {
            issues.push(ValidationIssue {
                id: "clover_inject_kexts_no".into(),
                severity: "error".into(),
                section: "SystemParameters".into(),
                field_path: "SystemParameters.InjectKexts".into(),
                title: "InjectKexts 当前为 'No'，会导致 CLOVER/kexts/Other 下所有驱动不加载！".into(),
                message: "黑苹果必须注入 FakeSMC/VirtualSMC 等核心驱动，建议将 InjectKexts 设为 'Yes'。".into(),
                fix_action: Some("clover_enable_inject_kexts".into()),
            });
        }
    }

    // 3. SMBIOS check
    if let Some(smb) = plist.get("SMBIOS") {
        let sn = smb.get("SerialNumber").and_then(|v| v.as_str()).unwrap_or("");
        let mlb = smb
            .get("BoardSerialNumber")
            .and_then(|v| v.as_str())
            .unwrap_or("");
        if sn.is_empty() || mlb.is_empty() {
            issues.push(ValidationIssue {
                id: "clover_incomplete_smbios".into(),
                severity: "warning".into(),
                section: "SMBIOS".into(),
                field_path: "SMBIOS.SerialNumber".into(),
                title: "四叶草 SMBIOS 序列号或主板码 MLB 为空".into(),
                message: "可在 SMBIOS 面板一键生成全套苹果机型三码。".into(),
                fix_action: Some("clover_generate_smbios".into()),
            });
        }
    }

    // 4. Disk driver conflict check in EFI/CLOVER/drivers/UEFI
    if let Some(dir) = clover_dir {
        let uefi_drv = dir.join("drivers").join("UEFI");
        if uefi_drv.is_dir() {
            let has_openruntime = uefi_drv.join("OpenRuntime.efi").is_file();
            let has_old_aptio = uefi_drv.join("OsxAptioFix3Drv.efi").is_file()
                || uefi_drv.join("OsxAptioFixDrv.efi").is_file()
                || uefi_drv.join("AptioMemoryFix.efi").is_file();
            if has_openruntime && has_old_aptio {
                issues.push(ValidationIssue {
                    id: "clover_aptio_openruntime_conflict".into(),
                    severity: "error".into(),
                    section: "Quirks".into(),
                    field_path: "drivers/UEFI".into(),
                    title: "严重驱动冲突：OpenRuntime.efi 与旧版 AptioMemoryFix / OsxAptioFix 同时存在！".into(),
                    message: "Clover r5123+ 只能保留 OpenRuntime.efi，请删除 drivers/UEFI 下的 AptioMemoryFix.efi 或 OsxAptioFix*Drv.efi。".into(),
                    fix_action: None,
                });
            }
        }
    }

    issues
}

pub fn apply_clover_quick_fix(plist: &mut PlistNode, fix_action: &str) -> Result<String, String> {
    match fix_action {
        "clover_fix_quirks_conflict" => {
            if let Some(q) = plist.get_mut("Quirks") {
                q.set_key("EnableWriteUnprotector", PlistNode::Boolean(false));
                q.set_key("RebuildAppleMemoryMap", PlistNode::Boolean(true));
                q.set_key("SyncRuntimePermissions", PlistNode::Boolean(true));
                return Ok("已关闭 EnableWriteUnprotector 并开启 RebuildAppleMemoryMap + SyncRuntimePermissions".into());
            }
        }
        "clover_enable_inject_kexts" => {
            if let Some(sp) = plist.get_mut("SystemParameters") {
                sp.set_key("InjectKexts", PlistNode::String("Yes".into()));
                return Ok("已将 SystemParameters -> InjectKexts 设为 Yes".into());
            }
        }
        "clover_generate_smbios" => {
            let model = plist
                .get("SMBIOS")
                .and_then(|s| s.get("ProductName"))
                .and_then(|v| v.as_str())
                .unwrap_or("iMac20,1")
                .to_string();
            let gen = generate_smbios_for_model(&model);
            if let Some(smb) = plist.get_mut("SMBIOS") {
                smb.set_key("ProductName", PlistNode::String(gen.model.clone()));
                smb.set_key("SerialNumber", PlistNode::String(gen.serial));
                smb.set_key("BoardSerialNumber", PlistNode::String(gen.mlb.clone()));
                smb.set_key("SmUUID", PlistNode::String(gen.system_uuid));
            }
            if let Some(rt) = plist.get_mut("RtVariables") {
                rt.set_key("MLB", PlistNode::String(gen.mlb));
                rt.set_key("ROM", PlistNode::Data(gen.rom_hex));
            }
            return Ok(format!("已为四叶草机型 {} 生成全套序列号、MLB 与 ROM", model));
        }
        _ => {}
    }
    Err(format!("未知的四叶草修复指令: {}", fix_action))
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct MigrationSummary {
    pub opencore_plist: PlistNode,
    pub migrated_notes: Vec<String>,
}

/// Converts a Clover `config.plist` into a clean, Dortania-compliant OpenCore 1.0.3 `config.plist`,
/// preserving existing SMBIOS serials, DeviceProperties, Audio layout-id, ACPI patches, and Quirks!
pub fn migrate_clover_to_opencore(clover: &PlistNode) -> MigrationSummary {
    let mut notes = Vec::new();
    let mut oc = build_preset_plist("intel_10th_desktop");

    // 1. Preserve SMBIOS (SerialNumber, BoardSerialNumber/MLB, SmUUID, ROM)
    if let Some(c_smb) = clover.get("SMBIOS") {
        let model = c_smb
            .get("ProductName")
            .and_then(|v| v.as_str())
            .filter(|s| !s.is_empty())
            .unwrap_or("iMac20,1");
        let sn = c_smb.get("SerialNumber").and_then(|v| v.as_str()).unwrap_or("");
        let mlb = c_smb
            .get("BoardSerialNumber")
            .and_then(|v| v.as_str())
            .or_else(|| clover.get("RtVariables").and_then(|r| r.get("MLB")).and_then(|v| v.as_str()))
            .unwrap_or("");
        let uuid = c_smb.get("SmUUID").and_then(|v| v.as_str()).unwrap_or("");

        if let Some(oc_gen) = oc.get_mut("PlatformInfo").and_then(|p| p.get_mut("Generic")) {
            oc_gen.set_key("SystemProductName", PlistNode::String(model.into()));
            if !sn.is_empty() {
                oc_gen.set_key("SystemSerialNumber", PlistNode::String(sn.into()));
            }
            if !mlb.is_empty() {
                oc_gen.set_key("MLB", PlistNode::String(mlb.into()));
            }
            if !uuid.is_empty() {
                oc_gen.set_key("SystemUUID", PlistNode::String(uuid.into()));
            }
            if let Some(PlistNode::Data(rom_hex)) = clover.get("RtVariables").and_then(|r| r.get("ROM")) {
                if !rom_hex.is_empty() {
                    oc_gen.set_key("ROM", PlistNode::Data(rom_hex.clone()));
                }
            }
        }
        notes.push(format!(
            "无损保留原机 SMBIOS 三码 ({}, SN: {})，升级后 Apple ID / iMessage 无需重登",
            model,
            if sn.is_empty() { "自动补齐" } else { sn }
        ));
    }

    // 2. Migrate & sanitize Boot -> Arguments into NVRAM -> boot-args
    let raw_args = clover
        .get("Boot")
        .and_then(|b| b.get("Arguments"))
        .and_then(|v| v.as_str())
        .unwrap_or("-v keepsyms=1 debug=0x100");

    let mut had_dart0 = false;
    let mut clean_tokens: Vec<String> = Vec::new();
    for tok in raw_args.split_whitespace() {
        let lower = tok.to_lowercase();
        if lower == "dart=0" {
            had_dart0 = true;
            continue;
        }
        // Strip legacy Clover-only flags that break or are deprecated on OpenCore
        if lower == "-xcpm"
            || lower == "kext-dev-mode=1"
            || lower == "rootless=0"
            || lower == "slide=0"
            || lower.starts_with("nvda_drv=")
        {
            notes.push(format!("已自动剔除四叶草过时启动参数 `{}`", tok));
            continue;
        }
        clean_tokens.push(tok.to_string());
    }

    // Check Devices -> Audio -> Inject integer to preserve alcid
    if let Some(audio_id) = clover
        .get("Devices")
        .and_then(|d| d.get("Audio"))
        .and_then(|a| a.get("Inject"))
        .and_then(|v| v.as_i64().or_else(|| v.as_str().and_then(|s| s.parse::<i64>().ok())))
    {
        if audio_id > 0 && !clean_tokens.iter().any(|t| t.starts_with("alcid=")) {
            clean_tokens.push(format!("alcid={}", audio_id));
            notes.push(format!(
                "已将四叶草 Devices -> Audio -> Inject ({}) 转换为 OpenCore `alcid={}`",
                audio_id, audio_id
            ));
        }
    }

    if let Some(boot_guid) = oc
        .get_mut("NVRAM")
        .and_then(|n| n.get_mut("Add"))
        .and_then(|a| a.get_mut("7C436110-AB2A-4BBB-A880-FE41995C9F82"))
    {
        boot_guid.set_key("boot-args", PlistNode::String(clean_tokens.join(" ")));
    }

    // 3. Migrate Devices -> Properties (and Graphics -> ig-platform-id if legacy)
    if let Some(c_props) = clover.get("Devices").and_then(|d| d.get("Properties")) {
        if let PlistNode::Dict(entries) = c_props {
            if !entries.is_empty() {
                if let Some(dp) = oc.get_mut("DeviceProperties") {
                    dp.set_key("Add", PlistNode::Dict(entries.clone()));
                }
                notes.push(format!(
                    "已完整迁移 {} 组 PCIe 设备属性注入 (DeviceProperties)",
                    entries.len()
                ));
            }
        }
    }

    // 4. Map KernelAndKextPatches -> OpenCore Kernel.Quirks
    if let Some(kkp) = clover.get("KernelAndKextPatches") {
        let kernel_pm = kkp.get("KernelPm").and_then(|v| v.as_bool()).unwrap_or(true);
        let cpu_pm = kkp
            .get("AppleIntelCPUPM")
            .and_then(|v| v.as_bool())
            .unwrap_or(false);
        let apple_rtc = kkp.get("AppleRTC").and_then(|v| v.as_bool()).unwrap_or(true);
        let lapic = kkp
            .get("KernelLapic")
            .and_then(|v| v.as_bool())
            .unwrap_or(false);

        if let Some(kq) = oc.get_mut("Kernel").and_then(|k| k.get_mut("Quirks")) {
            kq.set_key("AppleXcpmCfgLock", PlistNode::Boolean(kernel_pm));
            kq.set_key("AppleCpuPmCfgLock", PlistNode::Boolean(cpu_pm));
            kq.set_key("DisableRtcChecksum", PlistNode::Boolean(apple_rtc));
            kq.set_key("LapicKernelPanic", PlistNode::Boolean(lapic));
            if had_dart0 {
                kq.set_key("DisableIoMapper", PlistNode::Boolean(true));
                notes.push("已将四叶草 `dart=0` 自动映射为 OpenCore `Kernel -> Quirks -> DisableIoMapper = True`".into());
            }
        }
        notes.push("已将 KernelPm / AppleRTC / KernelLapic 映射至 OpenCore Kernel -> Quirks".into());
    }

    // 5. Migrate ACPI -> SortedOrder into OpenCore ACPI -> Add
    if let Some(sorted) = clover
        .get("ACPI")
        .and_then(|a| a.get("SortedOrder"))
        .and_then(|s| s.as_array())
    {
        if !sorted.is_empty() {
            let mut oc_acpi_add = Vec::new();
            for item in sorted {
                if let Some(name) = item.as_str() {
                    oc_acpi_add.push(PlistNode::Dict(vec![
                        ("Comment".into(), PlistNode::String(format!("Migrated from Clover ({})", name))),
                        ("Enabled".into(), PlistNode::Boolean(true)),
                        ("Path".into(), PlistNode::String(name.to_string())),
                    ]));
                }
            }
            if !oc_acpi_add.is_empty() {
                if let Some(acpi_sec) = oc.get_mut("ACPI") {
                    acpi_sec.set_key("Add", PlistNode::Array(oc_acpi_add));
                }
                notes.push("已迁移四叶草 ACPI -> SortedOrder 补丁列表至 OpenCore ACPI -> Add".into());
            }
        }
    }

    MigrationSummary {
        opencore_plist: oc,
        migrated_notes: notes,
    }
}

/// Scans an `EFI/CLOVER` directory and synchronizes `ACPI/patched` into `ACPI -> SortedOrder`.
pub fn scan_and_sync_clover_dir(
    clover_dir: &Path,
    plist: &mut PlistNode,
) -> Result<(Vec<String>, Vec<String>, Vec<ScannedKext>), String> {
    let mut acpi_files = Vec::new();
    let patched_dir = clover_dir.join("ACPI").join("patched");
    if patched_dir.is_dir() {
        if let Ok(entries) = std::fs::read_dir(&patched_dir) {
            for e in entries.flatten() {
                let name = e.file_name().to_string_lossy().to_string();
                if !name.starts_with('.') && name.ends_with(".aml") {
                    acpi_files.push(name);
                }
            }
        }
    }
    acpi_files.sort();

    if !acpi_files.is_empty() {
        if let Some(acpi) = plist.get_mut("ACPI") {
            acpi.set_key(
                "SortedOrder",
                PlistNode::Array(acpi_files.iter().cloned().map(PlistNode::String).collect()),
            );
        }
    }

    let mut driver_files = Vec::new();
    for sub in [
        clover_dir.join("drivers").join("UEFI"),
        clover_dir.join("drivers64UEFI"),
    ] {
        if sub.is_dir() {
            if let Ok(entries) = std::fs::read_dir(&sub) {
                for e in entries.flatten() {
                    let name = e.file_name().to_string_lossy().to_string();
                    if !name.starts_with('.') && name.ends_with(".efi") && !driver_files.contains(&name) {
                        driver_files.push(name);
                    }
                }
            }
        }
    }
    driver_files.sort();

    let mut kexts = Vec::new();
    let other_kexts = clover_dir.join("kexts").join("Other");
    if other_kexts.is_dir() {
        if let Ok(entries) = std::fs::read_dir(&other_kexts) {
            for e in entries.flatten() {
                let name = e.file_name().to_string_lossy().to_string();
                if !name.starts_with('.') && name.ends_with(".kext") && e.path().is_dir() {
                    kexts.push(ScannedKext {
                        bundle_path: name,
                        executable_path: String::new(),
                        plist_path: "Contents/Info.plist".into(),
                        bundle_id: String::new(),
                        version: "Clover/Other".into(),
                        dependencies: vec![],
                    });
                }
            }
        }
    }

    Ok((acpi_files, driver_files, kexts))
}

/// Generates a tailored Clover `EFI/CLOVER` configuration & directory structure from hardware profile.
pub fn generate_tailored_clover_efi(
    hw: &HardwareProfile,
    output_dir: Option<&Path>,
) -> Result<(PlistNode, Option<String>), String> {
    let report = evaluate_hardware_compatibility(hw);
    let preset_id = if hw.is_laptop {
        "clover_intel_laptop"
    } else {
        "clover_intel_modern"
    };
    let mut plist = build_clover_preset_plist(preset_id);

    if let Some(boot) = plist.get_mut("Boot") {
        boot.set_key("Arguments", PlistNode::String(report.recommended_boot_args.clone()));
    }

    let smb = generate_smbios_for_model(&report.recommended_smbios);
    if let Some(s) = plist.get_mut("SMBIOS") {
        s.set_key("ProductName", PlistNode::String(smb.model));
        s.set_key("SerialNumber", PlistNode::String(smb.serial));
        s.set_key("BoardSerialNumber", PlistNode::String(smb.mlb.clone()));
        s.set_key("SmUUID", PlistNode::String(smb.system_uuid));
    }
    if let Some(rt) = plist.get_mut("RtVariables") {
        rt.set_key("MLB", PlistNode::String(smb.mlb));
        rt.set_key("ROM", PlistNode::Data(smb.rom_hex));
    }

    let mut saved_cfg_path = None;
    if let Some(root) = output_dir {
        let clover_root = root.join("EFI").join("CLOVER");
        std::fs::create_dir_all(root.join("EFI").join("BOOT"))
            .map_err(|e| format!("创建 BOOT 目录失败: {}", e))?;
        for sub in [
            "ACPI/origin",
            "ACPI/patched",
            "drivers/UEFI",
            "kexts/Other",
            "themes/embedded",
        ] {
            std::fs::create_dir_all(clover_root.join(sub))
                .map_err(|e| format!("创建 Clover 子目录失败: {}", e))?;
        }
        let cfg = clover_root.join("config.plist");
        save_plist_file(&cfg, &plist)?;
        saved_cfg_path = Some(cfg.to_string_lossy().to_string());
    }

    Ok((plist, saved_cfg_path))
}
