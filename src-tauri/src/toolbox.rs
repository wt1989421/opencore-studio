use serde::{Deserialize, Serialize};
use std::process::Command;

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct BootLogDiagnosis {
    pub code_pattern: String,
    pub matched_line: String,
    pub title: String,
    pub severity: String, // "critical" | "warning"
    pub root_cause: String,
    pub solution_steps: Vec<String>,
    pub jump_section: Option<String>,
    pub fix_action: Option<String>,
}

struct TroubleshootRule {
    keywords: &'static [&'static str],
    code_label: &'static str,
    title: &'static str,
    severity: &'static str,
    cause: &'static str,
    steps: &'static [&'static str],
    jump_section: Option<&'static str>,
    fix_action: Option<&'static str>,
}

const TROUBLESHOOT_KB: &[TroubleshootRule] = &[
    TroubleshootRule {
        keywords: &["EXITBS:START", "EndRandomSeed"],
        code_label: "[EB|#LOG:EXITBS:START] / EndRandomSeed",
        title: "卡在退出引导服务进入内核前 (EXITBS:START)",
        severity: "critical",
        cause: "这是黑苹果最高频卡点！本质是 KASLR 内核内存映射（Slide 值计算）或 MAT 内存属性表与主板 UEFI 固件冲突。",
        steps: &[
            "10代及更新平台 / AMD 主板：确保关闭 EnableWriteUnprotector，开启 RebuildAppleMemoryMap + SyncRuntimePermissions。",
            "Intel 11~14代或 AMD B550/B650 主板：尝试关闭 SetupVirtualMap（设为 False），并开启 DevirtualiseMmio。",
            "检查主板 BIOS 是否已开启 Above 4G Decoding 并关闭 CSM（传统引导兼容模块）。",
        ],
        jump_section: Some("Booter"),
        fix_action: Some("disable_enable_write_unprotector"),
    },
    TroubleshootRule {
        keywords: &["AppleIntelCPUPowerManagement", "AppleACPICPU", "XCPM"],
        code_label: "AppleACPICPU / CFG Lock Panic",
        title: "卡在 CPU 电源管理初始化（极大概率未解锁 CFG Lock）",
        severity: "critical",
        cause: "主板 BIOS 未关闭 MSR 0xE2 (CFG Lock) 写保护，导致 macOS XCPM 内核直接触发 Kernel Panic。",
        steps: &[
            "前往 Kernel -> Quirks，开启 AppleXcpmCfgLock = True（若是 3代及更老 CPU 则同时开启 AppleCpuPmCfgLock）。",
            "进阶方案：进入主板 BIOS 关闭 CFG Lock，或使用 modGRUBShell 解锁 MSR 0xE2 后再关闭该 Quirk。",
        ],
        jump_section: Some("Kernel"),
        fix_action: None,
    },
    TroubleshootRule {
        keywords: &["PCI configuration begin", "console relocated"],
        code_label: "PCI configuration begin",
        title: "卡在 PCI 总线枚举阶段 (PCI configuration begin)",
        severity: "critical",
        cause: "主板 PCIe 地址分配与 macOS IOPCIFamily 冲突（常见于 AMD 主板、X99/X299 或未开启 Above 4G 的主板）。",
        steps: &[
            "优先进入主板 BIOS 开启 Above 4G Decoding（同时建议关闭 Resizable BAR，或将 ResizeAppleGpuBars 设为 0）。",
            "若 BIOS 无 Above 4G 选项或在 AMD 平台，请在 NVRAM -> boot-args 中添加 `npci=0x2000` 或 `npci=0x3000`。",
        ],
        jump_section: Some("NVRAM"),
        fix_action: None,
    },
    TroubleshootRule {
        keywords: &["Invalid Vault mode", "Vault"],
        code_label: "OC: Invalid Vault mode",
        title: "OpenCore 安全签名校验失败 (Invalid Vault mode)",
        severity: "critical",
        cause: "Misc -> Security -> Vault 未设置为 Optional，而 EFI 目录又没有使用 RSA 私钥签名。",
        steps: &[
            "将 Misc -> Security -> Vault 修改为 `Optional`（可点击下方一键修复）。",
        ],
        jump_section: Some("Misc"),
        fix_action: Some("set_vault_optional"),
    },
    TroubleshootRule {
        keywords: &["IONVMeFamily", "AppleNVMe Assert", "nvme"],
        code_label: "IONVMeFamily / AppleNVMe Panic",
        title: "NVMe 固态硬盘控制器引发五国崩溃",
        severity: "critical",
        cause: "检测到不兼容的 OEM 固态硬盘（如三星 PM981/PM981a/PM991、镁光 2200S、海力士 PC601）或缺少 NVMeFix。",
        steps: &[
            "确认机器内是否插有三星 PM981 / PM991 等黑名单硬盘；若有，请通过 SSDT 或设备属性屏蔽其 PCIe 槽位。",
            "普通固态偶发崩溃请确保加载最新版 `NVMeFix.kext`。",
        ],
        jump_section: Some("Kernel"),
        fix_action: None,
    },
    TroubleshootRule {
        keywords: &["OCS: No schema for", "OCS: Missing key"],
        code_label: "OCS: No schema for / Missing key",
        title: "config.plist 字段版本与 OpenCore.efi 主程序版本不匹配",
        severity: "warning",
        cause: "使用旧版编辑器修改了新版 OpenCore 配置，或升级 OpenCore.efi 后未同步新增/废弃的 Quirk 键名。",
        steps: &[
            "在日志中查看具体报错的键名，使用本工具「视图切换 -> 原始 Plist 树」删除冗余废弃键，或使用预设模板对齐结构。",
        ],
        jump_section: Some("Misc"),
        fix_action: None,
    },
    TroubleshootRule {
        keywords: &["Waiting on", "IOResources", "IOConsoleUsers", "gIOScreenLockState"],
        code_label: "IOConsoleUsers / gIOScreenLockState 3",
        title: "跑码结束即将进桌面时黑屏、卡屏或冻屏",
        severity: "critical",
        cause: "显卡缓冲帧（Framebuffer）或显示输出通道握手失败（最常见于 RX 5000/6000 漏加 pikera，或 Intel 核显 ig-platform-id 不对）。",
        steps: &[
            "AMD RX 5000 / 6000 系列独显：必须在 NVRAM -> boot-args 添加 `agdpmod=pikera`。",
            "Intel UHD 630 台式机核显：检查 DeviceProperties 注入的 `AAPL,ig-platform-id` 是否为 `07009B3E`（若用 HDMI 黑屏可加 `igfxonln=1`）。",
            "双显卡笔记本：确保添加了 `-wegnoegpu` 屏蔽不支持的 NVIDIA RTX/GTX 独显。",
        ],
        jump_section: Some("DeviceProperties"),
        fix_action: None,
    },
    TroubleshootRule {
        keywords: &["EB|#LOG:DT:NONE", "OCB: LoadImage failed", "Unsupported"],
        code_label: "OCB: LoadImage failed - Unsupported",
        title: "无法加载 macOS 启动镜像或机型不受目标系统支持",
        severity: "critical",
        cause: "当前设置的 SMBIOS 机型过老，不支持你正在引导的 macOS 版本（如用 iMac18,1 直接引导 Sonoma/Sequoia），或缺少 HfsPlus 驱动。",
        steps: &[
            "前往 PlatformInfo 更换受目标系统原生支持的机型（如 iMac20,1 / MacPro7,1 / MacBookPro16,1），或在 boot-args 临时添加 `-no_compat_check`。",
            "检查 Misc -> Security -> SecureBootModel：初次安装 Sonoma / Sequoia 时建议先设为 `Disabled` 避免个性化签名循环重启。",
        ],
        jump_section: Some("PlatformInfo"),
        fix_action: None,
    },
];

pub fn analyze_boot_log(log_text: &str) -> Vec<BootLogDiagnosis> {
    let mut results = Vec::new();
    let lines: Vec<&str> = log_text.lines().collect();

    for rule in TROUBLESHOOT_KB {
        let mut matched_line: Option<String> = None;
        for line in &lines {
            let lower_line = line.to_lowercase();
            if rule.keywords.iter().any(|kw| lower_line.contains(&kw.to_lowercase())) {
                matched_line = Some(line.trim().chars().take(160).collect());
                break;
            }
        }

        if let Some(m_line) = matched_line {
            results.push(BootLogDiagnosis {
                code_pattern: rule.code_label.into(),
                matched_line: m_line,
                title: rule.title.into(),
                severity: rule.severity.into(),
                root_cause: rule.cause.into(),
                solution_steps: rule.steps.iter().map(|s| s.to_string()).collect(),
                jump_section: rule.jump_section.map(String::from),
                fix_action: rule.fix_action.map(String::from),
            });
        }
    }

    results
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct AudioCodecEntry {
    pub codec: String,
    pub vendor_hex: String,
    pub recommended_ids: Vec<u32>,
    pub all_ids: Vec<u32>,
    pub notes: String,
}

pub fn search_applealc_codecs(query: &str) -> Vec<AudioCodecEntry> {
    let db = vec![
        AudioCodecEntry {
            codec: "Realtek ALC256 (ALC3246)".into(),
            vendor_hex: "10EC:0256".into(),
            recommended_ids: vec![21, 11, 13, 56, 97],
            all_ids: vec![5, 11, 13, 14, 16, 17, 19, 21, 22, 23, 24, 28, 38, 56, 66, 67, 68, 69, 70, 76, 82, 97, 99],
            notes: "华硕/戴尔/联想轻薄本高频声卡，戴尔本优先试 13/21/56，华硕/联想优先试 21/11/97。".into(),
        },
        AudioCodecEntry {
            codec: "Realtek ALC257".into(),
            vendor_hex: "10EC:0257".into(),
            recommended_ids: vec![11, 21, 86, 99, 100],
            all_ids: vec![11, 18, 21, 86, 96, 97, 99, 100, 101],
            notes: "联想拯救者/小新 Pro 系列标配声卡，优先尝试 alcid=21、11 或 86。".into(),
        },
        AudioCodecEntry {
            codec: "Realtek ALC269".into(),
            vendor_hex: "10EC:0269".into(),
            recommended_ids: vec![1, 3, 15, 27, 28, 29],
            all_ids: vec![1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 14, 15, 16, 18, 19, 20, 27, 28, 29, 32, 40, 88, 127],
            notes: "经典笔记本与迷你主机声卡，Layout 极丰富，建议从 28、29、15、3 开始测试麦克风与耳机切换。".into(),
        },
        AudioCodecEntry {
            codec: "Realtek ALC295 / ALC3254".into(),
            vendor_hex: "10EC:0295".into(),
            recommended_ids: vec![21, 28, 13, 77],
            all_ids: vec![1, 3, 11, 13, 14, 15, 21, 22, 23, 24, 28, 71, 77],
            notes: "HP 暗影精灵/战66 及戴尔灵越常见声卡，优先试 21、28、13。".into(),
        },
        AudioCodecEntry {
            codec: "Realtek ALC298".into(),
            vendor_hex: "10EC:0298".into(),
            recommended_ids: vec![29, 30, 11, 72, 99],
            all_ids: vec![3, 11, 13, 22, 28, 29, 30, 32, 47, 66, 72, 99],
            notes: "小米笔记本 Pro / 外星人 / 雷蛇灵刃常见，小米本常用 30 或 99。".into(),
        },
        AudioCodecEntry {
            codec: "Realtek ALC887".into(),
            vendor_hex: "10EC:0887".into(),
            recommended_ids: vec![1, 5, 7, 11, 12],
            all_ids: vec![1, 2, 3, 5, 7, 11, 12, 13, 17, 18, 20, 33, 40, 50, 52, 87, 99],
            notes: "经典入门/主流台式机主板声卡，5.1/立体声优先试 1、7、11。".into(),
        },
        AudioCodecEntry {
            codec: "Realtek ALC892".into(),
            vendor_hex: "10EC:0892".into(),
            recommended_ids: vec![1, 5, 7, 12],
            all_ids: vec![1, 2, 3, 4, 5, 7, 11, 12, 15, 16, 17, 18, 22, 28, 31, 90, 92, 97, 99, 100],
            notes: "主流台式机主板常客，绝大多数微星/华硕/技嘉主板用 alcid=1、5 或 7 即可完美前后置音频。".into(),
        },
        AudioCodecEntry {
            codec: "Realtek ALC897".into(),
            vendor_hex: "10EC:0897".into(),
            recommended_ids: vec![11, 12, 66, 69, 99],
            all_ids: vec![11, 12, 13, 21, 23, 66, 69, 77, 98, 99],
            notes: "B560 / B660 / B760 / B650 主流台式机最常见声卡！90% 以上主板直接用 alcid=11 或 66 完美发声。".into(),
        },
        AudioCodecEntry {
            codec: "Realtek ALC1200".into(),
            vendor_hex: "10EC:1200".into(),
            recommended_ids: vec![1, 11, 49, 50],
            all_ids: vec![1, 2, 3, 11, 12, 15, 49, 50, 51, 52],
            notes: "中高端 B460/Z490/B550 迫击炮/重炮手主板声卡，华硕重炮手推荐 1 或 11，微星推荐 49 或 50。".into(),
        },
        AudioCodecEntry {
            codec: "Realtek ALC1220".into(),
            vendor_hex: "10EC:1220".into(),
            recommended_ids: vec![1, 7, 11, 16],
            all_ids: vec![1, 2, 3, 5, 7, 8, 11, 13, 15, 16, 17, 20, 21, 25, 27, 28, 29, 30, 34, 35, 98, 99, 100],
            notes: "高端 Z 系列主板声卡，alcid=1、7、11 通杀绝大多数主板。".into(),
        },
        AudioCodecEntry {
            codec: "Realtek ALC4080 / ALC4082".into(),
            vendor_hex: "0DB0 / 0B05 (USB Audio)".into(),
            recommended_ids: vec![],
            all_ids: vec![],
            notes: "Z690 / Z790 / B650 高端主板采用的 USB 音频桥接芯片！无需 AppleALC 注入 alcid，只要 USB 端口定制正常即可免驱识别为 USB Audio。".into(),
        },
    ];

    let q = query.trim().to_lowercase();
    if q.is_empty() {
        return db;
    }
    db.into_iter()
        .filter(|item| {
            item.codec.to_lowercase().contains(&q)
                || item.vendor_hex.to_lowercase().contains(&q)
                || item.notes.to_lowercase().contains(&q)
        })
        .collect()
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct EspPartitionInfo {
    pub identifier: String,
    pub disk_name: String,
    pub size_display: String,
    pub mount_point: Option<String>,
    pub is_mounted: bool,
}

/// Safely lists EFI System Partitions on macOS (`diskutil list`) or Windows (`powershell`).
pub fn list_esp_partitions() -> Result<Vec<EspPartitionInfo>, String> {
    #[cfg(target_os = "macos")]
    {
        let out = Command::new("diskutil")
            .args(["list", "-plist"])
            .output()
            .map_err(|e| format!("调用 diskutil 失败: {}", e))?;

        let val = plist::from_bytes::<plist::Value>(&out.stdout)
            .map_err(|e| format!("解析 diskutil 输出失败: {}", e))?;

        let mut esps = Vec::new();
        if let Some(all_disks) = val
            .as_dictionary()
            .and_then(|d| d.get("AllDisksAndPartitions"))
            .and_then(|v| v.as_array())
        {
            for disk in all_disks {
                let Some(d_dict) = disk.as_dictionary() else {
                    continue;
                };
                let disk_id = d_dict
                    .get("DeviceIdentifier")
                    .and_then(|v| v.as_string())
                    .unwrap_or("disk");

                if let Some(parts) = d_dict.get("Partitions").and_then(|v| v.as_array()) {
                    for part in parts {
                        let Some(p_dict) = part.as_dictionary() else {
                            continue;
                        };
                        let content = p_dict
                            .get("Content")
                            .and_then(|v| v.as_string())
                            .unwrap_or("");
                        if content == "EFI" {
                            let id = p_dict
                                .get("DeviceIdentifier")
                                .and_then(|v| v.as_string())
                                .unwrap_or("")
                                .to_string();
                            let vol_name = p_dict
                                .get("VolumeName")
                                .and_then(|v| v.as_string())
                                .unwrap_or("EFI")
                                .to_string();
                            let size = p_dict
                                .get("Size")
                                .and_then(|v| {
                                    v.as_unsigned_integer()
                                        .or_else(|| v.as_signed_integer().map(|s| s as u64))
                                })
                                .unwrap_or(0);
                            let mount_pt = p_dict
                                .get("MountPoint")
                                .and_then(|v| v.as_string())
                                .filter(|s| !s.is_empty())
                                .map(String::from);

                            esps.push(EspPartitionInfo {
                                identifier: id,
                                disk_name: format!("{} ({})", vol_name, disk_id),
                                size_display: format!("{:.0} MB", size as f64 / 1_048_576.0),
                                is_mounted: mount_pt.is_some(),
                                mount_point: mount_pt,
                            });
                        }
                    }
                }
            }
        }
        return Ok(esps);
    }

    #[cfg(target_os = "windows")]
    {
        let out = Command::new("powershell")
            .args([
                "-NoProfile",
                "-Command",
                "Get-Partition | Where-Object {$_.GptType -eq '{c12a7328-f81f-11d2-ba4b-00a0c93ec93b}'} | Select-Object DiskNumber,PartitionNumber,Size,DriveLetter | ConvertTo-Json -Compress",
            ])
            .output()
            .map_err(|e| format!("查询 Windows 分区失败: {}", e))?;
        let text = String::from_utf8_lossy(&out.stdout).trim().to_string();
        if text.is_empty() {
            return Ok(Vec::new());
        }
        let parsed: serde_json::Value = serde_json::from_str(&text).unwrap_or(serde_json::Value::Null);
        let arr = match parsed {
            serde_json::Value::Array(a) => a,
            serde_json::Value::Object(_) => vec![parsed],
            _ => vec![],
        };
        let mut esps = Vec::new();
        for item in arr {
            let dn = item.get("DiskNumber").and_then(|v| v.as_u64()).unwrap_or(0);
            let pn = item.get("PartitionNumber").and_then(|v| v.as_u64()).unwrap_or(1);
            let sz = item.get("Size").and_then(|v| v.as_u64()).unwrap_or(0);
            let dl = item
                .get("DriveLetter")
                .and_then(|v| v.as_str())
                .filter(|s| !s.trim().is_empty() && *s != "\u{0}")
                .map(|s| format!("{}:\\", s));
            esps.push(EspPartitionInfo {
                identifier: format!("Disk {} Partition {}", dn, pn),
                disk_name: format!("物理磁盘 {} - EFI 系统分区", dn),
                size_display: format!("{:.0} MB", sz as f64 / 1_048_576.0),
                is_mounted: dl.is_some(),
                mount_point: dl,
            });
        }
        return Ok(esps);
    }

    #[allow(unreachable_code)]
    Ok(Vec::new())
}

/// Mounts an ESP partition on macOS via `osascript` administrator prompt + `diskutil mount`.
pub fn mount_esp_partition(identifier: &str) -> Result<String, String> {
    #[cfg(target_os = "macos")]
    {
        // Validate identifier contains only safe chars like "disk0s1"
        if !identifier.chars().all(|c| c.is_ascii_alphanumeric()) {
            return Err("非法的分区标识符".into());
        }
        // Try unprivileged mount first, fallback to AppleScript admin elevation
        let direct = Command::new("diskutil").args(["mount", identifier]).output();
        if let Ok(res) = direct {
            if res.status.success() {
                return Ok(String::from_utf8_lossy(&res.stdout).trim().to_string());
            }
        }
        let script = format!(
            "do shell script \"diskutil mount {}\" with administrator privileges",
            identifier
        );
        let elevated = Command::new("osascript")
            .args(["-e", &script])
            .output()
            .map_err(|e| format!("请求管理员挂载权限失败: {}", e))?;

        if elevated.status.success() {
            return Ok(String::from_utf8_lossy(&elevated.stdout).trim().to_string());
        } else {
            return Err(String::from_utf8_lossy(&elevated.stderr).trim().to_string());
        }
    }

    #[cfg(target_os = "windows")]
    {
        let _ = identifier;
        let out = Command::new("powershell")
            .args([
                "-NoProfile",
                "-Command",
                "Start-Process -FilePath 'mountvol' -ArgumentList 'S:','/S' -Verb RunAs -Wait",
            ])
            .output()
            .map_err(|e| format!("请求 Windows UAC 管理员挂载权限失败: {}", e))?;
        if out.status.success() {
            return Ok("已通过管理员权限将 EFI 系统分区挂载到 S:\\ 盘符".into());
        } else {
            return Err(String::from_utf8_lossy(&out.stderr).trim().to_string());
        }
    }

    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    {
        let _ = identifier;
        Err("当前系统暂不支持自动挂载 ESP 分区".into())
    }
}
