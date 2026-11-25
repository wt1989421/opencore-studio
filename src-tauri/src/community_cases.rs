use crate::hw_advisor::HardwareProfile;
use serde::{Deserialize, Serialize};
use std::process::Command;

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct CommunityEfiCase {
    pub repo_full_name: String,
    pub html_url: String,
    pub stars: u32,
    pub updated_at: String,
    pub bootloader: String, // "OpenCore" | "Clover"
    pub macos_tested: String,
    pub hardware_tags: Vec<String>,
    pub description: String,
    pub match_badge: String,
    pub recommended_preset_id: String,
    pub source_kind: String, // "GitHub 实时检索" | "精选验证案例"
}

/// Extracts concise search keywords (CPU model code like "7700K", "13600K", "9900X" or board chipset like "B760M", "Z270", "X870")
pub fn build_search_query_from_hardware(hw: &HardwareProfile) -> String {
    let mut tokens: Vec<String> = Vec::new();

    // Extract CPU token (e.g. i7-7700K -> 7700K, i5-13600K -> 13600K, Ryzen 9 9900X -> 9900X)
    for word in hw
        .cpu_model
        .replace(['(', ')', ',', '@'], " ")
        .split_whitespace()
    {
        let upper = word.to_uppercase();
        if upper.contains("7700")
            || upper.contains("13600")
            || upper.contains("14700")
            || upper.contains("12700")
            || upper.contains("10750")
            || upper.contains("10400")
            || upper.contains("10700")
            || upper.contains("9900")
            || upper.contains("9950")
            || upper.contains("7950")
            || (upper.starts_with("I3-") || upper.starts_with("I5-") || upper.starts_with("I7-") || upper.starts_with("I9-"))
            || (upper.chars().any(|c| c.is_ascii_digit()) && (upper.ends_with('K') || upper.ends_with('X') || upper.ends_with('H') || upper.ends_with('U')))
        {
            let clean = upper
                .trim_start_matches("I3-")
                .trim_start_matches("I5-")
                .trim_start_matches("I7-")
                .trim_start_matches("I9-")
                .to_string();
            if clean.len() >= 4 && !tokens.contains(&clean) {
                tokens.push(clean);
                break;
            }
        }
    }

    // Extract Motherboard chipset token if present (e.g. Z270, B760M, B660, Z690, B650, X870, Y7000P)
    for word in hw.board_model.split_whitespace() {
        let upper = word.to_uppercase();
        if upper.starts_with('Z')
            || upper.starts_with('B')
            || upper.starts_with('H')
            || upper.starts_with('X')
            || upper.contains("Y7000")
            || upper.contains("NUC")
        {
            if upper.chars().any(|c| c.is_ascii_digit()) && !upper.starts_with("MAC") && !upper.starts_with("IMAC") {
                tokens.push(upper);
                break;
            }
        }
    }

    if tokens.is_empty() {
        "OpenCore Hackintosh EFI".into()
    } else {
        format!("{} Hackintosh EFI", tokens.join(" "))
    }
}

/// Queries GitHub Search API live for real community Hackintosh EFI repositories,
/// merged with curated verified benchmark repositories so results are always rich & reliable.
pub fn search_community_cases(
    custom_query: Option<&str>,
    hw: Option<&HardwareProfile>,
) -> (String, Vec<CommunityEfiCase>) {
    let effective_query = custom_query
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .or_else(|| hw.map(build_search_query_from_hardware))
        .unwrap_or_else(|| "OpenCore Hackintosh EFI".into());

    let mut out = Vec::new();

    // 1. Live GitHub Search API query (respects OS system proxy via native curl / PowerShell)
    if let Ok(live_items) = fetch_github_repositories_live(&effective_query) {
        out.extend(live_items);
    }

    // 2. Append matching curated high-reliability cases (deduplicated by repo_full_name)
    for curated in curated_verified_cases(&effective_query) {
        if !out
            .iter()
            .any(|c| c.repo_full_name.eq_ignore_ascii_case(&curated.repo_full_name))
        {
            out.push(curated);
        }
    }

    out.truncate(10);
    (effective_query, out)
}

fn url_encode_simple(s: &str) -> String {
    let mut encoded = String::new();
    for b in s.bytes() {
        if b.is_ascii_alphanumeric() || b == b'-' || b == b'_' || b == b'.' {
            encoded.push(b as char);
        } else if b == b' ' {
            encoded.push('+');
        } else {
            encoded.push_str(&format!("%{:02X}", b));
        }
    }
    encoded
}

fn fetch_github_repositories_live(query: &str) -> Result<Vec<CommunityEfiCase>, String> {
    let full_q = if query.to_lowercase().contains("efi") || query.to_lowercase().contains("hackintosh") || query.to_lowercase().contains("opencore") {
        query.to_string()
    } else {
        format!("{} OpenCore EFI", query)
    };
    let api_url = format!(
        "https://api.github.com/search/repositories?q={}&sort=stars&order=desc&per_page=6",
        url_encode_simple(&full_q)
    );

    #[cfg(not(target_os = "windows"))]
    let raw_json = {
        let output = Command::new("curl")
            .args([
                "-fsSL",
                "--max-time",
                "6",
                "-H",
                "Accept: application/vnd.github+json",
                "-H",
                "User-Agent: OpenCore-Studio/0.4",
                &api_url,
            ])
            .output()
            .map_err(|e| e.to_string())?;
        if !output.status.success() {
            return Err("GitHub API 请求超时或受限".into());
        }
        String::from_utf8_lossy(&output.stdout).to_string()
    };

    #[cfg(target_os = "windows")]
    let raw_json = {
        let ps_cmd = format!(
            "[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; Invoke-RestMethod -TimeoutSec 6 -Uri '{}' -Headers @{{'User-Agent'='OpenCore-Studio'}} | ConvertTo-Json -Depth 6 -Compress",
            api_url
        );
        let output = Command::new("powershell")
            .args(["-NoProfile", "-Command", &ps_cmd])
            .output()
            .map_err(|e| e.to_string())?;
        if !output.status.success() {
            return Err("GitHub API 请求超时或受限".into());
        }
        String::from_utf8_lossy(&output.stdout).to_string()
    };

    let parsed: serde_json::Value = serde_json::from_str(&raw_json).map_err(|e| e.to_string())?;
    let items = parsed
        .get("items")
        .and_then(|v| v.as_array())
        .ok_or_else(|| "无返回列表".to_string())?;

    let mut cases = Vec::new();
    for item in items {
        let full_name = item
            .get("full_name")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string();
        let html_url = item
            .get("html_url")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string();
        if full_name.is_empty() || html_url.is_empty() {
            continue;
        }
        let stars = item
            .get("stargazers_count")
            .and_then(|v| v.as_u64())
            .unwrap_or(0) as u32;
        let updated = item
            .get("updated_at")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .chars()
            .take(10)
            .collect::<String>();
        let desc = item
            .get("description")
            .and_then(|v| v.as_str())
            .unwrap_or("社区分享的黑苹果 EFI 引导配置仓库")
            .to_string();

        let lower_all = format!("{} {}", full_name, desc).to_lowercase();
        let bl = if lower_all.contains("clover") && !lower_all.contains("opencore") {
            "Clover"
        } else {
            "OpenCore"
        };
        let preset_id = if lower_all.contains("9900") || lower_all.contains("9950") {
            "amd_ryzen_9900x_zen5"
        } else if lower_all.contains("ryzen") || lower_all.contains("b650") || lower_all.contains("b550") {
            "amd_ryzen_desktop"
        } else if lower_all.contains("b760") || lower_all.contains("z690") || lower_all.contains("z790") || lower_all.contains("13600") || lower_all.contains("14700") {
            "intel_12_14th_desktop"
        } else if lower_all.contains("laptop") || lower_all.contains("y7000") || lower_all.contains("xps") {
            "intel_laptop_cml"
        } else {
            "intel_10th_desktop"
        };

        cases.push(CommunityEfiCase {
            repo_full_name: full_name,
            html_url,
            stars,
            updated_at: updated,
            bootloader: bl.into(),
            macos_tested: if lower_all.contains("sequoia") {
                "macOS Sequoia 15".into()
            } else if lower_all.contains("sonoma") {
                "macOS Sonoma 14".into()
            } else {
                "macOS Monterey ~ Sequoia".into()
            },
            hardware_tags: vec![bl.into()],
            description: desc,
            match_badge: "GitHub 实时同款案例".into(),
            recommended_preset_id: preset_id.into(),
            source_kind: "GitHub 实时检索".into(),
        });
    }

    Ok(cases)
}

fn curated_verified_cases(query: &str) -> Vec<CommunityEfiCase> {
    let all = vec![
        CommunityEfiCase {
            repo_full_name: "lucndm/Z270-I7700K".into(),
            html_url: "https://github.com/lucndm/Z270-I7700K".into(),
            stars: 46,
            updated_at: "2024-11".into(),
            bootloader: "OpenCore".into(),
            macos_tested: "macOS Ventura / Sonoma".into(),
            hardware_tags: vec!["i7-7700K".into(), "Z270".into(), "HD 630 / AMD RX".into()],
            description: "针对 Intel Core i7-7700K (Kaby Lake) + 200系 Z270 主板完整的 OpenCore 成功案例，含详细 BIOS 截图与声卡/USB 端口映射。".into(),
            match_badge: "同款 i7-7700K 验证案例".into(),
            recommended_preset_id: "intel_10th_desktop".into(),
            source_kind: "精选验证案例".into(),
        },
        CommunityEfiCase {
            repo_full_name: "cupecups/hackintosh-z270f".into(),
            html_url: "https://github.com/cupecups/hackintosh-z270f".into(),
            stars: 68,
            updated_at: "2024-09".into(),
            bootloader: "OpenCore".into(),
            macos_tested: "macOS Monterey / Sonoma".into(),
            hardware_tags: vec!["i7-7700K".into(), "ASUS ROG Z270F".into(), "RX 580 / 6600".into()],
            description: "华硕 ROG Strix Z270F + i7-7700K 台式机稳定日用 EFI，完美睡眠唤醒、原生电源管理与 iMessage 三码配置参考。".into(),
            match_badge: "7代酷睿台式机标杆".into(),
            recommended_preset_id: "intel_10th_desktop".into(),
            source_kind: "精选验证案例".into(),
        },
        CommunityEfiCase {
            repo_full_name: "AMD-OSX/AMD_Vanilla".into(),
            html_url: "https://github.com/AMD-OSX/AMD_Vanilla".into(),
            stars: 4650,
            updated_at: "2026-03".into(),
            bootloader: "OpenCore".into(),
            macos_tested: "macOS Catalina ~ Sequoia 15".into(),
            hardware_tags: vec!["Ryzen 9 9900X".into(), "Zen 5 / AM5".into(), "X870 / B650".into()],
            description: "AMD 锐龙黑苹果官方核心补丁仓库，全面支持 Zen ~ Zen 5 (Ryzen 9000 / 9900X / 9950X) 在 Sonoma 与 Sequoia 下原生运行。".into(),
            match_badge: "AMD 锐龙官方必看".into(),
            recommended_preset_id: "amd_ryzen_9900x_zen5".into(),
            source_kind: "精选验证案例".into(),
        },
        CommunityEfiCase {
            repo_full_name: "guocailee/oc-b760m-13700-6500".into(),
            html_url: "https://github.com/guocailee/oc-b760m-13700-6500".into(),
            stars: 192,
            updated_at: "2025-08".into(),
            bootloader: "OpenCore".into(),
            macos_tested: "macOS Sonoma / Sequoia".into(),
            hardware_tags: vec!["B760M 迫击炮".into(), "13/14代酷睿".into(), "AMD 独显".into()],
            description: "微星 MAG B760M Mortar WiFi + 13/14代酷睿大小核 + 免驱 AMD 独显高星实战配置，含大小核拓扑修复与板载 2.5G/Wi-Fi 驱动。".into(),
            match_badge: "13/14代 B760 高星标杆".into(),
            recommended_preset_id: "intel_12_14th_desktop".into(),
            source_kind: "精选验证案例".into(),
        },
        CommunityEfiCase {
            repo_full_name: "elmaleek03/ASRock-B760M-PRO-RS-Hackintosh".into(),
            html_url: "https://github.com/elmaleek03/ASRock-B760M-PRO-RS-Hackintosh".into(),
            stars: 85,
            updated_at: "2025-10".into(),
            bootloader: "OpenCore".into(),
            macos_tested: "macOS Sequoia 15".into(),
            hardware_tags: vec!["B760M".into(), "i5-13600K".into(), "RX 6600 / 6800 XT".into()],
            description: "主流 B760M + i5-13600K + RX 6000 系显卡完美引导 macOS Sequoia 15 开源仓库。".into(),
            match_badge: "Sequoia 15 实测通过".into(),
            recommended_preset_id: "intel_12_14th_desktop".into(),
            source_kind: "精选验证案例".into(),
        },
        CommunityEfiCase {
            repo_full_name: "xiaoMGitHub/LEGION_Y7000Series_Hackintosh".into(),
            html_url: "https://github.com/xiaoMGitHub/LEGION_Y7000Series_Hackintosh".into(),
            stars: 3400,
            updated_at: "2024-12".into(),
            bootloader: "OpenCore".into(),
            macos_tested: "macOS Monterey ~ Sonoma".into(),
            hardware_tags: vec!["i7-10750H".into(), "双显卡游戏本".into(), "屏蔽独显".into()],
            description: "拯救者 Y7000 / Y7000P 标压双显卡游戏本三千星神级开源仓库，含独显断电屏蔽 SSDT、内屏高刷与声卡触摸板全套定制。".into(),
            match_badge: "3.4k 星笔记本标杆".into(),
            recommended_preset_id: "intel_laptop_cml".into(),
            source_kind: "精选验证案例".into(),
        },
    ];

    let q_tokens: Vec<String> = query
        .to_lowercase()
        .split_whitespace()
        .filter(|w| *w != "hackintosh" && *w != "efi" && *w != "opencore")
        .map(String::from)
        .collect();

    if q_tokens.is_empty() {
        return all;
    }

    let mut matched: Vec<CommunityEfiCase> = all
        .iter()
        .filter(|c| {
            let hay = format!(
                "{} {} {}",
                c.repo_full_name,
                c.description,
                c.hardware_tags.join(" ")
            )
            .to_lowercase();
            q_tokens.iter().any(|t| hay.contains(t))
        })
        .cloned()
        .collect();

    if matched.is_empty() {
        matched = all;
    }
    matched
}
