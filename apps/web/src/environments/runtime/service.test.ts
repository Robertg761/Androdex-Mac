import { describe, expect, it } from "vitest";

import { shouldApplyTerminalEvent, shouldReusePrimaryEnvironmentConnection } from "./service";

describe("shouldApplyTerminalEvent", () => {
  it("applies terminal events for draft-only threads", () => {
    expect(
      shouldApplyTerminalEvent({
        serverThreadArchivedAt: undefined,
        hasDraftThread: true,
      }),
    ).toBe(true);
  });

  it("drops terminal events for unknown threads", () => {
    expect(
      shouldApplyTerminalEvent({
        serverThreadArchivedAt: undefined,
        hasDraftThread: false,
      }),
    ).toBe(false);
  });

  it("drops terminal events for archived server threads even if a draft exists", () => {
    expect(
      shouldApplyTerminalEvent({
        serverThreadArchivedAt: "2026-04-09T00:00:00.000Z",
        hasDraftThread: true,
      }),
    ).toBe(false);
  });

  it("applies terminal events for active server threads", () => {
    expect(
      shouldApplyTerminalEvent({
        serverThreadArchivedAt: null,
        hasDraftThread: false,
      }),
    ).toBe(true);
  });
});

describe("shouldReusePrimaryEnvironmentConnection", () => {
  it("reuses a primary connection when the tunnel target is unchanged", () => {
    expect(
      shouldReusePrimaryEnvironmentConnection(
        {
          environmentId: "environment-1" as never,
          kind: "primary",
          knownEnvironment: {
            environmentId: "environment-1" as never,
            source: "window-origin",
            target: {
              httpBaseUrl: "https://relay.androdex.xyz/desktop/route-123",
              wsBaseUrl: "wss://relay.androdex.xyz/desktop/route-123",
            },
          } as never,
        },
        {
          environmentId: "environment-1" as never,
          source: "window-origin",
          target: {
            httpBaseUrl: "https://relay.androdex.xyz/desktop/route-123",
            wsBaseUrl: "wss://relay.androdex.xyz/desktop/route-123",
          },
        } as never,
      ),
    ).toBe(true);
  });

  it("replaces a primary connection when the tunnel target changes", () => {
    expect(
      shouldReusePrimaryEnvironmentConnection(
        {
          environmentId: "environment-1" as never,
          kind: "primary",
          knownEnvironment: {
            environmentId: "environment-1" as never,
            source: "window-origin",
            target: {
              httpBaseUrl: "https://relay.androdex.xyz/",
              wsBaseUrl: "wss://relay.androdex.xyz/",
            },
          } as never,
        },
        {
          environmentId: "environment-1" as never,
          source: "window-origin",
          target: {
            httpBaseUrl: "https://relay.androdex.xyz/desktop/route-123",
            wsBaseUrl: "wss://relay.androdex.xyz/desktop/route-123",
          },
        } as never,
      ),
    ).toBe(false);
  });
});
