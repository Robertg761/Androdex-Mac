import type {
  LocalWhisperModel,
  LocalWhisperModelId,
  LocalWhisperRuntimeStatus,
} from "@t3tools/contracts";
import {
  CheckIcon,
  DownloadIcon,
  LoaderCircleIcon,
  MicIcon,
  TriangleAlertIcon,
} from "lucide-react";

import { cn } from "~/lib/utils";
import { Button } from "../ui/button";

export interface LocalWhisperDownloadProgress {
  readonly modelId: LocalWhisperModelId;
  readonly downloadedBytes: number;
  readonly totalBytes: number;
  readonly percent: number;
}

interface LocalWhisperModelMenuProps {
  readonly open: boolean;
  readonly runtime: LocalWhisperRuntimeStatus | null;
  readonly models: readonly LocalWhisperModel[];
  readonly loading: boolean;
  readonly selectedModelId: LocalWhisperModelId | null;
  readonly downloadingModelId: LocalWhisperModelId | null;
  readonly downloadProgress: LocalWhisperDownloadProgress | null;
  readonly onClose: () => void;
  readonly onSelect: (model: LocalWhisperModel) => void;
}

function formatProgress(progress: LocalWhisperDownloadProgress): string {
  return `${Math.round(progress.percent)}%`;
}

function modelStatusLabel(input: {
  readonly model: LocalWhisperModel;
  readonly downloadingModelId: LocalWhisperModelId | null;
  readonly downloadProgress: LocalWhisperDownloadProgress | null;
}): string {
  if (input.downloadingModelId === input.model.id) {
    return input.downloadProgress ? formatProgress(input.downloadProgress) : "Starting";
  }
  if (input.model.installed) {
    return "Installed";
  }
  return "Download";
}

export function LocalWhisperModelMenu({
  open,
  runtime,
  models,
  loading,
  selectedModelId,
  downloadingModelId,
  downloadProgress,
  onClose,
  onSelect,
}: LocalWhisperModelMenuProps) {
  if (!open) {
    return null;
  }

  return (
    <div
      className="absolute bottom-full right-0 z-30 mb-2 flex w-[min(26rem,calc(100vw-2rem))] flex-col overflow-hidden rounded-md border bg-popover text-popover-foreground shadow-lg"
      data-local-whisper-model-menu="true"
      data-slot="popover-popup"
    >
      <div className="flex items-start gap-2 border-b px-3 py-2.5">
        <MicIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium">Local voice input</div>
          <div className="text-xs leading-5 text-muted-foreground">
            Choose the storage and accuracy tradeoff. Models are saved locally.
          </div>
        </div>
        <Button aria-label="Close model picker" size="xs" variant="ghost" onClick={onClose}>
          Close
        </Button>
      </div>
      {runtime && !runtime.available ? (
        <div className="flex gap-2 border-b border-amber-500/30 bg-amber-500/8 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
          <TriangleAlertIcon className="mt-0.5 size-3.5 shrink-0" />
          <div>{runtime.installHint}</div>
        </div>
      ) : null}
      <div className="max-h-80 overflow-y-auto p-1.5">
        {loading && models.length === 0 ? (
          <div className="px-2.5 py-6 text-center text-xs text-muted-foreground">
            Loading models
          </div>
        ) : null}
        {models.map((model) => {
          const isSelected = selectedModelId === model.id;
          const isDownloading = downloadingModelId === model.id;
          const statusLabel = modelStatusLabel({ model, downloadingModelId, downloadProgress });
          return (
            <button
              key={model.id}
              type="button"
              className={cn(
                "grid w-full grid-cols-[1fr_auto] gap-3 rounded-md px-2.5 py-2 text-left outline-none transition-colors hover:bg-accent focus-visible:bg-accent",
                isSelected && "bg-accent/70",
              )}
              disabled={downloadingModelId !== null && !isDownloading}
              onClick={() => onSelect(model)}
            >
              <span className="min-w-0">
                <span className="flex min-w-0 items-center gap-1.5">
                  <span className="truncate text-sm font-medium">{model.name}</span>
                  {model.recommended ? (
                    <span className="rounded border border-primary/20 bg-primary/8 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                      Recommended
                    </span>
                  ) : null}
                  {model.quantization ? (
                    <span className="rounded border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground">
                      {model.quantization}
                    </span>
                  ) : null}
                </span>
                <span className="mt-0.5 block text-xs leading-5 text-muted-foreground">
                  {model.diskLabel} / {model.language === "english" ? "English" : "Multilingual"}
                </span>
                <span className="mt-0.5 block text-xs leading-5 text-muted-foreground/90">
                  {model.description}
                </span>
                {isDownloading && downloadProgress ? (
                  <span className="mt-2 block h-1 overflow-hidden rounded-full bg-muted">
                    <span
                      className="block h-full bg-primary transition-[width]"
                      style={{ width: `${Math.max(2, Math.min(100, downloadProgress.percent))}%` }}
                    />
                  </span>
                ) : null}
              </span>
              <span className="mt-0.5 inline-flex min-w-20 items-center justify-end gap-1 text-xs text-muted-foreground">
                {isDownloading ? (
                  <LoaderCircleIcon className="size-3.5 animate-spin" />
                ) : model.installed ? (
                  <CheckIcon className="size-3.5 text-emerald-500" />
                ) : (
                  <DownloadIcon className="size-3.5" />
                )}
                {statusLabel}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
