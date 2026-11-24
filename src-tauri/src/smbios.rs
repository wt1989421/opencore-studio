use rand::Rng;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct SmbiosModelSpec {
    pub model: String,
    pub category: String, // "Desktop" | "Laptop" | "Workstation"
    pub cpu_family: String,
    pub min_macos: String,
    pub max_macos: String,
    pub gpu_note: String,
    pub model_code: &'static str, // 4-char Apple serial suffix
    pub board_code: &'static str,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct GeneratedSmbios {
    pub model: String,
    pub serial: String,
    pub mlb: String,
    pub system_uuid: String,
    pub rom_hex: String,
    pub cpu_family: String,
    pub macos_support: String,
}

pub const SMBIOS_CATALOG: &[(&str, &str, &str, &str, &str, &str, &str)] = &[
    (
        "iMac19,1",
        "Desktop",
        "Intel 8/9代酷睿 (Coffee Lake)",
        "macOS 10.14.4 ~ Tahoe 26 (OCLP) / Sequoia 15 原生",
        "核显 UHD 630 + AMD 独显或纯核显",
        "JV3Q",
        "J132",
    ),
    (
        "iMac20,1",
        "Desktop",
        "Intel 10代酷睿 (Comet Lake i5/i7)",
        "macOS 10.15.6 ~ Sequoia 15 / Tahoe 26 原生",
        "核显 UHD 630 或免驱 AMD RX 500/5000/6000 独显",
        "PN5T",
        "J185",
    ),
    (
        "iMac20,2",
        "Desktop",
        "Intel 10代酷睿 i9 (Comet Lake 10核)",
        "macOS 10.15.6 ~ Sequoia 15 / Tahoe 26 原生",
        "高配 10代 i9 台式机首选",
        "046W",
        "J185F",
    ),
    (
        "iMacPro1,1",
        "Workstation",
        "Intel Xeon / 无核显酷睿 F 系 / AMD Ryzen",
        "macOS 10.13.2 ~ Sequoia 15 原生",
        "必须搭配免驱 AMD 独显（无核显硬件加速配置）",
        "HX87",
        "J137",
    ),
    (
        "MacPro7,1",
        "Workstation",
        "Intel 12~14代酷睿 (Alder/Raptor Lake) / AMD Ryzen Zen 3~5",
        "macOS 10.15.1 ~ Sequoia 15 / Tahoe 26 原生",
        "无核显平台 + 免驱 AMD RX 5000/6000 独显旗舰首选（注意需 RestrictEvents 处理内存警告）",
        "P7QM",
        "J160",
    ),
    (
        "Macmini8,1",
        "Desktop",
        "Intel 8~10代纯核显迷你主机 (NUC / ITX)",
        "macOS 10.14.1 ~ Sequoia 15",
        "仅使用 Intel UHD 630 核显输出的台式机/小主机",
        "JYVX",
        "J174",
    ),
    (
        "MacBookPro15,2",
        "Laptop",
        "Intel 8代酷睿低压本 (Coffee Lake-U)",
        "macOS 10.13.6 ~ Sequoia 15",
        "Intel Iris Plus 655 / UHD 620 核显笔记本",
        "JHCC",
        "J132",
    ),
    (
        "MacBookPro16,1",
        "Laptop",
        "Intel 9/10代酷睿标压本 (Coffee/Comet Lake-H) 或 AMD 锐龙本",
        "macOS 10.15.1 ~ Sequoia 15 / Tahoe 26 原生",
        "标压游戏本/全能本（屏蔽 RTX 独显用核显，或搭配 NootedRed）",
        "MD6N",
        "J152F",
    ),
    (
        "MacBookPro16,2",
        "Laptop",
        "Intel 10代 Ice Lake (G4/G7 核显笔记本)",
        "macOS 10.15.4 ~ Sequoia 15 / Tahoe 26 原生",
        "10代 1035G1/1065G7 Ice Lake 核显专属机型",
        "ML7H",
        "J223",
    ),
    (
        "MacBookPro16,3",
        "Laptop",
        "Intel 8~10代低压核显轻薄本 (Comet Lake-U)",
        "macOS 10.15.4 ~ Sequoia 15 / Tahoe 26 原生",
        "10代 i5-10210U / i7-10510U 轻薄本首选",
        "P3XY",
        "J214K",
    ),
];

const BASE34_CHARS: &[u8] = b"0123456789ABCDEFGHJKLMNPQRSTUVWXYZ";
const APPLE_OUI_PREFIXES: &[&str] = &["0016CB", "001FF3", "003EE1", "3C0754", "A82066", "F01898"];

pub fn list_smbios_models() -> Vec<serde_json::Value> {
    SMBIOS_CATALOG
        .iter()
        .map(|(model, cat, cpu, macos, gpu, _, _)| {
            serde_json::json!({
                "model": model,
                "category": cat,
                "cpuFamily": cpu,
                "macosSupport": macos,
                "gpuNote": gpu,
            })
        })
        .collect()
}

pub fn generate_smbios_for_model(requested_model: &str) -> GeneratedSmbios {
    let entry = SMBIOS_CATALOG
        .iter()
        .find(|(m, _, _, _, _, _, _)| *m == requested_model)
        .unwrap_or(&SMBIOS_CATALOG[1]); // Default iMac20,1

    let mut rng = rand::thread_rng();
    let plant_codes = ["C02", "C07", "CK2", "F5K", "W80"];
    let plant = plant_codes[rng.gen_range(0..plant_codes.len())];

    // Apple Year/Week chars (Base-27 style valid manufacturing window: C/D/F/G/H)
    let year_chars = [b'C', b'D', b'F', b'G'];
    let week_chars = b"123456789CDFGHJKLMNPQRSTVWXYZ";
    let yr = year_chars[rng.gen_range(0..year_chars.len())] as char;
    let wk = week_chars[rng.gen_range(0..week_chars.len())] as char;

    let uniq: String = (0..3)
        .map(|_| BASE34_CHARS[rng.gen_range(0..BASE34_CHARS.len())] as char)
        .collect();

    // 12-char Apple Serial: PPP + Y + W + UUU + MMMM
    let serial = format!("{}{}{}{}{}", plant, yr, wk, uniq, entry.5);

    // 17-char MLB Board Serial: PPP + YY + WW + UUUUU + BBBB + C
    let week_num = rng.gen_range(1..=52);
    let mlb_mid: String = (0..5)
        .map(|_| BASE34_CHARS[rng.gen_range(0..BASE34_CHARS.len())] as char)
        .collect();
    let eee_code: String = (0..4)
        .map(|_| BASE34_CHARS[rng.gen_range(0..BASE34_CHARS.len())] as char)
        .collect();
    let check_char = BASE34_CHARS[rng.gen_range(0..BASE34_CHARS.len())] as char;
    let mlb = format!("{}0{:02}{}{}{}", plant, week_num, mlb_mid, eee_code, check_char);

    let system_uuid = Uuid::new_v4().to_string().to_uppercase();

    let oui = APPLE_OUI_PREFIXES[rng.gen_range(0..APPLE_OUI_PREFIXES.len())];
    let nic_tail = format!(
        "{:02X}{:02X}{:02X}",
        rng.gen::<u8>(),
        rng.gen::<u8>(),
        rng.gen::<u8>()
    );
    let rom_hex = format!("{}{}", oui, nic_tail);

    GeneratedSmbios {
        model: entry.0.to_string(),
        serial,
        mlb,
        system_uuid,
        rom_hex,
        cpu_family: entry.2.to_string(),
        macos_support: entry.3.to_string(),
    }
}
