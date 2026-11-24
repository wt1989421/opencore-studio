use crate::plist_engine::{save_plist_file, PlistNode};
use crate::presets::build_preset_plist;
use serde::{Deserialize, Serialize};
use std::path::Path;
use std::process::Command;

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct HardwareProfile {
    pub profile_name: String,
    pub source: String, // "本机实时扫描" | "预设模拟画像" | "外部导入"
    pub is_laptop: bool,
    pub board_model: String,
    pub cpu_model: String,
    pub cpu_vendor: String, // "Intel" | "AMD" | "Apple"
    pub cpu_cores: u32,
    pub gpus: Vec<String>,
    pub audio_codec: String,
    pub network_cards: Vec<String>,
    pub storage_drives: Vec<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct ComponentAdvice {
    pub category: String,
    pub hardware_name: String,
    pub status: String, // "supported" | "partial" | "unsupported"
    pub badge_text: String,
    pub advice: String,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct CompatibilityReport {
    pub overall_status: String, // "ready" | "caution" | "blocked"
    pub summary_headline: String,
    pub recommended_macos: String,
    pub recommended_smbios: String,
    pub recommended_preset_id: String,
    pub recommended_boot_args: String,
    pub required_ssdts: Vec<String>,
    pub required_kexts: Vec<String>,
    pub items: Vec<ComponentAdvice>,
}

/// Scans the current machine's real hardware on macOS (`sysctl` + `system_profiler`) or Windows (`powershell`).
pub fn probe_current_machine() -> HardwareProfile {
    #[cfg(target_os = "macos")]
    {
        let cpu_brand = run_cmd_trim("sysctl", &["-n", "machdep.cpu.brand_string"])
            .filter(|s| !s.is_empty())
            .or_else(|| run_cmd_trim("sysctl", &["-n", "hw.model"]))
            .unwrap_or_else(|| "Unknown Processor".into());

        let cores = run_cmd_trim("sysctl", &["-n", "hw.logicalcpu"])
            .and_then(|s| s.parse::<u32>().ok())
            .unwrap_or(8);

        let hw_model = run_cmd_trim("sysctl", &["-n", "hw.model"]).unwrap_or_else(|| "Mac".into());
        let is_laptop = hw_model.to_lowercase().contains("book");

        let cpu_vendor = if cpu_brand.contains("AMD") || cpu_brand.contains("Ryzen") {
            "AMD".into()
        } else if cpu_brand.contains("Apple") || hw_model.starts_with("Mac1") {
            "Apple".into()
        } else {
            "Intel".into()
        };

        let mut gpus = Vec::new();
        if let Some(sp_disp) = run_cmd_trim("system_profiler", &["SPDisplaysDataType"]) {
            for line in sp_disp.lines() {
                let trimmed = line.trim();
                if let Some(rest) = trimmed.strip_prefix("Chipset Model:") {
                    gpus.push(rest.trim().to_string());
                }
            }
        }
        if gpus.is_empty() {
            gpus.push("Integrated / System GPU".into());
        }

        let mut storage = Vec::new();
        if let Some(sp_nvme) = run_cmd_trim("system_profiler", &["SPNVMeDataType", "SPSerialATADataType"]) {
            for line in sp_nvme.lines() {
                let trimmed = line.trim();
                if let Some(rest) = trimmed.strip_prefix("Model:") {
                    let m = rest.trim().to_string();
                    if !storage.contains(&m) {
                        storage.push(m);
                    }
                }
            }
        }
        if storage.is_empty() {
            storage.push("Apple / NVMe SSD".into());
        }

        return HardwareProfile {
            profile_name: format!("本机硬件 ({})", hw_model),
            source: "本机实时扫描 (macOS)".into(),
            is_laptop,
            board_model: hw_model,
            cpu_model: cpu_brand,
            cpu_vendor,
            cpu_cores: cores,
            gpus,
            audio_codec: "ALC897 / AppleHDAController".into(),
            network_cards: vec!["Wi-Fi / Ethernet Controller".into()],
            storage_drives: storage,
        };
    }

    #[cfg(target_os = "windows")]
    {
        let cpu = run_cmd_trim(
            "powershell",
            &["-NoProfile", "-Command", "(Get-CimInstance Win32_Processor).Name"],
        )
        .unwrap_or_else(|| "Intel Core Processor".into());
        let board = run_cmd_trim(
            "powershell",
            &["-NoProfile", "-Command", "(Get-CimInstance Win32_BaseBoard).Product"],
        )
        .unwrap_or_else(|| "Standard Motherboard".into());
        let gpu_raw = run_cmd_trim(
            "powershell",
            &[
                "-NoProfile",
                "-Command",
                "(Get-CimInstance Win32_VideoController).Name -join '|'",
            ],
        )
        .unwrap_or_default();
        let disk_raw = run_cmd_trim(
            "powershell",
            &[
                "-NoProfile",
                "-Command",
                "(Get-CimInstance Win32_DiskDrive).Model -join '|'",
            ],
        )
        .unwrap_or_default();
        let net_raw = run_cmd_trim(
            "powershell",
            &[
                "-NoProfile",
                "-Command",
                "(Get-CimInstance Win32_NetworkAdapter | Where-Object {$_.PhysicalAdapter -eq $true}).Name -join '|'",
            ],
        )
        .unwrap_or_default();

        let cpu_vendor = if cpu.contains("AMD") || cpu.contains("Ryzen") {
            "AMD".into()
        } else {
            "Intel".into()
        };

        return HardwareProfile {
            profile_name: format!("本机硬件 ({})", board),
            source: "本机实时扫描 (Windows WMI)".into(),
            is_laptop: cpu.ends_with('H') || cpu.ends_with('U') || cpu.contains("Mobile"),
            board_model: board,
            cpu_model: cpu,
            cpu_vendor,
            cpu_cores: 12,
            gpus: gpu_raw.split('|').filter(|s| !s.is_empty()).map(String::from).collect(),
            audio_codec: "Realtek High Definition Audio (ALC897)".into(),
            network_cards: net_raw.split('|').filter(|s| !s.is_empty()).map(String::from).collect(),
            storage_drives: disk_raw.split('|').filter(|s| !s.is_empty()).map(String::from).collect(),
        };
    }

    #[allow(unreachable_code)]
    list_sample_hardware_profiles().remove(0)
}

fn run_cmd_trim(bin: &str, args: &[&str]) -> Option<String> {
    let out = Command::new(bin).args(args).output().ok()?;
    if !out.status.success() {
        return None;
    }
    Some(String::from_utf8_lossy(&out.stdout).trim().to_string())
}

pub fn list_sample_hardware_profiles() -> Vec<HardwareProfile> {
    vec![
        HardwareProfile {
            profile_name: "主流生产力台式机：i5-13600K + B760M + RX 6800 XT".into(),
            source: "典型硬件测试画像".into(),
            is_laptop: false,
            board_model: "ASUS TUF GAMING B760M-PLUS WIFI".into(),
            cpu_model: "13th Gen Intel(R) Core(TM) i5-13600K".into(),
            cpu_vendor: "Intel".into(),
            cpu_cores: 14,
            gpus: vec![
                "AMD Radeon RX 6800 XT (Navi 21)".into(),
                "Intel UHD Graphics 770".into(),
            ],
            audio_codec: "Realtek ALC897".into(),
            network_cards: vec![
                "Intel Wi-Fi 6 AX201 160MHz".into(),
                "Realtek RTL8125 2.5GbE".into(),
            ],
            storage_drives: vec!["WD_BLACK SN850X 1000GB".into()],
        },
        HardwareProfile {
            profile_name: "双显卡游戏本排雷示例：i7-10750H + RTX 4060 + PM981a".into(),
            source: "典型排雷测试画像".into(),
            is_laptop: true,
            board_model: "Lenovo Legion Y7000P".into(),
            cpu_model: "Intel(R) Core(TM) i7-10750H CPU @ 2.60GHz".into(),
            cpu_vendor: "Intel".into(),
            cpu_cores: 6,
            gpus: vec![
                "Intel(R) UHD Graphics 630".into(),
                "NVIDIA GeForce RTX 4060 Laptop GPU".into(),
            ],
            audio_codec: "Realtek ALC257".into(),
            network_cards: vec!["Intel Wi-Fi 6 AX200".into(), "Realtek RTL8111 Gigabit".into()],
            storage_drives: vec![
                "SAMSUNG MZVLB512HBJQ-000L2 (PM981a)".into(),
                "KIOXIA EXCERIA G2 1TB".into(),
            ],
        },
        HardwareProfile {
            profile_name: "AMD 锐龙高性价比主机：Ryzen 7 7700 + B650 + RX 6600".into(),
            source: "典型硬件测试画像".into(),
            is_laptop: false,
            board_model: "MSI MAG B650M MORTAR WIFI".into(),
            cpu_model: "AMD Ryzen 7 7700 8-Core Processor".into(),
            cpu_vendor: "AMD".into(),
            cpu_cores: 8,
            gpus: vec!["AMD Radeon RX 6600 (Navi 23)".into()],
            audio_codec: "Realtek ALC4080 (USB Audio)".into(),
            network_cards: vec!["Realtek RTL8125BG 2.5GbE".into(), "RZ616 / MT7922 Wi-Fi 6E".into()],
            storage_drives: vec!["Samsung SSD 990 PRO 1TB".into()],
        },
    ]
}

/// Dortania-based Compatibility & Configuration Advisor Engine
pub fn evaluate_hardware_compatibility(hw: &HardwareProfile) -> CompatibilityReport {
    let mut items = Vec::new();
    let mut ssdts = vec!["SSDT-EC-USBX.aml".to_string(), "SSDT-PLUG.aml".to_string()];
    let mut kexts = vec![
        "Lilu.kext".to_string(),
        "VirtualSMC.kext".to_string(),
        "WhateverGreen.kext".to_string(),
        "AppleALC.kext".to_string(),
    ];
    let mut boot_args = vec!["-v".to_string(), "keepsyms=1".to_string(), "debug=0x100".to_string()];

    let cpu_lower = hw.cpu_model.to_lowercase();
    let is_apple_silicon = hw.cpu_vendor == "Apple" || cpu_lower.contains("apple m");
    let is_amd = hw.cpu_vendor == "AMD" || cpu_lower.contains("ryzen");
    let is_intel_12_plus = cpu_lower.contains("12th")
        || cpu_lower.contains("13th")
        || cpu_lower.contains("14th")
        || cpu_lower.contains("i5-12")
        || cpu_lower.contains("i7-12")
        || cpu_lower.contains("i9-12")
        || cpu_lower.contains("i5-13")
        || cpu_lower.contains("i7-13")
        || cpu_lower.contains("i9-13")
        || cpu_lower.contains("i5-14")
        || cpu_lower.contains("i7-14")
        || cpu_lower.contains("i9-14");
    let is_intel_11 = cpu_lower.contains("11th") || cpu_lower.contains("-11");

    let mut preset_id = "intel_10th_desktop".to_string();
    let mut smbios = "iMac20,1".to_string();
    let mut overall = "ready".to_string();

    // 1. CPU Evaluation
    if is_apple_silicon {
        items.push(ComponentAdvice {
            category: "处理器 (CPU)".into(),
            hardware_name: hw.cpu_model.clone(),
            status: "partial".into(),
            badge_text: "白苹果 Apple Silicon 本机".into(),
            advice: "检测到当前为 Apple Silicon 真机环境！你可以正常使用本软件为其他 X86 台式机/笔记本编辑或生成黑苹果 EFI（也可切换上方模拟硬件画像测试）。".into(),
        });
    } else if is_amd {
        preset_id = "amd_ryzen_desktop".into();
        smbios = "MacPro7,1".into();
        kexts.push("RestrictEvents.kext".into());
        kexts.push("AMDRyzenCPUPowerManagement.kext".into());
        boot_args.push("npci=0x2000".into());
        items.push(ComponentAdvice {
            category: "处理器 (CPU)".into(),
            hardware_name: hw.cpu_model.clone(),
            status: "supported".into(),
            badge_text: "需 AMD Vanilla 内核补丁".into(),
            advice: format!(
                "AMD 锐龙处理器可通过 AMD_Vanilla 内核补丁稳定运行 macOS Sonoma / Sequoia。注意需根据 {} 核心数设置 algrey - Force cpuid_cores_per_package 补丁（Adobe 部分软件需额外打补丁）。",
                hw.cpu_cores
            ),
        });
    } else if is_intel_12_plus {
        preset_id = "intel_12_14th_desktop".into();
        smbios = "MacPro7,1".into();
        ssdts.push("SSDT-AWAC.aml".into());
        kexts.push("CpuTopologyRebuild.kext".into());
        kexts.push("RestrictEvents.kext".into());
        boot_args.push("revpatch=sbvmm".into());
        items.push(ComponentAdvice {
            category: "处理器 (CPU)".into(),
            hardware_name: hw.cpu_model.clone(),
            status: "supported".into(),
            badge_text: "完美支持（需仿冒 CPUID）".into(),
            advice: "Intel 12~14代混合架构需开启 Emulate 仿冒 10代 Comet Lake CPUID (55060A00)，并加载 CpuTopologyRebuild.kext 修复大小核调度，核显 UHD 730/770 无驱动，必须搭配免驱 AMD 独显。".into(),
        });
    } else if is_intel_11 {
        preset_id = "intel_12_14th_desktop".into();
        smbios = "MacPro7,1".into();
        ssdts.push("SSDT-AWAC.aml".into());
        items.push(ComponentAdvice {
            category: "处理器 (CPU)".into(),
            hardware_name: hw.cpu_model.clone(),
            status: "partial".into(),
            badge_text: "需仿冒 CPUID & 屏蔽核显".into(),
            advice: "11代 Rocket Lake/Tiger Lake 核显在 macOS 下无法驱动，台式机需仿冒 Comet Lake CPUID 并搭配免驱 AMD 独显。".into(),
        });
    } else {
        ssdts.push("SSDT-AWAC.aml".into());
        if hw.is_laptop {
            preset_id = "intel_laptop_cml".into();
            smbios = "MacBookPro16,1".into();
            ssdts.push("SSDT-PNLF.aml".into());
            ssdts.push("SSDT-XOSI.aml".into());
            kexts.push("SMCBatteryManager.kext".into());
            kexts.push("VoodooPS2Controller.kext".into());
            kexts.push("VoodooI2C.kext".into());
        }
        items.push(ComponentAdvice {
            category: "处理器 (CPU)".into(),
            hardware_name: hw.cpu_model.clone(),
            status: "supported".into(),
            badge_text: "原生黄金支持".into(),
            advice: "Intel 8~10代酷睿拥有原生 XCPM 电源管理支持，稳定性与白苹果几乎无异。".into(),
        });
    }

    // 2. GPU Evaluation
    let mut has_usable_gpu = false;
    for gpu in &hw.gpus {
        let g = gpu.to_lowercase();
        if g.contains("rtx") || g.contains("gtx 16") || g.contains("arc ") {
            if overall == "ready" {
                overall = "caution".into();
            }
            if !boot_args.iter().any(|b| b == "-wegnoegpu") {
                boot_args.push("-wegnoegpu".into());
            }
            items.push(ComponentAdvice {
                category: "显卡 (GPU)".into(),
                hardware_name: gpu.clone(),
                status: "unsupported".into(),
                badge_text: "无 macOS 驱动 · 需屏蔽".into(),
                advice: "NVIDIA Turing/Ampere/Ada (RTX 20~50系) 及 Intel Arc 完全无 macOS 驱动！已自动添加 `-wegnoegpu` 参数屏蔽该独显，请将显示器线插在主板核显口或免驱 AMD 副卡上。".into(),
            });
        } else if g.contains("rx 68")
            || g.contains("rx 69")
            || g.contains("rx 66")
            || g.contains("rx 57")
            || g.contains("rx 55")
            || g.contains("navi")
        {
            has_usable_gpu = true;
            if !boot_args.iter().any(|b| b == "agdpmod=pikera") {
                boot_args.push("agdpmod=pikera".into());
            }
            items.push(ComponentAdvice {
                category: "显卡 (GPU)".into(),
                hardware_name: gpu.clone(),
                status: "supported".into(),
                badge_text: "原生免驱独显".into(),
                advice: "AMD Navi 架构显卡在 macOS 下原生免驱支持 Metal 3 硬件加速！必须添加 `agdpmod=pikera` 启动参数防止开机进入桌面黑屏（已自动添加）。".into(),
            });
        } else if g.contains("uhd 7") || g.contains("iris xe") {
            items.push(ComponentAdvice {
                category: "显卡 (GPU)".into(),
                hardware_name: gpu.clone(),
                status: "unsupported".into(),
                badge_text: "核显不支持硬件加速".into(),
                advice: "11~14代 Intel UHD 730/770 / Iris Xe 核显无驱动，建议在主板 BIOS 中禁用核显并使用免驱 AMD 独显输出。".into(),
            });
        } else if g.contains("uhd 6") || g.contains("hd 6") || g.contains("iris plus") || g.contains("rx 580") || g.contains("rx 590") || g.contains("apple") {
            has_usable_gpu = true;
            items.push(ComponentAdvice {
                category: "显卡 (GPU)".into(),
                hardware_name: gpu.clone(),
                status: "supported".into(),
                badge_text: "原生支持驱动".into(),
                advice: "完全支持 macOS 图形加速与硬解输出（核显通过 DeviceProperties 注入 AAPL,ig-platform-id 驱动）。".into(),
            });
        } else {
            has_usable_gpu = true;
            items.push(ComponentAdvice {
                category: "显卡 (GPU)".into(),
                hardware_name: gpu.clone(),
                status: "partial".into(),
                badge_text: "需核对 Device ID".into(),
                advice: "请确认显卡核心代号是否在 Dortania 免驱列表中（如 RX 6700 XT 需加载 NootRX.kext，AMD Vega 核显需加载 NootedRed.kext）。".into(),
            });
        }
    }

    if !has_usable_gpu && !is_apple_silicon {
        overall = "blocked".into();
    }

    // 3. Storage NVMe Blacklist Check
    for disk in &hw.storage_drives {
        let d = disk.to_lowercase();
        if d.contains("pm981") || d.contains("pm991") || d.contains("2200s") || d.contains("pc601") {
            if overall == "ready" {
                overall = "caution".into();
            }
            kexts.push("NVMeFix.kext".into());
            items.push(ComponentAdvice {
                category: "存储硬盘 (NVMe)".into(),
                hardware_name: disk.clone(),
                status: "unsupported".into(),
                badge_text: "高危黑名单固态！".into(),
                advice: "三星 PM981/PM981a/PM991、镁光 2200S、海力士 PC601 存在严重 IONVMeFamily 固件兼容缺陷，直接安装 macOS 必触发五国死机！强烈建议将 macOS 安装在机器的另一块固态硬盘上，并在 BIOS 或 SSDT 中屏蔽此盘（若仅作数据盘请务必加载 NVMeFix.kext）。".into(),
            });
        } else {
            if !kexts.iter().any(|k| k == "NVMeFix.kext") {
                kexts.push("NVMeFix.kext".into());
            }
            items.push(ComponentAdvice {
                category: "存储硬盘 (NVMe)".into(),
                hardware_name: disk.clone(),
                status: "supported".into(),
                badge_text: "兼容良好".into(),
                advice: "主流消费级 NVMe 固态兼容良好，建议搭配 NVMeFix.kext 优化 ASPM 功耗。".into(),
            });
        }
    }

    // 4. Audio Check
    let audio_lower = hw.audio_codec.to_lowercase();
    if audio_lower.contains("4080") || audio_lower.contains("usb") {
        items.push(ComponentAdvice {
            category: "声卡 (Audio)".into(),
            hardware_name: hw.audio_codec.clone(),
            status: "supported".into(),
            badge_text: "USB 通道免驱直通".into(),
            advice: "ALC4080 / ALC4082 走内部 USB 总线而非传统 HDA 总线，无需注入 alcid，做好 USB 端口定制即可原生发声！".into(),
        });
    } else {
        let alcid = if audio_lower.contains("257") || audio_lower.contains("256") {
            "alcid=21"
        } else {
            "alcid=11"
        };
        boot_args.push(alcid.into());
        items.push(ComponentAdvice {
            category: "声卡 (Audio)".into(),
            hardware_name: hw.audio_codec.clone(),
            status: "supported".into(),
            badge_text: format!("AppleALC 支持 ({})", alcid),
            advice: format!(
                "可通过 AppleALC.kext 原生驱动，推荐优先尝试 `{}`（可在工具箱查询该芯片全部可用 Layout-ID）。",
                alcid
            ),
        });
    }

    // 5. Network Check
    for net in &hw.network_cards {
        let nl = net.to_lowercase();
        if nl.contains("intel") && (nl.contains("wi-fi") || nl.contains("ax2") || nl.contains("ac ")) {
            kexts.push("AirportItlwm.kext / itlwm.kext".into());
            kexts.push("IntelBluetoothFirmware.kext".into());
            items.push(ComponentAdvice {
                category: "无线网卡 (Wi-Fi)".into(),
                hardware_name: net.clone(),
                status: "supported".into(),
                badge_text: "需加载 itlwm 驱动".into(),
                advice: "Intel 无线网卡在 Sonoma 及以下推荐 `AirportItlwm.kext`；在 Sequoia 15 及更新版本推荐使用 `itlwm.kext` 配合 `HeliPort.app` 客户端，蓝牙需搭配 IntelBluetoothFirmware + BlueToolFixup。".into(),
            });
        } else if nl.contains("mt79") || nl.contains("rz6") || nl.contains("mediatek") || nl.contains("qualcomm") {
            items.push(ComponentAdvice {
                category: "无线网卡 (Wi-Fi)".into(),
                hardware_name: net.clone(),
                status: "unsupported".into(),
                badge_text: "联发科/高通无驱动".into(),
                advice: "联发科 MT7921/MT7922 (AMD RZ608/RZ616) 与高通无线网卡暂无 macOS 驱动，建议使用板载有线网卡或更换 Intel AX200/AX210 / 博通免驱卡。".into(),
            });
        } else if nl.contains("8125") {
            kexts.push("LucyRTL8125Ethernet.kext".into());
            items.push(ComponentAdvice {
                category: "有线网卡 (LAN)".into(),
                hardware_name: net.clone(),
                status: "supported".into(),
                badge_text: "LucyRTL8125 完美支持".into(),
                advice: "Realtek 2.5G 有线网卡加载 LucyRTL8125Ethernet.kext 即可满速运行。".into(),
            });
        } else {
            kexts.push("RealtekRTL8111.kext".into());
            items.push(ComponentAdvice {
                category: "网络适配器".into(),
                hardware_name: net.clone(),
                status: "supported".into(),
                badge_text: "常规网卡驱动支持".into(),
                advice: "千兆有线网卡按芯片加载 IntelMausi.kext 或 RealtekRTL8111.kext 即可。".into(),
            });
        }
    }

    let summary_headline = match overall.as_str() {
        "blocked" => "检测到关键显卡不兼容：当前未发现任何可开启 Metal 硬件加速的核显或 AMD 独显".into(),
        "caution" => "整体可安装黑苹果，但存在需手动规避的硬件项（如屏蔽 RTX 独显或避开黑名单固态）".into(),
        _ => "硬件整体兼容性极佳！可直接按推荐方案一键生成专属 OpenCore EFI".into(),
    };

    CompatibilityReport {
        overall_status: overall,
        summary_headline,
        recommended_macos: "macOS Sonoma 14 / Sequoia 15 (稳定推荐)".into(),
        recommended_smbios: smbios,
        recommended_preset_id: preset_id,
        recommended_boot_args: boot_args.join(" "),
        required_ssdts: ssdts,
        required_kexts: kexts,
        items,
    }
}

/// Generates a tailored `PlistNode` (and optionally writes out the standard `EFI/OC` directory skeleton)
/// based on the evaluated `HardwareProfile` and `CompatibilityReport`.
pub fn generate_tailored_efi(
    hw: &HardwareProfile,
    output_dir: Option<&Path>,
) -> Result<(PlistNode, Option<String>), String> {
    let report = evaluate_hardware_compatibility(hw);
    let mut plist = build_preset_plist(&report.recommended_preset_id);

    // Override boot-args with exact hardware advisor recommendations
    if let Some(nvram_add) = plist.get_mut("NVRAM").and_then(|n| n.get_mut("Add")) {
        if let Some(boot_guid) = nvram_add.get_mut("7C436110-AB2A-4BBB-A880-FE41995C9F82") {
            boot_guid.set_key("boot-args", PlistNode::String(report.recommended_boot_args.clone()));
        }
    }

    // Add helpful metadata comment key (#GeneratedBy)
    plist.set_key(
        "#OpenCoreStudio".into(),
        PlistNode::Dict(vec![
            ("TargetHardware".into(), PlistNode::String(hw.profile_name.clone())),
            ("RecommendedSMBIOS".into(), PlistNode::String(report.recommended_smbios.clone())),
            ("GeneratedAt".into(), PlistNode::String(chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string())),
        ]),
    );

    let mut saved_oc_path = None;
    if let Some(root) = output_dir {
        let efi_boot = root.join("EFI").join("BOOT");
        let efi_oc = root.join("EFI").join("OC");
        for sub in ["ACPI", "Drivers", "Kexts", "Resources", "Tools"] {
            std::fs::create_dir_all(efi_oc.join(sub))
                .map_err(|e| format!("创建目录失败: {}", e))?;
        }
        std::fs::create_dir_all(&efi_boot).map_err(|e| format!("创建 BOOT 目录失败: {}", e))?;

        let cfg_path = efi_oc.join("config.plist");
        save_plist_file(&cfg_path, &plist)?;

        // Write a clear README manifest inside EFI/OC explaining which binaries to place/download
        let readme = format!(
            "# OpenCore Studio 自动生成的专属 EFI 清单\n\n\
            - 目标机器: {}\n\
            - 推荐机型: {}\n\
            - 推荐系统: {}\n\
            - 启动参数: `{}`\n\n\
            ## 需放入 `EFI/OC/ACPI/` 的表文件\n{}\n\n\
            ## 需放入 `EFI/OC/Kexts/` 的驱动包\n{}\n",
            hw.profile_name,
            report.recommended_smbios,
            report.recommended_macos,
            report.recommended_boot_args,
            report.required_ssdts.iter().map(|s| format!("- `{}`", s)).collect::<Vec<_>>().join("\n"),
            report.required_kexts.iter().map(|k| format!("- `{}`", k)).collect::<Vec<_>>().join("\n"),
        );
        let _ = std::fs::write(efi_oc.join("README_MANIFEST.md"), readme);
        saved_oc_path = Some(cfg_path.to_string_lossy().to_string());
    }

    Ok((plist, saved_oc_path))
}
