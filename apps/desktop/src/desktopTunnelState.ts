import * as Crypto from "node:crypto";
import * as FS from "node:fs";
import * as Path from "node:path";

export interface DesktopTunnelState {
  readonly routeId: string;
  readonly routeToken: string;
}

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0;

export function createDesktopTunnelState(
  randomBytes: (size: number) => Uint8Array = Crypto.randomBytes,
): DesktopTunnelState {
  return {
    routeId: Buffer.from(randomBytes(16)).toString("hex"),
    routeToken: Buffer.from(randomBytes(24)).toString("hex"),
  };
}

export function readDesktopTunnelState(statePath: string): DesktopTunnelState | null {
  try {
    if (!FS.existsSync(statePath)) {
      return null;
    }

    const raw = FS.readFileSync(statePath, "utf8");
    const parsed = JSON.parse(raw) as {
      readonly routeId?: unknown;
      readonly routeToken?: unknown;
    };

    if (!isNonEmptyString(parsed.routeId) || !isNonEmptyString(parsed.routeToken)) {
      return null;
    }

    return {
      routeId: parsed.routeId.trim(),
      routeToken: parsed.routeToken.trim(),
    };
  } catch {
    return null;
  }
}

export function writeDesktopTunnelState(
  statePath: string,
  state: DesktopTunnelState,
): DesktopTunnelState {
  const directory = Path.dirname(statePath);
  const tempPath = `${statePath}.${process.pid}.${Date.now()}.tmp`;
  FS.mkdirSync(directory, { recursive: true });
  FS.writeFileSync(tempPath, `${JSON.stringify(state, null, 2)}\n`, "utf8");
  FS.renameSync(tempPath, statePath);
  return state;
}

export function readOrCreateDesktopTunnelState(
  statePath: string,
  randomBytes?: (size: number) => Uint8Array,
): DesktopTunnelState {
  return (
    readDesktopTunnelState(statePath) ??
    writeDesktopTunnelState(statePath, createDesktopTunnelState(randomBytes))
  );
}
