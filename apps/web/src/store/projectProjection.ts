import type {
  EnvironmentId,
  OrchestrationReadModel,
  OrchestrationSession,
  OrchestrationSessionStatus,
  ProjectId,
  ProviderKind,
} from "@t3tools/contracts";
import { resolveModelSlugForProvider } from "@t3tools/shared/model";
import type { Project, ThreadSession } from "../types";
import type { EnvironmentState } from "./environmentState";

export function normalizeModelSelection<
  T extends { provider: "codex" | "claudeAgent"; model: string },
>(selection: T): T {
  return {
    ...selection,
    model: resolveModelSlugForProvider(selection.provider, selection.model),
  };
}

export function mapProjectScripts(
  scripts: ReadonlyArray<Project["scripts"][number]>,
): Project["scripts"] {
  return scripts.map((script) => ({ ...script }));
}

export function toLegacySessionStatus(
  status: OrchestrationSessionStatus,
): "connecting" | "ready" | "running" | "error" | "closed" {
  switch (status) {
    case "starting":
      return "connecting";
    case "running":
      return "running";
    case "error":
      return "error";
    case "ready":
    case "interrupted":
      return "ready";
    case "idle":
    case "stopped":
      return "closed";
  }
}

export function toLegacyProvider(providerName: string | null): ProviderKind {
  if (providerName === "codex" || providerName === "claudeAgent") {
    return providerName;
  }
  return "codex";
}

export function mapSession(session: OrchestrationSession): ThreadSession {
  return {
    provider: toLegacyProvider(session.providerName),
    status: toLegacySessionStatus(session.status),
    orchestrationStatus: session.status,
    activeTurnId: session.activeTurnId ?? undefined,
    createdAt: session.updatedAt,
    updatedAt: session.updatedAt,
    ...(session.lastError ? { lastError: session.lastError } : {}),
  };
}

export function mapProject(
  project: OrchestrationReadModel["projects"][number],
  environmentId: EnvironmentId,
): Project {
  return {
    id: project.id,
    environmentId,
    name: project.title,
    cwd: project.workspaceRoot,
    repositoryIdentity: project.repositoryIdentity ?? null,
    defaultModelSelection: project.defaultModelSelection
      ? normalizeModelSelection(project.defaultModelSelection)
      : null,
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
    scripts: mapProjectScripts(project.scripts),
  };
}

export function buildProjectState(
  projects: ReadonlyArray<Project>,
): Pick<EnvironmentState, "projectIds" | "projectById"> {
  return {
    projectIds: projects.map((project) => project.id),
    projectById: Object.fromEntries(
      projects.map((project) => [project.id, project] as const),
    ) as Record<ProjectId, Project>,
  };
}
