import { useCallback, useState } from "react";
import { type NavigateFn } from "@tanstack/react-router";
import type { ScopedThreadRef } from "@t3tools/contracts";
import { stripDiffSearchParams } from "../../diffRouteSearch";
import { buildThreadRouteParams } from "../../threadRoutes";

export function useDiffRouteState(input: {
  readonly threadRef: ScopedThreadRef | null | undefined;
  readonly diffOpen: boolean;
  readonly navigate: NavigateFn;
}) {
  const { diffOpen, navigate, threadRef } = input;
  const currentThreadKey = threadRef ? `${threadRef.environmentId}:${threadRef.threadId}` : null;
  const [diffPanelMountState, setDiffPanelMountState] = useState(() => ({
    threadKey: currentThreadKey,
    hasOpenedDiff: diffOpen,
  }));
  const hasOpenedDiff =
    diffPanelMountState.threadKey === currentThreadKey
      ? diffPanelMountState.hasOpenedDiff
      : diffOpen;

  const markDiffOpened = useCallback(() => {
    setDiffPanelMountState((previous) => {
      if (previous.threadKey === currentThreadKey && previous.hasOpenedDiff) {
        return previous;
      }
      return {
        threadKey: currentThreadKey,
        hasOpenedDiff: true,
      };
    });
  }, [currentThreadKey]);

  const closeDiff = useCallback(() => {
    if (!threadRef) {
      return;
    }
    void navigate({
      to: "/$environmentId/$threadId",
      params: buildThreadRouteParams(threadRef),
      search: { diff: undefined },
    });
  }, [navigate, threadRef]);

  const openDiff = useCallback(() => {
    if (!threadRef) {
      return;
    }
    markDiffOpened();
    void navigate({
      to: "/$environmentId/$threadId",
      params: buildThreadRouteParams(threadRef),
      search: (previous) => {
        const rest = stripDiffSearchParams(previous);
        return { ...rest, diff: "1" };
      },
    });
  }, [markDiffOpened, navigate, threadRef]);

  return {
    hasOpenedDiff,
    markDiffOpened,
    closeDiff,
    openDiff,
  };
}
