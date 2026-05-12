import { DEFAULT_APP_ACCENT_COLOR } from "@t3tools/contracts/settings";

export const APP_ACCENT_SWATCHES = [
  "#111111",
  "#2563eb",
  "#16a34a",
  "#ea580c",
  "#dc2626",
  "#7c3aed",
  "#0891b2",
] as const;

export function normalizeAppAccentColor(value: string | undefined): string {
  const trimmed = value?.trim();
  if (!trimmed) return DEFAULT_APP_ACCENT_COLOR;
  return /^#[0-9a-fA-F]{6}$/u.test(trimmed) ? trimmed.toLowerCase() : DEFAULT_APP_ACCENT_COLOR;
}

function resolveReadableForeground(hexColor: string): "#111111" | "#ffffff" {
  const red = Number.parseInt(hexColor.slice(1, 3), 16);
  const green = Number.parseInt(hexColor.slice(3, 5), 16);
  const blue = Number.parseInt(hexColor.slice(5, 7), 16);
  const luminance = (0.2126 * red + 0.7152 * green + 0.0722 * blue) / 255;
  return luminance > 0.58 ? "#111111" : "#ffffff";
}

export function applyAppAccentColor(value: string | undefined): void {
  if (typeof document === "undefined") return;
  const accentColor = normalizeAppAccentColor(value);
  if (accentColor === DEFAULT_APP_ACCENT_COLOR) {
    document.documentElement.style.removeProperty("--primary");
    document.documentElement.style.removeProperty("--primary-foreground");
    document.documentElement.style.removeProperty("--ring");
    return;
  }
  document.documentElement.style.setProperty("--primary", accentColor);
  document.documentElement.style.setProperty(
    "--primary-foreground",
    resolveReadableForeground(accentColor),
  );
  document.documentElement.style.setProperty("--ring", accentColor);
}
