import type {
  EnvironmentId,
  OrchestrationEvent,
  OrchestrationReadModel,
  ScopedThreadRef,
  ThreadId,
} from "@t3tools/contracts";
import { create } from "zustand";
import { initialState, type AppState } from "./environmentState";
import {
  applyOrchestrationEvent,
  applyOrchestrationEvents,
  setActiveEnvironmentId,
  setError,
  setThreadBranch,
  syncServerReadModel,
} from "./threadProjection";

export * from "./environmentState";
export * from "./selectors";
export {
  applyOrchestrationEvent,
  applyOrchestrationEvents,
  setActiveEnvironmentId,
  setError,
  setThreadBranch,
  syncServerReadModel,
} from "./threadProjection";

interface AppStore extends AppState {
  setActiveEnvironmentId: (environmentId: EnvironmentId) => void;
  syncServerReadModel: (readModel: OrchestrationReadModel, environmentId: EnvironmentId) => void;
  applyOrchestrationEvent: (event: OrchestrationEvent, environmentId: EnvironmentId) => void;
  applyOrchestrationEvents: (
    events: ReadonlyArray<OrchestrationEvent>,
    environmentId: EnvironmentId,
  ) => void;
  setError: (threadId: ThreadId, error: string | null) => void;
  setThreadBranch: (
    threadRef: ScopedThreadRef,
    branch: string | null,
    worktreePath: string | null,
  ) => void;
}

export const useStore = create<AppStore>((set) => ({
  ...initialState,
  setActiveEnvironmentId: (environmentId) =>
    set((state) => setActiveEnvironmentId(state, environmentId)),
  syncServerReadModel: (readModel, environmentId) =>
    set((state) => syncServerReadModel(state, readModel, environmentId)),
  applyOrchestrationEvent: (event, environmentId) =>
    set((state) => applyOrchestrationEvent(state, event, environmentId)),
  applyOrchestrationEvents: (events, environmentId) =>
    set((state) => applyOrchestrationEvents(state, events, environmentId)),
  setError: (threadId, error) => set((state) => setError(state, threadId, error)),
  setThreadBranch: (threadRef, branch, worktreePath) =>
    set((state) => setThreadBranch(state, threadRef, branch, worktreePath)),
}));
