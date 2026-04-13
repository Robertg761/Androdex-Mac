import type { CodexAccountSummary, CodexAccountsSnapshot } from "@t3tools/contracts";

export function resolveCodexAccountDisplayName(
  account: Pick<CodexAccountSummary, "alias" | "accountName" | "email">,
): string {
  return account.alias ?? account.accountName ?? account.email ?? "Codex account";
}

function titleCasePlan(planType: CodexAccountSummary["planType"]): string | null {
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

export function resolveCodexAccountBadgeLabel(account: CodexAccountSummary): string | null {
  return titleCasePlan(account.planType) ?? resolveCodexAuthModeLabel(account.authMode);
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

function resolveCodexCurrentAuthDetail(snapshot: CodexAccountsSnapshot): string | null {
  if (snapshot.currentAuthMode === "apikey") {
    return "Currently using an API key.";
  }

  if (!snapshot.managedCurrentAuth && snapshot.currentAuthMode === "chatgpt") {
    return "Current auth is not managed by Codex accounts.";
  }

  return snapshot.message ?? null;
}

export function formatRunningCodexSessionNotice(count: number): string | null {
  if (count <= 0) {
    return null;
  }

  return `${count} running Codex session${count === 1 ? "" : "s"} will keep using the previous account until restarted.`;
}

export function buildCodexAccountSwitchDescription(input: {
  readonly account: CodexAccountSummary;
  readonly runningCodexSessionCount: number;
}): string {
  const message = `Switched Codex account to ${resolveCodexAccountDisplayName(input.account)}.`;
  const notice = formatRunningCodexSessionNotice(input.runningCodexSessionCount);
  return notice ? `${message} ${notice}` : message;
}

export function resolveCodexAccountButtonState(snapshot: CodexAccountsSnapshot | null): {
  readonly activeAccount: CodexAccountSummary | null;
  readonly badgeLabel: string | null;
  readonly detail: string | null;
  readonly disabledReason: string | null;
  readonly label: string;
  readonly selectableCount: number;
} {
  const activeAccount =
    snapshot?.accounts.find((account) => account.isActive) ??
    snapshot?.accounts.find((account) => account.accountKey === snapshot.activeAccountKey) ??
    null;
  const selectableCount = snapshot?.accounts.filter((account) => account.hasSnapshot).length ?? 0;
  const disabledReason =
    selectableCount > 0 ? null : (snapshot?.message ?? "No managed Codex accounts found.");

  if (!snapshot) {
    return {
      activeAccount: null,
      badgeLabel: null,
      detail: "Loading accounts",
      disabledReason: "Loading Codex accounts.",
      label: "Codex account",
      selectableCount: 0,
    };
  }

  if (activeAccount) {
    return {
      activeAccount,
      badgeLabel: resolveCodexAccountBadgeLabel(activeAccount),
      detail: activeAccount.email ?? null,
      disabledReason,
      label: resolveCodexAccountDisplayName(activeAccount),
      selectableCount,
    };
  }

  return {
    activeAccount: null,
    badgeLabel: resolveCodexAuthModeLabel(snapshot.currentAuthMode),
    detail: resolveCodexCurrentAuthDetail(snapshot),
    disabledReason,
    label: "Codex account",
    selectableCount,
  };
}
