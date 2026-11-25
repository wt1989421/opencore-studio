import { create } from "zustand";
import {
  setNodeAtPath,
  type BackupSnapshot,
  type EfiScanResult,
  type LoadedWorkspacePayload,
  type PlistNode,
  type ValidationIssue,
} from "../types/opencore";
import { apiValidatePlist, isTauriRuntime } from "../lib/tauri-bridge";

export type MainModule = "editor" | "hardware" | "toolbox";
export type BootloaderMode = "OpenCore" | "Clover";

export type EditorTab =
  | "ACPI"
  | "Booter"
  | "DeviceProperties"
  | "Kernel"
  | "Misc"
  | "NVRAM"
  | "PlatformInfo"
  | "UEFI"
  | "RawTree"
  | "XmlPreview";

export type CloverTab =
  | "ACPI"
  | "Boot"
  | "Devices"
  | "GUI"
  | "Graphics"
  | "KernelAndKextPatches"
  | "Quirks"
  | "RtVariables"
  | "SMBIOS"
  | "SystemParameters"
  | "RawTree"
  | "XmlPreview";

interface ToastMessage {
  id: number;
  type: "success" | "error" | "info";
  text: string;
}

interface WorkspaceState {
  bootloader: BootloaderMode;
  activeModule: MainModule;
  activeEditorTab: EditorTab;
  activeCloverTab: CloverTab;
  toolboxTab: "log" | "audio" | "esp" | "converter";

  workspaceTitle: string;
  configPath: string | null;
  ocDir: string | null;
  plist: PlistNode;
  past: PlistNode[];
  future: PlistNode[];
  isDirty: boolean;

  scan: EfiScanResult | null;
  issues: ValidationIssue[];
  backups: BackupSnapshot[];
  migrationNotes: string[];

  showIssuesDrawer: boolean;
  showCommandPalette: boolean;
  toasts: ToastMessage[];

  setActiveModule: (mod: MainModule) => void;
  setActiveEditorTab: (tab: EditorTab) => void;
  setActiveCloverTab: (tab: CloverTab) => void;
  setToolboxTab: (tab: "log" | "audio" | "esp" | "converter") => void;
  setShowIssuesDrawer: (open: boolean) => void;
  setShowCommandPalette: (open: boolean) => void;
  clearMigrationNotes: () => void;
  setMigrationNotes: (notes: string[]) => void;

  loadWorkspace: (payload: LoadedWorkspacePayload) => void;
  updatePlistPath: (path: string[], value: PlistNode) => void;
  replacePlist: (next: PlistNode, markDirty?: boolean) => void;
  undo: () => void;
  redo: () => void;
  markSaved: (configPath: string, backups: BackupSnapshot[]) => void;
  setScanAndIssues: (scan: EfiScanResult | null, issues: ValidationIssue[]) => void;
  setIssues: (issues: ValidationIssue[]) => void;
  pushToast: (type: "success" | "error" | "info", text: string) => void;
}

const EMPTY_PLIST: PlistNode = {
  kind: "Dict",
  val: [
    ["ACPI", { kind: "Dict", val: [["Add", { kind: "Array", val: [] }], ["Quirks", { kind: "Dict", val: [] }]] }],
    ["Booter", { kind: "Dict", val: [["Quirks", { kind: "Dict", val: [] }]] }],
    ["DeviceProperties", { kind: "Dict", val: [["Add", { kind: "Dict", val: [] }]] }],
    ["Kernel", { kind: "Dict", val: [["Add", { kind: "Array", val: [] }], ["Quirks", { kind: "Dict", val: [] }]] }],
    ["Misc", { kind: "Dict", val: [["Boot", { kind: "Dict", val: [] }], ["Security", { kind: "Dict", val: [] }]] }],
    ["NVRAM", { kind: "Dict", val: [["Add", { kind: "Dict", val: [] }]] }],
    ["PlatformInfo", { kind: "Dict", val: [["Generic", { kind: "Dict", val: [] }]] }],
    ["UEFI", { kind: "Dict", val: [["Drivers", { kind: "Array", val: [] }], ["Quirks", { kind: "Dict", val: [] }]] }],
  ],
};

let toastSeq = 1;

export const useWorkspaceStore = create<WorkspaceState>((set, get) => ({
  bootloader: "OpenCore",
  activeModule: "hardware",
  activeEditorTab: "PlatformInfo",
  activeCloverTab: "ACPI",
  toolboxTab: "log",

  workspaceTitle: "未命名配置 (OpenCore)",
  configPath: null,
  ocDir: null,
  plist: EMPTY_PLIST,
  past: [],
  future: [],
  isDirty: false,

  scan: null,
  issues: [],
  backups: [],
  migrationNotes: [],

  showIssuesDrawer: false,
  showCommandPalette: false,
  toasts: [],

  setActiveModule: (activeModule) => set({ activeModule }),
  setActiveEditorTab: (activeEditorTab) => set({ activeEditorTab }),
  setActiveCloverTab: (activeCloverTab) => set({ activeCloverTab }),
  setToolboxTab: (toolboxTab) => set({ toolboxTab }),
  setShowIssuesDrawer: (showIssuesDrawer) => set({ showIssuesDrawer }),
  setShowCommandPalette: (showCommandPalette) => set({ showCommandPalette }),
  clearMigrationNotes: () => set({ migrationNotes: [] }),
  setMigrationNotes: (migrationNotes) => set({ migrationNotes }),

  loadWorkspace: (payload) => {
    const mode: BootloaderMode =
      payload.bootloader === "Clover" ? "Clover" : "OpenCore";
    set({
      bootloader: mode,
      workspaceTitle: payload.title,
      configPath: payload.config_path ?? null,
      ocDir: payload.oc_dir ?? null,
      plist: payload.plist,
      past: [],
      future: [],
      isDirty: false,
      scan: payload.scan ?? null,
      issues: payload.issues ?? [],
      backups: payload.backups ?? [],
      migrationNotes: [],
    });
  },

  updatePlistPath: (path, value) => {
    const { plist, past, ocDir } = get();
    const next = setNodeAtPath(plist, path, value);
    const nextPast = [...past.slice(-29), plist];
    set({ plist: next, past: nextPast, future: [], isDirty: true });
    if (isTauriRuntime()) {
      apiValidatePlist(next, ocDir)
        .then((issues) => set({ issues }))
        .catch(() => {});
    }
  },

  replacePlist: (next, markDirty = true) => {
    const { plist, past, ocDir } = get();
    const nextPast = [...past.slice(-29), plist];
    set({ plist: next, past: nextPast, future: [], isDirty: markDirty });
    if (isTauriRuntime()) {
      apiValidatePlist(next, ocDir)
        .then((issues) => set({ issues }))
        .catch(() => {});
    }
  },

  undo: () => {
    const { past, plist, future, ocDir } = get();
    if (past.length === 0) return;
    const prev = past[past.length - 1];
    set({
      plist: prev,
      past: past.slice(0, -1),
      future: [plist, ...future],
      isDirty: true,
    });
    if (isTauriRuntime()) {
      apiValidatePlist(prev, ocDir).then((issues) => set({ issues })).catch(() => {});
    }
  },

  redo: () => {
    const { past, plist, future, ocDir } = get();
    if (future.length === 0) return;
    const next = future[0];
    set({
      plist: next,
      past: [...past, plist],
      future: future.slice(1),
      isDirty: true,
    });
    if (isTauriRuntime()) {
      apiValidatePlist(next, ocDir).then((issues) => set({ issues })).catch(() => {});
    }
  },

  markSaved: (configPath, backups) =>
    set({
      configPath,
      backups,
      isDirty: false,
    }),

  setScanAndIssues: (scan, issues) => set({ scan, issues }),
  setIssues: (issues) => set({ issues }),

  pushToast: (type, text) => {
    const id = toastSeq++;
    set((s) => ({ toasts: [...s.toasts, { id, type, text }] }));
    setTimeout(() => {
      set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
    }, 3800);
  },
}));
