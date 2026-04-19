import * as FS from "node:fs";
import * as OS from "node:os";
import * as Path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
  createDesktopTunnelState,
  readDesktopTunnelState,
  readOrCreateDesktopTunnelState,
  writeDesktopTunnelState,
} from "./desktopTunnelState";

const tempDirectories: string[] = [];

afterEach(() => {
  for (const directory of tempDirectories.splice(0)) {
    FS.rmSync(directory, { recursive: true, force: true });
  }
});

function makeStatePath(): string {
  const directory = FS.mkdtempSync(Path.join(OS.tmpdir(), "androdex-desktop-tunnel-state-"));
  tempDirectories.push(directory);
  return Path.join(directory, "desktop-tunnel.json");
}

describe("desktopTunnelState", () => {
  it("creates deterministic random hex route values", () => {
    const state = createDesktopTunnelState((size) => new Uint8Array(size).fill(0xab));

    expect(state).toEqual({
      routeId: "abababababababababababababababab",
      routeToken: "abababababababababababababababababababababababab",
    });
  });

  it("round-trips persisted tunnel state", () => {
    const statePath = makeStatePath();

    writeDesktopTunnelState(statePath, {
      routeId: "route-1",
      routeToken: "token-1",
    });

    expect(readDesktopTunnelState(statePath)).toEqual({
      routeId: "route-1",
      routeToken: "token-1",
    });
  });

  it("creates and persists a new tunnel state when none exists", () => {
    const statePath = makeStatePath();

    const created = readOrCreateDesktopTunnelState(statePath, (size) =>
      new Uint8Array(size).fill(0xcd),
    );

    expect(created).toEqual({
      routeId: "cdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcd",
      routeToken: "cdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcd",
    });
    expect(readDesktopTunnelState(statePath)).toEqual(created);
  });

  it("reuses an existing persisted tunnel state", () => {
    const statePath = makeStatePath();
    writeDesktopTunnelState(statePath, {
      routeId: "route-existing",
      routeToken: "token-existing",
    });

    expect(
      readOrCreateDesktopTunnelState(statePath, () => {
        throw new Error("should not regenerate");
      }),
    ).toEqual({
      routeId: "route-existing",
      routeToken: "token-existing",
    });
  });
});
