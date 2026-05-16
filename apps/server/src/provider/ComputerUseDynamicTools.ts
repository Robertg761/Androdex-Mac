// @effect-diagnostics preferSchemaOverJson:off
import {
  ComputerUseAction,
  ComputerUseDriverKind,
  ComputerUseSessionId,
  type ComputerUseTarget,
  ComputerUseTargetId,
  ProviderInstanceId,
  ThreadId,
} from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import type * as EffectCodexSchema from "effect-codex-app-server/schema";

import type { ComputerUseManagerShape } from "../computerUse/Services/ComputerUseManager.ts";

type DynamicToolSpec = EffectCodexSchema.V2ThreadStartParams__DynamicToolSpec;
type DynamicToolResponse = EffectCodexSchema.DynamicToolCallResponse;
type DynamicToolContentItem = DynamicToolResponse["contentItems"][number];

const TOOL_NAMESPACE = "androdex";
const TOOL_NAME = "computer_use";

const ComputerUseOperation = Schema.Literals([
  "status",
  "list_targets",
  "start_session",
  "screenshot",
  "execute_actions",
  "stop_session",
]);

const ComputerUseToolArguments = Schema.Struct({
  operation: ComputerUseOperation,
  sessionId: Schema.optionalKey(Schema.String),
  targetId: Schema.optionalKey(Schema.String),
  targetHint: Schema.optionalKey(Schema.String),
  driver: Schema.optionalKey(ComputerUseDriverKind),
  reason: Schema.optionalKey(Schema.String),
  action: Schema.optionalKey(ComputerUseAction),
  actions: Schema.optionalKey(Schema.Array(ComputerUseAction)),
});
type ComputerUseToolArguments = typeof ComputerUseToolArguments.Type;

const decodeComputerUseToolArguments = Schema.decodeUnknownEffect(ComputerUseToolArguments);

export const COMPUTER_USE_DYNAMIC_TOOLS: ReadonlyArray<DynamicToolSpec> = [
  {
    namespace: TOOL_NAMESPACE,
    name: TOOL_NAME,
    description:
      "Use the user's visible Linux computer. Start a session, inspect screenshots, then click, move, drag, scroll, type, press keys, wait, or stop. Use this for desktop apps and websites the user asks you to operate. Host desktop access may require explicit user approval.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["operation"],
      properties: {
        operation: {
          type: "string",
          enum: [
            "status",
            "list_targets",
            "start_session",
            "screenshot",
            "execute_actions",
            "stop_session",
          ],
          description:
            "Call start_session first unless you already have an active sessionId. Then alternate screenshot and execute_actions.",
        },
        sessionId: {
          type: "string",
          description: "Existing computer-use session id. Optional when one active session exists.",
        },
        targetId: {
          type: "string",
          description: "Exact target id from list_targets. Optional for start_session.",
        },
        targetHint: {
          type: "string",
          description: "Human-readable target hint, such as an app or window title.",
        },
        driver: {
          type: "string",
          enum: ["container", "browser", "linux-x11", "linux-wayland"],
          description:
            "Driver to use for start_session. Use linux-wayland for a Wayland desktop and linux-x11 for X11.",
        },
        reason: {
          type: "string",
          description: "Short user-facing reason for starting or stopping the session.",
        },
        action: {
          type: "object",
          description:
            "Single action for execute_actions. Action types: click, double_click, move, drag, scroll, type, keypress, wait, screenshot.",
        },
        actions: {
          type: "array",
          minItems: 1,
          maxItems: 20,
          description: "Batch of actions for execute_actions.",
          items: { type: "object" },
        },
      },
    },
  },
];

export const getComputerUseDynamicToolSpecs = (
  manager: ComputerUseManagerShape,
): Effect.Effect<ReadonlyArray<DynamicToolSpec>> =>
  manager.getStatus.pipe(
    Effect.map((status) =>
      status.enabled && status.health.some((driver) => driver.status === "available")
        ? COMPUTER_USE_DYNAMIC_TOOLS
        : [],
    ),
    Effect.catch(() => Effect.succeed([])),
  );

export const isComputerUseDynamicTool = (input: {
  readonly namespace?: string | null | undefined;
  readonly tool: string;
}): boolean => input.tool === TOOL_NAME && (input.namespace ?? TOOL_NAMESPACE) === TOOL_NAMESPACE;

function textItem(text: string): DynamicToolContentItem {
  return { type: "inputText", text };
}

function imageItem(imageUrl: string): DynamicToolContentItem {
  return { type: "inputImage", imageUrl };
}

function successResponse(contentItems: ReadonlyArray<DynamicToolContentItem>): DynamicToolResponse {
  return {
    success: true,
    contentItems,
  };
}

function failureResponse(message: string): DynamicToolResponse {
  return {
    success: false,
    contentItems: [textItem(message)],
  };
}

function summarizeTargets(targets: ReadonlyArray<ComputerUseTarget>): string {
  return JSON.stringify(
    targets.map((target) => ({
      id: target.id,
      title: target.title,
      driver: target.driver,
      kind: target.kind,
      trustLevel: target.trustLevel,
      allowed: target.allowed,
      reason: target.reason,
    })),
  );
}

function summarizeSession(input: {
  readonly sessionId: string;
  readonly width: number;
  readonly height: number;
  readonly message: string;
}): string {
  return JSON.stringify({
    message: input.message,
    sessionId: input.sessionId,
    displaySize: {
      width: input.width,
      height: input.height,
    },
  });
}

export function makeComputerUseDynamicToolHandler(input: {
  readonly manager: ComputerUseManagerShape;
  readonly threadId: ThreadId;
  readonly providerInstanceId: ProviderInstanceId;
}): (params: EffectCodexSchema.DynamicToolCallParams) => Effect.Effect<DynamicToolResponse> {
  const { manager, providerInstanceId, threadId } = input;

  const resolveSessionId = (sessionId: string | undefined) =>
    Effect.gen(function* () {
      if (sessionId) {
        return ComputerUseSessionId.make(sessionId);
      }
      const snapshot = yield* manager.getSnapshot;
      const session = snapshot.sessions.find(
        (candidate) =>
          candidate.threadId === threadId &&
          candidate.providerId === providerInstanceId &&
          candidate.status === "active",
      );
      if (!session) {
        return undefined;
      }
      return session.id;
    });

  const responseWithLatestScreenshot = (input: {
    readonly sessionId: ComputerUseSessionId;
    readonly message: string;
  }) =>
    manager.getSnapshot.pipe(
      Effect.map((snapshot) => {
        const session = snapshot.sessions.find((candidate) => candidate.id === input.sessionId);
        const screenshot = session?.lastScreenshotId
          ? snapshot.screenshots.find((candidate) => candidate.id === session.lastScreenshotId)
          : undefined;
        const contentItems: DynamicToolContentItem[] = [
          textItem(
            summarizeSession({
              sessionId: input.sessionId,
              width: session?.displaySize.width ?? screenshot?.width ?? 0,
              height: session?.displaySize.height ?? screenshot?.height ?? 0,
              message: input.message,
            }),
          ),
        ];
        if (screenshot?.dataUrl) {
          contentItems.push(imageItem(screenshot.dataUrl));
        }
        return successResponse(contentItems);
      }),
    );

  const runTool = (args: ComputerUseToolArguments) =>
    Effect.gen(function* () {
      switch (args.operation) {
        case "status": {
          const status = yield* manager.getStatus;
          return successResponse([textItem(JSON.stringify(status))]);
        }
        case "list_targets": {
          const targets = yield* manager.listTargets;
          return successResponse([textItem(summarizeTargets(targets))]);
        }
        case "start_session": {
          const session = yield* manager.startSession({
            threadId,
            providerId: providerInstanceId,
            reason: args.reason ?? "Computer-use session requested by Codex.",
            ...(args.driver ? { driver: args.driver } : {}),
            ...(args.targetId ? { targetId: ComputerUseTargetId.make(args.targetId) } : {}),
            ...(args.targetHint ? { targetHint: args.targetHint } : {}),
          });
          return yield* responseWithLatestScreenshot({
            sessionId: session.id,
            message: "Computer-use session started.",
          });
        }
        case "screenshot": {
          const sessionId = yield* resolveSessionId(args.sessionId);
          if (!sessionId) {
            return failureResponse("No active computer-use session. Call start_session first.");
          }
          yield* manager.captureScreenshot({ sessionId });
          return yield* responseWithLatestScreenshot({
            sessionId,
            message: "Computer-use screenshot captured.",
          });
        }
        case "execute_actions": {
          const sessionId = yield* resolveSessionId(args.sessionId);
          if (!sessionId) {
            return failureResponse("No active computer-use session. Call start_session first.");
          }
          const actions = args.actions ?? (args.action ? [args.action] : []);
          if (actions.length === 0) {
            return failureResponse("execute_actions requires action or actions.");
          }
          yield* manager.executeActions({ sessionId, actions });
          return yield* responseWithLatestScreenshot({
            sessionId,
            message: "Computer-use actions executed.",
          });
        }
        case "stop_session": {
          const sessionId = yield* resolveSessionId(args.sessionId);
          if (!sessionId) {
            return failureResponse("No active computer-use session to stop.");
          }
          yield* manager.stopSession({
            sessionId,
            reason: args.reason ?? "Computer-use session stopped by Codex.",
          });
          return successResponse([
            textItem(JSON.stringify({ message: "Computer-use session stopped.", sessionId })),
          ]);
        }
      }
    });

  return (params) => {
    if (!isComputerUseDynamicTool(params)) {
      return Effect.succeed(failureResponse(`Unsupported dynamic tool: ${params.tool}.`));
    }
    return decodeComputerUseToolArguments(params.arguments).pipe(
      Effect.flatMap(runTool),
      Effect.catch((cause) =>
        Effect.succeed(
          failureResponse(cause instanceof Error ? cause.message : "Computer-use tool failed."),
        ),
      ),
    );
  };
}
