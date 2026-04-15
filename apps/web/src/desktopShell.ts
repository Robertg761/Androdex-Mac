import type { CSSProperties } from "react";

import {
  DESKTOP_MAC_TRAFFIC_LIGHT_SAFE_AREA_LEFT_PX,
  DESKTOP_TITLEBAR_HEIGHT_PX,
} from "@t3tools/shared/desktopShell";

export function getDesktopTitlebarStyle(options?: {
  reserveMacTrafficLights?: boolean;
}): CSSProperties {
  return {
    height: `${DESKTOP_TITLEBAR_HEIGHT_PX}px`,
    ...(options?.reserveMacTrafficLights
      ? {
          paddingInlineStart: `${DESKTOP_MAC_TRAFFIC_LIGHT_SAFE_AREA_LEFT_PX}px`,
        }
      : {}),
  };
}
