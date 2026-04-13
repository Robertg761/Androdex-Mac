import type { CodexAccountsSnapshot } from "@t3tools/contracts";
import { ArrowUpDownIcon } from "lucide-react";
import { startTransition, useEffect, useEffectEvent, useState } from "react";
import { ensureLocalApi } from "~/localApi";
import { useServerProviders, useServerSettings } from "~/rpc/serverState";
import { cn } from "~/lib/utils";
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
  readonly badgeLabel: string | null;
  readonly detail: string | null;
  readonly disabled: boolean;
  readonly disabledReason: string | null;
  readonly label: string;
  readonly pending: boolean;
}) {
  const button = (
    <Button
      variant="outline"
      size="xs"
      disabled={input.disabled || input.pending}
      aria-label="Codex account selector"
      className={cn(
        "h-8 min-w-0 flex-1 justify-start gap-2 rounded-lg px-2 text-left text-muted-foreground",
        input.pending && "cursor-wait",
      )}
    >
      <div className="min-w-0 flex-1">
        <div className="truncate text-xs font-medium text-foreground">{input.label}</div>
        {input.detail ? (
          <div className="truncate text-[11px] text-muted-foreground/80">{input.detail}</div>
        ) : null}
      </div>
      {input.badgeLabel ? (
        <Badge variant="outline" size="sm" className="max-w-20 shrink-0 truncate">
          {input.badgeLabel}
        </Badge>
      ) : null}
      <ArrowUpDownIcon className="size-3.5 shrink-0 opacity-60" />
    </Button>
  );

  if (!input.disabledReason) {
    return button;
  }

  return (
    <Tooltip>
      <TooltipTrigger render={<span className="flex min-w-0 flex-1">{button}</span>} />
      <TooltipPopup side="top">{input.disabledReason}</TooltipPopup>
    </Tooltip>
  );
}

export function SidebarCodexAccountControl({
  initialSnapshot = null,
}: SidebarCodexAccountControlProps) {
  const serverSettings = useServerSettings();
  const codexProvider =
    useServerProviders().find((provider) => provider.provider === "codex") ?? null;
  const [snapshot, setSnapshot] = useState<CodexAccountsSnapshot | null>(initialSnapshot);
  const [isLoading, setIsLoading] = useState(initialSnapshot === null);
  const [switchingAccountKey, setSwitchingAccountKey] = useState<string | null>(null);

  const reloadSnapshot = useEffectEvent(async () => {
    setIsLoading(true);
    try {
      const nextSnapshot = await ensureLocalApi().server.listCodexAccounts();
      startTransition(() => {
        setSnapshot(nextSnapshot);
      });
    } finally {
      setIsLoading(false);
    }
  });

  useEffect(() => {
    void reloadSnapshot();
  }, [
    codexProvider?.auth.status,
    codexProvider?.auth.type,
    codexProvider?.checkedAt,
    codexProvider?.status,
    serverSettings.providers.codex.homePath,
  ]);

  const handleAccountChange = useEffectEvent(async (accountKey: string) => {
    const selectedAccount =
      snapshot?.accounts.find((account) => account.accountKey === accountKey) ?? null;
    if (!selectedAccount || !selectedAccount.hasSnapshot || switchingAccountKey === accountKey) {
      return;
    }

    setSwitchingAccountKey(accountKey);
    try {
      const result = await ensureLocalApi().server.switchCodexAccount({ accountKey });
      startTransition(() => {
        setSnapshot(result.snapshot);
      });
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
          badgeLabel: selectorState.badgeLabel,
          detail: selectorState.detail,
          disabled: selectorDisabled,
          disabledReason: selectorState.disabledReason,
          label: selectorState.label,
          pending: isLoading || switchingAccountKey !== null,
        })}
      />
      <MenuPopup align="start" side="top" className="min-w-72">
        <MenuGroup>
          <MenuGroupLabel>Codex accounts</MenuGroupLabel>
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
                className="min-h-10 py-1.5"
              >
                <div className="flex min-w-0 items-center gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm text-foreground">
                      {resolveCodexAccountDisplayName(account)}
                    </div>
                    <div className="truncate text-xs text-muted-foreground">
                      {account.email ?? account.accountKey}
                    </div>
                  </div>
                  {resolveCodexAccountBadgeLabel(account) ? (
                    <Badge variant="outline" size="sm" className="shrink-0">
                      {resolveCodexAccountBadgeLabel(account)}
                    </Badge>
                  ) : null}
                </div>
              </MenuRadioItem>
            ))}
          </MenuRadioGroup>
          {snapshot && snapshot.accounts.length === 0 ? (
            <div className="px-2 py-2 text-xs text-muted-foreground">
              {snapshot.message ?? "No managed Codex accounts were found."}
            </div>
          ) : null}
        </MenuGroup>
        {menuNote ? (
          <>
            <MenuSeparator />
            <div className="px-2 py-1.5 text-xs text-muted-foreground">{menuNote}</div>
          </>
        ) : null}
      </MenuPopup>
    </Menu>
  );
}
