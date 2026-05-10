import * as Config from "effect/Config";
import * as ConfigProvider from "effect/ConfigProvider";
import * as Option from "effect/Option";

const trimNonEmptyOption = (value: string): Option.Option<string> => {
  const trimmed = value.trim();
  return trimmed.length > 0 ? Option.some(trimmed) : Option.none();
};

const trimmedString = (name: string) =>
  Config.string(name).pipe(Config.option, Config.map(Option.flatMap(trimNonEmptyOption)));

const preferOption = <A>(primary: Option.Option<A>, legacy: Option.Option<A>): Option.Option<A> =>
  Option.isSome(primary) ? primary : legacy;

const trimmedStringAlias = (primaryName: string, legacyName: string) =>
  Config.all({
    primary: trimmedString(primaryName),
    legacy: trimmedString(legacyName),
  }).pipe(Config.map(({ primary, legacy }) => preferOption(primary, legacy)));

const optionalBooleanAlias = (primaryName: string, legacyName: string) =>
  Config.all({
    primary: Config.boolean(primaryName).pipe(Config.option),
    legacy: Config.boolean(legacyName).pipe(Config.option),
  }).pipe(
    Config.map(({ primary, legacy }) =>
      Option.getOrElse(preferOption(primary, legacy), () => false),
    ),
  );

const optionalPortAlias = (primaryName: string, legacyName: string) =>
  Config.all({
    primary: Config.port(primaryName).pipe(Config.option),
    legacy: Config.port(legacyName).pipe(Config.option),
  }).pipe(Config.map(({ primary, legacy }) => preferOption(primary, legacy)));

const intAliasWithDefault = (primaryName: string, legacyName: string, defaultValue: number) =>
  Config.all({
    primary: Config.int(primaryName).pipe(Config.option),
    legacy: Config.int(legacyName).pipe(Config.option),
  }).pipe(
    Config.map(({ primary, legacy }) =>
      Option.getOrElse(preferOption(primary, legacy), () => defaultValue),
    ),
  );

const commaSeparatedStringsAlias = (primaryName: string, legacyName: string) =>
  trimmedStringAlias(primaryName, legacyName).pipe(
    Config.map(
      Option.match({
        onNone: () => [],
        onSome: (value) =>
          value
            .split(",")
            .map((entry) => entry.trim())
            .filter((entry) => entry.length > 0),
      }),
    ),
  );

const compactEnv = (env: Readonly<Record<string, string | undefined>>): Record<string, string> =>
  Object.fromEntries(
    Object.entries(env).filter((entry): entry is [string, string] => entry[1] !== undefined),
  );

export const DesktopConfig = Config.all({
  appDataDirectory: trimmedString("APPDATA"),
  xdgConfigHome: trimmedString("XDG_CONFIG_HOME"),
  t3Home: trimmedStringAlias("ANDRODEX_HOME", "T3CODE_HOME"),
  devServerUrl: Config.url("VITE_DEV_SERVER_URL").pipe(Config.option),
  devRemoteT3ServerEntryPath: trimmedStringAlias(
    "ANDRODEX_DEV_REMOTE_T3_SERVER_ENTRY_PATH",
    "T3CODE_DEV_REMOTE_T3_SERVER_ENTRY_PATH",
  ),
  configuredBackendPort: optionalPortAlias("ANDRODEX_PORT", "T3CODE_PORT"),
  commitHashOverride: trimmedStringAlias("ANDRODEX_COMMIT_HASH", "T3CODE_COMMIT_HASH"),
  desktopLanHostOverride: trimmedStringAlias(
    "ANDRODEX_DESKTOP_LAN_HOST",
    "T3CODE_DESKTOP_LAN_HOST",
  ),
  desktopHttpsEndpointUrls: commaSeparatedStringsAlias(
    "ANDRODEX_DESKTOP_HTTPS_ENDPOINTS",
    "T3CODE_DESKTOP_HTTPS_ENDPOINTS",
  ),
  otlpTracesUrl: trimmedStringAlias("ANDRODEX_OTLP_TRACES_URL", "T3CODE_OTLP_TRACES_URL"),
  otlpExportIntervalMs: intAliasWithDefault(
    "ANDRODEX_OTLP_EXPORT_INTERVAL_MS",
    "T3CODE_OTLP_EXPORT_INTERVAL_MS",
    10_000,
  ),
  appImagePath: trimmedString("APPIMAGE"),
  disableAutoUpdate: optionalBooleanAlias(
    "ANDRODEX_DISABLE_AUTO_UPDATE",
    "T3CODE_DISABLE_AUTO_UPDATE",
  ),
  mockUpdates: optionalBooleanAlias("ANDRODEX_DESKTOP_MOCK_UPDATES", "T3CODE_DESKTOP_MOCK_UPDATES"),
  mockUpdateServerPort: Config.all({
    primary: Config.port("ANDRODEX_DESKTOP_MOCK_UPDATE_SERVER_PORT").pipe(Config.option),
    legacy: Config.port("T3CODE_DESKTOP_MOCK_UPDATE_SERVER_PORT").pipe(Config.option),
  }).pipe(
    Config.map(({ primary, legacy }) =>
      Option.getOrElse(preferOption(primary, legacy), () => 3000),
    ),
  ),
});

export const layerTest = (env: Readonly<Record<string, string | undefined>>) =>
  ConfigProvider.layer(ConfigProvider.fromEnv({ env: compactEnv(env) }));
