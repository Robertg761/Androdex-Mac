import type { EnvironmentId, MessageId, ProjectId, ThreadId, TurnId } from "@t3tools/contracts";
import type {
  ChatMessage,
  Project,
  ProposedPlan,
  SidebarThreadSummary,
  ThreadSession,
  ThreadShell,
  ThreadTurnState,
  TurnDiffSummary,
} from "../types";
import type { OrchestrationThreadActivity } from "@t3tools/contracts";

export interface EnvironmentState {
  projectIds: ProjectId[];
  projectById: Record<ProjectId, Project>;
  threadIds: ThreadId[];
  threadIdsByProjectId: Record<ProjectId, ThreadId[]>;
  threadShellById: Record<ThreadId, ThreadShell>;
  threadSessionById: Record<ThreadId, ThreadSession | null>;
  threadTurnStateById: Record<ThreadId, ThreadTurnState>;
  messageIdsByThreadId: Record<ThreadId, MessageId[]>;
  messageByThreadId: Record<ThreadId, Record<MessageId, ChatMessage>>;
  activityIdsByThreadId: Record<ThreadId, string[]>;
  activityByThreadId: Record<ThreadId, Record<string, OrchestrationThreadActivity>>;
  proposedPlanIdsByThreadId: Record<ThreadId, string[]>;
  proposedPlanByThreadId: Record<ThreadId, Record<string, ProposedPlan>>;
  turnDiffIdsByThreadId: Record<ThreadId, TurnId[]>;
  turnDiffSummaryByThreadId: Record<ThreadId, Record<TurnId, TurnDiffSummary>>;
  sidebarThreadSummaryById: Record<ThreadId, SidebarThreadSummary>;
  bootstrapComplete: boolean;
}

export interface AppState {
  activeEnvironmentId: EnvironmentId | null;
  environmentStateById: Record<string, EnvironmentState>;
}

export const initialEnvironmentState: EnvironmentState = {
  projectIds: [],
  projectById: {},
  threadIds: [],
  threadIdsByProjectId: {},
  threadShellById: {},
  threadSessionById: {},
  threadTurnStateById: {},
  messageIdsByThreadId: {},
  messageByThreadId: {},
  activityIdsByThreadId: {},
  activityByThreadId: {},
  proposedPlanIdsByThreadId: {},
  proposedPlanByThreadId: {},
  turnDiffIdsByThreadId: {},
  turnDiffSummaryByThreadId: {},
  sidebarThreadSummaryById: {},
  bootstrapComplete: false,
};

export const initialState: AppState = {
  activeEnvironmentId: null,
  environmentStateById: {},
};

export const EMPTY_THREAD_IDS: ThreadId[] = [];

export function arraysEqual<T>(left: readonly T[], right: readonly T[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

export function appendId<T extends string>(ids: readonly T[], id: T): T[] {
  return ids.includes(id) ? [...ids] : [...ids, id];
}

export function removeId<T extends string>(ids: readonly T[], id: T): T[] {
  return ids.filter((value) => value !== id);
}

export function getStoredEnvironmentState(
  state: AppState,
  environmentId: EnvironmentId,
): EnvironmentState {
  return state.environmentStateById[environmentId] ?? initialEnvironmentState;
}

export function commitEnvironmentState(
  state: AppState,
  environmentId: EnvironmentId,
  nextEnvironmentState: EnvironmentState,
): AppState {
  const currentEnvironmentState = state.environmentStateById[environmentId];
  const environmentStateById =
    currentEnvironmentState === nextEnvironmentState
      ? state.environmentStateById
      : {
          ...state.environmentStateById,
          [environmentId]: nextEnvironmentState,
        };

  if (environmentStateById === state.environmentStateById) {
    return state;
  }

  return {
    ...state,
    environmentStateById,
  };
}

export function getEnvironmentEntries(
  state: AppState,
): ReadonlyArray<readonly [EnvironmentId, EnvironmentState]> {
  return Object.entries(state.environmentStateById) as unknown as ReadonlyArray<
    readonly [EnvironmentId, EnvironmentState]
  >;
}
