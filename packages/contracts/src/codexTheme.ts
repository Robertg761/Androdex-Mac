import * as Schema from "effect/Schema";

import { TrimmedNonEmptyString } from "./baseSchemas.ts";
import { ProviderInstanceId } from "./providerInstance.ts";

export const CODEX_BUNDLED_THEME_NAMES = [
  "1337",
  "ansi",
  "base16",
  "base16-256",
  "base16-eighties-dark",
  "base16-mocha-dark",
  "base16-ocean-dark",
  "base16-ocean-light",
  "catppuccin-frappe",
  "catppuccin-latte",
  "catppuccin-macchiato",
  "catppuccin-mocha",
  "coldark-cold",
  "coldark-dark",
  "dark-neon",
  "dracula",
  "github",
  "gruvbox-dark",
  "gruvbox-light",
  "inspired-github",
  "monokai-extended",
  "monokai-extended-bright",
  "monokai-extended-light",
  "monokai-extended-origin",
  "nord",
  "one-half-dark",
  "one-half-light",
  "solarized-dark",
  "solarized-light",
  "sublime-snazzy",
  "two-dark",
  "zenburn",
] as const;

export const ServerCodexThemeSource = Schema.Literals(["bundled", "custom"]);
export type ServerCodexThemeSource = typeof ServerCodexThemeSource.Type;

export const ServerCodexTheme = Schema.Struct({
  name: TrimmedNonEmptyString,
  source: ServerCodexThemeSource,
});
export type ServerCodexTheme = typeof ServerCodexTheme.Type;

export const ServerCodexThemeListInput = Schema.Struct({
  instanceId: ProviderInstanceId,
});
export type ServerCodexThemeListInput = typeof ServerCodexThemeListInput.Type;

export const ServerCodexThemeListResult = Schema.Struct({
  instanceId: ProviderInstanceId,
  codexHomePath: TrimmedNonEmptyString,
  customThemesDirectory: TrimmedNonEmptyString,
  selectedTheme: Schema.NullOr(TrimmedNonEmptyString),
  defaultTheme: TrimmedNonEmptyString,
  themes: Schema.Array(ServerCodexTheme),
});
export type ServerCodexThemeListResult = typeof ServerCodexThemeListResult.Type;

export const ServerCodexThemeSetInput = Schema.Struct({
  instanceId: ProviderInstanceId,
  theme: TrimmedNonEmptyString,
});
export type ServerCodexThemeSetInput = typeof ServerCodexThemeSetInput.Type;

export class ServerCodexThemeError extends Schema.TaggedErrorClass<ServerCodexThemeError>()(
  "ServerCodexThemeError",
  {
    instanceId: ProviderInstanceId,
    detail: TrimmedNonEmptyString,
    cause: Schema.optional(Schema.Defect),
  },
) {
  override get message(): string {
    return `Codex theme operation failed for ${this.instanceId}: ${this.detail}`;
  }
}
