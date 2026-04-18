import type { CodexAccountsSnapshot } from "@t3tools/contracts";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { SidebarCodexAccountControl } from "./SidebarCodexAccountControl";

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
    isLoading: true,
    reloadSnapshot: vi.fn(),
    snapshot: activeSnapshot,
  }),
}));

describe("SidebarCodexAccountControl refreshing state", () => {
  it("keeps the account trigger enabled while the refresh button is busy", () => {
    const html = renderToStaticMarkup(
      <SidebarCodexAccountControl initialSnapshot={activeSnapshot} />,
    );

    expect(html).toContain('aria-busy="true"');
    expect(html).toContain('aria-label="Refresh Codex accounts"');
    expect(html).toMatch(/aria-label="Codex account selector"(?:(?!disabled).)*>Accounts</s);
  });
});
