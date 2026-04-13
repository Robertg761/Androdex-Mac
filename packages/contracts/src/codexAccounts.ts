import { Effect, Schema } from "effect";
import { NonNegativeInt, TrimmedNonEmptyString } from "./baseSchemas";

export const CodexAccountPlanType = Schema.Literals([
  "free",
  "go",
  "plus",
  "pro",
  "team",
  "business",
  "enterprise",
  "edu",
  "unknown",
]);
export type CodexAccountPlanType = typeof CodexAccountPlanType.Type;

export const CodexAccountAuthMode = Schema.Literals(["chatgpt", "apikey", "unknown"]);
export type CodexAccountAuthMode = typeof CodexAccountAuthMode.Type;

export const CodexAccountSummary = Schema.Struct({
  accountKey: TrimmedNonEmptyString,
  email: Schema.optional(TrimmedNonEmptyString),
  alias: Schema.optional(TrimmedNonEmptyString),
  accountName: Schema.optional(TrimmedNonEmptyString),
  planType: Schema.NullOr(CodexAccountPlanType).pipe(
    Schema.withDecodingDefault(Effect.succeed(null)),
  ),
  authMode: CodexAccountAuthMode,
  hasSnapshot: Schema.Boolean,
  isActive: Schema.Boolean,
});
export type CodexAccountSummary = typeof CodexAccountSummary.Type;

export const CodexAccountsSnapshot = Schema.Struct({
  codexHomePath: TrimmedNonEmptyString,
  accounts: Schema.Array(CodexAccountSummary),
  activeAccountKey: Schema.optional(TrimmedNonEmptyString),
  currentAuthMode: CodexAccountAuthMode,
  managedCurrentAuth: Schema.Boolean,
  runningCodexSessionCount: NonNegativeInt,
  message: Schema.optional(TrimmedNonEmptyString),
});
export type CodexAccountsSnapshot = typeof CodexAccountsSnapshot.Type;

export const CodexSwitchAccountInput = Schema.Struct({
  accountKey: TrimmedNonEmptyString,
});
export type CodexSwitchAccountInput = typeof CodexSwitchAccountInput.Type;

export const CodexSwitchAccountResult = Schema.Struct({
  snapshot: CodexAccountsSnapshot,
});
export type CodexSwitchAccountResult = typeof CodexSwitchAccountResult.Type;

export class CodexAccountsError extends Schema.TaggedErrorClass<CodexAccountsError>()(
  "CodexAccountsError",
  {
    message: TrimmedNonEmptyString,
  },
) {}
