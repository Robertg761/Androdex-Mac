import * as NodeServices from "@effect/platform-node/NodeServices";
import {
  DEFAULT_SERVER_SETTINGS,
  ThreadId,
  type ProviderKind,
  type ProviderSession,
} from "@t3tools/contracts";
import { assert, describe, it } from "@effect/vitest";
import { Effect, FileSystem, Path, Stream } from "effect";
import {
  ProviderRegistry,
  type ProviderRegistryShape,
} from "../../provider/Services/ProviderRegistry";
import {
  ProviderService,
  type ProviderServiceShape,
} from "../../provider/Services/ProviderService";
import { type ServerSettingsShape, ServerSettingsService } from "../../serverSettings";
import { CodexAccountManager } from "../Services/CodexAccountManager";
import { CodexAccountManagerLive } from "./CodexAccountManager";

function createJwt(payload: Record<string, unknown>): string {
  return `header.${Buffer.from(JSON.stringify(payload), "utf8").toString("base64url")}.signature`;
}

function makeServerSettingsService(homePath: string): ServerSettingsShape {
  return {
    start: Effect.void,
    ready: Effect.void,
    getSettings: Effect.succeed({
      ...DEFAULT_SERVER_SETTINGS,
      providers: {
        ...DEFAULT_SERVER_SETTINGS.providers,
        codex: {
          ...DEFAULT_SERVER_SETTINGS.providers.codex,
          homePath,
        },
      },
    }),
    updateSettings: () =>
      Effect.die("updateSettings should not be called in CodexAccountManager tests"),
    streamChanges: Stream.empty,
  };
}

function makeProviderRegistryService(
  refreshCalls: Array<ProviderKind | undefined>,
): ProviderRegistryShape {
  return {
    getProviders: Effect.succeed([]),
    refresh: (provider) =>
      Effect.sync(() => {
        refreshCalls.push(provider);
        return [];
      }),
    streamChanges: Stream.empty,
  };
}

function makeProviderServiceShape(
  sessions: ReadonlyArray<ProviderSession> = [],
): ProviderServiceShape {
  const unused = () => Effect.die("unused ProviderService method");

  return {
    startSession: () => unused(),
    sendTurn: () => unused(),
    interruptTurn: () => unused(),
    respondToRequest: () => unused(),
    respondToUserInput: () => unused(),
    stopSession: () => unused(),
    listSessions: () => Effect.succeed(sessions),
    getCapabilities: () => unused(),
    rollbackConversation: () => unused(),
    streamEvents: Stream.empty,
  };
}

function writeTextFile(filePath: string, content: string) {
  return Effect.gen(function* () {
    const fileSystem = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    yield* fileSystem.makeDirectory(path.dirname(filePath), { recursive: true });
    yield* fileSystem.writeFileString(filePath, content);
  });
}

function writeJsonFile(filePath: string, value: unknown) {
  return writeTextFile(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function makeCodexSession(
  status: ProviderSession["status"],
  provider: ProviderKind = "codex",
): ProviderSession {
  const now = "2026-04-13T00:00:00.000Z";
  return {
    provider,
    status,
    runtimeMode: "full-access",
    threadId: ThreadId.make(`thread-${provider}-${status}`),
    createdAt: now,
    updatedAt: now,
  };
}

describe("CodexAccountManager", () => {
  it.effect("lists encoded account snapshots and counts only running codex sessions", () =>
    Effect.gen(function* () {
      const fileSystem = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const codexHomePath = yield* fileSystem.makeTempDirectoryScoped({
        prefix: "t3-codex-account-manager-",
      });
      const accountKey = "user-1::acct-1";
      const email = "work@example.com";
      const authPayload = {
        tokens: {
          account_id: "acct-1",
          id_token: createJwt({
            email,
            "https://api.openai.com/auth": {
              chatgpt_plan_type: "pro",
              chatgpt_user_id: "user-1",
            },
          }),
        },
      };
      const snapshotFileName = `${Buffer.from(accountKey, "utf8").toString("base64url")}.auth.json`;

      yield* writeJsonFile(path.join(codexHomePath, "accounts", "registry.json"), {
        accounts: [
          {
            account_key: accountKey,
            alias: "Work",
            auth_mode: "chatgpt",
            email,
            plan: "pro",
            last_usage: {
              five_hour_window: {
                resets_at: 1_777_001_200,
                used_percent: 35,
                window_minutes: 300,
              },
              weekly_window: {
                resets_at: 1_777_604_800,
                used_percent: 72,
                window_minutes: 10_080,
              },
            },
          },
        ],
        active_account_key: accountKey,
      });
      yield* writeJsonFile(path.join(codexHomePath, "accounts", snapshotFileName), authPayload);
      yield* writeJsonFile(path.join(codexHomePath, "auth.json"), authPayload);

      const snapshot = yield* Effect.gen(function* () {
        const manager = yield* CodexAccountManager;
        return yield* manager.listAccounts;
      }).pipe(
        Effect.provide(CodexAccountManagerLive),
        Effect.provideService(ServerSettingsService, makeServerSettingsService(codexHomePath)),
        Effect.provideService(ProviderRegistry, makeProviderRegistryService([])),
        Effect.provideService(
          ProviderService,
          makeProviderServiceShape([
            makeCodexSession("running"),
            makeCodexSession("closed"),
            makeCodexSession("ready", "claudeAgent"),
          ]),
        ),
      );

      assert.strictEqual(snapshot.activeAccountKey, accountKey);
      assert.strictEqual(snapshot.currentAuthMode, "chatgpt");
      assert.strictEqual(snapshot.managedCurrentAuth, true);
      assert.strictEqual(snapshot.runningCodexSessionCount, 1);
      assert.deepStrictEqual(snapshot.accounts, [
        {
          accountKey,
          alias: "Work",
          authMode: "chatgpt",
          email,
          hasSnapshot: true,
          isActive: true,
          planType: "pro",
          usageLimits: {
            fiveHourUsedPercent: 35,
            fiveHourResetsAtEpochSeconds: 1_777_001_200,
            weeklyUsedPercent: 72,
            weeklyResetsAtEpochSeconds: 1_777_604_800,
          },
        },
      ]);
    }).pipe(Effect.provide(NodeServices.layer)),
  );

  it.effect("derives 5-hour and weekly usage limits from window durations", () =>
    Effect.gen(function* () {
      const fileSystem = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const codexHomePath = yield* fileSystem.makeTempDirectoryScoped({
        prefix: "t3-codex-account-usage-",
      });
      const accountKey = "user-window::acct-window";
      const email = "window@example.com";
      const authPayload = {
        tokens: {
          account_id: "acct-window",
          id_token: createJwt({
            email,
            "https://api.openai.com/auth": {
              chatgpt_plan_type: "plus",
              chatgpt_user_id: "user-window",
            },
          }),
        },
      };

      yield* writeJsonFile(path.join(codexHomePath, "accounts", "registry.json"), {
        accounts: [
          {
            account_key: accountKey,
            email,
            last_usage: {
              some_future_name: {
                resets_at: 1_777_123_400,
                used_percent: 12,
                window_minutes: 300,
              },
              some_other_name: {
                resets_at: 1_777_777_000,
                used_percent: 63,
                window_minutes: 10_080,
              },
            },
          },
        ],
      });
      yield* writeJsonFile(
        path.join(
          codexHomePath,
          "accounts",
          `${Buffer.from(accountKey, "utf8").toString("base64url")}.auth.json`,
        ),
        authPayload,
      );

      const snapshot = yield* Effect.gen(function* () {
        const manager = yield* CodexAccountManager;
        return yield* manager.listAccounts;
      }).pipe(
        Effect.provide(CodexAccountManagerLive),
        Effect.provideService(ServerSettingsService, makeServerSettingsService(codexHomePath)),
        Effect.provideService(ProviderRegistry, makeProviderRegistryService([])),
        Effect.provideService(ProviderService, makeProviderServiceShape()),
      );

      assert.deepStrictEqual(snapshot.accounts[0]?.usageLimits, {
        fiveHourUsedPercent: 12,
        fiveHourResetsAtEpochSeconds: 1_777_123_400,
        weeklyUsedPercent: 63,
        weeklyResetsAtEpochSeconds: 1_777_777_000,
      });
    }).pipe(Effect.provide(NodeServices.layer)),
  );

  it.effect(
    "falls back to legacy email-encoded snapshots and auth.json for the active account",
    () =>
      Effect.gen(function* () {
        const fileSystem = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const codexHomePath = yield* fileSystem.makeTempDirectoryScoped({
          prefix: "t3-codex-account-legacy-",
        });
        const accountKey = "user-legacy::acct-legacy";
        const email = "legacy@example.com";
        const authPayload = {
          tokens: {
            account_id: "acct-legacy",
            id_token: createJwt({
              email,
              "https://api.openai.com/auth": {
                chatgpt_plan_type: "plus",
                chatgpt_user_id: "user-legacy",
              },
            }),
          },
        };
        const legacySnapshotName = `${Buffer.from(email, "utf8").toString("base64url")}.auth.json`;

        yield* writeJsonFile(path.join(codexHomePath, "accounts", "registry.json"), {
          accounts: [
            {
              account_key: accountKey,
              email,
            },
          ],
          active_account_key: "stale-account-key",
        });
        yield* writeJsonFile(path.join(codexHomePath, "accounts", legacySnapshotName), authPayload);
        yield* writeJsonFile(path.join(codexHomePath, "auth.json"), authPayload);

        const snapshot = yield* Effect.gen(function* () {
          const manager = yield* CodexAccountManager;
          return yield* manager.listAccounts;
        }).pipe(
          Effect.provide(CodexAccountManagerLive),
          Effect.provideService(ServerSettingsService, makeServerSettingsService(codexHomePath)),
          Effect.provideService(ProviderRegistry, makeProviderRegistryService([])),
          Effect.provideService(ProviderService, makeProviderServiceShape()),
        );

        assert.strictEqual(snapshot.activeAccountKey, accountKey);
        assert.strictEqual(snapshot.accounts[0]?.hasSnapshot, true);
        assert.strictEqual(snapshot.accounts[0]?.isActive, true);
        assert.strictEqual(snapshot.accounts[0]?.planType, "plus");
      }).pipe(Effect.provide(NodeServices.layer)),
  );

  it.effect(
    "switches the active account, preserves registry fields, and refreshes Codex provider state",
    () =>
      Effect.gen(function* () {
        const fileSystem = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const codexHomePath = yield* fileSystem.makeTempDirectoryScoped({
          prefix: "t3-codex-account-switch-",
        });
        const refreshCalls: Array<ProviderKind | undefined> = [];
        const firstAccountKey = "user-1::acct-1";
        const secondAccountKey = "user-2::acct-2";
        const firstSnapshot = {
          tokens: {
            account_id: "acct-1",
            id_token: createJwt({
              email: "first@example.com",
              "https://api.openai.com/auth": {
                chatgpt_plan_type: "free",
                chatgpt_user_id: "user-1",
              },
            }),
          },
        };
        const secondSnapshot = {
          tokens: {
            account_id: "acct-2",
            id_token: createJwt({
              email: "second@example.com",
              "https://api.openai.com/auth": {
                chatgpt_plan_type: "team",
                chatgpt_user_id: "user-2",
              },
            }),
          },
        };

        yield* writeJsonFile(path.join(codexHomePath, "accounts", "registry.json"), {
          accounts: [
            {
              account_key: firstAccountKey,
              email: "first@example.com",
              unknown_account_field: "keep-me",
            },
            {
              account_key: secondAccountKey,
              alias: "Second",
              email: "second@example.com",
            },
          ],
          active_account_key: firstAccountKey,
          custom_top_level_field: "preserve-me",
        });
        yield* writeJsonFile(
          path.join(
            codexHomePath,
            "accounts",
            `${Buffer.from(firstAccountKey, "utf8").toString("base64url")}.auth.json`,
          ),
          firstSnapshot,
        );
        yield* writeJsonFile(
          path.join(
            codexHomePath,
            "accounts",
            `${Buffer.from(secondAccountKey, "utf8").toString("base64url")}.auth.json`,
          ),
          secondSnapshot,
        );
        yield* writeJsonFile(path.join(codexHomePath, "auth.json"), firstSnapshot);

        const result = yield* Effect.gen(function* () {
          const manager = yield* CodexAccountManager;
          return yield* manager.switchAccount({ accountKey: secondAccountKey });
        }).pipe(
          Effect.provide(CodexAccountManagerLive),
          Effect.provideService(ServerSettingsService, makeServerSettingsService(codexHomePath)),
          Effect.provideService(ProviderRegistry, makeProviderRegistryService(refreshCalls)),
          Effect.provideService(ProviderService, makeProviderServiceShape()),
        );
        const nextAuthText = yield* fileSystem.readFileString(
          path.join(codexHomePath, "auth.json"),
        );
        const nextRegistryText = yield* fileSystem.readFileString(
          path.join(codexHomePath, "accounts", "registry.json"),
        );
        const nextRegistry = JSON.parse(nextRegistryText) as Record<string, unknown>;

        assert.strictEqual(refreshCalls[0], "codex");
        assert.deepStrictEqual(JSON.parse(nextAuthText), secondSnapshot);
        assert.strictEqual(result.snapshot.activeAccountKey, secondAccountKey);
        assert.strictEqual(nextRegistry.active_account_key, secondAccountKey);
        assert.strictEqual(nextRegistry.custom_top_level_field, "preserve-me");
        assert.deepStrictEqual(
          (nextRegistry.accounts as Array<Record<string, unknown>>)[0]?.unknown_account_field,
          "keep-me",
        );
        assert.strictEqual(typeof nextRegistry.active_account_activated_at_ms, "number");
      }).pipe(Effect.provide(NodeServices.layer)),
  );
});
