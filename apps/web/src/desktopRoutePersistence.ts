import { makeLegacyStorageKey, makeStorageKey } from "@t3tools/shared/branding";
import * as Schema from "effect/Schema";

import {
  getLocalStorageItem,
  removeLocalStorageItem,
  setLocalStorageItem,
} from "./hooks/useLocalStorage";

export const DESKTOP_ROUTE_STORAGE_KEY = makeStorageKey("desktop-route:v1");
const LEGACY_DESKTOP_ROUTE_STORAGE_KEYS = [makeLegacyStorageKey("desktop-route:v1")] as const;
const DesktopRouteSchema = Schema.String;

export function normalizePersistedDesktopRoute(hash: string | null | undefined): string | null {
  if (typeof hash !== "string") {
    return null;
  }

  const trimmed = hash.trim();
  if (trimmed.length === 0) {
    return null;
  }

  const normalized = trimmed.startsWith("#") ? trimmed : `#${trimmed}`;
  if (!normalized.startsWith("#/")) {
    return null;
  }

  if (normalized === "#/" || normalized.startsWith("#/pair")) {
    return null;
  }

  return normalized;
}

export function resolveInitialDesktopRouteRestore(input: {
  readonly currentHash: string | null | undefined;
  readonly persistedHash: string | null | undefined;
}): string | null {
  const normalizedCurrent = normalizePersistedDesktopRoute(input.currentHash);
  if (normalizedCurrent !== null) {
    return null;
  }

  const currentHash = input.currentHash?.trim();
  if (currentHash && currentHash !== "#" && currentHash !== "#/") {
    return null;
  }

  return normalizePersistedDesktopRoute(input.persistedHash);
}

export function readPersistedDesktopRoute(): string | null {
  try {
    const persisted = getLocalStorageItem(
      DESKTOP_ROUTE_STORAGE_KEY,
      DesktopRouteSchema,
      LEGACY_DESKTOP_ROUTE_STORAGE_KEYS,
    );
    return normalizePersistedDesktopRoute(persisted);
  } catch {
    return null;
  }
}

export function writePersistedDesktopRoute(hash: string | null | undefined): void {
  const normalized = normalizePersistedDesktopRoute(hash);
  if (normalized === null) {
    removeLocalStorageItem(DESKTOP_ROUTE_STORAGE_KEY, LEGACY_DESKTOP_ROUTE_STORAGE_KEYS);
    return;
  }

  setLocalStorageItem(
    DESKTOP_ROUTE_STORAGE_KEY,
    normalized,
    DesktopRouteSchema,
    LEGACY_DESKTOP_ROUTE_STORAGE_KEYS,
  );
}

export function restoreInitialDesktopRoute(): void {
  if (typeof window === "undefined") {
    return;
  }

  const nextHash = resolveInitialDesktopRouteRestore({
    currentHash: window.location.hash,
    persistedHash: readPersistedDesktopRoute(),
  });
  if (!nextHash || window.location.hash === nextHash) {
    return;
  }

  window.location.hash = nextHash;
}

export function startDesktopRoutePersistence(): () => void {
  if (typeof window === "undefined") {
    return () => undefined;
  }

  const persistCurrentRoute = () => {
    writePersistedDesktopRoute(window.location.hash);
  };

  persistCurrentRoute();
  window.addEventListener("hashchange", persistCurrentRoute);

  return () => {
    window.removeEventListener("hashchange", persistCurrentRoute);
  };
}
