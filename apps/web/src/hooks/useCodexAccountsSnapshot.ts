import type { CodexAccountsSnapshot } from "@t3tools/contracts";
import { startTransition, useEffect, useEffectEvent, useRef, useState } from "react";
import { ensureLocalApi } from "~/localApi";
import { useServerProviders, useServerSettings } from "~/rpc/serverState";

export function useCodexAccountsSnapshot(initialSnapshot: CodexAccountsSnapshot | null = null) {
  const serverSettings = useServerSettings();
  const codexProvider =
    useServerProviders().find((provider) => provider.provider === "codex") ?? null;
  const [snapshot, setSnapshot] = useState<CodexAccountsSnapshot | null>(initialSnapshot);
  const [isLoading, setIsLoading] = useState(initialSnapshot === null);
  const reloadPromiseRef = useRef<Promise<CodexAccountsSnapshot> | null>(null);

  const applySnapshot = useEffectEvent((nextSnapshot: CodexAccountsSnapshot | null) => {
    startTransition(() => {
      setSnapshot(nextSnapshot);
    });
  });

  const reloadSnapshot = useEffectEvent(async () => {
    if (reloadPromiseRef.current) {
      return reloadPromiseRef.current;
    }

    const reloadPromise = (async () => {
      setIsLoading(true);
      try {
        const nextSnapshot = await ensureLocalApi().server.listCodexAccounts();
        applySnapshot(nextSnapshot);
        return nextSnapshot;
      } finally {
        reloadPromiseRef.current = null;
        setIsLoading(false);
      }
    })();

    reloadPromiseRef.current = reloadPromise;

    return reloadPromise;
  });

  useEffect(() => {
    void reloadSnapshot();
  }, [
    codexProvider?.auth.status,
    codexProvider?.auth.type,
    codexProvider?.checkedAt,
    codexProvider?.status,
    serverSettings.providers.codex.homePath,
  ]);

  return {
    applySnapshot,
    isLoading,
    reloadSnapshot,
    snapshot,
  };
}
