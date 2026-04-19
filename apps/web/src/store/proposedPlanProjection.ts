import type { OrchestrationProposedPlan } from "@t3tools/contracts";
import type { ProposedPlan } from "../types";

export function mapProposedPlan(proposedPlan: OrchestrationProposedPlan): ProposedPlan {
  return {
    id: proposedPlan.id,
    turnId: proposedPlan.turnId,
    planMarkdown: proposedPlan.planMarkdown,
    implementedAt: proposedPlan.implementedAt,
    implementationThreadId: proposedPlan.implementationThreadId,
    createdAt: proposedPlan.createdAt,
    updatedAt: proposedPlan.updatedAt,
  };
}

export function buildProposedPlanSlice(thread: { proposedPlans: ReadonlyArray<ProposedPlan> }): {
  ids: string[];
  byId: Record<string, ProposedPlan>;
} {
  return {
    ids: thread.proposedPlans.map((plan) => plan.id),
    byId: Object.fromEntries(
      thread.proposedPlans.map((plan) => [plan.id, plan] as const),
    ) as Record<string, ProposedPlan>,
  };
}

export function retainThreadProposedPlansAfterRevert(
  proposedPlans: ReadonlyArray<ProposedPlan>,
  retainedTurnIds: ReadonlySet<string>,
): ProposedPlan[] {
  return proposedPlans.filter(
    (proposedPlan) => proposedPlan.turnId === null || retainedTurnIds.has(proposedPlan.turnId),
  );
}
