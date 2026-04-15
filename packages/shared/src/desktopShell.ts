export const DESKTOP_TITLEBAR_HEIGHT_PX = 52;

export const DESKTOP_MAC_TRAFFIC_LIGHT_POSITION = {
  x: 16,
  y: 18,
} as const;

const DESKTOP_MAC_TRAFFIC_LIGHT_GROUP_WIDTH_PX = 58;
const DESKTOP_MAC_TRAFFIC_LIGHT_CONTENT_GAP_PX = 16;

/**
 * Reserve enough room for the native traffic-light cluster plus a small gap
 * before any custom titlebar content begins.
 */
export const DESKTOP_MAC_TRAFFIC_LIGHT_SAFE_AREA_LEFT_PX =
  DESKTOP_MAC_TRAFFIC_LIGHT_POSITION.x +
  DESKTOP_MAC_TRAFFIC_LIGHT_GROUP_WIDTH_PX +
  DESKTOP_MAC_TRAFFIC_LIGHT_CONTENT_GAP_PX;
