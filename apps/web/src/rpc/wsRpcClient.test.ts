import type {
  CodexAccountsSnapshot,
  CodexSwitchAccountResult,
  GitStatusLocalResult,
  GitStatusRemoteResult,
  GitStatusStreamEvent,
} from "@t3tools/contracts";
import { WS_METHODS } from "@t3tools/contracts";
import { describe, expect, it, vi } from "vitest";

vi.mock("./wsTransport", () => ({
  WsTransport: class WsTransport {
    dispose = vi.fn(async () => undefined);
    reconnect = vi.fn(async () => undefined);
    request = vi.fn();
    requestStream = vi.fn();
    subscribe = vi.fn(() => () => undefined);
  },
}));

import { createWsRpcClient } from "./wsRpcClient";
import { type WsTransport } from "./wsTransport";

const baseLocalStatus: GitStatusLocalResult = {
  isRepo: true,
  hasOriginRemote: true,
  isDefaultBranch: false,
  branch: "feature/demo",
  hasWorkingTreeChanges: false,
  workingTree: { files: [], insertions: 0, deletions: 0 },
};

const baseRemoteStatus: GitStatusRemoteResult = {
  hasUpstream: true,
  aheadCount: 0,
  behindCount: 0,
  pr: null,
};

describe("wsRpcClient", () => {
  it("reduces git status stream events into flat status snapshots", () => {
    const subscribe = vi.fn(<TValue>(_connect: unknown, listener: (value: TValue) => void) => {
      for (const event of [
        {
          _tag: "snapshot",
          local: baseLocalStatus,
          remote: null,
        },
        {
          _tag: "remoteUpdated",
          remote: baseRemoteStatus,
        },
        {
          _tag: "localUpdated",
          local: {
            ...baseLocalStatus,
            hasWorkingTreeChanges: true,
          },
        },
      ] satisfies GitStatusStreamEvent[]) {
        listener(event as TValue);
      }
      return () => undefined;
    });

    const transport = {
      dispose: vi.fn(async () => undefined),
      reconnect: vi.fn(async () => undefined),
      request: vi.fn(),
      requestStream: vi.fn(),
      subscribe,
    } satisfies Pick<
      WsTransport,
      "dispose" | "reconnect" | "request" | "requestStream" | "subscribe"
    >;

    const client = createWsRpcClient(transport as unknown as WsTransport);
    const listener = vi.fn();

    client.git.onStatus({ cwd: "/repo" }, listener);

    expect(listener.mock.calls).toEqual([
      [
        {
          ...baseLocalStatus,
          hasUpstream: false,
          aheadCount: 0,
          behindCount: 0,
          pr: null,
        },
      ],
      [
        {
          ...baseLocalStatus,
          ...baseRemoteStatus,
        },
      ],
      [
        {
          ...baseLocalStatus,
          ...baseRemoteStatus,
          hasWorkingTreeChanges: true,
        },
      ],
    ]);
  });

  it("forwards codex account RPC helpers to the transport", async () => {
    const listResult: CodexAccountsSnapshot = {
      codexHomePath: "/Users/test/.codex",
      accounts: [],
      currentAuthMode: "unknown",
      managedCurrentAuth: false,
      runningCodexSessionCount: 0,
      message: "No managed Codex accounts were found in the current CODEX_HOME.",
    };
    const switchResult: CodexSwitchAccountResult = {
      snapshot: {
        ...listResult,
        accounts: [
          {
            accountKey: "acct-1",
            alias: "Work",
            authMode: "chatgpt",
            hasSnapshot: true,
            isActive: true,
            planType: "pro",
          },
        ],
        activeAccountKey: "acct-1",
        currentAuthMode: "chatgpt",
        managedCurrentAuth: true,
      },
    };
    const serverListCodexAccounts = vi.fn(() => listResult);
    const serverSwitchCodexAccount = vi.fn((input: { accountKey: string }) => ({
      ...switchResult,
      input,
    }));
    const request = vi.fn(async (callback: (client: Record<string, unknown>) => unknown) =>
      callback({
        [WS_METHODS.serverListCodexAccounts]: serverListCodexAccounts,
        [WS_METHODS.serverSwitchCodexAccount]: serverSwitchCodexAccount,
      }),
    );

    const client = createWsRpcClient({
      dispose: vi.fn(async () => undefined),
      reconnect: vi.fn(async () => undefined),
      request,
      requestStream: vi.fn(),
      subscribe: vi.fn(() => () => undefined),
    } as unknown as WsTransport);

    await expect(client.server.listCodexAccounts()).resolves.toEqual(listResult);
    await expect(client.server.switchCodexAccount({ accountKey: "acct-1" })).resolves.toEqual({
      ...switchResult,
      input: { accountKey: "acct-1" },
    });
    expect(serverListCodexAccounts).toHaveBeenCalledWith({});
    expect(serverSwitchCodexAccount).toHaveBeenCalledWith({ accountKey: "acct-1" });
  });
});
