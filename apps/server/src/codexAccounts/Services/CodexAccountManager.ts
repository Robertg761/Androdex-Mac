import { Context } from "effect";
import type {
  CodexAccountsError,
  CodexAccountsSnapshot,
  CodexSwitchAccountInput,
  CodexSwitchAccountResult,
} from "@t3tools/contracts";
import type { Effect } from "effect";

export interface CodexAccountManagerShape {
  readonly listAccounts: Effect.Effect<CodexAccountsSnapshot, CodexAccountsError>;
  readonly switchAccount: (
    input: CodexSwitchAccountInput,
  ) => Effect.Effect<CodexSwitchAccountResult, CodexAccountsError>;
}

export class CodexAccountManager extends Context.Service<
  CodexAccountManager,
  CodexAccountManagerShape
>()("t3/codexAccounts/Services/CodexAccountManager") {}
