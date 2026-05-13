import {
  CaptureComputerUseScreenshotInput,
  ComputerUseApprovalId,
  ComputerUseError,
  ComputerUseSessionId,
  ExecuteComputerUseActionsInput,
  RespondComputerUseApprovalInput,
  StartComputerUseSessionInput,
  StopComputerUseSessionInput,
} from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { HttpRouter, HttpServerRequest, HttpServerResponse } from "effect/unstable/http";

import { ServerAuth } from "../auth/Services/ServerAuth.ts";
import { ComputerUseManager } from "./Services/ComputerUseManager.ts";

const SessionPathParams = Schema.Struct({
  sessionId: ComputerUseSessionId,
});

const ApprovalPathParams = Schema.Struct({
  approvalId: ComputerUseApprovalId,
});

const respondToComputerUseError = (error: ComputerUseError) => {
  const status =
    error.code === "feature-disabled"
      ? 403
      : error.code === "not-found"
        ? 404
        : error.code === "approval-required"
          ? 409
          : error.code === "policy-blocked"
            ? 403
            : 400;
  return Effect.succeed(
    HttpServerResponse.jsonUnsafe({ error: error.message, code: error.code }, { status }),
  );
};

const authenticateOwnerSession = Effect.gen(function* () {
  const request = yield* HttpServerRequest.HttpServerRequest;
  const serverAuth = yield* ServerAuth;
  const session = yield* serverAuth.authenticateHttpRequest(request);
  if (session.role !== "owner") {
    return yield* new ComputerUseError({
      code: "policy-blocked",
      message: "Only owner sessions can use Computer Use.",
    });
  }
  return session;
});

export const computerUseStatusRouteLayer = HttpRouter.add(
  "GET",
  "/api/computer-use/status",
  Effect.gen(function* () {
    yield* authenticateOwnerSession;
    const manager = yield* ComputerUseManager;
    return HttpServerResponse.jsonUnsafe(yield* manager.getStatus, { status: 200 });
  }).pipe(Effect.catchTag("ComputerUseError", respondToComputerUseError)),
);

export const computerUseTargetsRouteLayer = HttpRouter.add(
  "GET",
  "/api/computer-use/targets",
  Effect.gen(function* () {
    yield* authenticateOwnerSession;
    const manager = yield* ComputerUseManager;
    return HttpServerResponse.jsonUnsafe(yield* manager.listTargets, { status: 200 });
  }).pipe(Effect.catchTag("ComputerUseError", respondToComputerUseError)),
);

export const computerUseSnapshotRouteLayer = HttpRouter.add(
  "GET",
  "/api/computer-use/sessions",
  Effect.gen(function* () {
    yield* authenticateOwnerSession;
    const manager = yield* ComputerUseManager;
    return HttpServerResponse.jsonUnsafe(yield* manager.getSnapshot, { status: 200 });
  }).pipe(Effect.catchTag("ComputerUseError", respondToComputerUseError)),
);

export const computerUseStartSessionRouteLayer = HttpRouter.add(
  "POST",
  "/api/computer-use/sessions",
  Effect.gen(function* () {
    yield* authenticateOwnerSession;
    const manager = yield* ComputerUseManager;
    const input = yield* HttpServerRequest.schemaBodyJson(StartComputerUseSessionInput).pipe(
      Effect.mapError(
        (cause) =>
          new ComputerUseError({
            code: "invalid-state",
            message: "Invalid computer-use session payload.",
            cause,
          }),
      ),
    );
    return HttpServerResponse.jsonUnsafe(yield* manager.startSession(input), { status: 201 });
  }).pipe(Effect.catchTag("ComputerUseError", respondToComputerUseError)),
);

export const computerUseGetSessionRouteLayer = HttpRouter.add(
  "GET",
  "/api/computer-use/sessions/:sessionId",
  Effect.gen(function* () {
    yield* authenticateOwnerSession;
    const params = yield* HttpRouter.schemaPathParams(SessionPathParams).pipe(
      Effect.mapError(
        (cause) =>
          new ComputerUseError({
            code: "invalid-state",
            message: "Invalid computer-use session path.",
            cause,
          }),
      ),
    );
    const manager = yield* ComputerUseManager;
    const snapshot = yield* manager.getSnapshot;
    const session = snapshot.sessions.find((candidate) => candidate.id === params.sessionId);
    if (!session) {
      return yield* new ComputerUseError({
        code: "not-found",
        message: `Computer-use session ${params.sessionId} was not found.`,
      });
    }
    return HttpServerResponse.jsonUnsafe(session, { status: 200 });
  }).pipe(Effect.catchTag("ComputerUseError", respondToComputerUseError)),
);

export const computerUseStopSessionRouteLayer = HttpRouter.add(
  "DELETE",
  "/api/computer-use/sessions/:sessionId",
  Effect.gen(function* () {
    yield* authenticateOwnerSession;
    const params = yield* HttpRouter.schemaPathParams(SessionPathParams).pipe(
      Effect.mapError(
        (cause) =>
          new ComputerUseError({
            code: "invalid-state",
            message: "Invalid computer-use session path.",
            cause,
          }),
      ),
    );
    const manager = yield* ComputerUseManager;
    yield* manager.stopSession({
      sessionId: params.sessionId,
      reason: "Stopped through HTTP API.",
    } satisfies StopComputerUseSessionInput);
    return HttpServerResponse.jsonUnsafe({}, { status: 200 });
  }).pipe(Effect.catchTag("ComputerUseError", respondToComputerUseError)),
);

export const computerUseCaptureScreenshotRouteLayer = HttpRouter.add(
  "POST",
  "/api/computer-use/sessions/:sessionId/screenshot",
  Effect.gen(function* () {
    yield* authenticateOwnerSession;
    const params = yield* HttpRouter.schemaPathParams(SessionPathParams).pipe(
      Effect.mapError(
        (cause) =>
          new ComputerUseError({
            code: "invalid-state",
            message: "Invalid computer-use session path.",
            cause,
          }),
      ),
    );
    const manager = yield* ComputerUseManager;
    return HttpServerResponse.jsonUnsafe(
      yield* manager.captureScreenshot({
        sessionId: params.sessionId,
      } satisfies CaptureComputerUseScreenshotInput),
      { status: 200 },
    );
  }).pipe(Effect.catchTag("ComputerUseError", respondToComputerUseError)),
);

export const computerUseExecuteActionsRouteLayer = HttpRouter.add(
  "POST",
  "/api/computer-use/sessions/:sessionId/actions",
  Effect.gen(function* () {
    yield* authenticateOwnerSession;
    const params = yield* HttpRouter.schemaPathParams(SessionPathParams).pipe(
      Effect.mapError(
        (cause) =>
          new ComputerUseError({
            code: "invalid-state",
            message: "Invalid computer-use session path.",
            cause,
          }),
      ),
    );
    const body = yield* HttpServerRequest.schemaBodyJson(
      Schema.Struct({ actions: ExecuteComputerUseActionsInput.fields.actions }),
    ).pipe(
      Effect.mapError(
        (cause) =>
          new ComputerUseError({
            code: "invalid-state",
            message: "Invalid computer-use actions payload.",
            cause,
          }),
      ),
    );
    const manager = yield* ComputerUseManager;
    return HttpServerResponse.jsonUnsafe(
      yield* manager.executeActions({ sessionId: params.sessionId, actions: body.actions }),
      { status: 200 },
    );
  }).pipe(Effect.catchTag("ComputerUseError", respondToComputerUseError)),
);

export const computerUseRespondApprovalRouteLayer = HttpRouter.add(
  "POST",
  "/api/computer-use/approvals/:approvalId/respond",
  Effect.gen(function* () {
    yield* authenticateOwnerSession;
    const params = yield* HttpRouter.schemaPathParams(ApprovalPathParams).pipe(
      Effect.mapError(
        (cause) =>
          new ComputerUseError({
            code: "invalid-state",
            message: "Invalid computer-use approval path.",
            cause,
          }),
      ),
    );
    const manager = yield* ComputerUseManager;
    const body = yield* HttpServerRequest.schemaBodyJson(
      Schema.Struct({ decision: RespondComputerUseApprovalInput.fields.decision }),
    ).pipe(
      Effect.mapError(
        (cause) =>
          new ComputerUseError({
            code: "invalid-state",
            message: "Invalid computer-use approval payload.",
            cause,
          }),
      ),
    );
    return HttpServerResponse.jsonUnsafe(
      yield* manager.respondToApproval({
        approvalId: params.approvalId,
        decision: body.decision,
      }),
      { status: 200 },
    );
  }).pipe(Effect.catchTag("ComputerUseError", respondToComputerUseError)),
);
