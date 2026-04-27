export const APP_BASE_NAME = "Androdex";
export const LEGACY_APP_BASE_NAME = "T3 Code";

export const PRODUCT_SLUG = "androdex";
export const LEGACY_PRODUCT_SLUG = "t3code";

export const DEFAULT_BASE_DIR_NAME = ".androdex";
export const LEGACY_BASE_DIR_NAME = ".t3";

export const DESKTOP_SCHEME = PRODUCT_SLUG;
export const LEGACY_DESKTOP_SCHEME = "t3";

export const APP_BUNDLE_ID = "xyz.androdex.desktop";
export const LEGACY_APP_BUNDLE_ID = "com.t3tools.t3code";

export const SESSION_COOKIE_BASENAME = `${PRODUCT_SLUG}_session`;
export const LEGACY_SESSION_COOKIE_BASENAME = `${LEGACY_PRODUCT_SLUG}_session`;

export const USER_DATA_DIR_NAME = PRODUCT_SLUG;
export const LEGACY_USER_DATA_DIR_NAMES = [
  LEGACY_PRODUCT_SLUG,
  `${LEGACY_APP_BASE_NAME} (Alpha)`,
  `${LEGACY_APP_BASE_NAME} (Dev)`,
] as const;

export type AppStageLabel = "Alpha" | "Dev" | "Nightly";

export function makeAppDisplayName(stage: AppStageLabel): string {
  return `${APP_BASE_NAME} (${stage})`;
}

export function makeLegacyAppDisplayName(stage: AppStageLabel): string {
  return `${LEGACY_APP_BASE_NAME} (${stage})`;
}

export function makeStorageKey(suffix: string): string {
  return `${PRODUCT_SLUG}:${suffix}`;
}

export function makeLegacyStorageKey(suffix: string): string {
  return `${LEGACY_PRODUCT_SLUG}:${suffix}`;
}
