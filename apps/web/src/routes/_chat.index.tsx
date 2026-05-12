import { createFileRoute } from "@tanstack/react-router";
import { PlusIcon } from "lucide-react";

import { AppLogo } from "../components/AppBranding";
import { NoActiveThreadState } from "../components/NoActiveThreadState";
import { Button } from "../components/ui/button";
import { SidebarInset, SidebarTrigger } from "../components/ui/sidebar";
import { useSavedEnvironmentRegistryStore } from "../environments/runtime";
import { APP_DISPLAY_NAME } from "~/branding";

function ChatIndexRouteView() {
  const { authGateState } = Route.useRouteContext();
  const savedEnvironmentCount = useSavedEnvironmentRegistryStore(
    (state) => Object.keys(state.byId).length,
  );

  if (authGateState.status === "hosted-static" && savedEnvironmentCount === 0) {
    return <HostedStaticOnboardingState />;
  }

  return <NoActiveThreadState />;
}

export const Route = createFileRoute("/_chat/")({
  component: ChatIndexRouteView,
});

function HostedStaticOnboardingState() {
  return (
    <SidebarInset className="h-dvh min-h-0 overflow-hidden overscroll-y-none bg-background text-foreground">
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-x-hidden bg-background">
        <header className="border-border/45 bg-background/70 px-3 py-2 backdrop-blur-xl sm:px-5 sm:py-3">
          <div className="flex items-center gap-2">
            <SidebarTrigger className="size-7 shrink-0 md:hidden" />
            <span className="text-sm font-medium text-foreground md:text-muted-foreground/60">
              {APP_DISPLAY_NAME}
            </span>
          </div>
        </header>

        <main className="grid min-h-0 flex-1 place-items-center px-5 py-10">
          <section className="flex w-full max-w-[32rem] flex-col items-center text-center">
            <AppLogo aria-hidden="true" className="mb-6 size-15" />
            <h1 className="text-3xl font-semibold tracking-normal text-foreground sm:text-4xl">
              Connect an environment
            </h1>
            <p className="mt-3 max-w-md text-sm leading-relaxed text-muted-foreground/78">
              Open a pairing link from your Androdex desktop app or add a reachable backend
              manually. Your saved environments stay in this browser.
            </p>
            <Button
              render={<a href="/settings/connections" />}
              size="sm"
              className="mt-7 rounded-full px-4"
            >
              <PlusIcon className="size-4" />
              Add environment
            </Button>
          </section>
        </main>
      </div>
    </SidebarInset>
  );
}
