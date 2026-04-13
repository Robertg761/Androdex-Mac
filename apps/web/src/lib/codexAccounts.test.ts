import { describe, expect, it } from "vitest";
import {
  formatCodexPercent,
  formatCodexResetCountdown,
  formatCodexResetSummary,
  formatCodexUsageSummary,
  resolveCodexAccountBadgeLabel,
  resolveCodexAccountDisplayName,
  resolveCodexRemainingUsagePercent,
} from "./codexAccounts";

describe("codexAccounts", () => {
  it("prefers alias, then account name, then email for display names", () => {
    expect(
      resolveCodexAccountDisplayName({
        alias: "Work",
        accountName: "Work account",
        email: "work@example.com",
      }),
    ).toBe("Work");
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

  it("formats plan and auth labels for account badges", () => {
    expect(
      resolveCodexAccountBadgeLabel({
        accountKey: "acct-1",
        authMode: "chatgpt",
        hasSnapshot: true,
        isActive: false,
        planType: "pro",
      }),
    ).toBe("Pro");
    expect(
      resolveCodexAccountBadgeLabel({
        accountKey: "acct-2",
        authMode: "apikey",
        hasSnapshot: true,
        isActive: false,
        planType: null,
      }),
    ).toBe("API key");
  });

  it("derives remaining usage from Codex used percentages", () => {
    expect(resolveCodexRemainingUsagePercent(0)).toBe(100);
    expect(resolveCodexRemainingUsagePercent(67)).toBe(33);
    expect(resolveCodexRemainingUsagePercent(100)).toBe(0);
    expect(resolveCodexRemainingUsagePercent(undefined)).toBeNull();
  });

  it("formats percentages for display", () => {
    expect(formatCodexPercent(33)).toBe("33%");
    expect(formatCodexPercent(null)).toBe("Unknown");
  });

  it("formats compact 5-hour and weekly usage summaries", () => {
    expect(
      formatCodexUsageSummary({
        fiveHourUsedPercent: 30,
        weeklyUsedPercent: 55,
      }),
    ).toBe("5h 70% left · Weekly 45% left");
  });

  it("formats reset countdowns and summaries", () => {
    const nowMs = new Date("2026-04-13T12:00:00.000Z").getTime();

    expect(
      formatCodexResetCountdown(new Date("2026-04-13T15:00:00.000Z").getTime() / 1000, nowMs),
    ).toBe("in 3h");
    expect(
      formatCodexResetSummary(
        {
          fiveHourResetsAtEpochSeconds: new Date("2026-04-13T15:00:00.000Z").getTime() / 1000,
          weeklyResetsAtEpochSeconds: new Date("2026-04-15T12:00:00.000Z").getTime() / 1000,
        },
        nowMs,
      ),
    ).toBe("5h resets in 3h · Weekly resets in 2d");
  });
});
