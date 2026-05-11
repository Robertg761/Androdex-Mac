import { FolderIcon } from "lucide-react";
import type { ComponentPropsWithoutRef } from "react";

import { cn } from "~/lib/utils";

export function CodexGlyph({ className, ...props }: ComponentPropsWithoutRef<"span">) {
  return (
    <span
      aria-hidden="true"
      className={cn("inline-flex shrink-0 items-center justify-center text-foreground", className)}
      {...props}
    >
      <svg className="size-full" fill="none" viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg">
        <path
          d="M18.4 38.5h12.2c7 0 12.2-4.5 12.2-10.6 0-5.2-3.8-9.4-9.2-10.3C32.5 12.7 28.1 9 22.8 9c-5.9 0-10.6 4.4-11.2 10.1C7.8 20.6 5.2 24 5.2 28c0 6 5.6 10.5 13.2 10.5Z"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="3.4"
        />
        <path
          d="M17.6 27.2 14.8 24l2.8-3.2M30.4 27.2 33.2 24l-2.8-3.2"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="3.2"
        />
        <path
          d="M21.2 31.2c1.7 1 3.9 1 5.6 0"
          stroke="currentColor"
          strokeLinecap="round"
          strokeWidth="3.2"
        />
      </svg>
    </span>
  );
}

export function CodexNewThreadHero({
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
      <CodexGlyph className="mb-5 size-16 text-foreground sm:size-18" />
      <h1 className="text-3xl font-semibold tracking-normal text-foreground sm:text-4xl">
        Let's build
      </h1>
      {projectName ? (
        <div className="mt-4 inline-flex max-w-full items-center gap-2 rounded-full bg-white/72 px-3 py-2 text-sm font-medium text-foreground shadow-sm ring-1 ring-black/5 backdrop-blur">
          <FolderIcon className="size-4 shrink-0 text-muted-foreground" />
          <span className="min-w-0 truncate">{projectName}</span>
        </div>
      ) : null}
    </div>
  );
}
