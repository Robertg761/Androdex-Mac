import type {
  CodexAccountPlanType,
  CodexAccountSummary,
  CodexAccountsSnapshot,
} from "@t3tools/contracts";
import { formatExpiresInLabel } from "~/timestampFormat";

export function resolveCodexAccountDisplayName(
  account: Pick<CodexAccountSummary, "alias" | "accountName" | "email">,
): string {
  return account.alias ?? account.accountName ?? account.email ?? "Codex account";
}

export function resolveCodexPlanLabel(
  planType: CodexAccountPlanType | null | undefined,
): string | null {
  switch (planType) {
    case "business":
      return "Business";
    case "edu":
      return "Edu";
    case "enterprise":
      return "Enterprise";
    case "free":
      return "Free";
    case "go":
      return "Go";
    case "plus":
      return "Plus";
    case "pro":
      return "Pro";
    case "team":
      return "Team";
    case "unknown":
      return "Unknown";
    default:
      return null;
  }
}

export function resolveCodexAuthModeLabel(
  authMode: CodexAccountsSnapshot["currentAuthMode"],
): string | null {
  switch (authMode) {
    case "apikey":
      return "API key";
    case "chatgpt":
      return "ChatGPT";
    default:
      return null;
  }
}

export function resolveCodexAccountBadgeLabel(account: CodexAccountSummary): string | null {
  return resolveCodexPlanLabel(account.planType) ?? resolveCodexAuthModeLabel(account.authMode);
}

export function resolveCodexRemainingUsagePercent(usedPercent: number | undefined): number | null {
  if (usedPercent === undefined || !Number.isFinite(usedPercent)) {
    return null;
  }
  return Math.max(0, Math.round(100 - usedPercent));
}

export function formatCodexPercent(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return "Unknown";
  }
  return `${Math.max(0, Math.round(value))}%`;
}

export function formatCodexUsageSummary(input: {
  readonly fiveHourUsedPercent: number | undefined;
  readonly weeklyUsedPercent: number | undefined;
}): string {
  const fiveHourRemaining = resolveCodexRemainingUsagePercent(input.fiveHourUsedPercent);
  const weeklyRemaining = resolveCodexRemainingUsagePercent(input.weeklyUsedPercent);

  return `5h ${formatCodexPercent(fiveHourRemaining)} left · Weekly ${formatCodexPercent(weeklyRemaining)} left`;
}

export function formatCodexResetCountdown(
  resetAtEpochSeconds: number | undefined,
  nowMs: number = Date.now(),
): string {
  if (resetAtEpochSeconds === undefined || !Number.isFinite(resetAtEpochSeconds)) {
    return "unknown";
  }

  const relativeLabel = formatExpiresInLabel(
    new Date(resetAtEpochSeconds * 1000).toISOString(),
    nowMs,
  );
  return relativeLabel === "Expired" ? "now" : relativeLabel.replace(/^Expires in /, "in ");
}

export function formatCodexResetSummary(
  input: {
    readonly fiveHourResetsAtEpochSeconds: number | undefined;
    readonly weeklyResetsAtEpochSeconds: number | undefined;
  },
  nowMs: number = Date.now(),
): string {
  return `5h resets ${formatCodexResetCountdown(input.fiveHourResetsAtEpochSeconds, nowMs)} · Weekly resets ${formatCodexResetCountdown(input.weeklyResetsAtEpochSeconds, nowMs)}`;
}
