import type { CodexAccountsSnapshot } from "@t3tools/contracts";
import { useEffectEvent, useState } from "react";
import { useRelativeTimeTick } from "~/hooks/useRelativeTimeTick";
import { ensureLocalApi } from "~/localApi";
import { cn } from "~/lib/utils";
import { useCodexAccountsSnapshot } from "~/hooks/useCodexAccountsSnapshot";
import { formatCodexResetSummary, formatCodexUsageSummary } from "~/lib/codexAccounts";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import {
  Menu,
  MenuGroup,
  MenuGroupLabel,
  MenuPopup,
  MenuRadioGroup,
  MenuRadioItem,
  MenuSeparator,
  MenuTrigger,
} from "../ui/menu";
import { toastManager } from "../ui/toast";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import {
  buildCodexAccountSwitchDescription,
  formatRunningCodexSessionNotice,
  resolveCodexAccountBadgeLabel,
  resolveCodexAccountButtonState,
  resolveCodexAccountDisplayName,
} from "./SidebarCodexAccountControl.logic";

interface SidebarCodexAccountControlProps {
  readonly initialSnapshot?: CodexAccountsSnapshot | null;
}

function renderSelectorButton(input: {
  readonly disabled: boolean;
  readonly disabledReason: string | null;
}) {
  const button = (
    <Button
      variant="ghost"
      size="xs"
      disabled={input.disabled}
      aria-label="Codex account selector"
      className={cn(
        "h-7 w-auto shrink-0 justify-start rounded-md border-transparent bg-transparent px-1.5 text-left text-xs font-medium text-muted-foreground/70 shadow-none hover:bg-background/80 hover:text-foreground/80 sm:h-7",
        input.disabled && "hover:bg-transparent hover:text-muted-foreground/60",
      )}
    >
      <span className="truncate">Accounts</span>
    </Button>
  );

  if (!input.disabledReason) {
    return button;
  }

  return (
    <Tooltip>
      <TooltipTrigger render={<span className="inline-flex w-auto shrink-0">{button}</span>} />
      <TooltipPopup side="top">{input.disabledReason}</TooltipPopup>
    </Tooltip>
  );
}

export function SidebarCodexAccountControl({
  initialSnapshot = null,
}: SidebarCodexAccountControlProps) {
  const { applySnapshot, isLoading, snapshot } = useCodexAccountsSnapshot(initialSnapshot);
  const nowMs = useRelativeTimeTick(60_000);
  const [switchingAccountKey, setSwitchingAccountKey] = useState<string | null>(null);

  const handleAccountChange = useEffectEvent(async (accountKey: string) => {
    const selectedAccount =
      snapshot?.accounts.find((account) => account.accountKey === accountKey) ?? null;
    if (!selectedAccount || !selectedAccount.hasSnapshot || switchingAccountKey === accountKey) {
      return;
    }

    setSwitchingAccountKey(accountKey);
    try {
      const result = await ensureLocalApi().server.switchCodexAccount({ accountKey });
      applySnapshot(result.snapshot);
      const activeAccount =
        result.snapshot.accounts.find((account) => account.isActive) ?? selectedAccount;
      toastManager.add({
        type: "success",
        title: "Codex account updated",
        description: buildCodexAccountSwitchDescription({
          account: activeAccount,
          runningCodexSessionCount: result.snapshot.runningCodexSessionCount,
        }),
      });
    } catch (error) {
      toastManager.add({
        type: "error",
        title: "Failed to switch Codex account",
        description: error instanceof Error ? error.message : "An error occurred.",
      });
    } finally {
      setSwitchingAccountKey(null);
    }
  });

  const selectorState = resolveCodexAccountButtonState(snapshot);
  const selectorDisabled = selectorState.selectableCount === 0;
  const menuNote = snapshot
    ? formatRunningCodexSessionNotice(snapshot.runningCodexSessionCount)
    : null;

  return (
    <Menu>
      <MenuTrigger
        disabled={selectorDisabled || isLoading}
        render={renderSelectorButton({
          disabled: selectorDisabled,
          disabledReason: selectorState.disabledReason,
        })}
      />
      <MenuPopup
        align="start"
        side="top"
        className="min-w-80 rounded-xl border-border/70 bg-popover/96 shadow-lg/10 backdrop-blur-md"
      >
        <MenuGroup>
          <MenuGroupLabel className="px-2.5 py-2 font-semibold uppercase tracking-[0.18em] text-[10px] text-muted-foreground/70">
            Codex accounts
          </MenuGroupLabel>
          <MenuRadioGroup
            value={snapshot?.activeAccountKey}
            onValueChange={(value) => {
              if (!value) {
                return;
              }
              void handleAccountChange(value);
            }}
          >
            {(snapshot?.accounts ?? []).map((account) => (
              <MenuRadioItem
                key={account.accountKey}
                value={account.accountKey}
                disabled={!account.hasSnapshot || switchingAccountKey !== null}
                className="min-h-11 rounded-lg py-1.5 data-highlighted:bg-accent/65"
              >
                <div className="flex min-w-0 items-center gap-2">
                  <div
                    className={cn(
                      "flex size-7 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-foreground/[0.08] via-foreground/[0.04] to-transparent text-[11px] font-semibold uppercase text-foreground/75 ring-1 ring-inset ring-foreground/[0.06]",
                      account.isActive && "text-primary ring-primary/20",
                    )}
                  >
                    {resolveCodexAccountDisplayName(account).slice(0, 1)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium text-foreground">
                      {resolveCodexAccountDisplayName(account)}
                    </div>
                    <div className="truncate text-[11px] text-muted-foreground">
                      {account.email ?? account.accountKey}
                    </div>
                    <div className="truncate pt-0.5 text-[11px] font-medium text-muted-foreground/85">
                      {formatCodexUsageSummary({
                        fiveHourUsedPercent: account.usageLimits?.fiveHourUsedPercent,
                        weeklyUsedPercent: account.usageLimits?.weeklyUsedPercent,
                      })}
                    </div>
                    <div className="truncate pt-0.5 text-[11px] text-muted-foreground/75">
                      {formatCodexResetSummary(
                        {
                          fiveHourResetsAtEpochSeconds:
                            account.usageLimits?.fiveHourResetsAtEpochSeconds,
                          weeklyResetsAtEpochSeconds:
                            account.usageLimits?.weeklyResetsAtEpochSeconds,
                        },
                        nowMs,
                      )}
                    </div>
                  </div>
                  {resolveCodexAccountBadgeLabel(account) ? (
                    <Badge
                      variant="outline"
                      size="sm"
                      className="shrink-0 border-border/70 bg-background/80 font-semibold text-[10px] tracking-[0.08em] uppercase"
                    >
                      {resolveCodexAccountBadgeLabel(account)}
                    </Badge>
                  ) : null}
                </div>
              </MenuRadioItem>
            ))}
          </MenuRadioGroup>
          {snapshot && snapshot.accounts.length === 0 ? (
            <div className="px-2.5 py-2 text-xs text-muted-foreground">
              {snapshot.message ?? "No managed Codex accounts were found."}
            </div>
          ) : null}
        </MenuGroup>
        {menuNote ? (
          <>
            <MenuSeparator />
            <div className="px-2.5 py-2 text-xs leading-relaxed text-muted-foreground">
              {menuNote}
            </div>
          </>
        ) : null}
      </MenuPopup>
    </Menu>
  );
}
