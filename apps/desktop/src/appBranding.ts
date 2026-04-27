import type { DesktopAppBranding, DesktopAppStageLabel } from "@t3tools/contracts";
import { APP_BASE_NAME, makeAppDisplayName } from "@t3tools/shared/branding";

import { isNightlyDesktopVersion } from "./updateChannels.ts";

export function resolveDesktopAppStageLabel(input: {
  readonly isDevelopment: boolean;
  readonly appVersion: string;
}): DesktopAppStageLabel {
  if (input.isDevelopment) {
    return "Dev";
  }

  return isNightlyDesktopVersion(input.appVersion) ? "Nightly" : "Alpha";
}

export function resolveDesktopAppBranding(input: {
  readonly isDevelopment: boolean;
  readonly appVersion: string;
}): DesktopAppBranding {
  const stageLabel = resolveDesktopAppStageLabel(input);
  return {
    baseName: APP_BASE_NAME,
    stageLabel,
    displayName: makeAppDisplayName(stageLabel),
  };
}
