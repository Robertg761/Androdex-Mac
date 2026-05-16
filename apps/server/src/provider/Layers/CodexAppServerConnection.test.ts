import { describe, expect, it } from "vitest";
import { CodexSettings } from "@t3tools/contracts";
import * as Schema from "effect/Schema";

import {
  isCodexAppServerRemoteConnection,
  resolveCodexAppServerRemoteConnection,
} from "./CodexAppServerConnection.ts";

const decodeCodexSettings = Schema.decodeSync(CodexSettings);

describe("CodexAppServerConnection", () => {
  it("is disabled when no remote app-server URL is configured", () => {
    expect(resolveCodexAppServerRemoteConnection(decodeCodexSettings({}), {})).toBeUndefined();
  });

  it("resolves the bearer token from the configured provider environment variable", () => {
    const resolved = resolveCodexAppServerRemoteConnection(
      decodeCodexSettings({
        appServerUrl: "ws://127.0.0.1:8765",
        appServerTokenEnvVar: "REMOTE_CODEX_TOKEN",
      }),
      { REMOTE_CODEX_TOKEN: "secret-token" },
    );

    expect(isCodexAppServerRemoteConnection(resolved)).toBe(true);
    expect(resolved).toEqual({
      url: "ws://127.0.0.1:8765",
      bearerToken: "secret-token",
      tokenEnvVar: "REMOTE_CODEX_TOKEN",
    });
  });

  it("omits websocket auth when no token environment variable is set", () => {
    const resolved = resolveCodexAppServerRemoteConnection(
      decodeCodexSettings({ appServerUrl: "wss://codex.example.test/app-server" }),
      {},
    );

    expect(resolved).toEqual({
      url: "wss://codex.example.test/app-server",
      tokenEnvVar: "CODEX_APP_SERVER_TOKEN",
    });
  });
});
