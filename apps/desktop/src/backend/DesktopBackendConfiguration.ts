import { parsePersistedServerObservabilitySettings } from "@t3tools/shared/serverSettings";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Random from "effect/Random";
import * as Ref from "effect/Ref";

import * as DesktopBackendManager from "./DesktopBackendManager.ts";
import * as DesktopEnvironment from "../app/DesktopEnvironment.ts";
import * as DesktopObservability from "../app/DesktopObservability.ts";
import * as DesktopServerExposure from "./DesktopServerExposure.ts";

export interface DesktopBackendConfigurationShape {
  readonly resolve: Effect.Effect<DesktopBackendManager.DesktopBackendStartConfig>;
}

export class DesktopBackendConfiguration extends Context.Service<
  DesktopBackendConfiguration,
  DesktopBackendConfigurationShape
>()("t3/desktop/BackendConfiguration") {}

interface BackendObservabilitySettings {
  readonly otlpTracesUrl: Option.Option<string>;
  readonly otlpMetricsUrl: Option.Option<string>;
}

const emptyBackendObservabilitySettings: BackendObservabilitySettings = {
  otlpTracesUrl: Option.none(),
  otlpMetricsUrl: Option.none(),
};

const DESKTOP_BACKEND_ENV_NAMES = [
  "ANDRODEX_PORT",
  "ANDRODEX_MODE",
  "ANDRODEX_NO_BROWSER",
  "ANDRODEX_HOST",
  "ANDRODEX_DESKTOP_WS_URL",
  "ANDRODEX_DESKTOP_LAN_ACCESS",
  "ANDRODEX_DESKTOP_LAN_HOST",
  "ANDRODEX_DESKTOP_HTTPS_ENDPOINTS",
  "ANDRODEX_TAILSCALE_SERVE",
  "ANDRODEX_TAILSCALE_SERVE_PORT",
  "ANDRODEX_WHISPER_CPP_BINARY",
  "T3CODE_PORT",
  "T3CODE_MODE",
  "T3CODE_NO_BROWSER",
  "T3CODE_HOST",
  "T3CODE_DESKTOP_WS_URL",
  "T3CODE_DESKTOP_LAN_ACCESS",
  "T3CODE_DESKTOP_LAN_HOST",
  "T3CODE_DESKTOP_HTTPS_ENDPOINTS",
  "T3CODE_TAILSCALE_SERVE",
  "T3CODE_TAILSCALE_SERVE_PORT",
] as const;

const backendChildEnvPatch = (): Record<string, string | undefined> =>
  Object.fromEntries(DESKTOP_BACKEND_ENV_NAMES.map((name) => [name, undefined]));

const { logWarning: logBackendConfigurationWarning } = DesktopObservability.makeComponentLogger(
  "desktop-backend-configuration",
);

const readPersistedBackendObservabilitySettings: Effect.Effect<
  BackendObservabilitySettings,
  never,
  FileSystem.FileSystem | DesktopEnvironment.DesktopEnvironment
> = Effect.gen(function* () {
  const fileSystem = yield* FileSystem.FileSystem;
  const environment = yield* DesktopEnvironment.DesktopEnvironment;
  const exists = yield* fileSystem
    .exists(environment.serverSettingsPath)
    .pipe(Effect.orElseSucceed(() => false));
  if (!exists) {
    return emptyBackendObservabilitySettings;
  }

  const raw = yield* fileSystem.readFileString(environment.serverSettingsPath).pipe(Effect.option);
  if (Option.isNone(raw)) {
    yield* logBackendConfigurationWarning(
      "failed to read persisted backend observability settings",
    );
    return emptyBackendObservabilitySettings;
  }

  const parsed = parsePersistedServerObservabilitySettings(raw.value);
  return {
    otlpTracesUrl: Option.fromNullishOr(parsed.otlpTracesUrl),
    otlpMetricsUrl: Option.fromNullishOr(parsed.otlpMetricsUrl),
  };
});

function resolveVoiceRuntimeResourceNames(environment: DesktopEnvironment.DesktopEnvironmentShape) {
  const executableName = environment.platform === "win32" ? "whisper-cli.exe" : "whisper-cli";
  const arch =
    environment.runtimeInfo.appArch === "arm64" || environment.runtimeInfo.appArch === "x64"
      ? environment.runtimeInfo.appArch
      : environment.processArch;
  const platform = environment.platform;

  return [
    `voice/whisper/${platform}-${arch}/${executableName}`,
    `voice/whisper/${platform}/${arch}/${executableName}`,
  ];
}

const resolveBundledWhisperBinary = Effect.fn("desktop.backendConfiguration.whisperBinary")(
  function* (): Effect.fn.Return<
    Option.Option<string>,
    never,
    FileSystem.FileSystem | DesktopEnvironment.DesktopEnvironment
  > {
    const fileSystem = yield* FileSystem.FileSystem;
    const environment = yield* DesktopEnvironment.DesktopEnvironment;
    for (const resourceName of resolveVoiceRuntimeResourceNames(environment)) {
      for (const candidate of environment.resolveResourcePathCandidates(resourceName)) {
        const exists = yield* fileSystem.exists(candidate).pipe(Effect.orElseSucceed(() => false));
        if (exists) {
          return Option.some(candidate);
        }
      }
    }
    return Option.none();
  },
);

const getOrCreateBootstrapToken = Effect.fn("desktop.backendConfiguration.bootstrapToken")(
  function* (tokenRef: Ref.Ref<Option.Option<string>>) {
    const existing = yield* Ref.get(tokenRef);
    if (Option.isSome(existing)) {
      return existing.value;
    }

    let token = "";
    while (token.length < 48) {
      token += (yield* Random.nextUUIDv4).replace(/-/g, "");
    }
    token = token.slice(0, 48);
    yield* Ref.set(tokenRef, Option.some(token));
    return token;
  },
);

const resolveBackendStartConfig = Effect.fn("desktop.backendConfiguration.resolveStartConfig")(
  function* (input: {
    readonly bootstrapToken: string;
    readonly observabilitySettings: BackendObservabilitySettings;
  }): Effect.fn.Return<
    DesktopBackendManager.DesktopBackendStartConfig,
    never,
    | DesktopEnvironment.DesktopEnvironment
    | DesktopServerExposure.DesktopServerExposure
    | FileSystem.FileSystem
  > {
    const environment = yield* DesktopEnvironment.DesktopEnvironment;
    const serverExposure = yield* DesktopServerExposure.DesktopServerExposure;
    const backendExposure = yield* serverExposure.backendConfig;
    const bundledWhisperBinary = yield* resolveBundledWhisperBinary();

    return {
      executablePath: process.execPath,
      entryPath: environment.backendEntryPath,
      cwd: environment.backendCwd,
      env: {
        ...backendChildEnvPatch(),
        ELECTRON_RUN_AS_NODE: "1",
        ...Option.match(bundledWhisperBinary, {
          onNone: () => ({}),
          onSome: (binaryPath) => ({ ANDRODEX_WHISPER_CPP_BINARY: binaryPath }),
        }),
      },
      bootstrap: {
        mode: "desktop",
        noBrowser: true,
        port: backendExposure.port,
        t3Home: environment.baseDir,
        host: backendExposure.bindHost,
        desktopBootstrapToken: input.bootstrapToken,
        tailscaleServeEnabled: backendExposure.tailscaleServeEnabled,
        tailscaleServePort: backendExposure.tailscaleServePort,
        ...Option.match(input.observabilitySettings.otlpTracesUrl, {
          onNone: () => ({}),
          onSome: (otlpTracesUrl) => ({ otlpTracesUrl }),
        }),
        ...Option.match(input.observabilitySettings.otlpMetricsUrl, {
          onNone: () => ({}),
          onSome: (otlpMetricsUrl) => ({ otlpMetricsUrl }),
        }),
      },
      httpBaseUrl: backendExposure.httpBaseUrl,
      captureOutput: true,
    };
  },
);

export const layer = Layer.effect(
  DesktopBackendConfiguration,
  Effect.gen(function* () {
    const environment = yield* DesktopEnvironment.DesktopEnvironment;
    const fileSystem = yield* FileSystem.FileSystem;
    const serverExposure = yield* DesktopServerExposure.DesktopServerExposure;
    const tokenRef = yield* Ref.make(Option.none<string>());

    return DesktopBackendConfiguration.of({
      resolve: Effect.gen(function* () {
        const bootstrapToken = yield* getOrCreateBootstrapToken(tokenRef);
        const observabilitySettings = yield* readPersistedBackendObservabilitySettings.pipe(
          Effect.provideService(FileSystem.FileSystem, fileSystem),
          Effect.provideService(DesktopEnvironment.DesktopEnvironment, environment),
        );
        return yield* resolveBackendStartConfig({
          bootstrapToken,
          observabilitySettings,
        }).pipe(
          Effect.provideService(FileSystem.FileSystem, fileSystem),
          Effect.provideService(DesktopEnvironment.DesktopEnvironment, environment),
          Effect.provideService(DesktopServerExposure.DesktopServerExposure, serverExposure),
        );
      }).pipe(Effect.withSpan("desktop.backendConfiguration.resolve")),
    });
  }),
);
