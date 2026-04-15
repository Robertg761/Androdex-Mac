import { describe, expect, it } from "vitest";

import {
  normalizePersistedDesktopRoute,
  resolveInitialDesktopRouteRestore,
} from "./desktopRoutePersistence";

describe("desktopRoutePersistence", () => {
  it("normalizes restorable desktop routes", () => {
    expect(normalizePersistedDesktopRoute("/environment-1/thread-1")).toBe(
      "#/environment-1/thread-1",
    );
    expect(normalizePersistedDesktopRoute("#/draft/draft-1")).toBe("#/draft/draft-1");
    expect(normalizePersistedDesktopRoute("#/settings/connections")).toBe("#/settings/connections");
  });

  it("rejects empty, home, and pairing routes", () => {
    expect(normalizePersistedDesktopRoute(null)).toBeNull();
    expect(normalizePersistedDesktopRoute("")).toBeNull();
    expect(normalizePersistedDesktopRoute("#")).toBeNull();
    expect(normalizePersistedDesktopRoute("#/")).toBeNull();
    expect(normalizePersistedDesktopRoute("#/pair")).toBeNull();
    expect(normalizePersistedDesktopRoute("#/pair?token=test")).toBeNull();
    expect(normalizePersistedDesktopRoute("https://example.com")).toBeNull();
  });

  it("restores the last desktop route only when startup has no explicit route", () => {
    expect(
      resolveInitialDesktopRouteRestore({
        currentHash: "",
        persistedHash: "#/environment-1/thread-1",
      }),
    ).toBe("#/environment-1/thread-1");
    expect(
      resolveInitialDesktopRouteRestore({
        currentHash: "#/",
        persistedHash: "#/environment-1/thread-1",
      }),
    ).toBe("#/environment-1/thread-1");
    expect(
      resolveInitialDesktopRouteRestore({
        currentHash: "#/pair?token=abc",
        persistedHash: "#/environment-1/thread-1",
      }),
    ).toBeNull();
    expect(
      resolveInitialDesktopRouteRestore({
        currentHash: "#/settings/general",
        persistedHash: "#/environment-1/thread-1",
      }),
    ).toBeNull();
  });
});
