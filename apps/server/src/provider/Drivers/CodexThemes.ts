import {
  CODEX_BUNDLED_THEME_NAMES,
  ProviderDriverKind,
  type ProviderInstanceId,
  type ServerCodexTheme,
  type ServerCodexThemeListResult,
} from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import type * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import type * as Path from "effect/Path";
import { ChildProcessSpawner } from "effect/unstable/process";
import * as CodexClient from "effect-codex-app-server/client";
import * as CodexSchema from "effect-codex-app-server/schema";

import { expandHomePath } from "../../pathExpansion.ts";
import { ProviderDriverError } from "../Errors.ts";
import { buildCodexInitializeParams } from "../Layers/CodexProvider.ts";
import { scopedSafeTeardown } from "../Layers/scopedSafeTeardown.ts";
import type { ProviderCodexThemeControls, ProviderCodexThemeSetInput } from "../ProviderDriver.ts";

const DRIVER_KIND = ProviderDriverKind.make("codex");
const CODEX_DEFAULT_SYNTAX_THEME = "catppuccin-mocha";
const TM_THEME_EXTENSION = ".tmTheme";
const BUNDLED_THEME_NAME_SET = new Set<string>(CODEX_BUNDLED_THEME_NAMES);

interface CodexThemeStoreInput {
  readonly instanceId: ProviderInstanceId;
  readonly binaryPath: string;
  readonly codexHomePath: string;
  readonly cwd: string;
  readonly environment: NodeJS.ProcessEnv;
  readonly fileSystem: FileSystem.FileSystem;
  readonly path: Path.Path;
  readonly spawner: ChildProcessSpawner.ChildProcessSpawner["Service"];
}

function toDriverError(
  instanceId: ProviderInstanceId,
  detail: string,
  cause?: unknown,
): ProviderDriverError {
  return new ProviderDriverError({
    driver: DRIVER_KIND,
    instanceId,
    detail,
    ...(cause === undefined ? {} : { cause }),
  });
}

function codexThemesDirectory(path: Path.Path, codexHomePath: string): string {
  return path.join(codexHomePath, "themes");
}

function sortThemes(themes: ReadonlyArray<ServerCodexTheme>): ReadonlyArray<ServerCodexTheme> {
  return themes.toSorted((left, right) => {
    const leftKey = left.name.toLocaleLowerCase();
    const rightKey = right.name.toLocaleLowerCase();
    if (leftKey === rightKey) {
      return left.name.localeCompare(right.name);
    }
    return leftKey.localeCompare(rightKey);
  });
}

function readSelectedTheme(response: CodexSchema.V2ConfigReadResponse): string | null {
  const tuiConfig = response.config["tui"];
  if (tuiConfig === null || typeof tuiConfig !== "object" || Array.isArray(tuiConfig)) {
    return null;
  }

  const theme = (tuiConfig as { readonly theme?: unknown }).theme;
  return typeof theme === "string" && theme.trim().length > 0 ? theme.trim() : null;
}

const readCodexConfig = Effect.fn("CodexThemes.readCodexConfig")(function* (input: {
  readonly binaryPath: string;
  readonly codexHomePath: string;
  readonly cwd: string;
  readonly environment: NodeJS.ProcessEnv;
}) {
  const resolvedHomePath = expandHomePath(input.codexHomePath);
  const clientContext = yield* Layer.build(
    CodexClient.layerCommand({
      command: input.binaryPath,
      args: ["app-server"],
      cwd: input.cwd,
      env: {
        ...input.environment,
        CODEX_HOME: resolvedHomePath,
      },
    }),
  );
  const client = yield* Effect.service(CodexClient.CodexAppServerClient).pipe(
    Effect.provide(clientContext),
  );

  yield* client.request("initialize", buildCodexInitializeParams());
  yield* client.notify("initialized", undefined);

  return yield* client.request("config/read", {});
}, scopedSafeTeardown("codex-theme-config-read"));

const writeCodexThemeConfig = Effect.fn("CodexThemes.writeCodexThemeConfig")(function* (input: {
  readonly binaryPath: string;
  readonly codexHomePath: string;
  readonly cwd: string;
  readonly environment: NodeJS.ProcessEnv;
  readonly theme: string;
}) {
  const resolvedHomePath = expandHomePath(input.codexHomePath);
  const clientContext = yield* Layer.build(
    CodexClient.layerCommand({
      command: input.binaryPath,
      args: ["app-server"],
      cwd: input.cwd,
      env: {
        ...input.environment,
        CODEX_HOME: resolvedHomePath,
      },
    }),
  );
  const client = yield* Effect.service(CodexClient.CodexAppServerClient).pipe(
    Effect.provide(clientContext),
  );

  yield* client.request("initialize", buildCodexInitializeParams());
  yield* client.notify("initialized", undefined);

  return yield* client.request("config/value/write", {
    keyPath: "tui.theme",
    value: input.theme,
    mergeStrategy: "replace",
  });
}, scopedSafeTeardown("codex-theme-config-write"));

function readCustomThemes(
  input: CodexThemeStoreInput,
): Effect.Effect<ReadonlyArray<ServerCodexTheme>, ProviderDriverError> {
  const themesDirectory = codexThemesDirectory(input.path, input.codexHomePath);
  return input.fileSystem.readDirectory(themesDirectory, { recursive: false }).pipe(
    Effect.catch(() => Effect.succeed([] as ReadonlyArray<string>)),
    Effect.map((entries) => {
      const customThemeNames = new Set<string>();
      for (const entry of entries) {
        if (!entry.endsWith(TM_THEME_EXTENSION)) {
          continue;
        }
        const name = entry.slice(0, -TM_THEME_EXTENSION.length).trim();
        if (!name || BUNDLED_THEME_NAME_SET.has(name)) {
          continue;
        }
        customThemeNames.add(name);
      }

      return [...customThemeNames].map(
        (name): ServerCodexTheme => ({
          name,
          source: "custom",
        }),
      );
    }),
    Effect.mapError((cause) =>
      toDriverError(input.instanceId, "Failed to list Codex custom themes.", cause),
    ),
  );
}

function listCodexThemes(
  input: CodexThemeStoreInput,
): Effect.Effect<ServerCodexThemeListResult, ProviderDriverError> {
  return Effect.gen(function* () {
    yield* input.fileSystem
      .makeDirectory(input.codexHomePath, { recursive: true })
      .pipe(
        Effect.mapError((cause) =>
          toDriverError(
            input.instanceId,
            "Failed to prepare Codex home for theme settings.",
            cause,
          ),
        ),
      );

    const [configResponse, customThemes] = yield* Effect.all(
      [
        readCodexConfig(input).pipe(
          Effect.mapError((cause) =>
            toDriverError(input.instanceId, "Failed to read Codex config.", cause),
          ),
          Effect.provideService(ChildProcessSpawner.ChildProcessSpawner, input.spawner),
        ),
        readCustomThemes(input),
      ],
      { concurrency: "unbounded" },
    );

    const bundledThemes = CODEX_BUNDLED_THEME_NAMES.map(
      (name): ServerCodexTheme => ({
        name,
        source: "bundled",
      }),
    );

    return {
      instanceId: input.instanceId,
      codexHomePath: input.codexHomePath,
      customThemesDirectory: codexThemesDirectory(input.path, input.codexHomePath),
      selectedTheme: readSelectedTheme(configResponse),
      defaultTheme: CODEX_DEFAULT_SYNTAX_THEME,
      themes: sortThemes([...bundledThemes, ...customThemes]),
    } satisfies ServerCodexThemeListResult;
  });
}

function setCodexTheme(
  input: CodexThemeStoreInput,
  payload: ProviderCodexThemeSetInput,
): Effect.Effect<ServerCodexThemeListResult, ProviderDriverError> {
  return Effect.gen(function* () {
    const theme = payload.theme.trim();
    const current = yield* listCodexThemes(input);
    const availableThemes = new Set(current.themes.map((entry) => entry.name));
    if (!availableThemes.has(theme)) {
      return yield* toDriverError(
        input.instanceId,
        `Codex theme '${theme}' is not available. Add custom themes to ${current.customThemesDirectory}.`,
      );
    }

    yield* writeCodexThemeConfig({
      binaryPath: input.binaryPath,
      codexHomePath: input.codexHomePath,
      cwd: input.cwd,
      environment: input.environment,
      theme,
    }).pipe(
      Effect.mapError((cause) =>
        toDriverError(input.instanceId, "Failed to write Codex theme config.", cause),
      ),
      Effect.provideService(ChildProcessSpawner.ChildProcessSpawner, input.spawner),
    );

    return yield* listCodexThemes(input);
  });
}

export function makeCodexThemeControls(input: {
  readonly instanceId: ProviderInstanceId;
  readonly binaryPath: string;
  readonly codexHomePath: string;
  readonly cwd: string;
  readonly environment: NodeJS.ProcessEnv;
  readonly fileSystem: FileSystem.FileSystem;
  readonly path: Path.Path;
  readonly spawner: ChildProcessSpawner.ChildProcessSpawner["Service"];
}): ProviderCodexThemeControls {
  const store = {
    instanceId: input.instanceId,
    binaryPath: input.binaryPath,
    codexHomePath: input.codexHomePath,
    cwd: input.cwd,
    environment: input.environment,
    fileSystem: input.fileSystem,
    path: input.path,
    spawner: input.spawner,
  } satisfies CodexThemeStoreInput;

  return {
    list: () => listCodexThemes(store),
    set: (payload) => setCodexTheme(store, payload),
  };
}
