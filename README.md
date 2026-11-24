# OpenCore Studio — 黑苹果一站式配置工作台

基于 **Tauri v2 + Rust + React 19 + TypeScript + Tailwind CSS v4** 构建的跨平台（macOS / Windows）黑苹果全流程桌面工具。

## 已实现三大核心模块

1. **模块一：可视化编辑与管理 EFI (`config.plist`)**
   - 100% 无损 Plist 读写引擎：完整保留未知自定义注释键与所有原始数据类型，`Data` 自动在前端以直观大写 HEX 展示并在落盘时无损写回标准 Apple Base64 `<data>`。
   - 覆盖 OpenCore 八大顶级节点（`ACPI`、`Booter`、`DeviceProperties`、`Kernel`、`Misc`、`NVRAM`、`PlatformInfo`、`UEFI`），内置中英双语 Dortania Quirk 释义百科与全局命令搜索（`Cmd/Ctrl + K`）。
   - 支持 **EFI 目录扫描联动** 与 **Kext 依赖有向无环图（DAG）拓扑排序**（自动解析 `Contents/Info.plist` 内 `OSBundleLibraries`，强制保证 `Lilu` -> `VirtualSMC` -> 插件顺序）。
   - 内置实时 **OpenCore 规则校验器**（支持一键自动修正互斥 Quirk / 补齐核心驱动 / 拓扑重排）与 **SMBIOS 三码生成工作站**，每次保存前自动在 `.ocstudio-backups/` 生成本地快照。

2. **模块二：硬件检测 + Dortania 兼容性诊断 + 智能生成 EFI**
   - 支持本机底层硬件探测（macOS `sysctl`/`system_profiler`、Windows WMI）及多套典型装机测试画像切换。
   - 自动识别并预警高危硬件（如三星 `PM981a` 黑名单固态、无驱动的 NVIDIA `RTX 40系` 独显），自动添加 `-wegnoegpu`、`agdpmod=pikera`、12~14代酷睿 CPUID 仿冒等参数，一键生成专属 `EFI` 目录与 `config.plist`。

3. **模块三：排错诊断与辅助工具箱**
   - **OpenCore 启动日志与卡代码分析器**：粘贴日志自动诊断 `[EB|#LOG:EXITBS:START]`、`CFG Lock`、`PCI configuration begin`、`IONVMeFamily` 等常见卡点并支持一键跳转修复。
   - **AppleALC 声卡 Layout-ID 速查**：搜索声卡型号并一键写入 `boot-args` 与 `DeviceProperties`。
   - **ESP 系统引导分区扫描与安全挂载** 及 **小端字节序（Little-Endian Hex）换算器**。

---

## 本地启动与构建命令

确保环境变量包含 Cargo（`export PATH="$HOME/.cargo/bin:$PATH"`）：

```bash
# 启动桌面端热重载开发模式
npm run tauri dev

# 运行 Rust 核心引擎单元测试
cargo test --manifest-path src-tauri/Cargo.toml

# 打包生产级桌面安装包 (macOS .app/.dmg 或 Windows .msi/.exe)
npm run tauri build
```

项目内置了一个测试用 `sample-efi/` 目录，启动软件后可点击左侧 **「打开 EFI 文件夹...」** 选择 `sample-efi` 体验目录扫描、Kext 自动依赖排序与配置冲突一键修复！
