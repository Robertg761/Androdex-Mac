// @effect-diagnostics nodeBuiltinImport:off
import * as NodeFS from "node:fs/promises";
import * as NodePath from "node:path";

import {
  DEFAULT_COMPUTER_USE_SETTINGS,
  type ComputerUseAction,
  type ComputerUseApprovalId,
  type ComputerUseApprovalRequest,
  type ComputerUseAuditEntry,
  type ComputerUseError,
  type ComputerUseDriverKind,
  type ComputerUseEvent,
  type ComputerUseEventId,
  type ComputerUseScreenshot,
  type ComputerUseScreenshotId,
  type ComputerUseSession,
  type ComputerUseSessionId,
  type ComputerUseSettings,
  type ComputerUseSnapshot,
  type ComputerUseStatus,
  type ComputerUseTarget,
  type ComputerUseTargetId,
  type StartComputerUseSessionInput,
  type StopComputerUseSessionInput,
} from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as PubSub from "effect/PubSub";
import * as Ref from "effect/Ref";
import * as Stream from "effect/Stream";

import { ServerConfig } from "../../config.ts";
import { ServerSettingsService } from "../../serverSettings.ts";
import type { ComputerUseDriver, ComputerUseDriverSession } from "../Drivers/ComputerUseDriver.ts";
import { LinuxWaylandDriver } from "../Drivers/LinuxWaylandDriver.ts";
import { LinuxX11Driver } from "../Drivers/LinuxX11Driver.ts";
import { VirtualDisplayDriver } from "../Drivers/VirtualDisplayDriver.ts";
import { ComputerUseManager, registerComputerUseManager } from "../Services/ComputerUseManager.ts";
import { evaluateActionPolicy, evaluateTargetPolicy } from "../Services/ComputerUsePolicy.ts";
import {
  MAX_RETAINED_AUDIT_ENTRIES,
  MAX_RETAINED_SCREENSHOTS,
  makeId,
  nowIso,
  pngDataUrl,
  retainArrayTail,
  retainMapTail,
  targetMatchesHint,
  toComputerUseError,
} from "../Services/ComputerUseRuntimeUtils.ts";

interface ManagedSession {
  readonly session: ComputerUseSession;
  readonly driverSession: ComputerUseDriverSession;
}

interface ComputerUseState {
  readonly allowedTargetIds: ReadonlySet<string>;
  readonly sessions: ReadonlyMap<string, ManagedSession>;
  readonly screenshots: ReadonlyMap<string, ComputerUseScreenshot>;
  readonly approvals: ReadonlyMap<string, ComputerUseApprovalRequest>;
  readonly auditLog: ReadonlyArray<ComputerUseAuditEntry>;
}

function buildDrivers(): ReadonlyMap<ComputerUseDriverKind, ComputerUseDriver> {
  const drivers: ReadonlyArray<ComputerUseDriver> = [
    new VirtualDisplayDriver("container"),
    new VirtualDisplayDriver("browser"),
    new LinuxX11Driver(),
    new LinuxWaylandDriver(),
  ];
  return new Map(drivers.map((driver) => [driver.kind, driver]));
}

export const ComputerUseManagerLive = Layer.effect(
  ComputerUseManager,
  Effect.gen(function* () {
    const config = yield* ServerConfig;
    const serverSettings = yield* ServerSettingsService;
    const stateRef = yield* Ref.make<ComputerUseState>({
      allowedTargetIds: new Set(),
      sessions: new Map(),
      screenshots: new Map(),
      approvals: new Map(),
      auditLog: [],
    });
    const eventsPubSub = yield* PubSub.unbounded<ComputerUseEvent>();
    const drivers = buildDrivers();
    const auditLogPath = NodePath.join(config.logsDir, "computer-use-audit.ndjson");

    const readSettings = serverSettings.getSettings.pipe(
      Effect.map((settings) => settings.computerUse ?? DEFAULT_COMPUTER_USE_SETTINGS),
      Effect.mapError((cause) =>
        toComputerUseError("invalid-state", "Failed to read computer-use settings.", cause),
      ),
    );

    const isEnabled = (settings: ComputerUseSettings) =>
      config.computerUseFeatureEnabled && settings.enabled;

    const requireEnabled = Effect.gen(function* () {
      const settings = yield* readSettings;
      if (!config.computerUseFeatureEnabled) {
        return yield* toComputerUseError(
          "feature-disabled",
          "Computer Use is disabled. Set ANDRODEX_COMPUTER_USE=1 to enable it.",
        );
      }
      if (!settings.enabled) {
        return yield* toComputerUseError(
          "feature-disabled",
          "Computer Use is disabled in server settings.",
        );
      }
      return settings;
    });

    const appendAudit = (entry: Omit<ComputerUseAuditEntry, "id" | "createdAt">) =>
      Effect.gen(function* () {
        const createdAt = yield* nowIso;
        const auditEntry = {
          id: makeId<ComputerUseEventId>("computer-audit"),
          createdAt,
          ...entry,
        } satisfies ComputerUseAuditEntry;
        yield* Ref.update(stateRef, (state) => ({
          ...state,
          auditLog: retainArrayTail([...state.auditLog, auditEntry], MAX_RETAINED_AUDIT_ENTRIES),
        }));
        yield* Effect.tryPromise({
          try: () =>
            NodeFS.appendFile(auditLogPath, `${JSON.stringify(auditEntry)}\n`, {
              encoding: "utf8",
            }),
          catch: (cause) =>
            toComputerUseError("driver-error", "Failed to write computer-use audit log.", cause),
        }).pipe(Effect.catch(() => Effect.void));
        return auditEntry;
      });

    const publishEvent = (event: ComputerUseEvent) =>
      PubSub.publish(eventsPubSub, event).pipe(Effect.asVoid);

    const getDriver = (kind: ComputerUseDriverKind) => {
      const driver = drivers.get(kind);
      if (!driver) {
        return Effect.fail(
          toComputerUseError(
            "driver-unavailable",
            `Computer-use driver ${kind} is not registered.`,
          ),
        );
      }
      return Effect.succeed(driver);
    };

    const healthCheck = Effect.all(
      Array.from(drivers.values()).map((driver) =>
        Effect.tryPromise({
          try: () => driver.healthCheck(),
          catch: (cause) =>
            toComputerUseError(
              "driver-error",
              `Failed to check ${driver.kind} computer-use driver health.`,
              cause,
            ),
        }),
      ),
      { concurrency: "unbounded" },
    );

    const listTargets = Effect.gen(function* () {
      const state = yield* Ref.get(stateRef);
      const targetGroups = yield* Effect.all(
        Array.from(drivers.values()).map((driver) =>
          Effect.tryPromise({
            try: () => driver.listTargets(),
            catch: (cause) =>
              toComputerUseError(
                "driver-error",
                `Failed to list ${driver.kind} computer-use targets.`,
                cause,
              ),
          }).pipe(Effect.catch(() => Effect.succeed<ReadonlyArray<ComputerUseTarget>>([]))),
        ),
        { concurrency: "unbounded" },
      );
      return targetGroups
        .flat()
        .map((target) =>
          target.allowed || !state.allowedTargetIds.has(target.id)
            ? target
            : Object.assign({}, target, { allowed: true }),
        );
    });

    const getSnapshot: Effect.Effect<ComputerUseSnapshot, ComputerUseError> = Effect.gen(
      function* () {
        const settings = yield* readSettings;
        const [health, targets, state] = yield* Effect.all([
          healthCheck,
          listTargets,
          Ref.get(stateRef),
        ]);
        return {
          enabled: isEnabled(settings),
          featureFlagEnabled: config.computerUseFeatureEnabled,
          settings,
          health,
          targets: [...targets],
          sessions: Array.from(state.sessions.values()).map((entry) => entry.session),
          approvals: Array.from(state.approvals.values()),
          screenshots: Array.from(state.screenshots.values()),
          auditLog: [...state.auditLog],
        };
      },
    );

    const makeStatus: Effect.Effect<ComputerUseStatus, ComputerUseError> = Effect.gen(function* () {
      const settings = yield* readSettings;
      return {
        enabled: isEnabled(settings),
        featureFlagEnabled: config.computerUseFeatureEnabled,
        settings,
        health: yield* healthCheck,
      };
    });

    const requestApproval = (input: {
      readonly kind: ComputerUseApprovalRequest["kind"];
      readonly title: string;
      readonly description: string;
      readonly targetId?: ComputerUseTargetId | undefined;
      readonly sessionId?: ComputerUseSessionId | undefined;
      readonly requestedAction?: ComputerUseAction | undefined;
      readonly screenshotId?: ComputerUseScreenshotId | undefined;
    }) =>
      Effect.gen(function* () {
        const createdAt = yield* nowIso;
        const request = {
          id: makeId<ComputerUseApprovalId>("computer-approval"),
          kind: input.kind,
          title: input.title,
          description: input.description,
          defaultDecision: "deny",
          status: "pending",
          createdAt,
          ...(input.targetId ? { targetId: input.targetId } : {}),
          ...(input.sessionId ? { sessionId: input.sessionId } : {}),
          ...(input.requestedAction ? { requestedAction: input.requestedAction } : {}),
          ...(input.screenshotId ? { screenshotId: input.screenshotId } : {}),
        } satisfies ComputerUseApprovalRequest;
        yield* Ref.update(stateRef, (state) => ({
          ...state,
          approvals: new Map([...state.approvals, [request.id, request]]),
        }));
        yield* appendAudit({
          type: "approval.requested",
          message: request.title,
          ...(request.targetId ? { targetId: request.targetId } : {}),
          ...(request.sessionId ? { sessionId: request.sessionId } : {}),
        });
        yield* publishEvent({ type: "computer.approval.requested", request });
        return request;
      });

    const captureScreenshot = (input: { readonly sessionId: ComputerUseSessionId }) =>
      Effect.gen(function* () {
        const managed = (yield* Ref.get(stateRef)).sessions.get(input.sessionId);
        if (!managed) {
          return yield* toComputerUseError(
            "not-found",
            `Computer-use session ${input.sessionId} was not found.`,
          );
        }
        const driver = yield* getDriver(managed.session.driver);
        const captured = yield* Effect.tryPromise({
          try: () => driver.captureScreenshot(managed.driverSession),
          catch: (cause) =>
            toComputerUseError("driver-error", "Failed to capture computer-use screenshot.", cause),
        });
        const createdAt = yield* nowIso;
        const screenshot = {
          id: makeId<ComputerUseScreenshotId>("computer-screenshot"),
          sessionId: input.sessionId,
          width: captured.width,
          height: captured.height,
          mimeType: "image/png",
          sizeBytes: captured.pngBytes.byteLength,
          dataUrl: pngDataUrl(captured.pngBytes),
          createdAt,
        } satisfies ComputerUseScreenshot;
        yield* Ref.update(stateRef, (state) => {
          const sessions = new Map(state.sessions);
          const current = sessions.get(input.sessionId);
          if (current) {
            sessions.set(input.sessionId, {
              ...current,
              session: {
                ...current.session,
                displaySize: {
                  width: screenshot.width,
                  height: screenshot.height,
                },
                lastScreenshotId: screenshot.id,
                updatedAt: createdAt,
              },
            });
          }
          const screenshots = new Map(state.screenshots);
          screenshots.set(screenshot.id, screenshot);
          return {
            ...state,
            sessions,
            screenshots: retainMapTail(screenshots, MAX_RETAINED_SCREENSHOTS),
          };
        });
        yield* appendAudit({
          type: "screenshot.captured",
          message: "Captured computer-use screenshot.",
          sessionId: input.sessionId,
          payload: {
            screenshotId: screenshot.id,
            width: screenshot.width,
            height: screenshot.height,
            sizeBytes: screenshot.sizeBytes,
          },
        });
        yield* publishEvent({
          type: "computer.screenshot.captured",
          sessionId: input.sessionId,
          screenshotId: screenshot.id,
        });
        return screenshot;
      });

    const startSession = (input: StartComputerUseSessionInput) =>
      Effect.gen(function* () {
        const settings = yield* requireEnabled;
        const driverKind = input.driver ?? settings.defaultDriver;
        const driver = yield* getDriver(driverKind);
        const targets = yield* listTargets;
        const driverTargets = targets.filter((candidate) => candidate.driver === driverKind);
        const target =
          input.targetId !== undefined
            ? targets.find((candidate) => candidate.id === input.targetId)
            : input.targetHint !== undefined
              ? (driverTargets.find((candidate) =>
                  targetMatchesHint(candidate, input.targetHint),
                ) ??
                targets.find((candidate) => targetMatchesHint(candidate, input.targetHint)) ??
                driverTargets[0])
              : driverTargets[0];
        if (!target) {
          return yield* toComputerUseError(
            "not-found",
            `No computer-use target is available for ${driverKind}.`,
          );
        }

        const decision = evaluateTargetPolicy(target, settings);
        if (decision.type === "block") {
          yield* appendAudit({
            type: "policy.blocked",
            message: decision.reason,
            targetId: target.id,
          });
          yield* publishEvent({ type: "computer.policy.blocked", reason: decision.reason });
          return yield* toComputerUseError("policy-blocked", decision.reason);
        }
        if (decision.type === "approval-required") {
          yield* requestApproval({
            kind: target.trustLevel === "host-desktop" ? "host-desktop-access" : "allow-target",
            title: `Allow Computer Use for ${target.title}`,
            description: input.reason,
            targetId: target.id,
          });
          return yield* toComputerUseError("approval-required", decision.reason);
        }

        const health = yield* Effect.tryPromise({
          try: () => driver.healthCheck(),
          catch: (cause) =>
            toComputerUseError("driver-error", `Failed to check ${driverKind} health.`, cause),
        });
        if (health.status !== "available") {
          return yield* toComputerUseError("driver-unavailable", health.message);
        }

        const driverSession = yield* Effect.tryPromise({
          try: () => driver.startSession(target),
          catch: (cause) =>
            toComputerUseError(
              "driver-error",
              `Failed to start ${driverKind} computer-use session.`,
              cause,
            ),
        });
        const createdAt = yield* nowIso;
        const session = {
          id: makeId<ComputerUseSessionId>("computer-session"),
          threadId: input.threadId,
          providerId: input.providerId,
          targetId: target.id,
          driver: driverKind,
          status: "active",
          displaySize: target.bounds
            ? {
                width: target.bounds.width,
                height: target.bounds.height,
              }
            : { width: 0, height: 0 },
          createdAt,
          updatedAt: createdAt,
        } satisfies ComputerUseSession;
        yield* Ref.update(stateRef, (state) => ({
          ...state,
          sessions: new Map([...state.sessions, [session.id, { session, driverSession }]]),
        }));
        yield* appendAudit({
          type: "session.started",
          message: `Started ${driverKind} computer-use session.`,
          sessionId: session.id,
          targetId: target.id,
        });
        yield* publishEvent({ type: "computer.session.started", session });
        yield* captureScreenshot({ sessionId: session.id }).pipe(
          Effect.catch((cause) =>
            Effect.logWarning("initial computer-use screenshot failed", {
              sessionId: session.id,
              cause,
            }),
          ),
        );
        return session;
      });

    const stopSession = (input: StopComputerUseSessionInput) =>
      Effect.gen(function* () {
        const managed = (yield* Ref.get(stateRef)).sessions.get(input.sessionId);
        if (!managed) {
          return yield* toComputerUseError(
            "not-found",
            `Computer-use session ${input.sessionId} was not found.`,
          );
        }
        const driver = yield* getDriver(managed.session.driver);
        yield* Effect.tryPromise({
          try: () => driver.stopSession(managed.driverSession),
          catch: (cause) =>
            toComputerUseError("driver-error", "Failed to stop computer-use session.", cause),
        });
        const updatedAt = yield* nowIso;
        yield* Ref.update(stateRef, (state) => {
          const sessions = new Map(state.sessions);
          sessions.set(input.sessionId, {
            ...managed,
            session: {
              ...managed.session,
              status: "stopped",
              updatedAt,
            },
          });
          return { ...state, sessions };
        });
        yield* appendAudit({
          type: "session.stopped",
          message: input.reason ?? "Stopped computer-use session.",
          sessionId: input.sessionId,
        });
        yield* publishEvent({
          type: "computer.session.stopped",
          sessionId: input.sessionId,
          ...(input.reason ? { reason: input.reason } : {}),
        });
      });

    const executeActions = (input: {
      readonly sessionId: ComputerUseSessionId;
      readonly actions: ReadonlyArray<ComputerUseAction>;
    }) =>
      Effect.gen(function* () {
        const settings = yield* requireEnabled;
        for (const action of input.actions) {
          const managed = (yield* Ref.get(stateRef)).sessions.get(input.sessionId);
          if (!managed) {
            return yield* toComputerUseError(
              "not-found",
              `Computer-use session ${input.sessionId} was not found.`,
            );
          }
          if (managed.session.status !== "active") {
            return yield* toComputerUseError(
              "invalid-state",
              `Computer-use session ${input.sessionId} is not active.`,
            );
          }
          const targets = yield* listTargets;
          const target =
            targets.find((candidate) => candidate.id === managed.session.targetId) ??
            managed.driverSession.target;
          const decision = evaluateActionPolicy(action, target, settings);
          if (decision.type === "block") {
            yield* appendAudit({
              type: "policy.blocked",
              message: decision.reason,
              sessionId: input.sessionId,
              targetId: target.id,
              payload: { action },
            });
            yield* publishEvent({
              type: "computer.policy.blocked",
              sessionId: input.sessionId,
              reason: decision.reason,
            });
            return yield* toComputerUseError("policy-blocked", decision.reason);
          }
          if (decision.type === "approval-required") {
            const screenshotId = managed.session.lastScreenshotId;
            yield* requestApproval({
              kind: "sensitive-action",
              title: "Review sensitive computer-use action",
              description: decision.reason,
              sessionId: input.sessionId,
              targetId: target.id,
              requestedAction: action,
              ...(screenshotId ? { screenshotId } : {}),
            });
            return yield* toComputerUseError("approval-required", decision.reason);
          }

          yield* appendAudit({
            type: "action.requested",
            message: `Requested ${action.type}.`,
            sessionId: input.sessionId,
            targetId: target.id,
            payload: { action },
          });
          yield* publishEvent({
            type: "computer.action.requested",
            sessionId: input.sessionId,
            action,
          });
          const driver = yield* getDriver(managed.session.driver);
          if (action.type === "screenshot") {
            yield* captureScreenshot({ sessionId: input.sessionId });
          } else {
            yield* Effect.tryPromise({
              try: () => driver.executeAction(managed.driverSession, action),
              catch: (cause) =>
                toComputerUseError(
                  "driver-error",
                  `Failed to execute computer-use action ${action.type}.`,
                  cause,
                ),
            }).pipe(
              Effect.tapError((error) =>
                Effect.all(
                  [
                    publishEvent({
                      type: "computer.action.failed",
                      sessionId: input.sessionId,
                      action,
                      error: error.message,
                    }),
                    appendAudit({
                      type: "action.failed",
                      message: error.message,
                      sessionId: input.sessionId,
                      targetId: target.id,
                      payload: { action },
                    }),
                  ],
                  { discard: true },
                ),
              ),
            );
            yield* publishEvent({
              type: "computer.action.executed",
              sessionId: input.sessionId,
              action,
            });
            yield* appendAudit({
              type: "action.executed",
              message: `Executed ${action.type}.`,
              sessionId: input.sessionId,
              targetId: target.id,
              payload: { action },
            });
            yield* captureScreenshot({ sessionId: input.sessionId }).pipe(
              Effect.catch((cause) =>
                Effect.logWarning("post-action computer-use screenshot failed", {
                  sessionId: input.sessionId,
                  actionType: action.type,
                  cause,
                }),
              ),
            );
          }
        }
        return yield* getSnapshot;
      });

    const respondToApproval = (input: {
      readonly approvalId: ComputerUseApprovalId;
      readonly decision: "allow" | "deny";
    }) =>
      Effect.gen(function* () {
        const resolvedAt = yield* nowIso;
        const request = (yield* Ref.get(stateRef)).approvals.get(input.approvalId);
        if (!request) {
          return yield* toComputerUseError(
            "not-found",
            `Computer-use approval ${input.approvalId} was not found.`,
          );
        }
        yield* Ref.update(stateRef, (state) => {
          const approvals = new Map(state.approvals);
          approvals.set(input.approvalId, {
            ...request,
            status: "resolved",
            decision: input.decision,
            resolvedAt,
          });
          const allowedTargetIds = new Set(state.allowedTargetIds);
          if (input.decision === "allow" && request.targetId) {
            allowedTargetIds.add(request.targetId);
          }
          return {
            ...state,
            approvals,
            allowedTargetIds,
          };
        });
        yield* appendAudit({
          type: "approval.resolved",
          message: `Computer-use approval ${input.decision}.`,
          ...(request.targetId ? { targetId: request.targetId } : {}),
          ...(request.sessionId ? { sessionId: request.sessionId } : {}),
          payload: {
            approvalId: input.approvalId,
            decision: input.decision,
          },
        });
        yield* publishEvent({
          type: "computer.approval.resolved",
          requestId: input.approvalId,
          decision: input.decision,
        });
        return yield* getSnapshot;
      });

    const stopAllSessions = Effect.gen(function* () {
      const state = yield* Ref.get(stateRef);
      yield* Effect.forEach(
        state.sessions.values(),
        (managed) =>
          Effect.gen(function* () {
            const driver = yield* getDriver(managed.session.driver);
            yield* Effect.tryPromise({
              try: () => driver.stopSession(managed.driverSession),
              catch: (cause) =>
                toComputerUseError(
                  "driver-error",
                  "Failed to stop computer-use driver session during shutdown.",
                  cause,
                ),
            }).pipe(Effect.ignore);
          }),
        { concurrency: "unbounded", discard: true },
      );
    });

    yield* Effect.addFinalizer(() => stopAllSessions.pipe(Effect.ignore));

    return registerComputerUseManager({
      getStatus: makeStatus,
      getSnapshot,
      healthCheck,
      listTargets,
      startSession,
      stopSession,
      captureScreenshot,
      executeActions,
      respondToApproval,
      streamEvents: Stream.concat(
        Stream.unwrap(
          Effect.map(getSnapshot, (snapshot) =>
            Stream.make({ kind: "snapshot", snapshot } as const),
          ),
        ),
        Stream.fromPubSub(eventsPubSub).pipe(
          Stream.map((event) => ({ kind: "event", event }) as const),
        ),
      ),
    });
  }),
);
