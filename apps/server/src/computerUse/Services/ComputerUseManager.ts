import type {
  CaptureComputerUseScreenshotInput,
  ComputerUseDriverHealth,
  ComputerUseEvent,
  ComputerUseScreenshot,
  ComputerUseSession,
  ComputerUseSnapshot,
  ComputerUseStatus,
  ComputerUseTarget,
  ExecuteComputerUseActionsInput,
  RespondComputerUseApprovalInput,
  StartComputerUseSessionInput,
  StopComputerUseSessionInput,
} from "@t3tools/contracts";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import type * as Stream from "effect/Stream";
import { ComputerUseError } from "@t3tools/contracts";

export interface ComputerUseManagerShape {
  readonly getStatus: Effect.Effect<ComputerUseStatus, ComputerUseError>;
  readonly getSnapshot: Effect.Effect<ComputerUseSnapshot, ComputerUseError>;
  readonly healthCheck: Effect.Effect<ReadonlyArray<ComputerUseDriverHealth>, ComputerUseError>;
  readonly listTargets: Effect.Effect<ReadonlyArray<ComputerUseTarget>, ComputerUseError>;
  readonly startSession: (
    input: StartComputerUseSessionInput,
  ) => Effect.Effect<ComputerUseSession, ComputerUseError>;
  readonly stopSession: (
    input: StopComputerUseSessionInput,
  ) => Effect.Effect<void, ComputerUseError>;
  readonly captureScreenshot: (
    input: CaptureComputerUseScreenshotInput,
  ) => Effect.Effect<ComputerUseScreenshot, ComputerUseError>;
  readonly executeActions: (
    input: ExecuteComputerUseActionsInput,
  ) => Effect.Effect<ComputerUseSnapshot, ComputerUseError>;
  readonly respondToApproval: (
    input: RespondComputerUseApprovalInput,
  ) => Effect.Effect<ComputerUseSnapshot, ComputerUseError>;
  readonly streamEvents: Stream.Stream<
    | { readonly kind: "snapshot"; readonly snapshot: ComputerUseSnapshot }
    | {
        readonly kind: "event";
        readonly event: ComputerUseEvent;
      },
    ComputerUseError
  >;
}

let registeredComputerUseManager: ComputerUseManagerShape | undefined;

export function registerComputerUseManager(
  manager: ComputerUseManagerShape,
): ComputerUseManagerShape {
  registeredComputerUseManager = manager;
  return manager;
}

export function getRegisteredComputerUseManager(): ComputerUseManagerShape | undefined {
  return registeredComputerUseManager;
}

export class ComputerUseManager extends Context.Service<
  ComputerUseManager,
  ComputerUseManagerShape
>()("t3/computerUse/Services/ComputerUseManager") {}
