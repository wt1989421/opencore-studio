export type PlistNode =
  | { kind: "Dict"; val: [string, PlistNode][] }
  | { kind: "Array"; val: PlistNode[] }
  | { kind: "String"; val: string }
  | { kind: "Integer"; val: number }
  | { kind: "Real"; val: number }
  | { kind: "Boolean"; val: boolean }
  | { kind: "Data"; val: string }
  | { kind: "Date"; val: string };

export interface PresetMeta {
  id: string;
  name: string;
  subtitle: string;
  platform: string;
  recommended_smbios: string;
}

export interface ScannedKext {
  bundle_path: string;
  executable_path: string;
  plist_path: string;
  bundle_id: string;
  version: string;
  dependencies: string[];
}

export interface EfiScanResult {
  oc_dir: string;
  config_path: string;
  acpi_files: string[];
  driver_files: string[];
  tool_files: string[];
  kexts: ScannedKext[];
}

export interface ValidationIssue {
  id: string;
  severity: "error" | "warning" | "info" | string;
  section: string;
  field_path: string;
  title: string;
  message: string;
  fix_action?: string | null;
}

export interface BackupSnapshot {
  filename: string;
  full_path: string;
  created_at: string;
  size_bytes: number;
}

export interface LoadedWorkspacePayload {
  title: string;
  config_path?: string | null;
  oc_dir?: string | null;
  plist: PlistNode;
  scan?: EfiScanResult | null;
  issues: ValidationIssue[];
  backups: BackupSnapshot[];
}

export interface GeneratedSmbios {
  model: string;
  serial: string;
  mlb: string;
  system_uuid: string;
  rom_hex: string;
  cpu_family: string;
  macos_support: string;
}

export interface SmbiosModelOption {
  model: string;
  category: string;
  cpuFamily: string;
  macosSupport: string;
  gpuNote: string;
}

export interface HardwareProfile {
  profile_name: string;
  source: string;
  is_laptop: boolean;
  board_model: string;
  cpu_model: string;
  cpu_vendor: string;
  cpu_cores: number;
  gpus: string[];
  audio_codec: string;
  network_cards: string[];
  storage_drives: string[];
}

export interface ComponentAdvice {
  category: string;
  hardware_name: string;
  status: "supported" | "partial" | "unsupported" | string;
  badge_text: string;
  advice: string;
}

export interface CompatibilityReport {
  overall_status: "ready" | "caution" | "blocked" | string;
  summary_headline: string;
  recommended_macos: string;
  recommended_smbios: string;
  recommended_preset_id: string;
  recommended_boot_args: string;
  required_ssdts: string[];
  required_kexts: string[];
  items: ComponentAdvice[];
}

export interface BootLogDiagnosis {
  code_pattern: string;
  matched_line: string;
  title: string;
  severity: string;
  root_cause: string;
  solution_steps: string[];
  jump_section?: string | null;
  fix_action?: string | null;
}

export interface AudioCodecEntry {
  codec: string;
  vendor_hex: string;
  recommended_ids: number[];
  all_ids: number[];
  notes: string;
}

export interface EspPartitionInfo {
  identifier: string;
  disk_name: string;
  size_display: string;
  mount_point?: string | null;
  is_mounted: boolean;
}

// ---------------- Immutable Lossless PlistNode Helpers ----------------

export function getNode(root: PlistNode | undefined, path: string[]): PlistNode | undefined {
  let curr = root;
  for (const seg of path) {
    if (!curr || curr.kind !== "Dict") return undefined;
    const found = curr.val.find(([k]) => k === seg);
    curr = found ? found[1] : undefined;
  }
  return curr;
}

export function getStr(root: PlistNode | undefined, path: string[], fallback = ""): string {
  const n = getNode(root, path);
  return n && n.kind === "String" ? n.val : fallback;
}

export function getBool(root: PlistNode | undefined, path: string[], fallback = false): boolean {
  const n = getNode(root, path);
  return n && n.kind === "Boolean" ? n.val : fallback;
}

export function getInt(root: PlistNode | undefined, path: string[], fallback = 0): number {
  const n = getNode(root, path);
  return n && n.kind === "Integer" ? n.val : fallback;
}

export function getData(root: PlistNode | undefined, path: string[], fallback = ""): string {
  const n = getNode(root, path);
  return n && n.kind === "Data" ? n.val : fallback;
}

export function getArray(root: PlistNode | undefined, path: string[]): PlistNode[] {
  const n = getNode(root, path);
  return n && n.kind === "Array" ? n.val : [];
}

export function getDictEntries(root: PlistNode | undefined, path: string[]): [string, PlistNode][] {
  const n = getNode(root, path);
  return n && n.kind === "Dict" ? n.val : [];
}

/**
 * Pure immutable update at `path` inside `PlistNode`, preserving exact key order & all sibling keys.
 */
export function setNodeAtPath(root: PlistNode, path: string[], newValue: PlistNode): PlistNode {
  if (path.length === 0) return newValue;
  const [head, ...rest] = path;
  if (root.kind !== "Dict") {
    return {
      kind: "Dict",
      val: [[head, setNodeAtPath({ kind: "Dict", val: [] }, rest, newValue)]],
    };
  }
  let exists = false;
  const nextEntries: [string, PlistNode][] = root.val.map(([k, v]) => {
    if (k === head) {
      exists = true;
      return [k, setNodeAtPath(v, rest, newValue)];
    }
    return [k, v];
  });
  if (!exists) {
    nextEntries.push([head, setNodeAtPath({ kind: "Dict", val: [] }, rest, newValue)]);
  }
  return { kind: "Dict", val: nextEntries };
}

export function u32ToLittleEndianHex(num: number): string {
  const b0 = num & 0xff;
  const b1 = (num >> 8) & 0xff;
  const b2 = (num >> 16) & 0xff;
  const b3 = (num >> 24) & 0xff;
  return [b0, b1, b2, b3]
    .map((b) => b.toString(16).padStart(2, "0").toUpperCase())
    .join("");
}

export function littleEndianHexToU32(hex: string): number | null {
  const clean = hex.replace(/\s+/g, "");
  if (clean.length !== 8 || !/^[0-9a-fA-F]+$/.test(clean)) return null;
  const bytes = [
    parseInt(clean.slice(0, 2), 16),
    parseInt(clean.slice(2, 4), 16),
    parseInt(clean.slice(4, 6), 16),
    parseInt(clean.slice(6, 8), 16),
  ];
  return (bytes[0] | (bytes[1] << 8) | (bytes[2] << 16) | (bytes[3] << 24)) >>> 0;
}
