import { DEFAULT_APP_ACCENT_COLOR } from "@t3tools/contracts/settings";

export const APP_ACCENT_SWATCHES = [
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

export function applyAppAccentColor(value: string | undefined): void {
  if (typeof document === "undefined") return;
  const accentColor = normalizeAppAccentColor(value);
  document.documentElement.style.setProperty("--primary", accentColor);
  document.documentElement.style.setProperty("--ring", accentColor);
}
