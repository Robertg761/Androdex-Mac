import type { DesktopThreadNotification } from "@t3tools/contracts";

import {
  derivePendingApprovals,
  derivePendingUserInputs,
  isLatestTurnSettled,
} from "./session-logic";
import type { Project, Thread } from "./types";

function hasPendingUserAttention(thread: Thread): boolean {
  return (
    derivePendingApprovals(thread.activities).length > 0 ||
    derivePendingUserInputs(thread.activities).length > 0
  );
}

function getCompletedTurnNotificationKey(thread: Thread): string | null {
  if (
    thread.latestTurn?.state !== "completed" ||
    !thread.latestTurn.completedAt ||
    !isLatestTurnSettled(thread.latestTurn, thread.session)
  ) {
    return null;
  }

  return `${thread.latestTurn.turnId}:${thread.latestTurn.completedAt}`;
}

function buildThreadNotificationBody(thread: Thread, project: Project | null | undefined): string {
  return project ? `${thread.title} in ${project.name}` : thread.title;
}

export function deriveThreadNotifications(input: {
  previousThread?: Thread;
  nextThread?: Thread;
  project?: Project | null;
}): DesktopThreadNotification[] {
  const nextThread = input.nextThread;
  if (!nextThread) {
    return [];
  }

  const nextNeedsInput = hasPendingUserAttention(nextThread);
  const previousNeedsInput = input.previousThread
    ? hasPendingUserAttention(input.previousThread)
    : false;
  if (nextNeedsInput && !previousNeedsInput) {
    return [
      {
        kind: "thread-input-required",
        environmentId: nextThread.environmentId,
        threadId: nextThread.id,
        title: "Thread needs input",
        body: buildThreadNotificationBody(nextThread, input.project),
      },
    ];
  }

  const nextCompletedTurnKey = getCompletedTurnNotificationKey(nextThread);
  if (nextCompletedTurnKey === null) {
    return [];
  }

  const previousCompletedTurnKey = input.previousThread
    ? getCompletedTurnNotificationKey(input.previousThread)
    : null;
  if (nextCompletedTurnKey === previousCompletedTurnKey) {
    return [];
  }

  return [
    {
      kind: "thread-finished",
      environmentId: nextThread.environmentId,
      threadId: nextThread.id,
      title: "Thread finished",
      body: buildThreadNotificationBody(nextThread, input.project),
    },
  ];
}
