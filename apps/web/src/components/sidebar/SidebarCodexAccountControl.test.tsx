import type { CodexAccountsSnapshot } from "@t3tools/contracts";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { SidebarCodexAccountControl } from "./SidebarCodexAccountControl";

vi.mock("~/rpc/serverState", () => ({
  useServerProviders: () => [],
  useServerSettings: () => ({
    providers: {
      codex: {
        homePath: "",
      },
    },
  }),
}));

vi.mock("~/localApi", () => ({
  ensureLocalApi: () => ({
    server: {
      listCodexAccounts: vi.fn(),
      switchCodexAccount: vi.fn(),
    },
  }),
}));

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

describe("SidebarCodexAccountControl", () => {
  it("renders a simplified accounts trigger", () => {
    const html = renderToStaticMarkup(
      <SidebarCodexAccountControl initialSnapshot={activeSnapshot} />,
    );

    expect(html).toContain("Accounts");
    expect(html).toContain("Codex account selector");
  });

  it("does not render account metadata inside the trigger", () => {
    const html = renderToStaticMarkup(
      <SidebarCodexAccountControl initialSnapshot={activeSnapshot} />,
    );

    expect(html).not.toContain("work@example.com");
    expect(html).not.toContain("Pro");
  });

  it("renders a disabled trigger when no managed accounts are available", () => {
    const html = renderToStaticMarkup(
      <SidebarCodexAccountControl
        initialSnapshot={{
          codexHomePath: "/Users/test/.codex",
          accounts: [],
          currentAuthMode: "apikey",
          managedCurrentAuth: false,
          runningCodexSessionCount: 0,
          message:
            "Codex is currently using an OpenAI API key. No managed Codex accounts were found.",
        }}
      />,
    );

    expect(html).toContain("Codex account");
    expect(html).toContain("disabled");
  });
});
