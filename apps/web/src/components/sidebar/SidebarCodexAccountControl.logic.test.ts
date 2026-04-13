import type { CodexAccountsSnapshot } from "@t3tools/contracts";
import { describe, expect, it } from "vitest";
import {
  buildCodexAccountSwitchDescription,
  formatRunningCodexSessionNotice,
  resolveCodexAccountButtonState,
  resolveCodexAccountDisplayName,
} from "./SidebarCodexAccountControl.logic";

const baseSnapshot: CodexAccountsSnapshot = {
  codexHomePath: "/Users/test/.codex",
  accounts: [
    {
      accountKey: "user-1::acct-1",
      alias: "Work",
      email: "work@example.com",
      planType: "pro",
      authMode: "chatgpt",
      hasSnapshot: true,
      isActive: true,
    },
  ],
  activeAccountKey: "user-1::acct-1",
  currentAuthMode: "chatgpt",
  managedCurrentAuth: true,
  runningCodexSessionCount: 0,
};

describe("SidebarCodexAccountControl.logic", () => {
  it("prefers alias, then account name, then email for display labels", () => {
    expect(resolveCodexAccountDisplayName(baseSnapshot.accounts[0]!)).toBe("Work");
    expect(
      resolveCodexAccountDisplayName({
        alias: undefined,
        accountName: "Fallback account",
        email: "fallback@example.com",
      }),
    ).toBe("Fallback account");
    expect(
      resolveCodexAccountDisplayName({
        alias: undefined,
        accountName: undefined,
        email: "fallback@example.com",
      }),
    ).toBe("fallback@example.com");
  });

  it("builds the active selector state from the active managed account", () => {
    expect(resolveCodexAccountButtonState(baseSnapshot)).toEqual({
      activeAccount: baseSnapshot.accounts[0],
      badgeLabel: "Pro",
      detail: "work@example.com",
      disabledReason: null,
      label: "Work",
      selectableCount: 1,
    });
  });

  it("surfaces unmanaged current auth state when there is no active managed account", () => {
    expect(
      resolveCodexAccountButtonState({
        ...baseSnapshot,
        accounts: [],
        activeAccountKey: undefined,
        currentAuthMode: "apikey",
        managedCurrentAuth: false,
        message:
          "Codex is currently using an OpenAI API key. No managed Codex accounts were found.",
      }),
    ).toEqual({
      activeAccount: null,
      badgeLabel: "API key",
      detail: "Currently using an API key.",
      disabledReason:
        "Codex is currently using an OpenAI API key. No managed Codex accounts were found.",
      label: "Codex account",
      selectableCount: 0,
    });
  });

  it("formats the running-session notice and success description", () => {
    expect(formatRunningCodexSessionNotice(0)).toBeNull();
    expect(formatRunningCodexSessionNotice(2)).toBe(
      "2 existing Codex sessions will pick up the new account on the next turn.",
    );
    expect(
      buildCodexAccountSwitchDescription({
        account: baseSnapshot.accounts[0]!,
        runningCodexSessionCount: 1,
      }),
    ).toBe(
      "Switched Codex account to Work. 1 existing Codex session will pick up the new account on the next turn.",
    );
  });
});
