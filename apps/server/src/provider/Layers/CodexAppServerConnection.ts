import type { CodexSettings } from "@t3tools/contracts";

export const DEFAULT_CODEX_APP_SERVER_TOKEN_ENV_VAR = "CODEX_APP_SERVER_TOKEN";

export interface CodexAppServerRemoteConnection {
  readonly url: string;
  readonly bearerToken?: string;
  readonly tokenEnvVar: string;
}

export type CodexAppServerRemoteResolution = CodexAppServerRemoteConnection | undefined;

export function resolveCodexAppServerRemoteConnection(
  settings: CodexSettings,
  environment: NodeJS.ProcessEnv = process.env,
): CodexAppServerRemoteResolution {
  const url = settings.appServerUrl.trim();
  if (!url) {
    return undefined;
  }

  const tokenEnvVar =
    settings.appServerTokenEnvVar.trim() || DEFAULT_CODEX_APP_SERVER_TOKEN_ENV_VAR;
  const bearerToken = environment[tokenEnvVar]?.trim();

  return {
    url,
    ...(bearerToken ? { bearerToken } : {}),
    tokenEnvVar,
  };
}

export function isCodexAppServerRemoteConnection(
  resolution: CodexAppServerRemoteResolution,
): resolution is CodexAppServerRemoteConnection {
  return resolution !== undefined;
}
