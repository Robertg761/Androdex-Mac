import type {
  ComputerUseAction,
  ComputerUseDriverHealth,
  ComputerUseDriverKind,
  ComputerUseTarget,
} from "@t3tools/contracts";

export interface ComputerUseDriverSession {
  readonly id: string;
  readonly target: ComputerUseTarget;
}

export interface ComputerUseScreenshotBytes {
  readonly pngBytes: Uint8Array;
  readonly width: number;
  readonly height: number;
}

export interface ComputerUseDriver {
  readonly kind: ComputerUseDriverKind;
  readonly healthCheck: () => Promise<ComputerUseDriverHealth>;
  readonly listTargets: () => Promise<ReadonlyArray<ComputerUseTarget>>;
  readonly startSession: (target: ComputerUseTarget) => Promise<ComputerUseDriverSession>;
  readonly captureScreenshot: (
    session: ComputerUseDriverSession,
  ) => Promise<ComputerUseScreenshotBytes>;
  readonly executeAction: (
    session: ComputerUseDriverSession,
    action: ComputerUseAction,
  ) => Promise<void>;
  readonly stopSession: (session: ComputerUseDriverSession) => Promise<void>;
}
