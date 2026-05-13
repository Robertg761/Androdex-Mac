import type {
  ComputerUseAction,
  ComputerUseDriverHealth,
  ComputerUseTarget,
} from "@t3tools/contracts";

import type {
  ComputerUseDriver,
  ComputerUseDriverSession,
  ComputerUseScreenshotBytes,
} from "./ComputerUseDriver.ts";
import { findCommand } from "./processUtils.ts";

export class LinuxWaylandDriver implements ComputerUseDriver {
  readonly kind = "linux-wayland" as const;

  async healthCheck(): Promise<ComputerUseDriverHealth> {
    const dependencies = [
      findCommand("xdg-desktop-portal"),
      findCommand("grim"),
      findCommand("ydotool"),
    ];
    return {
      driver: this.kind,
      status: "unsupported",
      message:
        "Wayland computer-use control is detected as experimental and is not enabled by this build.",
      dependencies,
    };
  }

  async listTargets(): Promise<ReadonlyArray<ComputerUseTarget>> {
    return [];
  }

  async startSession(_target: ComputerUseTarget): Promise<ComputerUseDriverSession> {
    throw new Error("Wayland computer-use sessions are not supported yet.");
  }

  async captureScreenshot(_session: ComputerUseDriverSession): Promise<ComputerUseScreenshotBytes> {
    throw new Error("Wayland screenshot capture is not supported yet.");
  }

  async executeAction(
    _session: ComputerUseDriverSession,
    _action: ComputerUseAction,
  ): Promise<void> {
    throw new Error("Wayland action execution is not supported yet.");
  }

  async stopSession(_session: ComputerUseDriverSession): Promise<void> {}
}
