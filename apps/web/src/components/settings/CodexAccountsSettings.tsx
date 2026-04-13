import { RefreshCwIcon } from "lucide-react";
import { useMemo } from "react";
import { useRelativeTimeTick } from "~/hooks/useRelativeTimeTick";
import { useCodexAccountsSnapshot } from "~/hooks/useCodexAccountsSnapshot";
import {
  formatCodexPercent,
  formatCodexResetCountdown,
  resolveCodexAccountBadgeLabel,
  resolveCodexAccountDisplayName,
  resolveCodexRemainingUsagePercent,
} from "~/lib/codexAccounts";
import { cn } from "~/lib/utils";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { SettingsSection } from "./settingsLayout";

const ACCOUNT_ROW_CLASSNAME = "border-t border-border/60 px-4 py-4 first:border-t-0 sm:px-5";

function resolveRemainingUsageToneClass(remainingPercent: number | null) {
  if (remainingPercent === null) {
    return "bg-muted-foreground/20";
  }
  if (remainingPercent <= 10) {
    return "bg-destructive/80";
  }
  if (remainingPercent <= 25) {
    return "bg-warning/80";
  }
  return "bg-success/80";
}

function UsageLimitStat({
  label,
  nowMs,
  resetsAtEpochSeconds,
  usedPercent,
}: {
  label: string;
  nowMs: number;
  resetsAtEpochSeconds: number | undefined;
  usedPercent: number | undefined;
}) {
  const remainingPercent = resolveCodexRemainingUsagePercent(usedPercent);
  const meterWidth = remainingPercent === null ? 0 : Math.max(0, Math.min(100, remainingPercent));

  return (
    <div className="space-y-1.5 rounded-xl border border-border/60 bg-muted/[0.22] px-3 py-2.5">
      <div className="flex items-center justify-between gap-3">
        <span className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
          {label}
        </span>
        <span className="text-xs font-semibold tabular-nums text-foreground">
          {formatCodexPercent(remainingPercent)}
        </span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-muted">
        <div
          className={cn(
            "h-full rounded-full transition-[width] duration-300 ease-out",
            resolveRemainingUsageToneClass(remainingPercent),
          )}
          style={{ width: `${meterWidth}%` }}
        />
      </div>
      <div className="text-[11px] text-muted-foreground/80">
        {usedPercent === undefined
          ? "Usage data unavailable."
          : `${formatCodexPercent(usedPercent)} used`}
      </div>
      <div className="text-[11px] text-muted-foreground/80">
        Resets {formatCodexResetCountdown(resetsAtEpochSeconds, nowMs)}
      </div>
    </div>
  );
}

export function CodexAccountsSettings() {
  const { isLoading, reloadSnapshot, snapshot } = useCodexAccountsSnapshot();
  const nowMs = useRelativeTimeTick(60_000);
  const accounts = useMemo(() => snapshot?.accounts ?? [], [snapshot]);

  return (
    <SettingsSection
      title="Codex accounts"
      headerAction={
        <Button
          size="xs"
          variant="outline"
          disabled={isLoading}
          onClick={() => void reloadSnapshot()}
        >
          <RefreshCwIcon className={cn("size-3.5", isLoading && "animate-spin")} />
          {isLoading ? "Refreshing..." : "Refresh"}
        </Button>
      }
    >
      {snapshot === null && isLoading ? (
        <div className={ACCOUNT_ROW_CLASSNAME}>
          <p className="text-xs text-muted-foreground">Loading managed Codex accounts...</p>
        </div>
      ) : null}

      {accounts.map((account) => {
        const badgeLabel = resolveCodexAccountBadgeLabel(account);
        const displayName = resolveCodexAccountDisplayName(account);

        return (
          <div key={account.accountKey} className={ACCOUNT_ROW_CLASSNAME}>
            <div className="flex flex-col gap-3">
              <div className="flex min-w-0 items-start gap-3">
                <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-foreground/[0.08] via-foreground/[0.04] to-transparent text-xs font-semibold uppercase text-foreground/75 ring-1 ring-inset ring-foreground/[0.06]">
                  {displayName.slice(0, 1)}
                </div>
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex min-w-0 flex-wrap items-center gap-2">
                    <h3 className="truncate text-[13px] font-semibold tracking-[-0.01em] text-foreground">
                      {displayName}
                    </h3>
                    {badgeLabel ? (
                      <Badge
                        variant="outline"
                        size="sm"
                        className="border-border/70 bg-background/80 font-semibold uppercase tracking-[0.08em]"
                      >
                        {badgeLabel}
                      </Badge>
                    ) : null}
                    {account.isActive ? (
                      <Badge
                        variant="secondary"
                        size="sm"
                        className="font-semibold uppercase tracking-[0.08em]"
                      >
                        Active
                      </Badge>
                    ) : null}
                    {!account.hasSnapshot ? (
                      <Badge
                        variant="warning"
                        size="sm"
                        className="font-semibold uppercase tracking-[0.08em]"
                      >
                        Missing snapshot
                      </Badge>
                    ) : null}
                  </div>
                  <p className="truncate text-xs text-muted-foreground">
                    {account.email ?? account.accountKey}
                  </p>
                  {!account.hasSnapshot ? (
                    <p className="text-[11px] text-muted-foreground/80">
                      This account is in the registry, but its saved auth snapshot is missing so it
                      cannot be activated.
                    </p>
                  ) : null}
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <UsageLimitStat
                  label="5h remaining"
                  nowMs={nowMs}
                  resetsAtEpochSeconds={account.usageLimits?.fiveHourResetsAtEpochSeconds}
                  usedPercent={account.usageLimits?.fiveHourUsedPercent}
                />
                <UsageLimitStat
                  label="Weekly remaining"
                  nowMs={nowMs}
                  resetsAtEpochSeconds={account.usageLimits?.weeklyResetsAtEpochSeconds}
                  usedPercent={account.usageLimits?.weeklyUsedPercent}
                />
              </div>
            </div>
          </div>
        );
      })}

      {snapshot !== null && accounts.length === 0 ? (
        <div className={ACCOUNT_ROW_CLASSNAME}>
          <p className="text-xs text-muted-foreground">
            {snapshot.message ?? "No managed Codex accounts were found."}
          </p>
        </div>
      ) : null}
    </SettingsSection>
  );
}
