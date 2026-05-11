import type { ReactNode } from "react";

import { getDesktopTitlebarStyle } from "~/desktopShell";
import { isElectron } from "~/env";
import { cn } from "~/lib/utils";
import { SidebarInset, SidebarTrigger } from "~/components/ui/sidebar";

export function CodexSectionPage(props: {
  readonly title: string;
  readonly subtitle?: string;
  readonly actions?: ReactNode;
  readonly children: ReactNode;
}) {
  return (
    <SidebarInset className="h-dvh min-h-0 overflow-hidden overscroll-y-none bg-background text-foreground">
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-background">
        <header
          className={cn(
            "border-b border-border/45 bg-background/78 px-3 backdrop-blur-xl sm:px-5",
            isElectron
              ? "drag-region flex h-[52px] items-center wco:h-[env(titlebar-area-height)]"
              : "py-2.5 sm:py-3",
          )}
          style={isElectron ? getDesktopTitlebarStyle() : undefined}
        >
          <div className="flex min-w-0 flex-1 items-center gap-3">
            {!isElectron ? <SidebarTrigger className="size-7 shrink-0 md:hidden" /> : null}
            <div className="min-w-0 flex-1">
              <h1 className="truncate text-sm font-semibold text-foreground">{props.title}</h1>
              {props.subtitle ? (
                <p className="mt-0.5 truncate text-xs text-muted-foreground">{props.subtitle}</p>
              ) : null}
            </div>
            {props.actions ? <div className="no-drag shrink-0">{props.actions}</div> : null}
          </div>
        </header>
        <main className="min-h-0 flex-1 overflow-auto px-4 py-5 sm:px-6 lg:px-8">
          {props.children}
        </main>
      </div>
    </SidebarInset>
  );
}
