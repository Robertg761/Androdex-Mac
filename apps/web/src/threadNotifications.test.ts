import {
  EnvironmentId,
  EventId,
  MessageId,
  ProjectId,
  ThreadId,
  TurnId,
  type OrchestrationThreadActivity,
} from "@t3tools/contracts";
import { describe, expect, it } from "vitest";

import { deriveThreadNotifications } from "./threadNotifications";
import type { Project, Thread, ThreadSession } from "./types";

function makeActivity(overrides: {
  id?: string;
  createdAt?: string;
  kind?: string;
  summary?: string;
  tone?: OrchestrationThreadActivity["tone"];
  payload?: Record<string, unknown>;
}): OrchestrationThreadActivity {
  return {
    id: EventId.make(overrides.id ?? crypto.randomUUID()),
    createdAt: overrides.createdAt ?? "2026-04-13T00:00:00.000Z",
    kind: overrides.kind ?? "tool.started",
    summary: overrides.summary ?? "Tool call",
    tone: overrides.tone ?? "tool",
    payload: overrides.payload ?? {},
    turnId: null,
  };
}

function makeSession(overrides: Partial<ThreadSession> = {}): ThreadSession {
  return {
    provider: "codex",
    status: "ready",
    createdAt: "2026-04-13T00:00:00.000Z",
    updatedAt: "2026-04-13T00:00:00.000Z",
    orchestrationStatus: "ready",
    ...overrides,
  };
}

function makeThread(overrides: Partial<Thread> = {}): Thread {
  return {
    id: ThreadId.make("thread-1"),
    environmentId: EnvironmentId.make("environment-local"),
    codexThreadId: null,
    projectId: ProjectId.make("project-1"),
    title: "Implement notifications",
    modelSelection: {
      provider: "codex",
      model: "gpt-5.4",
    },
    runtimeMode: "full-access",
    interactionMode: "default",
    session: makeSession(),
    messages: [],
    proposedPlans: [],
    error: null,
    createdAt: "2026-04-13T00:00:00.000Z",
    archivedAt: null,
    updatedAt: "2026-04-13T00:00:00.000Z",
    latestTurn: null,
    branch: null,
    worktreePath: null,
    turnDiffSummaries: [],
    activities: [],
    ...overrides,
  };
}

const project: Project = {
  id: ProjectId.make("project-1"),
  environmentId: EnvironmentId.make("environment-local"),
  name: "Local environment",
  cwd: "/tmp/project",
  defaultModelSelection: null,
  scripts: [],
};

describe("deriveThreadNotifications", () => {
  it("notifies when a thread starts requiring user input", () => {
    const nextThread = makeThread({
      activities: [
        makeActivity({
          id: "approval-1",
          kind: "approval.requested",
          summary: "Command approval requested",
          tone: "approval",
          payload: {
            requestId: "req-1",
            requestKind: "command",
            detail: "bun lint",
          },
        }),
      ],
    });

    expect(deriveThreadNotifications({ nextThread, project })).toEqual([
      {
        kind: "thread-input-required",
        environmentId: EnvironmentId.make("environment-local"),
        threadId: ThreadId.make("thread-1"),
        title: "Thread needs input",
        body: "Implement notifications in Local environment",
      },
    ]);
  });

  it("notifies when a running turn completes", () => {
    const previousThread = makeThread({
      session: makeSession({
        status: "running",
        orchestrationStatus: "running",
        activeTurnId: TurnId.make("turn-1"),
      }),
      latestTurn: {
        turnId: TurnId.make("turn-1"),
        state: "running",
        requestedAt: "2026-04-13T00:00:00.000Z",
        startedAt: "2026-04-13T00:00:01.000Z",
        completedAt: null,
        assistantMessageId: null,
      },
    });
    const nextThread = makeThread({
      session: makeSession({
        status: "ready",
        orchestrationStatus: "ready",
      }),
      latestTurn: {
        turnId: TurnId.make("turn-1"),
        state: "completed",
        requestedAt: "2026-04-13T00:00:00.000Z",
        startedAt: "2026-04-13T00:00:01.000Z",
        completedAt: "2026-04-13T00:00:05.000Z",
        assistantMessageId: MessageId.make("message-1"),
      },
    });

    expect(deriveThreadNotifications({ previousThread, nextThread, project })).toEqual([
      {
        kind: "thread-finished",
        environmentId: EnvironmentId.make("environment-local"),
        threadId: ThreadId.make("thread-1"),
        title: "Thread finished",
        body: "Implement notifications in Local environment",
      },
    ]);
  });

  it("does not re-notify for the same completed turn", () => {
    const previousThread = makeThread({
      latestTurn: {
        turnId: TurnId.make("turn-1"),
        state: "completed",
        requestedAt: "2026-04-13T00:00:00.000Z",
        startedAt: "2026-04-13T00:00:01.000Z",
        completedAt: "2026-04-13T00:00:05.000Z",
        assistantMessageId: MessageId.make("message-1"),
      },
    });
    const nextThread = makeThread({
      latestTurn: {
        turnId: TurnId.make("turn-1"),
        state: "completed",
        requestedAt: "2026-04-13T00:00:00.000Z",
        startedAt: "2026-04-13T00:00:01.000Z",
        completedAt: "2026-04-13T00:00:05.000Z",
        assistantMessageId: MessageId.make("message-1"),
      },
      updatedAt: "2026-04-13T00:00:06.000Z",
    });

    expect(deriveThreadNotifications({ previousThread, nextThread, project })).toEqual([]);
  });

  it("prefers the actionable input-required notification when both states appear together", () => {
    const previousThread = makeThread({
      session: makeSession({
        status: "running",
        orchestrationStatus: "running",
        activeTurnId: TurnId.make("turn-1"),
      }),
      latestTurn: {
        turnId: TurnId.make("turn-1"),
        state: "running",
        requestedAt: "2026-04-13T00:00:00.000Z",
        startedAt: "2026-04-13T00:00:01.000Z",
        completedAt: null,
        assistantMessageId: null,
      },
    });
    const nextThread = makeThread({
      latestTurn: {
        turnId: TurnId.make("turn-1"),
        state: "completed",
        requestedAt: "2026-04-13T00:00:00.000Z",
        startedAt: "2026-04-13T00:00:01.000Z",
        completedAt: "2026-04-13T00:00:05.000Z",
        assistantMessageId: MessageId.make("message-1"),
      },
      activities: [
        makeActivity({
          id: "user-input-1",
          kind: "user-input.requested",
          summary: "User input requested",
          tone: "info",
          payload: {
            requestId: "req-user-input-1",
            questions: [
              {
                id: "approval",
                header: "Approval",
                question: "Continue?",
                options: [
                  {
                    label: "Yes",
                    description: "Continue execution",
                  },
                ],
              },
            ],
          },
        }),
      ],
    });

    expect(deriveThreadNotifications({ previousThread, nextThread, project })).toEqual([
      {
        kind: "thread-input-required",
        environmentId: EnvironmentId.make("environment-local"),
        threadId: ThreadId.make("thread-1"),
        title: "Thread needs input",
        body: "Implement notifications in Local environment",
      },
    ]);
  });
});
