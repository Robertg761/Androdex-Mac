import * as OS from "node:os";
import {
  CodexAccountsError,
  type CodexAccountAuthMode,
  type CodexAccountPlanType,
  type CodexAccountSummary,
  type CodexAccountsSnapshot,
} from "@t3tools/contracts";
import { Effect, FileSystem, Layer, Path } from "effect";
import { ProviderRegistry } from "../../provider/Services/ProviderRegistry";
import { ProviderService } from "../../provider/Services/ProviderService";
import { ServerSettingsService } from "../../serverSettings";
import {
  CodexAccountManager,
  type CodexAccountManagerShape,
} from "../Services/CodexAccountManager";

type AuthInfo = {
  readonly authMode: CodexAccountAuthMode;
  readonly email?: string | undefined;
  readonly recordKey?: string | undefined;
  readonly planType?: CodexAccountPlanType | null | undefined;
};

type RegistryAccountRecord = {
  readonly accountKey: string;
  readonly chatgptAccountId?: string | undefined;
  readonly chatgptUserId?: string | undefined;
  readonly email?: string | undefined;
  readonly alias?: string | undefined;
  readonly accountName?: string | undefined;
  readonly planType?: CodexAccountPlanType | null | undefined;
  readonly usageLimits?:
    | {
        readonly fiveHourUsedPercent?: number | undefined;
        readonly fiveHourResetsAtEpochSeconds?: number | undefined;
        readonly weeklyUsedPercent?: number | undefined;
        readonly weeklyResetsAtEpochSeconds?: number | undefined;
      }
    | undefined;
  readonly authMode: CodexAccountAuthMode;
};

type RegistryDocument = {
  readonly raw: Record<string, unknown> | null;
  readonly accounts: ReadonlyArray<RegistryAccountRecord>;
  readonly activeAccountKey?: string | undefined;
};

const SAFE_ACCOUNT_KEY_PATTERN = /^[a-z0-9._-]+$/i;

function fail(message: string): CodexAccountsError {
  return new CodexAccountsError({ message });
}

function asObject(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function asArray(value: unknown): ReadonlyArray<unknown> | undefined {
  return Array.isArray(value) ? value : undefined;
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function asNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function nonEmptyTrimmed(value: unknown): string | undefined {
  const candidate = asString(value)?.trim();
  return candidate && candidate.length > 0 ? candidate : undefined;
}

function asNonNegativeInt(value: unknown): number | undefined {
  const candidate = asNumber(value);
  if (candidate === undefined || candidate < 0) {
    return undefined;
  }
  return Math.round(candidate);
}

function normalizePlanType(value: unknown): CodexAccountPlanType | null | undefined {
  switch (value) {
    case "free":
    case "go":
    case "plus":
    case "pro":
    case "team":
    case "business":
    case "enterprise":
    case "edu":
    case "unknown":
      return value;
    case null:
      return null;
    default:
      return undefined;
  }
}

function normalizeAuthMode(value: unknown): CodexAccountAuthMode {
  switch (value) {
    case "chatgpt":
      return "chatgpt";
    case "apikey":
    case "apiKey":
      return "apikey";
    default:
      return "unknown";
  }
}

function base64UrlEncode(value: string): string {
  return Buffer.from(value, "utf8").toString("base64url");
}

function buildRecordKey(chatgptUserId: string | undefined, chatgptAccountId: string | undefined) {
  if (!chatgptUserId || !chatgptAccountId) {
    return undefined;
  }
  return `${chatgptUserId}::${chatgptAccountId}`;
}

function decodeJwtPayload(jwt: string): Record<string, unknown> | undefined {
  const parts = jwt.split(".");
  if (parts.length < 2 || parts[1]!.length === 0) {
    return undefined;
  }

  try {
    const payload = Buffer.from(parts[1]!, "base64url").toString("utf8");
    return asObject(JSON.parse(payload));
  } catch {
    return undefined;
  }
}

function parseAuthInfo(raw: string): AuthInfo {
  try {
    const root = asObject(JSON.parse(raw));
    if (!root) {
      return { authMode: "unknown" };
    }

    const apiKey = nonEmptyTrimmed(root.OPENAI_API_KEY);
    if (apiKey) {
      return { authMode: "apikey" };
    }

    const tokens = asObject(root.tokens);
    const tokenAccountId = nonEmptyTrimmed(tokens?.account_id);
    const claims = nonEmptyTrimmed(tokens?.id_token)
      ? decodeJwtPayload(nonEmptyTrimmed(tokens?.id_token)!)
      : undefined;
    const authClaims = asObject(claims?.["https://api.openai.com/auth"]);
    const chatgptUserId =
      nonEmptyTrimmed(authClaims?.chatgpt_user_id) ?? nonEmptyTrimmed(authClaims?.user_id);
    const email = nonEmptyTrimmed(claims?.email);
    const recordKey =
      nonEmptyTrimmed(root.record_key) ?? buildRecordKey(chatgptUserId, tokenAccountId);
    const planType = normalizePlanType(authClaims?.chatgpt_plan_type) ?? null;

    if (tokens || claims) {
      return {
        authMode: "chatgpt",
        ...(email ? { email } : {}),
        ...(recordKey ? { recordKey } : {}),
        planType,
      };
    }

    return { authMode: "unknown" };
  } catch {
    return { authMode: "unknown" };
  }
}

function parseRegistryAccountRecord(value: unknown): RegistryAccountRecord | undefined {
  const record = asObject(value);
  if (!record) {
    return undefined;
  }

  const accountKey =
    nonEmptyTrimmed(record.account_key) ??
    buildRecordKey(
      nonEmptyTrimmed(record.chatgpt_user_id),
      nonEmptyTrimmed(record.chatgpt_account_id),
    );
  if (!accountKey) {
    return undefined;
  }

  const lastUsage = asObject(record.last_usage);
  const planType =
    normalizePlanType(record.plan) ?? normalizePlanType(lastUsage?.plan_type) ?? null;
  const resolveWindowUsage = (windowMinutes: number) => {
    if (!lastUsage) {
      return {};
    }

    for (const entry of Object.values(lastUsage)) {
      const usageWindow = asObject(entry);
      if (!usageWindow) {
        continue;
      }
      const resolvedWindowMinutes =
        asNumber(usageWindow.window_minutes) ?? asNumber(usageWindow.windowMinutes);
      if (resolvedWindowMinutes !== windowMinutes) {
        continue;
      }
      return {
        usedPercent: asNonNegativeInt(usageWindow.used_percent ?? usageWindow.usedPercent),
        resetsAtEpochSeconds: asNonNegativeInt(usageWindow.resets_at ?? usageWindow.resetsAt),
      };
    }

    return {};
  };
  const fiveHourUsage = resolveWindowUsage(300);
  const weeklyUsage = resolveWindowUsage(10_080);
  const chatgptAccountId = nonEmptyTrimmed(record.chatgpt_account_id);
  const chatgptUserId = nonEmptyTrimmed(record.chatgpt_user_id);
  const email = nonEmptyTrimmed(record.email);
  const alias = nonEmptyTrimmed(record.alias);
  const accountName = nonEmptyTrimmed(record.account_name);

  return {
    accountKey,
    ...(chatgptAccountId ? { chatgptAccountId } : {}),
    ...(chatgptUserId ? { chatgptUserId } : {}),
    ...(email ? { email } : {}),
    ...(alias ? { alias } : {}),
    ...(accountName ? { accountName } : {}),
    planType,
    ...(fiveHourUsage.usedPercent !== undefined ||
    fiveHourUsage.resetsAtEpochSeconds !== undefined ||
    weeklyUsage.usedPercent !== undefined ||
    weeklyUsage.resetsAtEpochSeconds !== undefined
      ? {
          usageLimits: {
            ...(fiveHourUsage.usedPercent !== undefined
              ? { fiveHourUsedPercent: fiveHourUsage.usedPercent }
              : {}),
            ...(fiveHourUsage.resetsAtEpochSeconds !== undefined
              ? { fiveHourResetsAtEpochSeconds: fiveHourUsage.resetsAtEpochSeconds }
              : {}),
            ...(weeklyUsage.usedPercent !== undefined
              ? { weeklyUsedPercent: weeklyUsage.usedPercent }
              : {}),
            ...(weeklyUsage.resetsAtEpochSeconds !== undefined
              ? { weeklyResetsAtEpochSeconds: weeklyUsage.resetsAtEpochSeconds }
              : {}),
          },
        }
      : {}),
    authMode: normalizeAuthMode(record.auth_mode),
  };
}

function createSnapshotMessage(input: {
  readonly accounts: ReadonlyArray<CodexAccountSummary>;
  readonly currentAuthMode: CodexAccountAuthMode;
  readonly managedCurrentAuth: boolean;
}): string | undefined {
  if (input.accounts.length > 0) {
    return undefined;
  }

  if (input.currentAuthMode === "apikey") {
    return "Codex is currently using an OpenAI API key. No managed Codex accounts were found.";
  }

  if (!input.managedCurrentAuth) {
    return "No managed Codex accounts were found in the current CODEX_HOME.";
  }

  return undefined;
}

export const CodexAccountManagerLive = Layer.effect(
  CodexAccountManager,
  Effect.gen(function* () {
    const fileSystem = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const serverSettings = yield* ServerSettingsService;
    const providerRegistry = yield* ProviderRegistry;
    const providerService = yield* ProviderService;

    const getCodexHomePath = Effect.gen(function* () {
      const settings = yield* serverSettings.getSettings.pipe(
        Effect.mapError((error) => fail(error.message)),
      );
      const configuredHome = settings.providers.codex.homePath.trim();
      return configuredHome.length > 0 ? configuredHome : path.join(OS.homedir(), ".codex");
    });

    const readTextFileIfExists = (filePath: string) =>
      fileSystem.exists(filePath).pipe(
        Effect.mapError((error) => fail(`Failed to check ${filePath}: ${String(error)}`)),
        Effect.flatMap((exists) =>
          exists
            ? fileSystem
                .readFileString(filePath)
                .pipe(
                  Effect.mapError((error) => fail(`Failed to read ${filePath}: ${String(error)}`)),
                )
            : Effect.succeed(null),
        ),
      );

    const resolveAccountSnapshotPath = Effect.fn("resolveAccountSnapshotPath")(function* (
      codexHomePath: string,
      record: RegistryAccountRecord,
    ) {
      const candidates = [
        SAFE_ACCOUNT_KEY_PATTERN.test(record.accountKey)
          ? `${record.accountKey}.auth.json`
          : `${base64UrlEncode(record.accountKey)}.auth.json`,
        ...(record.email ? [`${base64UrlEncode(record.email)}.auth.json`] : []),
      ];

      for (const candidate of candidates) {
        const snapshotPath = path.join(codexHomePath, "accounts", candidate);
        const exists = yield* fileSystem
          .exists(snapshotPath)
          .pipe(
            Effect.mapError((error) => fail(`Failed to check ${snapshotPath}: ${String(error)}`)),
          );
        if (exists) {
          return snapshotPath;
        }
      }

      return null;
    });

    const readRegistry = (codexHomePath: string) =>
      Effect.gen(function* () {
        const registryPath = path.join(codexHomePath, "accounts", "registry.json");
        const rawText = yield* readTextFileIfExists(registryPath);
        if (!rawText) {
          return {
            raw: null,
            accounts: [],
            activeAccountKey: undefined,
          } satisfies RegistryDocument;
        }

        const parsed = yield* Effect.try({
          try: () => JSON.parse(rawText),
          catch: () => fail("Codex account registry is malformed JSON."),
        });
        const raw = asObject(parsed);
        if (!raw) {
          return yield* fail("Codex account registry must be a JSON object.");
        }

        return {
          raw,
          accounts: (asArray(raw.accounts) ?? [])
            .map((entry) => parseRegistryAccountRecord(entry))
            .filter((entry): entry is RegistryAccountRecord => entry !== undefined),
          ...(nonEmptyTrimmed(raw.active_account_key)
            ? { activeAccountKey: nonEmptyTrimmed(raw.active_account_key) }
            : {}),
        } satisfies RegistryDocument;
      });

    const listSnapshot = Effect.fn("listSnapshot")(function* () {
      const codexHomePath = yield* getCodexHomePath;
      const registry = yield* readRegistry(codexHomePath);
      const activeAuthPath = path.join(codexHomePath, "auth.json");
      const activeAuthText = yield* readTextFileIfExists(activeAuthPath);
      const activeAuth = activeAuthText
        ? parseAuthInfo(activeAuthText)
        : { authMode: "unknown" as const };
      const activeAccountKey =
        registry.activeAccountKey &&
        registry.accounts.some((account) => account.accountKey === registry.activeAccountKey)
          ? registry.activeAccountKey
          : activeAuth.recordKey &&
              registry.accounts.some((account) => account.accountKey === activeAuth.recordKey)
            ? activeAuth.recordKey
            : undefined;

      const accounts = yield* Effect.forEach(registry.accounts, (record) =>
        Effect.gen(function* () {
          const snapshotPath = yield* resolveAccountSnapshotPath(codexHomePath, record);
          const snapshotText = snapshotPath ? yield* readTextFileIfExists(snapshotPath) : null;
          const snapshotInfo = snapshotText
            ? parseAuthInfo(snapshotText)
            : { authMode: "unknown" as const };
          const planType = record.planType ?? snapshotInfo.planType ?? null;

          return {
            accountKey: record.accountKey,
            ...((record.email ?? snapshotInfo.email)
              ? { email: record.email ?? snapshotInfo.email }
              : {}),
            ...(record.alias ? { alias: record.alias } : {}),
            ...(record.accountName ? { accountName: record.accountName } : {}),
            planType,
            authMode: record.authMode !== "unknown" ? record.authMode : snapshotInfo.authMode,
            ...(record.usageLimits ? { usageLimits: record.usageLimits } : {}),
            hasSnapshot: snapshotPath !== null,
            isActive: activeAccountKey === record.accountKey,
          } satisfies CodexAccountSummary;
        }),
      );

      const runningCodexSessionCount = yield* providerService.listSessions().pipe(
        Effect.map(
          (sessions) =>
            sessions.filter(
              (session) => session.provider === "codex" && session.status !== "closed",
            ).length,
        ),
        Effect.orElseSucceed(() => 0),
      );

      const managedCurrentAuth =
        activeAccountKey !== undefined &&
        accounts.some((account) => account.accountKey === activeAccountKey && account.hasSnapshot);

      return {
        codexHomePath,
        accounts,
        ...(activeAccountKey ? { activeAccountKey } : {}),
        currentAuthMode: activeAuth.authMode,
        managedCurrentAuth,
        runningCodexSessionCount,
        ...(createSnapshotMessage({
          accounts,
          currentAuthMode: activeAuth.authMode,
          managedCurrentAuth,
        })
          ? {
              message: createSnapshotMessage({
                accounts,
                currentAuthMode: activeAuth.authMode,
                managedCurrentAuth,
              })!,
            }
          : {}),
      } satisfies CodexAccountsSnapshot;
    });

    const writeFileAtomically = (filePath: string, content: string) => {
      const tempPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
      return Effect.gen(function* () {
        yield* fileSystem
          .makeDirectory(path.dirname(filePath), { recursive: true })
          .pipe(
            Effect.mapError((error) => fail(`Failed to prepare ${filePath}: ${String(error)}`)),
          );
        yield* fileSystem
          .writeFileString(tempPath, content)
          .pipe(Effect.mapError((error) => fail(`Failed to write ${filePath}: ${String(error)}`)));
        yield* fileSystem
          .rename(tempPath, filePath)
          .pipe(
            Effect.mapError((error) => fail(`Failed to finalize ${filePath}: ${String(error)}`)),
          );
      }).pipe(
        Effect.ensuring(
          fileSystem.remove(tempPath, { force: true }).pipe(Effect.orElseSucceed(() => undefined)),
        ),
      );
    };

    const switchAccount: CodexAccountManagerShape["switchAccount"] = (input) =>
      Effect.gen(function* () {
        const snapshotBefore = yield* listSnapshot();
        const target = snapshotBefore.accounts.find(
          (account) => account.accountKey === input.accountKey,
        );
        if (!target) {
          return yield* fail("The selected Codex account does not exist in the registry.");
        }
        if (!target.hasSnapshot) {
          return yield* fail("The selected Codex account is missing its stored auth snapshot.");
        }

        const registry = yield* readRegistry(snapshotBefore.codexHomePath);
        if (!registry.raw) {
          return yield* fail("Codex account registry was not found.");
        }

        const record = registry.accounts.find((account) => account.accountKey === input.accountKey);
        if (!record) {
          return yield* fail("The selected Codex account could not be resolved.");
        }

        const snapshotPath = yield* resolveAccountSnapshotPath(
          snapshotBefore.codexHomePath,
          record,
        );
        if (!snapshotPath) {
          return yield* fail("The selected Codex account is missing its stored auth snapshot.");
        }

        const snapshotText = yield* readTextFileIfExists(snapshotPath);
        if (!snapshotText) {
          return yield* fail("The selected Codex account snapshot could not be read.");
        }

        const authPath = path.join(snapshotBefore.codexHomePath, "auth.json");
        yield* writeFileAtomically(
          authPath,
          snapshotText.endsWith("\n") ? snapshotText : `${snapshotText}\n`,
        );

        const nextRegistryRaw = {
          ...registry.raw,
          active_account_key: input.accountKey,
          active_account_activated_at_ms: Date.now(),
        } satisfies Record<string, unknown>;
        const registryPath = path.join(snapshotBefore.codexHomePath, "accounts", "registry.json");
        const registryContent = `${JSON.stringify(nextRegistryRaw, null, 2)}\n`;
        yield* writeFileAtomically(registryPath, registryContent).pipe(
          Effect.tapError((error) =>
            Effect.logWarning(
              "codex account switch updated auth.json but failed to persist registry",
              {
                accountKey: input.accountKey,
                message: error.message,
              },
            ),
          ),
        );

        yield* providerRegistry.refresh("codex").pipe(Effect.orElseSucceed(() => []));
        return {
          snapshot: yield* listSnapshot(),
        };
      });

    return {
      listAccounts: listSnapshot(),
      switchAccount,
    } satisfies CodexAccountManagerShape;
  }),
);
