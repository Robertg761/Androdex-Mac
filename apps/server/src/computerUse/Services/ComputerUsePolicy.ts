import type { ComputerUseAction, ComputerUseSettings, ComputerUseTarget } from "@t3tools/contracts";

const SENSITIVE_TARGET_PATTERNS = [
  /terminal/i,
  /\bconsole\b/i,
  /\bshell\b/i,
  /password/i,
  /passkey/i,
  /keychain/i,
  /keepass/i,
  /1password/i,
  /bitwarden/i,
  /settings/i,
  /software/i,
  /package/i,
  /sudo/i,
  /admin/i,
  /bank/i,
  /payment/i,
] as const;

const SENSITIVE_TYPED_TEXT_PATTERNS = [
  /password\s*[:=]/i,
  /api[_ -]?key\s*[:=]/i,
  /secret\s*[:=]/i,
  /token\s*[:=]/i,
] as const;

export type ComputerUsePolicyDecision =
  | { readonly type: "allow" }
  | { readonly type: "approval-required"; readonly reason: string }
  | { readonly type: "block"; readonly reason: string };

export function evaluateTargetPolicy(
  target: ComputerUseTarget,
  settings: ComputerUseSettings,
): ComputerUsePolicyDecision {
  if (target.trustLevel === "sensitive") {
    return { type: "block", reason: "Sensitive targets are blocked by default." };
  }

  if (
    target.trustLevel === "host-desktop" &&
    (!settings.hostDesktopEnabled ||
      (target.driver !== "linux-x11" && target.driver !== "linux-wayland"))
  ) {
    return { type: "block", reason: "Host desktop control is disabled." };
  }

  if (SENSITIVE_TARGET_PATTERNS.some((pattern) => pattern.test(target.title))) {
    return { type: "block", reason: "Target title matches the sensitive-target blocklist." };
  }

  if (settings.askBeforeNewTarget && !target.allowed) {
    return { type: "approval-required", reason: "Target requires explicit approval." };
  }

  return { type: "allow" };
}

export function evaluateActionPolicy(
  action: ComputerUseAction,
  target: ComputerUseTarget,
  settings: ComputerUseSettings,
): ComputerUsePolicyDecision {
  if (action.type === "type") {
    if (SENSITIVE_TYPED_TEXT_PATTERNS.some((pattern) => pattern.test(action.text))) {
      return {
        type: "approval-required",
        reason: "Typed text appears to contain sensitive material.",
      };
    }
    if (settings.askBeforeSensitiveAction && action.text.length > 500) {
      return {
        type: "approval-required",
        reason: "Large text entry requires review.",
      };
    }
    if (target.trustLevel === "host-desktop" && settings.askBeforeSensitiveAction) {
      return {
        type: "approval-required",
        reason: "Typing into a host desktop target requires review.",
      };
    }
  }

  if (action.type === "keypress") {
    const keys = new Set(action.keys.map((key) => key.toLowerCase()));
    if (keys.has("ctrl") && (keys.has("v") || keys.has("insert"))) {
      if (!settings.clipboardEnabled) {
        return { type: "block", reason: "Clipboard paste is disabled." };
      }
    }
  }

  return { type: "allow" };
}
