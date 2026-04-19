import type {
  MessageId,
  OrchestrationThreadActivity,
  ProjectId,
  ThreadId,
  TurnId,
} from "@t3tools/contracts";
import {
  derivePendingApprovals,
  derivePendingUserInputs,
  findLatestProposedPlan,
  hasActionableProposedPlan,
} from "../session-logic";
import type {
  ChatMessage,
  Project,
  ProposedPlan,
  SidebarThreadSummary,
  Thread,
  ThreadSession,
  ThreadShell,
  ThreadTurnState,
  TurnDiffSummary,
} from "../types";
import { getThreadFromEnvironmentState } from "../threadDerivation";
import { buildActivitySlice } from "./activityProjection";
import { buildTurnDiffSlice } from "./checkpointProjection";
import {
  EMPTY_THREAD_IDS,
  appendId,
  arraysEqual,
  removeId,
  type EnvironmentState,
} from "./environmentState";
import { buildMessageSlice, getLatestUserMessageAt } from "./messageProjection";
import { buildProposedPlanSlice } from "./proposedPlanProjection";

export function toThreadShell(thread: Thread): ThreadShell {
  return {
    id: thread.id,
    environmentId: thread.environmentId,
    codexThreadId: thread.codexThreadId,
    projectId: thread.projectId,
    title: thread.title,
    modelSelection: thread.modelSelection,
    runtimeMode: thread.runtimeMode,
    interactionMode: thread.interactionMode,
    error: thread.error,
    createdAt: thread.createdAt,
    archivedAt: thread.archivedAt,
    updatedAt: thread.updatedAt,
    branch: thread.branch,
    worktreePath: thread.worktreePath,
  };
}

export function toThreadTurnState(thread: Thread): ThreadTurnState {
  return {
    latestTurn: thread.latestTurn,
    ...(thread.pendingSourceProposedPlan
      ? { pendingSourceProposedPlan: thread.pendingSourceProposedPlan }
      : {}),
  };
}

export function buildLatestTurn(params: {
  previous: Thread["latestTurn"];
  turnId: NonNullable<Thread["latestTurn"]>["turnId"];
  state: NonNullable<Thread["latestTurn"]>["state"];
  requestedAt: string;
  startedAt: string | null;
  completedAt: string | null;
  assistantMessageId: NonNullable<Thread["latestTurn"]>["assistantMessageId"];
  sourceProposedPlan?: Thread["pendingSourceProposedPlan"];
}): NonNullable<Thread["latestTurn"]> {
  const resolvedPlan =
    params.previous?.turnId === params.turnId
      ? params.previous.sourceProposedPlan
      : params.sourceProposedPlan;
  return {
    turnId: params.turnId,
    state: params.state,
    requestedAt: params.requestedAt,
    startedAt: params.startedAt,
    completedAt: params.completedAt,
    assistantMessageId: params.assistantMessageId,
    ...(resolvedPlan ? { sourceProposedPlan: resolvedPlan } : {}),
  };
}

export function buildSidebarThreadSummary(thread: Thread): SidebarThreadSummary {
  return {
    id: thread.id,
    environmentId: thread.environmentId,
    projectId: thread.projectId,
    title: thread.title,
    interactionMode: thread.interactionMode,
    session: thread.session,
    createdAt: thread.createdAt,
    archivedAt: thread.archivedAt,
    updatedAt: thread.updatedAt,
    latestTurn: thread.latestTurn,
    branch: thread.branch,
    worktreePath: thread.worktreePath,
    latestUserMessageAt: getLatestUserMessageAt(thread.messages),
    hasPendingApprovals: derivePendingApprovals(thread.activities).length > 0,
    hasPendingUserInput: derivePendingUserInputs(thread.activities).length > 0,
    hasActionableProposedPlan: hasActionableProposedPlan(
      findLatestProposedPlan(thread.proposedPlans, thread.latestTurn?.turnId ?? null),
    ),
  };
}

function sidebarThreadSummariesEqual(
  left: SidebarThreadSummary | undefined,
  right: SidebarThreadSummary,
): boolean {
  return (
    left !== undefined &&
    left.id === right.id &&
    left.projectId === right.projectId &&
    left.title === right.title &&
    left.interactionMode === right.interactionMode &&
    left.session === right.session &&
    left.createdAt === right.createdAt &&
    left.archivedAt === right.archivedAt &&
    left.updatedAt === right.updatedAt &&
    left.latestTurn === right.latestTurn &&
    left.branch === right.branch &&
    left.worktreePath === right.worktreePath &&
    left.latestUserMessageAt === right.latestUserMessageAt &&
    left.hasPendingApprovals === right.hasPendingApprovals &&
    left.hasPendingUserInput === right.hasPendingUserInput &&
    left.hasActionableProposedPlan === right.hasActionableProposedPlan
  );
}

function threadShellsEqual(left: ThreadShell | undefined, right: ThreadShell): boolean {
  return (
    left !== undefined &&
    left.id === right.id &&
    left.environmentId === right.environmentId &&
    left.codexThreadId === right.codexThreadId &&
    left.projectId === right.projectId &&
    left.title === right.title &&
    left.modelSelection === right.modelSelection &&
    left.runtimeMode === right.runtimeMode &&
    left.interactionMode === right.interactionMode &&
    left.error === right.error &&
    left.createdAt === right.createdAt &&
    left.archivedAt === right.archivedAt &&
    left.updatedAt === right.updatedAt &&
    left.branch === right.branch &&
    left.worktreePath === right.worktreePath
  );
}

function threadTurnStatesEqual(left: ThreadTurnState | undefined, right: ThreadTurnState): boolean {
  return (
    left !== undefined &&
    left.latestTurn === right.latestTurn &&
    left.pendingSourceProposedPlan === right.pendingSourceProposedPlan
  );
}

export function buildThreadState(
  threads: ReadonlyArray<Thread>,
): Pick<
  EnvironmentState,
  | "threadIds"
  | "threadIdsByProjectId"
  | "threadShellById"
  | "threadSessionById"
  | "threadTurnStateById"
  | "messageIdsByThreadId"
  | "messageByThreadId"
  | "activityIdsByThreadId"
  | "activityByThreadId"
  | "proposedPlanIdsByThreadId"
  | "proposedPlanByThreadId"
  | "turnDiffIdsByThreadId"
  | "turnDiffSummaryByThreadId"
  | "sidebarThreadSummaryById"
> {
  const threadIds: ThreadId[] = [];
  const threadIdsByProjectId: Record<ProjectId, ThreadId[]> = {};
  const threadShellById: Record<ThreadId, ThreadShell> = {};
  const threadSessionById: Record<ThreadId, ThreadSession | null> = {};
  const threadTurnStateById: Record<ThreadId, ThreadTurnState> = {};
  const messageIdsByThreadId: Record<ThreadId, MessageId[]> = {};
  const messageByThreadId: Record<ThreadId, Record<MessageId, ChatMessage>> = {};
  const activityIdsByThreadId: Record<ThreadId, string[]> = {};
  const activityByThreadId: Record<ThreadId, Record<string, OrchestrationThreadActivity>> = {};
  const proposedPlanIdsByThreadId: Record<ThreadId, string[]> = {};
  const proposedPlanByThreadId: Record<ThreadId, Record<string, ProposedPlan>> = {};
  const turnDiffIdsByThreadId: Record<ThreadId, TurnId[]> = {};
  const turnDiffSummaryByThreadId: Record<ThreadId, Record<TurnId, TurnDiffSummary>> = {};
  const sidebarThreadSummaryById: Record<ThreadId, SidebarThreadSummary> = {};

  for (const thread of threads) {
    threadIds.push(thread.id);
    threadIdsByProjectId[thread.projectId] = [
      ...(threadIdsByProjectId[thread.projectId] ?? EMPTY_THREAD_IDS),
      thread.id,
    ];
    threadShellById[thread.id] = toThreadShell(thread);
    threadSessionById[thread.id] = thread.session;
    threadTurnStateById[thread.id] = toThreadTurnState(thread);
    const messageSlice = buildMessageSlice(thread);
    messageIdsByThreadId[thread.id] = messageSlice.ids;
    messageByThreadId[thread.id] = messageSlice.byId;
    const activitySlice = buildActivitySlice(thread);
    activityIdsByThreadId[thread.id] = activitySlice.ids;
    activityByThreadId[thread.id] = activitySlice.byId;
    const proposedPlanSlice = buildProposedPlanSlice(thread);
    proposedPlanIdsByThreadId[thread.id] = proposedPlanSlice.ids;
    proposedPlanByThreadId[thread.id] = proposedPlanSlice.byId;
    const turnDiffSlice = buildTurnDiffSlice(thread);
    turnDiffIdsByThreadId[thread.id] = turnDiffSlice.ids;
    turnDiffSummaryByThreadId[thread.id] = turnDiffSlice.byId;
    sidebarThreadSummaryById[thread.id] = buildSidebarThreadSummary(thread);
  }

  return {
    threadIds,
    threadIdsByProjectId,
    threadShellById,
    threadSessionById,
    threadTurnStateById,
    messageIdsByThreadId,
    messageByThreadId,
    activityIdsByThreadId,
    activityByThreadId,
    proposedPlanIdsByThreadId,
    proposedPlanByThreadId,
    turnDiffIdsByThreadId,
    turnDiffSummaryByThreadId,
    sidebarThreadSummaryById,
  };
}

export function getProjects(state: EnvironmentState): Project[] {
  return state.projectIds.flatMap((projectId) => {
    const project = state.projectById[projectId];
    return project ? [project] : [];
  });
}

export function getThreads(state: EnvironmentState): Thread[] {
  return state.threadIds.flatMap((threadId) => {
    const thread = getThreadFromEnvironmentState(state, threadId);
    return thread ? [thread] : [];
  });
}

export function writeThreadState(
  state: EnvironmentState,
  nextThread: Thread,
  previousThread?: Thread,
): EnvironmentState {
  const nextShell = toThreadShell(nextThread);
  const nextTurnState = toThreadTurnState(nextThread);
  const previousShell = state.threadShellById[nextThread.id];
  const previousTurnState = state.threadTurnStateById[nextThread.id];
  const previousSummary = state.sidebarThreadSummaryById[nextThread.id];
  const nextSummary = buildSidebarThreadSummary(nextThread);

  let nextState = state;

  if (!state.threadIds.includes(nextThread.id)) {
    nextState = {
      ...nextState,
      threadIds: [...nextState.threadIds, nextThread.id],
    };
  }

  const previousProjectId = previousThread?.projectId;
  const nextProjectId = nextThread.projectId;
  if (previousProjectId !== nextProjectId) {
    let threadIdsByProjectId = nextState.threadIdsByProjectId;
    if (previousProjectId) {
      const previousIds = threadIdsByProjectId[previousProjectId] ?? EMPTY_THREAD_IDS;
      const nextIds = removeId(previousIds, nextThread.id);
      if (nextIds.length === 0) {
        const { [previousProjectId]: _removed, ...rest } = threadIdsByProjectId;
        threadIdsByProjectId = rest as Record<ProjectId, ThreadId[]>;
      } else if (!arraysEqual(previousIds, nextIds)) {
        threadIdsByProjectId = {
          ...threadIdsByProjectId,
          [previousProjectId]: nextIds,
        };
      }
    }
    const projectThreadIds = threadIdsByProjectId[nextProjectId] ?? EMPTY_THREAD_IDS;
    const nextProjectThreadIds = appendId(projectThreadIds, nextThread.id);
    if (!arraysEqual(projectThreadIds, nextProjectThreadIds)) {
      threadIdsByProjectId = {
        ...threadIdsByProjectId,
        [nextProjectId]: nextProjectThreadIds,
      };
    }
    if (threadIdsByProjectId !== nextState.threadIdsByProjectId) {
      nextState = {
        ...nextState,
        threadIdsByProjectId,
      };
    }
  }

  if (!threadShellsEqual(previousShell, nextShell)) {
    nextState = {
      ...nextState,
      threadShellById: {
        ...nextState.threadShellById,
        [nextThread.id]: nextShell,
      },
    };
  }

  if ((previousThread?.session ?? null) !== nextThread.session) {
    nextState = {
      ...nextState,
      threadSessionById: {
        ...nextState.threadSessionById,
        [nextThread.id]: nextThread.session,
      },
    };
  }

  if (!threadTurnStatesEqual(previousTurnState, nextTurnState)) {
    nextState = {
      ...nextState,
      threadTurnStateById: {
        ...nextState.threadTurnStateById,
        [nextThread.id]: nextTurnState,
      },
    };
  }

  if (previousThread?.messages !== nextThread.messages) {
    const nextMessageSlice = buildMessageSlice(nextThread);
    nextState = {
      ...nextState,
      messageIdsByThreadId: {
        ...nextState.messageIdsByThreadId,
        [nextThread.id]: nextMessageSlice.ids,
      },
      messageByThreadId: {
        ...nextState.messageByThreadId,
        [nextThread.id]: nextMessageSlice.byId,
      },
    };
  }

  if (previousThread?.activities !== nextThread.activities) {
    const nextActivitySlice = buildActivitySlice(nextThread);
    nextState = {
      ...nextState,
      activityIdsByThreadId: {
        ...nextState.activityIdsByThreadId,
        [nextThread.id]: nextActivitySlice.ids,
      },
      activityByThreadId: {
        ...nextState.activityByThreadId,
        [nextThread.id]: nextActivitySlice.byId,
      },
    };
  }

  if (previousThread?.proposedPlans !== nextThread.proposedPlans) {
    const nextProposedPlanSlice = buildProposedPlanSlice(nextThread);
    nextState = {
      ...nextState,
      proposedPlanIdsByThreadId: {
        ...nextState.proposedPlanIdsByThreadId,
        [nextThread.id]: nextProposedPlanSlice.ids,
      },
      proposedPlanByThreadId: {
        ...nextState.proposedPlanByThreadId,
        [nextThread.id]: nextProposedPlanSlice.byId,
      },
    };
  }

  if (previousThread?.turnDiffSummaries !== nextThread.turnDiffSummaries) {
    const nextTurnDiffSlice = buildTurnDiffSlice(nextThread);
    nextState = {
      ...nextState,
      turnDiffIdsByThreadId: {
        ...nextState.turnDiffIdsByThreadId,
        [nextThread.id]: nextTurnDiffSlice.ids,
      },
      turnDiffSummaryByThreadId: {
        ...nextState.turnDiffSummaryByThreadId,
        [nextThread.id]: nextTurnDiffSlice.byId,
      },
    };
  }

  if (!sidebarThreadSummariesEqual(previousSummary, nextSummary)) {
    nextState = {
      ...nextState,
      sidebarThreadSummaryById: {
        ...nextState.sidebarThreadSummaryById,
        [nextThread.id]: nextSummary,
      },
    };
  }

  return nextState;
}

export function removeThreadState(state: EnvironmentState, threadId: ThreadId): EnvironmentState {
  const shell = state.threadShellById[threadId];
  if (!shell) {
    return state;
  }

  const nextThreadIds = removeId(state.threadIds, threadId);
  const currentProjectThreadIds = state.threadIdsByProjectId[shell.projectId] ?? EMPTY_THREAD_IDS;
  const nextProjectThreadIds = removeId(currentProjectThreadIds, threadId);
  const nextThreadIdsByProjectId =
    nextProjectThreadIds.length === 0
      ? (() => {
          const { [shell.projectId]: _removed, ...rest } = state.threadIdsByProjectId;
          return rest as Record<ProjectId, ThreadId[]>;
        })()
      : {
          ...state.threadIdsByProjectId,
          [shell.projectId]: nextProjectThreadIds,
        };

  const { [threadId]: _removedShell, ...threadShellById } = state.threadShellById;
  const { [threadId]: _removedSession, ...threadSessionById } = state.threadSessionById;
  const { [threadId]: _removedTurnState, ...threadTurnStateById } = state.threadTurnStateById;
  const { [threadId]: _removedMessageIds, ...messageIdsByThreadId } = state.messageIdsByThreadId;
  const { [threadId]: _removedMessages, ...messageByThreadId } = state.messageByThreadId;
  const { [threadId]: _removedActivityIds, ...activityIdsByThreadId } = state.activityIdsByThreadId;
  const { [threadId]: _removedActivities, ...activityByThreadId } = state.activityByThreadId;
  const { [threadId]: _removedPlanIds, ...proposedPlanIdsByThreadId } =
    state.proposedPlanIdsByThreadId;
  const { [threadId]: _removedPlans, ...proposedPlanByThreadId } = state.proposedPlanByThreadId;
  const { [threadId]: _removedTurnDiffIds, ...turnDiffIdsByThreadId } = state.turnDiffIdsByThreadId;
  const { [threadId]: _removedTurnDiffs, ...turnDiffSummaryByThreadId } =
    state.turnDiffSummaryByThreadId;
  const { [threadId]: _removedSidebarSummary, ...sidebarThreadSummaryById } =
    state.sidebarThreadSummaryById;

  return {
    ...state,
    threadIds: nextThreadIds,
    threadIdsByProjectId: nextThreadIdsByProjectId,
    threadShellById,
    threadSessionById,
    threadTurnStateById,
    messageIdsByThreadId,
    messageByThreadId,
    activityIdsByThreadId,
    activityByThreadId,
    proposedPlanIdsByThreadId,
    proposedPlanByThreadId,
    turnDiffIdsByThreadId,
    turnDiffSummaryByThreadId,
    sidebarThreadSummaryById,
  };
}

export function updateThreadState(
  state: EnvironmentState,
  threadId: ThreadId,
  updater: (thread: Thread) => Thread,
): EnvironmentState {
  const currentThread = getThreadFromEnvironmentState(state, threadId);
  if (!currentThread) {
    return state;
  }
  const nextThread = updater(currentThread);
  if (nextThread === currentThread) {
    return state;
  }
  return writeThreadState(state, nextThread, currentThread);
}
