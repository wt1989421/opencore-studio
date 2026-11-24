use crate::plist_engine::PlistNode;
use crate::smbios::generate_smbios_for_model;
use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct PresetMeta {
    pub id: String,
    pub name: String,
    pub subtitle: String,
    pub platform: String,
    pub recommended_smbios: String,
}

pub fn list_presets() -> Vec<PresetMeta> {
    vec![
        PresetMeta {
            id: "intel_10th_desktop".into(),
            name: "Intel 10代酷睿台式机 (Comet Lake)".into(),
            subtitle: "B460 / Z490 主板 · UHD 630 核显或免驱 AMD 独显 · OpenCore 1.0.3 标准结构".into(),
            platform: "Intel Desktop".into(),
            recommended_smbios: "iMac20,1".into(),
        },
        PresetMeta {
            id: "intel_12_14th_desktop".into(),
            name: "Intel 12~14代酷睿台式机 (Alder / Raptor Lake)".into(),
            subtitle: "B660 / B760 / Z690 / Z790 · 含 Comet Lake CPUID 仿冒 + 大小核拓扑修复 + 免驱独显".into(),
            platform: "Intel Hybrid Desktop".into(),
            recommended_smbios: "MacPro7,1".into(),
        },
        PresetMeta {
            id: "amd_ryzen_desktop".into(),
            name: "AMD Ryzen 5000 / 7000 / 9000 台式机".into(),
            subtitle: "B550 / B650 / X670 · 含 AMD Vanilla 核心补丁结构 + RX 6000 系 pikera 参数".into(),
            platform: "AMD Desktop".into(),
            recommended_smbios: "MacPro7,1".into(),
        },
        PresetMeta {
            id: "intel_laptop_cml".into(),
            name: "Intel 8~10代酷睿笔记本 (Coffee / Comet Lake)".into(),
            subtitle: "含触控板 I2C / 背光 PNLF / 屏蔽 RTX 独显 (-wegnoegpu) 标准移动平台配置".into(),
            platform: "Intel Laptop".into(),
            recommended_smbios: "MacBookPro16,1".into(),
        },
    ]
}

fn make_acpi_item(path: &str, comment: &str) -> PlistNode {
    PlistNode::Dict(vec![
        ("Comment".into(), PlistNode::String(comment.into())),
        ("Enabled".into(), PlistNode::Boolean(true)),
        ("Path".into(), PlistNode::String(path.into())),
    ])
}

fn make_kext_item(bundle: &str, exec: &str, comment: &str) -> PlistNode {
    PlistNode::Dict(vec![
        ("Arch".into(), PlistNode::String("Any".into())),
        ("BundlePath".into(), PlistNode::String(bundle.into())),
        ("Comment".into(), PlistNode::String(comment.into())),
        ("Enabled".into(), PlistNode::Boolean(true)),
        ("ExecutablePath".into(), PlistNode::String(exec.into())),
        ("MaxKernel".into(), PlistNode::String(String::new())),
        ("MinKernel".into(), PlistNode::String(String::new())),
        ("PlistPath".into(), PlistNode::String("Contents/Info.plist".into())),
    ])
}

fn make_driver_item(path: &str, comment: &str) -> PlistNode {
    PlistNode::Dict(vec![
        ("Arguments".into(), PlistNode::String(String::new())),
        ("Comment".into(), PlistNode::String(comment.into())),
        ("Enabled".into(), PlistNode::Boolean(true)),
        ("LoadEarly".into(), PlistNode::Boolean(false)),
        ("Path".into(), PlistNode::String(path.into())),
    ])
}

pub fn build_preset_plist(preset_id: &str) -> PlistNode {
    let is_alder_raptor = preset_id == "intel_12_14th_desktop";
    let is_amd = preset_id == "amd_ryzen_desktop";
    let is_laptop = preset_id == "intel_laptop_cml";

    let smbios_model = if is_alder_raptor || is_amd {
        "MacPro7,1"
    } else if is_laptop {
        "MacBookPro16,1"
    } else {
        "iMac20,1"
    };
    let smbios = generate_smbios_for_model(smbios_model);

    // 1. ACPI
    let mut acpi_add = vec![
        make_acpi_item("SSDT-EC-USBX.aml", "Embedded Controller & USB Power Injection"),
        make_acpi_item("SSDT-PLUG.aml", "CPU XCPM Power Management"),
    ];
    if !is_amd {
        acpi_add.push(make_acpi_item("SSDT-AWAC.aml", "300+ Series RTC / AWAC Clock Fix"));
    }
    if is_laptop {
        acpi_add.push(make_acpi_item("SSDT-PNLF.aml", "Laptop Display Backlight Control"));
        acpi_add.push(make_acpi_item("SSDT-XOSI.aml", "Windows OSI Trackpad I2C Routing"));
    }

    let acpi_node = PlistNode::Dict(vec![
        ("Add".into(), PlistNode::Array(acpi_add)),
        ("Delete".into(), PlistNode::Array(vec![])),
        ("Patch".into(), PlistNode::Array(vec![])),
        (
            "Quirks".into(),
            PlistNode::Dict(vec![
                ("FadtEnableReset".into(), PlistNode::Boolean(false)),
                ("NormalizeHeaders".into(), PlistNode::Boolean(false)),
                ("RebaseRegions".into(), PlistNode::Boolean(false)),
                ("ResetHwSig".into(), PlistNode::Boolean(false)),
                ("ResetLogoStatus".into(), PlistNode::Boolean(true)),
                ("SyncTableIds".into(), PlistNode::Boolean(false)),
            ]),
        ),
    ]);

    // 2. Booter
    let booter_node = PlistNode::Dict(vec![
        ("MmioWhitelist".into(), PlistNode::Array(vec![])),
        ("Patch".into(), PlistNode::Array(vec![])),
        (
            "Quirks".into(),
            PlistNode::Dict(vec![
                ("AllowRelocationBlock".into(), PlistNode::Boolean(false)),
                ("AvoidRuntimeDefrag".into(), PlistNode::Boolean(true)),
                ("DevirtualiseMmio".into(), PlistNode::Boolean(!is_amd)),
                ("DisableSingleUser".into(), PlistNode::Boolean(false)),
                ("DisableVariableWrite".into(), PlistNode::Boolean(false)),
                ("DiscardHibernateMap".into(), PlistNode::Boolean(false)),
                ("EnableSafeModeSlide".into(), PlistNode::Boolean(true)),
                ("EnableWriteUnprotector".into(), PlistNode::Boolean(false)),
                ("FixupAppleEfiImages".into(), PlistNode::Boolean(true)),
                ("ForceBooterSignature".into(), PlistNode::Boolean(false)),
                ("ForceExitBootServices".into(), PlistNode::Boolean(false)),
                ("ProtectMemoryRegions".into(), PlistNode::Boolean(false)),
                ("ProtectSecureBoot".into(), PlistNode::Boolean(false)),
                ("ProtectUefiServices".into(), PlistNode::Boolean(!is_amd)),
                ("ProvideCustomSlide".into(), PlistNode::Boolean(true)),
                ("ProvideMaxSlide".into(), PlistNode::Integer(0)),
                ("RebuildAppleMemoryMap".into(), PlistNode::Boolean(true)),
                ("ResizeAppleGpuBars".into(), PlistNode::Integer(if is_alder_raptor || is_amd { 0 } else { -1 })),
                ("SetupVirtualMap".into(), PlistNode::Boolean(!is_alder_raptor && !is_amd)),
                ("SignalAppleOS".into(), PlistNode::Boolean(false)),
                ("SyncRuntimePermissions".into(), PlistNode::Boolean(true)),
            ]),
        ),
    ]);

    // 3. DeviceProperties
    let mut dp_add = vec![(
        "PciRoot(0x0)/Pci(0x1b,0x0)".into(),
        PlistNode::Dict(vec![("layout-id".into(), PlistNode::Data("0B000000".into()))]),
    )];
    if preset_id == "intel_10th_desktop" {
        dp_add.push((
            "PciRoot(0x0)/Pci(0x2,0x0)".into(),
            PlistNode::Dict(vec![
                ("AAPL,ig-platform-id".into(), PlistNode::Data("07009B3E".into())),
                ("framebuffer-patch-enable".into(), PlistNode::Data("01000000".into())),
                ("framebuffer-stolenmem".into(), PlistNode::Data("00003001".into())),
            ]),
        ));
    } else if is_laptop {
        dp_add.push((
            "PciRoot(0x0)/Pci(0x2,0x0)".into(),
            PlistNode::Dict(vec![
                ("AAPL,ig-platform-id".into(), PlistNode::Data("0900A53E".into())),
                ("framebuffer-patch-enable".into(), PlistNode::Data("01000000".into())),
            ]),
        ));
    }

    let dp_node = PlistNode::Dict(vec![
        ("Add".into(), PlistNode::Dict(dp_add)),
        ("Delete".into(), PlistNode::Dict(vec![])),
    ]);

    // 4. Kernel
    let mut kext_add = vec![
        make_kext_item("Lilu.kext", "Contents/MacOS/Lilu", "Acidanthera Core Patching Engine"),
        make_kext_item("VirtualSMC.kext", "Contents/MacOS/VirtualSMC", "Apple SMC Emulator"),
        make_kext_item("WhateverGreen.kext", "Contents/MacOS/WhateverGreen", "GPU Graphics Patching"),
        make_kext_item("AppleALC.kext", "Contents/MacOS/AppleALC", "Native Onboard Audio"),
        make_kext_item("NVMeFix.kext", "Contents/MacOS/NVMeFix", "NVMe Power Management & Panic Fix"),
    ];
    if is_alder_raptor || is_amd {
        kext_add.push(make_kext_item(
            "RestrictEvents.kext",
            "Contents/MacOS/RestrictEvents",
            "MacPro7,1 Memory Warning & CPU Name Fix",
        ));
    }
    if is_alder_raptor {
        kext_add.push(make_kext_item(
            "CpuTopologyRebuild.kext",
            "Contents/MacOS/CpuTopologyRebuild",
            "Intel 12~14th Gen P-Core / E-Core SMT Topology Fix",
        ));
    }
    if !is_amd {
        kext_add.push(make_kext_item(
            "SMCProcessor.kext",
            "Contents/MacOS/SMCProcessor",
            "Intel CPU Temperature Sensor",
        ));
        kext_add.push(make_kext_item(
            "SMCSuperIO.kext",
            "Contents/MacOS/SMCSuperIO",
            "Fan Speed SuperIO Sensor",
        ));
    }
    if is_laptop {
        kext_add.push(make_kext_item(
            "SMCBatteryManager.kext",
            "Contents/MacOS/SMCBatteryManager",
            "Laptop Battery Status Manager",
        ));
        kext_add.push(make_kext_item(
            "VoodooPS2Controller.kext",
            "Contents/MacOS/VoodooPS2Controller",
            "Laptop Built-in PS2 Keyboard",
        ));
    }

    let emulate_node = if is_alder_raptor {
        PlistNode::Dict(vec![
            ("Cpuid1Data".into(), PlistNode::Data("55060A00000000000000000000000000".into())),
            ("Cpuid1Mask".into(), PlistNode::Data("FFFFFFFF000000000000000000000000".into())),
            ("DummyPowerManagement".into(), PlistNode::Boolean(false)),
            ("MaxKernel".into(), PlistNode::String(String::new())),
            ("MinKernel".into(), PlistNode::String(String::new())),
        ])
    } else {
        PlistNode::Dict(vec![
            ("Cpuid1Data".into(), PlistNode::Data(String::new())),
            ("Cpuid1Mask".into(), PlistNode::Data(String::new())),
            ("DummyPowerManagement".into(), PlistNode::Boolean(is_amd)),
            ("MaxKernel".into(), PlistNode::String(String::new())),
            ("MinKernel".into(), PlistNode::String(String::new())),
        ])
    };

    let kernel_node = PlistNode::Dict(vec![
        ("Add".into(), PlistNode::Array(kext_add)),
        ("Block".into(), PlistNode::Array(vec![])),
        ("Emulate".into(), emulate_node),
        ("Force".into(), PlistNode::Array(vec![])),
        ("Patch".into(), PlistNode::Array(vec![])),
        (
            "Quirks".into(),
            PlistNode::Dict(vec![
                ("AppleCpuPmCfgLock".into(), PlistNode::Boolean(false)),
                ("AppleXcpmCfgLock".into(), PlistNode::Boolean(!is_amd)),
                ("AppleXcpmExtraMsrs".into(), PlistNode::Boolean(false)),
                ("AppleXcpmForceBoost".into(), PlistNode::Boolean(false)),
                ("CustomPciSerialDevice".into(), PlistNode::Boolean(false)),
                ("CustomSMBIOSGuid".into(), PlistNode::Boolean(false)),
                ("DisableIoMapper".into(), PlistNode::Boolean(!is_amd)),
                ("DisableIoMapperMapping".into(), PlistNode::Boolean(false)),
                ("DisableLinkeditJettison".into(), PlistNode::Boolean(true)),
                ("DisableRtcChecksum".into(), PlistNode::Boolean(true)),
                ("ExtendBTFeatureFlags".into(), PlistNode::Boolean(false)),
                ("ExternalDiskIcons".into(), PlistNode::Boolean(false)),
                ("ForceAquantiaEthernet".into(), PlistNode::Boolean(false)),
                ("ForceSecureBootScheme".into(), PlistNode::Boolean(false)),
                ("IncreasePciBarSize".into(), PlistNode::Boolean(false)),
                ("LapicKernelPanic".into(), PlistNode::Boolean(false)),
                ("LegacyCommpage".into(), PlistNode::Boolean(false)),
                ("PanicNoKextDump".into(), PlistNode::Boolean(true)),
                ("PowerTimeoutKernelPanic".into(), PlistNode::Boolean(true)),
                ("ProvideCurrentCpuInfo".into(), PlistNode::Boolean(is_alder_raptor || is_amd)),
                ("SetApfsTrimTimeout".into(), PlistNode::Integer(-1)),
                ("ThirdPartyDrives".into(), PlistNode::Boolean(false)),
                ("XhciPortLimit".into(), PlistNode::Boolean(false)),
            ]),
        ),
        (
            "Scheme".into(),
            PlistNode::Dict(vec![
                ("CustomKernel".into(), PlistNode::Boolean(false)),
                ("FuzzyMatch".into(), PlistNode::Boolean(true)),
                ("KernelArch".into(), PlistNode::String("Auto".into())),
                ("KernelCache".into(), PlistNode::String("Auto".into())),
            ]),
        ),
    ]);

    // 5. Misc
    let misc_node = PlistNode::Dict(vec![
        ("BlessOverride".into(), PlistNode::Array(vec![])),
        (
            "Boot".into(),
            PlistNode::Dict(vec![
                ("ConsoleAttributes".into(), PlistNode::Integer(0)),
                ("HibernateMode".into(), PlistNode::String("None".into())),
                ("HibernateSkipsPicker".into(), PlistNode::Boolean(true)),
                ("HideAuxiliary".into(), PlistNode::Boolean(false)),
                ("LauncherOption".into(), PlistNode::String("Disabled".into())),
                ("LauncherPath".into(), PlistNode::String("Default".into())),
                ("PickerAttributes".into(), PlistNode::Integer(17)),
                ("PickerAudioAssist".into(), PlistNode::Boolean(false)),
                ("PickerMode".into(), PlistNode::String("External".into())),
                ("PickerVariant".into(), PlistNode::String("Acidanthera\\GoldenGate".into())),
                ("PollAppleHotKeys".into(), PlistNode::Boolean(true)),
                ("ShowPicker".into(), PlistNode::Boolean(true)),
                ("TakeoffDelay".into(), PlistNode::Integer(0)),
                ("Timeout".into(), PlistNode::Integer(5)),
            ]),
        ),
        (
            "Debug".into(),
            PlistNode::Dict(vec![
                ("AppleDebug".into(), PlistNode::Boolean(true)),
                ("ApplePanic".into(), PlistNode::Boolean(true)),
                ("DisableWatchDog".into(), PlistNode::Boolean(true)),
                ("DisplayDelay".into(), PlistNode::Integer(0)),
                ("DisplayLevel".into(), PlistNode::Integer(2147483650)),
                ("LogModules".into(), PlistNode::String("*".into())),
                ("SysReport".into(), PlistNode::Boolean(false)),
                ("Target".into(), PlistNode::Integer(3)),
            ]),
        ),
        ("Entries".into(), PlistNode::Array(vec![])),
        (
            "Security".into(),
            PlistNode::Dict(vec![
                ("AllowSetDefault".into(), PlistNode::Boolean(true)),
                ("ApECID".into(), PlistNode::Integer(0)),
                ("AuthRestart".into(), PlistNode::Boolean(false)),
                ("BlacklistAppleUpdate".into(), PlistNode::Boolean(true)),
                ("DmgLoading".into(), PlistNode::String("Signed".into())),
                ("EnablePassword".into(), PlistNode::Boolean(false)),
                ("ExposeSensitiveData".into(), PlistNode::Integer(6)),
                ("HaltLevel".into(), PlistNode::Integer(2147483648)),
                ("PasswordHash".into(), PlistNode::Data(String::new())),
                ("PasswordSalt".into(), PlistNode::Data(String::new())),
                ("ScanPolicy".into(), PlistNode::Integer(0)),
                ("SecureBootModel".into(), PlistNode::String("Disabled".into())),
                ("Vault".into(), PlistNode::String("Optional".into())),
            ]),
        ),
        ("Serial".into(), PlistNode::Dict(vec![("Init".into(), PlistNode::Boolean(false)), ("Override".into(), PlistNode::Boolean(false))])),
        (
            "Tools".into(),
            PlistNode::Array(vec![PlistNode::Dict(vec![
                ("Arguments".into(), PlistNode::String(String::new())),
                ("Auxiliary".into(), PlistNode::Boolean(true)),
                ("Comment".into(), PlistNode::String("UEFI Shell".into())),
                ("Enabled".into(), PlistNode::Boolean(true)),
                ("Flavour".into(), PlistNode::String("OpenShell:UEFIShell:Shell".into())),
                ("FullNvramAccess".into(), PlistNode::Boolean(false)),
                ("Name".into(), PlistNode::String("OpenShell".into())),
                ("Path".into(), PlistNode::String("OpenShell.efi".into())),
                ("RealPath".into(), PlistNode::Boolean(false)),
                ("TextMode".into(), PlistNode::Boolean(false)),
            ])]),
        ),
    ]);

    // 6. NVRAM
    let boot_args = if is_alder_raptor {
        "-v keepsyms=1 debug=0x100 agdpmod=pikera alcid=11 revpatch=sbvmm"
    } else if is_amd {
        "-v keepsyms=1 debug=0x100 npci=0x2000 agdpmod=pikera alcid=11"
    } else if is_laptop {
        "-v keepsyms=1 debug=0x100 -wegnoegpu alcid=21"
    } else {
        "-v keepsyms=1 debug=0x100 alcid=11"
    };

    let nvram_node = PlistNode::Dict(vec![
        (
            "Add".into(),
            PlistNode::Dict(vec![
                (
                    "4D1EDE05-38C7-4A6A-9CC6-4BCCA8B38C14".into(),
                    PlistNode::Dict(vec![("DefaultBackgroundColor".into(), PlistNode::Data("00000000".into()))]),
                ),
                (
                    "4D1FDA02-38C7-4A6A-9CC6-4BCCA8B30102".into(),
                    PlistNode::Dict(vec![("rtc-blacklist".into(), PlistNode::Data(String::new()))]),
                ),
                (
                    "7C436110-AB2A-4BBB-A880-FE41995C9F82".into(),
                    PlistNode::Dict(vec![
                        ("ForceDisplayRotationInEFI".into(), PlistNode::Integer(0)),
                        ("SystemAudioVolume".into(), PlistNode::Data("46".into())),
                        ("boot-args".into(), PlistNode::String(boot_args.into())),
                        ("csr-active-config".into(), PlistNode::Data("00000000".into())),
                        ("prev-lang:kbd".into(), PlistNode::String("zh-Hans:252".into())),
                        ("run-efi-updater".into(), PlistNode::String("No".into())),
                    ]),
                ),
            ]),
        ),
        ("Delete".into(), PlistNode::Dict(vec![])),
        ("LegacyOverwrite".into(), PlistNode::Boolean(false)),
        ("LegacySchema".into(), PlistNode::Dict(vec![])),
        ("WriteFlash".into(), PlistNode::Boolean(true)),
    ]);

    // 7. PlatformInfo
    let platform_node = PlistNode::Dict(vec![
        ("Automatic".into(), PlistNode::Boolean(true)),
        ("CustomMemory".into(), PlistNode::Boolean(false)),
        (
            "Generic".into(),
            PlistNode::Dict(vec![
                ("AdviseFeatures".into(), PlistNode::Boolean(false)),
                ("MaxBIOSVersion".into(), PlistNode::Boolean(false)),
                ("MLB".into(), PlistNode::String(smbios.mlb)),
                ("ProcessorType".into(), PlistNode::Integer(0)),
                ("ROM".into(), PlistNode::Data(smbios.rom_hex)),
                ("SpoofVendor".into(), PlistNode::Boolean(true)),
                ("SystemMemoryStatus".into(), PlistNode::String("Auto".into())),
                ("SystemProductName".into(), PlistNode::String(smbios.model)),
                ("SystemSerialNumber".into(), PlistNode::String(smbios.serial)),
                ("SystemUUID".into(), PlistNode::String(smbios.system_uuid)),
            ]),
        ),
        ("UpdateDataHub".into(), PlistNode::Boolean(true)),
        ("UpdateNVRAM".into(), PlistNode::Boolean(true)),
        ("UpdateSMBIOS".into(), PlistNode::Boolean(true)),
        ("UpdateSMBIOSMode".into(), PlistNode::String("Create".into())),
        ("UseRawUuidEncoding".into(), PlistNode::Boolean(false)),
    ]);

    // 8. UEFI
    let uefi_node = PlistNode::Dict(vec![
        (
            "APFS".into(),
            PlistNode::Dict(vec![
                ("EnableJumpstart".into(), PlistNode::Boolean(true)),
                ("GlobalConnect".into(), PlistNode::Boolean(false)),
                ("HideVerbose".into(), PlistNode::Boolean(true)),
                ("JumpstartHotPlug".into(), PlistNode::Boolean(false)),
                ("MinDate".into(), PlistNode::Integer(-1)),
                ("MinVersion".into(), PlistNode::Integer(-1)),
            ]),
        ),
        (
            "AppleInput".into(),
            PlistNode::Dict(vec![
                ("AppleEvent".into(), PlistNode::String("Builtin".into())),
                ("CustomDelays".into(), PlistNode::Boolean(false)),
                ("GraphicsInputMirroring".into(), PlistNode::Boolean(true)),
                ("KeyInitialDelay".into(), PlistNode::Integer(50)),
                ("KeySubsequentDelay".into(), PlistNode::Integer(5)),
            ]),
        ),
        (
            "Audio".into(),
            PlistNode::Dict(vec![
                ("AudioCodec".into(), PlistNode::Integer(0)),
                ("AudioDevice".into(), PlistNode::String("PciRoot(0x0)/Pci(0x1b,0x0)".into())),
                ("AudioOutMask".into(), PlistNode::Integer(1)),
                ("AudioSupport".into(), PlistNode::Boolean(false)),
                ("PlayChime".into(), PlistNode::String("Auto".into())),
            ]),
        ),
        ("ConnectDrivers".into(), PlistNode::Boolean(true)),
        (
            "Drivers".into(),
            PlistNode::Array(vec![
                make_driver_item("OpenRuntime.efi", "Essential OpenCore Runtime Services"),
                make_driver_item("OpenHfsPlus.efi", "HFS+ Partition Support"),
                make_driver_item("OpenCanopy.efi", "Graphical Boot Picker UI"),
                make_driver_item("ResetNvramEntry.efi", "Reset NVRAM Menu Entry"),
            ]),
        ),
        (
            "Input".into(),
            PlistNode::Dict(vec![
                ("KeyFiltering".into(), PlistNode::Boolean(false)),
                ("KeyForgetThreshold".into(), PlistNode::Integer(5)),
                ("KeySupport".into(), PlistNode::Boolean(true)),
                ("KeySupportMode".into(), PlistNode::String("Auto".into())),
                ("KeySwap".into(), PlistNode::Boolean(false)),
                ("PointerSupport".into(), PlistNode::Boolean(false)),
                ("PointerSupportMode".into(), PlistNode::String("ASUS".into())),
                ("TimerResolution".into(), PlistNode::Integer(50000)),
            ]),
        ),
        (
            "Output".into(),
            PlistNode::Dict(vec![
                ("ClearScreenOnModeSwitch".into(), PlistNode::Boolean(false)),
                ("ConsoleMode".into(), PlistNode::String(String::new())),
                ("DirectGopRendering".into(), PlistNode::Boolean(false)),
                ("ForceResolution".into(), PlistNode::Boolean(false)),
                ("GopPassThrough".into(), PlistNode::String("Disabled".into())),
                ("IgnoreTextInGraphics".into(), PlistNode::Boolean(false)),
                ("ProvideConsoleGop".into(), PlistNode::Boolean(true)),
                ("ReconnectGraphicsOnConnect".into(), PlistNode::Boolean(false)),
                ("ReconnectOnResChange".into(), PlistNode::Boolean(false)),
                ("ReplaceTabWithSpace".into(), PlistNode::Boolean(false)),
                ("Resolution".into(), PlistNode::String("Max".into())),
                ("SanitiseClearScreen".into(), PlistNode::Boolean(false)),
                ("TextRenderer".into(), PlistNode::String("BuiltinGraphics".into())),
                ("UgaPassThrough".into(), PlistNode::Boolean(false)),
                ("UIScale".into(), PlistNode::Integer(-1)),
            ]),
        ),
        (
            "ProtocolOverrides".into(),
            PlistNode::Dict(vec![
                ("AppleAudio".into(), PlistNode::Boolean(false)),
                ("AppleBootPolicy".into(), PlistNode::Boolean(false)),
                ("AppleDebugLog".into(), PlistNode::Boolean(false)),
                ("AppleEg2Info".into(), PlistNode::Boolean(false)),
                ("AppleFramebufferInfo".into(), PlistNode::Boolean(false)),
                ("AppleImageConversion".into(), PlistNode::Boolean(false)),
                ("AppleImg4Verification".into(), PlistNode::Boolean(false)),
                ("AppleKeyMap".into(), PlistNode::Boolean(false)),
                ("AppleRtcRam".into(), PlistNode::Boolean(false)),
                ("AppleSecureBoot".into(), PlistNode::Boolean(false)),
                ("AppleSmcIo".into(), PlistNode::Boolean(false)),
                ("AppleUserInterfaceTheme".into(), PlistNode::Boolean(false)),
                ("DataHub".into(), PlistNode::Boolean(false)),
                ("DeviceProperties".into(), PlistNode::Boolean(false)),
                ("FirmwareVolume".into(), PlistNode::Boolean(false)),
                ("HashServices".into(), PlistNode::Boolean(false)),
                ("OSInfo".into(), PlistNode::Boolean(false)),
                ("UnicodeCollation".into(), PlistNode::Boolean(false)),
            ]),
        ),
        (
            "Quirks".into(),
            PlistNode::Dict(vec![
                ("ActivateHpetSupport".into(), PlistNode::Boolean(false)),
                ("DisableSecurityPolicy".into(), PlistNode::Boolean(false)),
                ("EnableVectorAcceleration".into(), PlistNode::Boolean(true)),
                ("EnableVmx".into(), PlistNode::Boolean(false)),
                ("ExitBootServicesDelay".into(), PlistNode::Integer(0)),
                ("ForceOcWriteFlash".into(), PlistNode::Boolean(false)),
                ("ForgeUefiSupport".into(), PlistNode::Boolean(false)),
                ("IgnoreInvalidFlexRatio".into(), PlistNode::Boolean(false)),
                ("ReleaseUsbOwnership".into(), PlistNode::Boolean(is_laptop)),
                ("ReloadOptionRoms".into(), PlistNode::Boolean(false)),
                ("RequestBootVarRouting".into(), PlistNode::Boolean(true)),
                ("ResizeGpuBars".into(), PlistNode::Integer(-1)),
                ("TscSyncTimeout".into(), PlistNode::Integer(0)),
                ("UnblockFsConnect".into(), PlistNode::Boolean(false)),
            ]),
        ),
        ("ReservedMemory".into(), PlistNode::Array(vec![])),
    ]);

    PlistNode::Dict(vec![
        ("ACPI".into(), acpi_node),
        ("Booter".into(), booter_node),
        ("DeviceProperties".into(), dp_node),
        ("Kernel".into(), kernel_node),
        ("Misc".into(), misc_node),
        ("NVRAM".into(), nvram_node),
        ("PlatformInfo".into(), platform_node),
        ("UEFI".into(), uefi_node),
    ])
}
