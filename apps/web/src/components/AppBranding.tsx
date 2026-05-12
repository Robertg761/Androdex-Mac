import { FolderIcon } from "lucide-react";
import type { ComponentPropsWithoutRef } from "react";

import { cn } from "~/lib/utils";

export function AppLogo({ className, alt = "", ...props }: ComponentPropsWithoutRef<"img">) {
  return (
    <img
      alt={alt}
      className={cn("inline-block shrink-0 rounded-md object-contain", className)}
      draggable={false}
      src="/apple-touch-icon.png"
      {...props}
    />
  );
}

export function AppNewThreadHero({
  projectName,
  className,
}: {
  projectName: string | null | undefined;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "pointer-events-none flex flex-col items-center justify-center px-6 text-center",
        className,
      )}
    >
      <AppLogo aria-hidden="true" className="mb-5 size-16 sm:size-18" />
      <h1 className="text-3xl font-semibold tracking-normal text-foreground sm:text-4xl">
        Let's build
      </h1>
      {projectName ? (
        <div className="mt-4 inline-flex max-w-full items-center gap-2 rounded-md border border-border/65 bg-card/80 px-3 py-2 text-sm font-medium text-foreground shadow-[0_1px_2px_rgb(0_0_0_/_0.05)] backdrop-blur">
          <FolderIcon className="size-4 shrink-0 text-muted-foreground" />
          <span className="min-w-0 truncate">{projectName}</span>
        </div>
      ) : null}
    </div>
  );
}
