import { useCallback } from "react";
import { PlusIcon } from "lucide-react";

import { CodexNewThreadHero } from "./CodexAppChrome";
import { SidebarInset, SidebarTrigger } from "./ui/sidebar";
import { getDesktopTitlebarStyle } from "../desktopShell";
import { isElectron } from "../env";
import { cn } from "~/lib/utils";
import { Button } from "./ui/button";
import { useHandleNewThread } from "../hooks/useHandleNewThread";
import { startNewThreadFromContext } from "../lib/chatThreadActions";
import { useSettings } from "../hooks/useSettings";
import { resolveSidebarNewThreadEnvMode } from "./Sidebar.logic";
import { useCommandPaletteStore } from "../commandPaletteStore";

export function NoActiveThreadState() {
  const { activeDraftThread, activeThread, defaultProjectRef, handleNewThread } =
    useHandleNewThread();
  const defaultThreadEnvMode = useSettings((s) => s.defaultThreadEnvMode);
  const openAddProject = useCommandPaletteStore((store) => store.openAddProject);
  const handleNewThreadClick = useCallback(() => {
    void startNewThreadFromContext({
      activeDraftThread,
      activeThread,
      defaultProjectRef,
      defaultThreadEnvMode: resolveSidebarNewThreadEnvMode({
        defaultEnvMode: defaultThreadEnvMode,
      }),
      handleNewThread,
    }).then((started) => {
      if (!started) {
        openAddProject();
      }
    });
  }, [
    activeDraftThread,
    activeThread,
    defaultProjectRef,
    defaultThreadEnvMode,
    handleNewThread,
    openAddProject,
  ]);

  return (
    <SidebarInset
      className="h-dvh min-h-0 overflow-hidden overscroll-y-none bg-background text-foreground"
      data-androdex-active-thread="false"
    >
      <div
        className="flex min-h-0 min-w-0 flex-1 flex-col overflow-x-hidden bg-background"
        data-androdex-role="thread-shell"
      >
        <header
          className={cn(
            "border-b border-border/40 bg-background/70 px-3 backdrop-blur-xl sm:px-5",
            isElectron
              ? "drag-region flex h-[52px] items-center wco:h-[env(titlebar-area-height)]"
              : "py-2 sm:py-3",
          )}
          data-androdex-role="thread-header"
          style={isElectron ? getDesktopTitlebarStyle() : undefined}
        >
          {isElectron ? (
            <span className="text-xs text-muted-foreground/50 wco:pr-[calc(100vw-env(titlebar-area-width)-env(titlebar-area-x)+1em)]">
              New thread
            </span>
          ) : (
            <div className="flex items-center gap-2">
              <SidebarTrigger className="size-7 shrink-0 md:hidden" />
              <span className="text-sm font-medium text-muted-foreground">New thread</span>
            </div>
          )}
        </header>

        <div className="flex min-h-0 flex-1 items-center justify-center px-6 pb-24 pt-10">
          <div className="flex w-full max-w-208 flex-col items-center">
            <CodexNewThreadHero projectName={null} />
            <Button className="mt-9 rounded-full px-5" size="lg" onClick={handleNewThreadClick}>
              <PlusIcon className="size-4" />
              New thread
            </Button>
          </div>
        </div>
      </div>
    </SidebarInset>
  );
}
