import type { CodexAccountsSnapshot } from "@t3tools/contracts";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { SidebarCodexAccountControl } from "./SidebarCodexAccountControl";

const reloadSnapshotMock = vi.fn();

const activeSnapshot: CodexAccountsSnapshot = {
  codexHomePath: "/Users/test/.codex",
  accounts: [
    {
      accountKey: "user-1::acct-1",
      alias: "Work",
      email: "work@example.com",
      planType: "pro",
      authMode: "chatgpt",
      usageLimits: {
        fiveHourResetsAtEpochSeconds: 1_777_123_400,
        fiveHourUsedPercent: 30,
        weeklyResetsAtEpochSeconds: 1_777_777_000,
        weeklyUsedPercent: 55,
      },
      hasSnapshot: true,
      isActive: true,
    },
  ],
  activeAccountKey: "user-1::acct-1",
  currentAuthMode: "chatgpt",
  managedCurrentAuth: true,
  runningCodexSessionCount: 0,
};

vi.mock("~/hooks/useCodexAccountsSnapshot", () => ({
  useCodexAccountsSnapshot: () => ({
    applySnapshot: vi.fn(),
    isLoading: false,
    reloadSnapshot: reloadSnapshotMock,
    snapshot: activeSnapshot,
  }),
}));

vi.mock("../ui/menu", () => {
  return {
    Menu: ({
      children,
      onOpenChange,
    }: {
      children: ReactNode;
      onOpenChange?: (open: boolean) => void;
    }) => {
      onOpenChange?.(true);
      return <div>{children}</div>;
    },
    MenuGroup: ({ children }: { children: ReactNode }) => <div>{children}</div>,
    MenuGroupLabel: ({ children }: { children: ReactNode }) => <div>{children}</div>,
    MenuPopup: ({ children }: { children: ReactNode }) => <div>{children}</div>,
    MenuRadioGroup: ({ children }: { children: ReactNode }) => <div>{children}</div>,
    MenuRadioItem: ({ children }: { children: ReactNode }) => <div>{children}</div>,
    MenuSeparator: () => <hr />,
    MenuTrigger: ({ render }: { render: ReactNode }) => <div>{render}</div>,
  };
});

describe("SidebarCodexAccountControl menu refresh", () => {
  it("reloads the active account snapshot when the accounts menu opens", () => {
    reloadSnapshotMock.mockReset();

    renderToStaticMarkup(<SidebarCodexAccountControl initialSnapshot={activeSnapshot} />);

    expect(reloadSnapshotMock).toHaveBeenCalledTimes(1);
  });
});
