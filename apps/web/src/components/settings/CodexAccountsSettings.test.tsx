import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { CodexAccountsSettings } from "./CodexAccountsSettings";

vi.mock("~/hooks/useCodexAccountsSnapshot", () => ({
  useCodexAccountsSnapshot: () => ({
    isLoading: false,
    reloadSnapshot: vi.fn(),
    snapshot: {
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
    },
  }),
}));

describe("CodexAccountsSettings", () => {
  it("renders remaining 5-hour and weekly usage for each account", () => {
    const html = renderToStaticMarkup(<CodexAccountsSettings />);

    expect(html).toContain("Codex accounts");
    expect(html).toContain("Work");
    expect(html).toContain("5h remaining");
    expect(html).toContain("70%");
    expect(html).toContain("Weekly remaining");
    expect(html).toContain("45%");
    expect(html).toContain("Active");
  });
});
