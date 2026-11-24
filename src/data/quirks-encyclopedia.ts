export interface QuirkMeta {
  key: string;
  section: string;
  titleZh: string;
  desc: string;
  dortaniaTip: string;
}

export const QUIRKS_ENCYCLOPEDIA: Record<string, QuirkMeta> = {
  // ACPI Quirks
  FadtEnableReset: {
    key: "FadtEnableReset",
    section: "ACPI",
    titleZh: "修复老旧主板重启/关机寄存器",
    desc: "在 FADT 表中启用重启寄存器标志，仅用于极早期缺少标准重启定义的主板。",
    dortaniaTip: "现代主板一律保持 False，除非遇到点击重启变断电挂起。",
  },
  NormalizeHeaders: {
    key: "NormalizeHeaders",
    section: "ACPI",
    titleZh: "清理 ACPI 表头非 ASCII 字符",
    desc: "清除部分主板 ACPI 表头乱码字节以防早期 macOS (High Sierra/Mojave) 崩溃。",
    dortaniaTip: "macOS Catalina 10.15 及以上已由系统内核修复，通常保持 False。",
  },
  RebaseRegions: {
    key: "RebaseRegions",
    section: "ACPI",
    titleZh: "重定位 ACPI 物理内存基址",
    desc: "尝试重新计算 ACPI OperationRegion 物理内存地址，具有一定副作用。",
    dortaniaTip: "绝大多数机器严禁开启（保持 False），优先用 SSDT 修补。",
  },
  ResetHwSig: {
    key: "ResetHwSig",
    section: "ACPI",
    titleZh: "重置 FACS 硬件签名",
    desc: "当双系统切换修改了硬件状态导致休眠唤醒失败时，将硬件签名清零。",
    dortaniaTip: "默认保持 False。",
  },
  ResetLogoStatus: {
    key: "ResetLogoStatus",
    section: "ACPI",
    titleZh: "重置 BGRT 开机 Logo 状态标志",
    desc: "防止主板固件 BGRT 表导致开机屏幕闪烁或图形偏移。",
    dortaniaTip: "Dortania 推荐所有台式机和笔记本设为 True。",
  },
  SyncTableIds: {
    key: "SyncTableIds",
    section: "ACPI",
    titleZh: "同步 SLIC 表标识符",
    desc: "将表 OEM ID 同步到 SLIC 表，极少数服务器主板需要。",
    dortaniaTip: "常规主板保持 False。",
  },

  // Booter Quirks
  AvoidRuntimeDefrag: {
    key: "AvoidRuntimeDefrag",
    section: "Booter",
    titleZh: "修复 UEFI 运行时服务内存碎片",
    desc: "防止 boot.efi 整理日期、时间、NVRAM 等 UEFI 运行时内存区域导致崩溃。",
    dortaniaTip: "几乎所有黑苹果都必须开启（True）！",
  },
  DevirtualiseMmio: {
    key: "DevirtualiseMmio",
    section: "Booter",
    titleZh: "释放 MMIO 虚拟内存空间供 KASLR 使用",
    desc: "减少主板 MMIO 内存占用以腾出连续空间加载内核，解决 Slide 计算不足。",
    dortaniaTip: "Intel 9代及以上 (Z390/400/500/600/700系) 强烈建议开启 True；AMD B550/X570 视主板开启。",
  },
  DisableSingleUser: {
    key: "DisableSingleUser",
    section: "Booter",
    titleZh: "禁用 Cmd+S 单用户模式",
    desc: "安全锁定选项，禁止通过快捷键进入单用户命令行。",
    dortaniaTip: "日常使用保持 False。",
  },
  DisableVariableWrite: {
    key: "DisableVariableWrite",
    section: "Booter",
    titleZh: "禁止向主板 NVRAM 写入变量",
    desc: "拦截 macOS 对硬件 NVRAM 芯片的直接写入，保护存在固件缺陷的主板（如华硕老 B360/Z390 早期固件）。",
    dortaniaTip: "支持原生 NVRAM 的现代主板保持 False。",
  },
  EnableSafeModeSlide: {
    key: "EnableSafeModeSlide",
    section: "Booter",
    titleZh: "允许安全模式下使用随机 Slide 偏移",
    desc: "修复按住 Shift 进入安全模式时内存冲突无法启动的问题。",
    dortaniaTip: "推荐设为 True。",
  },
  EnableWriteUnprotector: {
    key: "EnableWriteUnprotector",
    section: "Booter",
    titleZh: "解除 CR0.WP 运行时内存写保护（旧平台专用）",
    desc: "通过关闭 CPU 寄存器写保护修改运行时内存；与 RebuildAppleMemoryMap 互斥！",
    dortaniaTip: "Intel 4~9代部分老主板开启；10代酷睿及更新平台、AMD Zen2+ 必须设为 False！",
  },
  FixupAppleEfiImages: {
    key: "FixupAppleEfiImages",
    section: "Booter",
    titleZh: "修正旧版 macOS boot.efi 镜像区段对齐",
    desc: "修复早期系统 EFI 镜像 W^X 内存权限错误。",
    dortaniaTip: "新版 OpenCore 推荐默认设为 True。",
  },
  ProtectUefiServices: {
    key: "ProtectUefiServices",
    section: "Booter",
    titleZh: "保护 UEFI 服务指针不被固件覆盖",
    desc: "防止 Z390 及 400/500/600/700 系现代主板在引导阶段破坏 UEFI 服务指针。",
    dortaniaTip: "Intel 9~14代平台必开 True；部分老主板或 AMD 主板保持 False。",
  },
  ProvideCustomSlide: {
    key: "ProvideCustomSlide",
    section: "Booter",
    titleZh: "自动计算自定义 KASLR Slide 值",
    desc: "当默认内存区域不可用时自动计算合法的内核加载偏移地址，解决 Only N/256 slide values are usable。",
    dortaniaTip: "所有平台推荐开启 True。",
  },
  RebuildAppleMemoryMap: {
    key: "RebuildAppleMemoryMap",
    section: "Booter",
    titleZh: "重建符合 macOS 规范的内存映射表",
    desc: "生成兼容苹果内核的内存布局，是现代主板取代 EnableWriteUnprotector 的核心方案。",
    dortaniaTip: "Intel 10~14代及 AMD Ryzen 主板必开 True（同时需开启 SyncRuntimePermissions）！",
  },
  SetupVirtualMap: {
    key: "SetupVirtualMap",
    section: "Booter",
    titleZh: "建立虚拟内存到物理内存映射",
    desc: "通过 SetVirtualAddressMap 构建早期虚拟内存保护。",
    dortaniaTip: "Intel 4~10代通常为 True；但华硕/微星 B550/X570 及 Intel 11~14代主板往往必须设为 False 才能进系统！",
  },
  SyncRuntimePermissions: {
    key: "SyncRuntimePermissions",
    section: "Booter",
    titleZh: "同步 MAT 内存运行时权限表",
    desc: "修正固件与操作系统驱动的内存读写执行权限标志。",
    dortaniaTip: "只要开启了 RebuildAppleMemoryMap，就应同步设为 True！",
  },

  // Kernel Quirks
  AppleCpuPmCfgLock: {
    key: "AppleCpuPmCfgLock",
    section: "Kernel",
    titleZh: "解锁旧款 CPU (Ivy Bridge/更早) CFG Lock 崩溃",
    desc: "修补 AppleIntelCPUPowerManagement.kext 避免写入锁定的 MSR 0xE2 导致死机。",
    dortaniaTip: "仅 2/3代酷睿且未解锁 BIOS CFG Lock 时开启；4代及以上使用 AppleXcpmCfgLock。",
  },
  AppleXcpmCfgLock: {
    key: "AppleXcpmCfgLock",
    section: "Kernel",
    titleZh: "规避 BIOS 未关闭 CFG Lock 引发的五国崩溃",
    desc: "修补 XCPM 内核电源管理使其不写入被锁定的 MSR 0xE2 寄存器。",
    dortaniaTip: "未在主板 BIOS 中手动关闭 CFG Lock 的所有 Intel 4~14代机器必须开启 True！AMD 设为 False。",
  },
  DisableIoMapper: {
    key: "DisableIoMapper",
    section: "Kernel",
    titleZh: "绕过主板 VT-d (IOMMU) 冲突",
    desc: "屏蔽 ACPI DMAR 表防止板载网卡/雷电/Wi-Fi 因 VT-d 内存隔离而断流或卡死。",
    dortaniaTip: "若你未在 BIOS 关闭 VT-d（或为了 Windows 虚拟机保留了 VT-d），建议开启 True。",
  },
  DisableLinkeditJettison: {
    key: "DisableLinkeditJettison",
    section: "Kernel",
    titleZh: "优化 Lilu 内核符号缓存保留",
    desc: "让 Lilu.kext 及插件在不加 keepsyms=1 时也能以最高性能运行。",
    dortaniaTip: "全平台必开 True！",
  },
  DisableRtcChecksum: {
    key: "DisableRtcChecksum",
    section: "Kernel",
    titleZh: "禁止写入苹果 RTC 校验和（防止开机 BIOS 重置报错）",
    desc: "阻止 AppleRTC 改写 CMOS 0x58-0x59，解决重启后主板提示 CMOS Checksum Error / Safe Mode。",
    dortaniaTip: "华硕、微星、惠普、戴尔等台式机/笔记本强烈推荐开启 True。",
  },
  LapicKernelPanic: {
    key: "LapicKernelPanic",
    section: "Kernel",
    titleZh: "修复 HP 惠普机器 AP 核心 LAPIC 中断崩溃",
    desc: "禁用核心 0 以外的本地 APIC 内核崩溃触发，专为惠普商用机/笔记本设计。",
    dortaniaTip: "惠普主板/笔记本若卡在早期的 Kernel Panic 开启 True，其余品牌保持 False。",
  },
  PanicNoKextDump: {
    key: "PanicNoKextDump",
    section: "Kernel",
    titleZh: "死机时不刷屏打印已加载驱动列表",
    desc: "防止发生 Kernel Panic 时满屏驱动列表把真正报错的堆栈信息顶出屏幕外。",
    dortaniaTip: "排错装机阶段必开 True，方便拍屏看清真正崩溃原因！",
  },
  PowerTimeoutKernelPanic: {
    key: "PowerTimeoutKernelPanic",
    section: "Kernel",
    titleZh: "忽略外设电源状态切换超时死机",
    desc: "防止 macOS Catalina 及更新系统中数字音频或 USB 设备唤醒超时导致自动重启。",
    dortaniaTip: "推荐设为 True。",
  },
  ProvideCurrentCpuInfo: {
    key: "ProvideCurrentCpuInfo",
    section: "Kernel",
    titleZh: "向内核注入真实 CPU 核心与 TSC 拓扑信息",
    desc: "将固件探测到的真实核心数与线程数直接传递给 XNU 内核。",
    dortaniaTip: "Intel 12~14代酷睿、AMD Ryzen 全系以及 Hyper-V 虚拟化环境必须开启 True！",
  },
  ThirdPartyDrives: {
    key: "ThirdPartyDrives",
    section: "Kernel",
    titleZh: "为第三方 SATA SSD 开启原生 TRIM 指令",
    desc: "为非苹果原装 SATA 固态硬盘启用 TRIM 垃圾回收支持（NVMe 默认已开启）。",
    dortaniaTip: "若有 SATA 固态作系统/数据盘可开启 True，但极个别老杂牌 SATA 盘开 TRIM 会掉速。",
  },
  XhciPortLimit: {
    key: "XhciPortLimit",
    section: "Kernel",
    titleZh: "解除 USB 15 端口数量限制补丁（11.3+ 慎用！）",
    desc: "修补 AppleUSBXHCI 突破单控制器 15 个端口上限。",
    dortaniaTip: "警告：macOS Big Sur 11.3 及以上（含 Monterey/Ventura/Sonoma/Sequoia）开启会导致 USB 失灵或崩溃！请保持 False 并做 USB 端口定制！",
  },
};

export interface BootArgTagSpec {
  flag: string;
  label: string;
  desc: string;
}

export const COMMON_BOOT_ARGS: BootArgTagSpec[] = [
  { flag: "-v", label: "跑码模式 (-v)", desc: "开机显示详细文字启动日志代替苹果 Logo，排错必备" },
  { flag: "keepsyms=1", label: "保留崩溃符号", desc: "五国死机时打印具体函数名而不是十六进制偏移地址" },
  { flag: "debug=0x100", label: "死机不自动重启", desc: "遇到 Kernel Panic 停留在报错画面，方便拍照排查" },
  { flag: "agdpmod=pikera", label: "RX 5000/6000 防黑屏", desc: "AMD Navi 架构显卡（RX 5500~6950 XT）必加，否则进桌面黑屏无信号" },
  { flag: "-wegnoegpu", label: "屏蔽全部独显", desc: "双显卡笔记本/主机屏蔽无驱动的 NVIDIA RTX/GTX 独显，强制用核显" },
  { flag: "alcid=11", label: "声卡 ID 11", desc: "ALC897 / ALC1220 等主流主板最常用音频 Layout-ID" },
  { flag: "npci=0x2000", label: "PCI 枚举修复", desc: "解决未开启 Above 4G Decoding 或 AMD 主板卡在 PCI configuration begin" },
  { flag: "revpatch=sbvmm", label: "OTA 增量更新修复", desc: "配合 RestrictEvents 让 MacPro7,1 / 仿冒机型正常收到 macOS 系统小版本增量推送" },
  { flag: "-igfxblr", label: "核显背光寄存器修复", desc: "修复部分 8~10代笔记本内屏开机亮度和背光延迟" },
];

export const SIP_PRESETS = [
  { hex: "00000000", name: "完全开启 SIP (00000000)", desc: "苹果官方最高安全状态，Apple Pay / iOS 应用兼容最佳" },
  { hex: "03080000", name: "OCLP 根补丁模式 (03080000)", desc: "使用 OpenCore Legacy Patcher 驱动博通网卡或老显卡时必选" },
  { hex: "6F020000", name: "常规关闭文件与驱动限制 (6F020000)", desc: "允许加载未签名 Kext 与修改系统目录" },
  { hex: "EF0F0000", name: "完全彻底关闭 SIP (EF0F0000)", desc: "开放全部内核调试与文件系统写权限" },
];
