import React from "react";
import type { LucideIcon } from "lucide-react";

/**
 * Genuine iOS / macOS Sequoia pill toggle switch (#007AFF / #34C759 when ON, #E5E5EA when OFF)
 */
export const AppleSwitch: React.FC<{
  checked: boolean;
  onChange: (next: boolean) => void;
  accent?: "blue" | "green";
}> = ({ checked, onChange, accent = "blue" }) => {
  const activeBg = accent === "green" ? "bg-[#34C759]" : "bg-[#007AFF]";
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-[22px] w-[38px] shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
        checked ? activeBg : "bg-[#E5E5EA]"
      }`}
    >
      <span
        className={`pointer-events-none inline-block h-[18px] w-[18px] transform rounded-full bg-white shadow-[0_1px_3px_rgba(0,0,0,0.25)] transition duration-200 ease-in-out ${
          checked ? "translate-x-[16px]" : "translate-x-0"
        }`}
      />
    </button>
  );
};

/**
 * macOS System Settings colorful rounded-square (squircle) sidebar icon
 */
export const SquircleIcon: React.FC<{
  icon: LucideIcon;
  color:
    | "blue"
    | "indigo"
    | "purple"
    | "orange"
    | "green"
    | "teal"
    | "red"
    | "amber"
    | "slate"
    | "pink";
  size?: "sm" | "md";
}> = ({ icon: Icon, color, size = "sm" }) => {
  const gradients: Record<string, string> = {
    blue: "from-[#0A84FF] to-[#0066CC]",
    indigo: "from-[#5E5CE6] to-[#4644C9]",
    purple: "from-[#BF5AF2] to-[#9B36D1]",
    orange: "from-[#FF9F0A] to-[#FF6B00]",
    green: "from-[#34C759] to-[#248A3D]",
    teal: "from-[#32ADE6] to-[#0082BA]",
    red: "from-[#FF453A] to-[#D70015]",
    amber: "from-[#FFD60A] to-[#F59E0B]",
    slate: "from-[#8E8E93] to-[#636366]",
    pink: "from-[#FF375F] to-[#D61C4E]",
  };
  const dim = size === "md" ? "w-8 h-8 rounded-[8px]" : "w-[22px] h-[22px] rounded-[6px]";
  const iconDim = size === "md" ? "w-4.5 h-4.5" : "w-3.5 h-3.5";
  return (
    <span
      className={`${dim} bg-gradient-to-b ${gradients[color]} inline-flex items-center justify-center text-white shadow-[0_1px_2px_rgba(0,0,0,0.12)] shrink-0`}
    >
      <Icon className={iconDim} strokeWidth={2.2} />
    </span>
  );
};

/**
 * macOS System Settings grouped white inset card with section header & optional footer caption
 */
export const SettingsGroup: React.FC<{
  title?: string;
  description?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}> = ({ title, description, action, children }) => (
  <div className="space-y-1.5">
    {(title || action) && (
      <div className="flex items-end justify-between gap-3 px-1">
        <div>
          {title && (
            <h3 className="text-[13px] font-semibold text-[#1D1D1F] tracking-tight">
              {title}
            </h3>
          )}
          {description && (
            <p className="text-[11.5px] text-[#86868B] mt-0.5">{description}</p>
          )}
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>
    )}
    <div className="bg-white rounded-[12px] border border-black/[0.07] shadow-[0_1px_2px_rgba(0,0,0,0.02)] divide-y divide-black/[0.06] overflow-hidden">
      {children}
    </div>
  </div>
);

/**
 * Single row inside a SettingsGroup (left title + subtitle, right control)
 */
export const SettingsRow: React.FC<{
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  tip?: string;
  right?: React.ReactNode;
}> = ({ title, subtitle, tip, right }) => (
  <div className="px-4 py-3 flex items-center justify-between gap-4 hover:bg-black/[0.012] transition-colors">
    <div className="min-w-0 flex-1">
      <div className="text-[13px] font-medium text-[#1D1D1F] leading-snug">{title}</div>
      {subtitle && (
        <div className="text-[11.5px] text-[#86868B] mt-0.5 leading-relaxed">{subtitle}</div>
      )}
      {tip && (
        <div className="text-[11px] text-[#0066CC] mt-0.5 leading-snug">{tip}</div>
      )}
    </div>
    {right && <div className="shrink-0 flex items-center gap-2">{right}</div>}
  </div>
);

/**
 * macOS native Segmented Control
 */
export const SegmentedControl: React.FC<{
  options: { id: string; label: string }[];
  value: string;
  onChange: (val: string) => void;
}> = ({ options, value, onChange }) => (
  <div className="inline-flex bg-[#E5E5EA]/90 p-[3px] rounded-[8px] border border-black/[0.04]">
    {options.map((opt) => {
      const active = opt.id === value;
      return (
        <button
          key={opt.id}
          type="button"
          onClick={() => onChange(opt.id)}
          className={`px-3 py-1 rounded-[6px] text-[12px] font-medium transition-all ${
            active
              ? "bg-white text-[#1D1D1F] shadow-[0_1px_3px_rgba(0,0,0,0.12)]"
              : "text-[#6E6E73] hover:text-[#1D1D1F]"
          }`}
        >
          {opt.label}
        </button>
      );
    })}
  </div>
);

export const appleInputCls =
  "bg-[#F5F5F7] hover:bg-[#ECECEE] focus:bg-white border border-black/[0.09] focus:border-[#007AFF] focus:ring-2 focus:ring-[#007AFF]/15 rounded-[8px] px-2.5 py-1.5 text-[12.5px] text-[#1D1D1F] outline-none transition";

export const applePrimaryBtnCls =
  "inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-[8px] bg-[#007AFF] hover:bg-[#0066D6] active:scale-[0.99] text-white text-[12.5px] font-medium shadow-[0_1px_2px_rgba(0,122,255,0.28)] transition";

export const appleSecondaryBtnCls =
  "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[8px] bg-white hover:bg-[#F5F5F7] border border-black/[0.1] text-[#1D1D1F] text-[12px] font-medium shadow-[0_1px_1px_rgba(0,0,0,0.03)] transition";
