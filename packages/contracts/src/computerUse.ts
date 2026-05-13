import * as Schema from "effect/Schema";
import { IsoDateTime, NonNegativeInt, ThreadId, TrimmedNonEmptyString } from "./baseSchemas.ts";
import { ProviderInstanceId } from "./providerInstance.ts";

const ComputerUseId = TrimmedNonEmptyString;

export const ComputerUseSessionId = ComputerUseId.pipe(Schema.brand("ComputerUseSessionId"));
export type ComputerUseSessionId = typeof ComputerUseSessionId.Type;
export const ComputerUseTargetId = ComputerUseId.pipe(Schema.brand("ComputerUseTargetId"));
export type ComputerUseTargetId = typeof ComputerUseTargetId.Type;
export const ComputerUseScreenshotId = ComputerUseId.pipe(Schema.brand("ComputerUseScreenshotId"));
export type ComputerUseScreenshotId = typeof ComputerUseScreenshotId.Type;
export const ComputerUseApprovalId = ComputerUseId.pipe(Schema.brand("ComputerUseApprovalId"));
export type ComputerUseApprovalId = typeof ComputerUseApprovalId.Type;
export const ComputerUseEventId = ComputerUseId.pipe(Schema.brand("ComputerUseEventId"));
export type ComputerUseEventId = typeof ComputerUseEventId.Type;

export const COMPUTER_USE_WS_METHODS = {
  getStatus: "computerUse.getStatus",
  getSnapshot: "computerUse.getSnapshot",
  listTargets: "computerUse.listTargets",
  startSession: "computerUse.startSession",
  stopSession: "computerUse.stopSession",
  captureScreenshot: "computerUse.captureScreenshot",
  executeActions: "computerUse.executeActions",
  respondToApproval: "computerUse.respondToApproval",
  subscribeEvents: "computerUse.subscribeEvents",
} as const;

export const ComputerUseDriverKind = Schema.Literals([
  "container",
  "browser",
  "linux-x11",
  "linux-wayland",
]);
export type ComputerUseDriverKind = typeof ComputerUseDriverKind.Type;

export const ComputerUseTargetKind = Schema.Literals([
  "browser",
  "container",
  "desktop-window",
  "desktop-display",
]);
export type ComputerUseTargetKind = typeof ComputerUseTargetKind.Type;

export const ComputerUseTrustLevel = Schema.Literals(["isolated", "host-desktop", "sensitive"]);
export type ComputerUseTrustLevel = typeof ComputerUseTrustLevel.Type;

export const ComputerUseBounds = Schema.Struct({
  x: Schema.Number,
  y: Schema.Number,
  width: NonNegativeInt,
  height: NonNegativeInt,
});
export type ComputerUseBounds = typeof ComputerUseBounds.Type;

export const ComputerUseTarget = Schema.Struct({
  id: ComputerUseTargetId,
  kind: ComputerUseTargetKind,
  title: TrimmedNonEmptyString,
  appName: Schema.optionalKey(TrimmedNonEmptyString),
  pid: Schema.optionalKey(NonNegativeInt),
  display: Schema.optionalKey(TrimmedNonEmptyString),
  bounds: Schema.optionalKey(ComputerUseBounds),
  allowed: Schema.Boolean,
  trustLevel: ComputerUseTrustLevel,
  driver: ComputerUseDriverKind,
  reason: Schema.optionalKey(TrimmedNonEmptyString),
});
export type ComputerUseTarget = typeof ComputerUseTarget.Type;

export const ComputerUseSessionStatus = Schema.Literals([
  "starting",
  "active",
  "paused",
  "stopped",
  "failed",
]);
export type ComputerUseSessionStatus = typeof ComputerUseSessionStatus.Type;

export const ComputerUseDisplaySize = Schema.Struct({
  width: NonNegativeInt,
  height: NonNegativeInt,
});
export type ComputerUseDisplaySize = typeof ComputerUseDisplaySize.Type;

export const ComputerUseSession = Schema.Struct({
  id: ComputerUseSessionId,
  threadId: ThreadId,
  providerId: ProviderInstanceId,
  targetId: ComputerUseTargetId,
  driver: ComputerUseDriverKind,
  status: ComputerUseSessionStatus,
  displaySize: ComputerUseDisplaySize,
  lastScreenshotId: Schema.optionalKey(ComputerUseScreenshotId),
  createdAt: IsoDateTime,
  updatedAt: IsoDateTime,
  failureReason: Schema.optionalKey(TrimmedNonEmptyString),
});
export type ComputerUseSession = typeof ComputerUseSession.Type;

const Coordinate = NonNegativeInt;

export const ComputerUsePoint = Schema.Struct({
  x: Coordinate,
  y: Coordinate,
});
export type ComputerUsePoint = typeof ComputerUsePoint.Type;

export const ComputerUseMouseButton = Schema.Literals(["left", "right", "middle"]);
export type ComputerUseMouseButton = typeof ComputerUseMouseButton.Type;

export const ComputerUseClickAction = Schema.Struct({
  type: Schema.Literal("click"),
  x: Coordinate,
  y: Coordinate,
  button: Schema.optionalKey(ComputerUseMouseButton),
});
export const ComputerUseDoubleClickAction = Schema.Struct({
  type: Schema.Literal("double_click"),
  x: Coordinate,
  y: Coordinate,
});
export const ComputerUseMoveAction = Schema.Struct({
  type: Schema.Literal("move"),
  x: Coordinate,
  y: Coordinate,
});
export const ComputerUseDragAction = Schema.Struct({
  type: Schema.Literal("drag"),
  path: Schema.Array(ComputerUsePoint),
});
export const ComputerUseScrollAction = Schema.Struct({
  type: Schema.Literal("scroll"),
  x: Coordinate,
  y: Coordinate,
  scrollX: Schema.optionalKey(Schema.Number),
  scrollY: Schema.optionalKey(Schema.Number),
});
export const ComputerUseTypeAction = Schema.Struct({
  type: Schema.Literal("type"),
  text: Schema.String.check(Schema.isMaxLength(20_000)),
});
export const ComputerUseKeypressAction = Schema.Struct({
  type: Schema.Literal("keypress"),
  keys: Schema.Array(TrimmedNonEmptyString).check(Schema.isMinLength(1), Schema.isMaxLength(8)),
});
export const ComputerUseWaitAction = Schema.Struct({
  type: Schema.Literal("wait"),
  ms: Schema.optionalKey(NonNegativeInt),
});
export const ComputerUseScreenshotAction = Schema.Struct({
  type: Schema.Literal("screenshot"),
});

export const ComputerUseAction = Schema.Union([
  ComputerUseClickAction,
  ComputerUseDoubleClickAction,
  ComputerUseMoveAction,
  ComputerUseDragAction,
  ComputerUseScrollAction,
  ComputerUseTypeAction,
  ComputerUseKeypressAction,
  ComputerUseWaitAction,
  ComputerUseScreenshotAction,
]);
export type ComputerUseAction = typeof ComputerUseAction.Type;

export const ComputerUseApprovalKind = Schema.Literals([
  "allow-target",
  "execute-action",
  "sensitive-action",
  "clipboard-access",
  "host-desktop-access",
]);
export type ComputerUseApprovalKind = typeof ComputerUseApprovalKind.Type;

export const ComputerUseApprovalDecision = Schema.Literals(["allow", "deny"]);
export type ComputerUseApprovalDecision = typeof ComputerUseApprovalDecision.Type;

export const ComputerUseApprovalRequest = Schema.Struct({
  id: ComputerUseApprovalId,
  sessionId: Schema.optionalKey(ComputerUseSessionId),
  targetId: Schema.optionalKey(ComputerUseTargetId),
  kind: ComputerUseApprovalKind,
  title: TrimmedNonEmptyString,
  description: TrimmedNonEmptyString,
  screenshotId: Schema.optionalKey(ComputerUseScreenshotId),
  requestedAction: Schema.optionalKey(ComputerUseAction),
  defaultDecision: ComputerUseApprovalDecision,
  status: Schema.Literals(["pending", "resolved"]),
  createdAt: IsoDateTime,
  resolvedAt: Schema.optionalKey(IsoDateTime),
  decision: Schema.optionalKey(ComputerUseApprovalDecision),
});
export type ComputerUseApprovalRequest = typeof ComputerUseApprovalRequest.Type;

export const ComputerUseScreenshot = Schema.Struct({
  id: ComputerUseScreenshotId,
  sessionId: ComputerUseSessionId,
  width: NonNegativeInt,
  height: NonNegativeInt,
  mimeType: Schema.Literal("image/png"),
  sizeBytes: NonNegativeInt,
  dataUrl: Schema.optionalKey(Schema.String),
  createdAt: IsoDateTime,
});
export type ComputerUseScreenshot = typeof ComputerUseScreenshot.Type;

export const ComputerUseDriverHealthStatus = Schema.Literals([
  "available",
  "missing-dependencies",
  "unsupported",
  "disabled",
]);
export type ComputerUseDriverHealthStatus = typeof ComputerUseDriverHealthStatus.Type;

export const ComputerUseDriverHealth = Schema.Struct({
  driver: ComputerUseDriverKind,
  status: ComputerUseDriverHealthStatus,
  message: TrimmedNonEmptyString,
  dependencies: Schema.Array(
    Schema.Struct({
      name: TrimmedNonEmptyString,
      found: Schema.Boolean,
      detail: Schema.optionalKey(TrimmedNonEmptyString),
    }),
  ),
});
export type ComputerUseDriverHealth = typeof ComputerUseDriverHealth.Type;

export const ComputerUseSettings = Schema.Struct({
  enabled: Schema.Boolean,
  defaultDriver: ComputerUseDriverKind,
  askBeforeNewTarget: Schema.Boolean,
  askBeforeSensitiveAction: Schema.Boolean,
  clipboardEnabled: Schema.Boolean,
  hostDesktopEnabled: Schema.Boolean,
});
export type ComputerUseSettings = typeof ComputerUseSettings.Type;

export const DEFAULT_COMPUTER_USE_SETTINGS = {
  enabled: false,
  defaultDriver: "container",
  askBeforeNewTarget: true,
  askBeforeSensitiveAction: true,
  clipboardEnabled: false,
  hostDesktopEnabled: false,
} as const satisfies ComputerUseSettings;

export const ComputerUseAuditEntry = Schema.Struct({
  id: ComputerUseEventId,
  sessionId: Schema.optionalKey(ComputerUseSessionId),
  targetId: Schema.optionalKey(ComputerUseTargetId),
  type: TrimmedNonEmptyString,
  message: TrimmedNonEmptyString,
  createdAt: IsoDateTime,
  payload: Schema.optionalKey(Schema.Record(Schema.String, Schema.Unknown)),
});
export type ComputerUseAuditEntry = typeof ComputerUseAuditEntry.Type;

export const ComputerUseEvent = Schema.Union([
  Schema.Struct({
    type: Schema.Literal("computer.session.started"),
    session: ComputerUseSession,
  }),
  Schema.Struct({
    type: Schema.Literal("computer.session.stopped"),
    sessionId: ComputerUseSessionId,
    reason: Schema.optionalKey(TrimmedNonEmptyString),
  }),
  Schema.Struct({
    type: Schema.Literal("computer.screenshot.captured"),
    sessionId: ComputerUseSessionId,
    screenshotId: ComputerUseScreenshotId,
  }),
  Schema.Struct({
    type: Schema.Literal("computer.action.requested"),
    sessionId: ComputerUseSessionId,
    action: ComputerUseAction,
  }),
  Schema.Struct({
    type: Schema.Literal("computer.action.executed"),
    sessionId: ComputerUseSessionId,
    action: ComputerUseAction,
  }),
  Schema.Struct({
    type: Schema.Literal("computer.action.failed"),
    sessionId: ComputerUseSessionId,
    action: ComputerUseAction,
    error: TrimmedNonEmptyString,
  }),
  Schema.Struct({
    type: Schema.Literal("computer.approval.requested"),
    request: ComputerUseApprovalRequest,
  }),
  Schema.Struct({
    type: Schema.Literal("computer.approval.resolved"),
    requestId: ComputerUseApprovalId,
    decision: ComputerUseApprovalDecision,
  }),
  Schema.Struct({
    type: Schema.Literal("computer.policy.blocked"),
    sessionId: Schema.optionalKey(ComputerUseSessionId),
    reason: TrimmedNonEmptyString,
  }),
]);
export type ComputerUseEvent = typeof ComputerUseEvent.Type;

export const ComputerUseSnapshot = Schema.Struct({
  enabled: Schema.Boolean,
  featureFlagEnabled: Schema.Boolean,
  settings: ComputerUseSettings,
  health: Schema.Array(ComputerUseDriverHealth),
  targets: Schema.Array(ComputerUseTarget),
  sessions: Schema.Array(ComputerUseSession),
  approvals: Schema.Array(ComputerUseApprovalRequest),
  screenshots: Schema.Array(ComputerUseScreenshot),
  auditLog: Schema.Array(ComputerUseAuditEntry),
});
export type ComputerUseSnapshot = typeof ComputerUseSnapshot.Type;

export const ComputerUseStreamItem = Schema.Union([
  Schema.Struct({
    kind: Schema.Literal("snapshot"),
    snapshot: ComputerUseSnapshot,
  }),
  Schema.Struct({
    kind: Schema.Literal("event"),
    event: ComputerUseEvent,
  }),
]);
export type ComputerUseStreamItem = typeof ComputerUseStreamItem.Type;

export const ComputerUseStatus = Schema.Struct({
  enabled: Schema.Boolean,
  featureFlagEnabled: Schema.Boolean,
  settings: ComputerUseSettings,
  health: Schema.Array(ComputerUseDriverHealth),
});
export type ComputerUseStatus = typeof ComputerUseStatus.Type;

export const StartComputerUseSessionInput = Schema.Struct({
  threadId: ThreadId,
  providerId: ProviderInstanceId,
  targetId: Schema.optionalKey(ComputerUseTargetId),
  driver: Schema.optionalKey(ComputerUseDriverKind),
  targetHint: Schema.optionalKey(TrimmedNonEmptyString),
  reason: TrimmedNonEmptyString,
});
export type StartComputerUseSessionInput = typeof StartComputerUseSessionInput.Type;

export const StopComputerUseSessionInput = Schema.Struct({
  sessionId: ComputerUseSessionId,
  reason: Schema.optionalKey(TrimmedNonEmptyString),
});
export type StopComputerUseSessionInput = typeof StopComputerUseSessionInput.Type;

export const CaptureComputerUseScreenshotInput = Schema.Struct({
  sessionId: ComputerUseSessionId,
});
export type CaptureComputerUseScreenshotInput = typeof CaptureComputerUseScreenshotInput.Type;

export const ExecuteComputerUseActionsInput = Schema.Struct({
  sessionId: ComputerUseSessionId,
  actions: Schema.Array(ComputerUseAction).check(Schema.isMinLength(1), Schema.isMaxLength(20)),
});
export type ExecuteComputerUseActionsInput = typeof ExecuteComputerUseActionsInput.Type;

export const RespondComputerUseApprovalInput = Schema.Struct({
  approvalId: ComputerUseApprovalId,
  decision: ComputerUseApprovalDecision,
});
export type RespondComputerUseApprovalInput = typeof RespondComputerUseApprovalInput.Type;

export class ComputerUseError extends Schema.TaggedErrorClass<ComputerUseError>()(
  "ComputerUseError",
  {
    code: Schema.Literals([
      "feature-disabled",
      "not-found",
      "driver-unavailable",
      "policy-blocked",
      "approval-required",
      "invalid-state",
      "driver-error",
    ]),
    message: TrimmedNonEmptyString,
    cause: Schema.optional(Schema.Defect),
  },
) {}

export const ComputerUseRpcSchemas = {
  getStatus: {
    input: Schema.Struct({}),
    output: ComputerUseStatus,
  },
  getSnapshot: {
    input: Schema.Struct({}),
    output: ComputerUseSnapshot,
  },
  listTargets: {
    input: Schema.Struct({}),
    output: Schema.Array(ComputerUseTarget),
  },
  startSession: {
    input: StartComputerUseSessionInput,
    output: ComputerUseSession,
  },
  stopSession: {
    input: StopComputerUseSessionInput,
    output: Schema.Struct({}),
  },
  captureScreenshot: {
    input: CaptureComputerUseScreenshotInput,
    output: ComputerUseScreenshot,
  },
  executeActions: {
    input: ExecuteComputerUseActionsInput,
    output: ComputerUseSnapshot,
  },
  respondToApproval: {
    input: RespondComputerUseApprovalInput,
    output: ComputerUseSnapshot,
  },
  subscribeEvents: {
    input: Schema.Struct({}),
    output: ComputerUseStreamItem,
  },
} as const;

export type ProviderComputerUseCapability = {
  readonly available: boolean;
  readonly startComputerUseSession: (
    input: StartComputerUseSessionInput,
  ) => Promise<ComputerUseSession>;
  readonly submitScreenshot: (
    input: CaptureComputerUseScreenshotInput,
  ) => Promise<ComputerUseScreenshot>;
  readonly handleComputerUseActions: (
    input: ExecuteComputerUseActionsInput,
  ) => Promise<ComputerUseSnapshot>;
};
