import { createFileRoute } from "@tanstack/react-router";
import { CalendarClockIcon, PlusIcon, RefreshCwIcon, Trash2Icon } from "lucide-react";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";

import {
  isProviderAvailable,
  type ProviderInstanceId,
  type ServerCodexAutomation,
  type ServerCodexAutomationsListResult,
  type ServerProvider,
} from "@t3tools/contracts";
import { CodexSectionPage } from "~/components/codex/CodexSectionPage";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import { Textarea } from "~/components/ui/textarea";
import { ensureLocalApi } from "~/localApi";
import { cn } from "~/lib/utils";
import { useServerProviders } from "~/rpc/serverState";

type AutomationDraft = {
  readonly id?: string;
  readonly name: string;
  readonly prompt: string;
  readonly status: "ACTIVE" | "PAUSED";
  readonly cwdsText: string;
  readonly rrule: string;
  readonly recurrencePreset: RecurrencePreset;
  readonly model: string;
  readonly reasoningEffort: string;
};

type RecurrencePreset = "daily" | "hourly" | "weekly" | "custom";

const RRULE_PRESETS: Record<Exclude<RecurrencePreset, "custom">, string> = {
  hourly: "FREQ=HOURLY;INTERVAL=1;BYMINUTE=0",
  daily: "FREQ=HOURLY;INTERVAL=24;BYMINUTE=0",
  weekly: "FREQ=WEEKLY;INTERVAL=1;BYDAY=MO;BYHOUR=9;BYMINUTE=0",
};

function providerLabel(provider: ServerProvider): string {
  return provider.displayName ?? provider.instanceId;
}

function recurrencePresetForRrule(rrule: string): RecurrencePreset {
  for (const [preset, presetRrule] of Object.entries(RRULE_PRESETS)) {
    if (rrule === presetRrule) {
      return preset as RecurrencePreset;
    }
  }
  return "custom";
}

function formatTimestamp(value: number | null): string {
  if (value === null) {
    return "Not scheduled";
  }
  const millis = value < 10_000_000_000 ? value * 1000 : value;
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(millis));
}

function draftFromAutomation(automation?: ServerCodexAutomation): AutomationDraft {
  if (!automation) {
    return {
      name: "",
      prompt: "",
      status: "ACTIVE",
      cwdsText: "",
      rrule: RRULE_PRESETS.daily,
      recurrencePreset: "daily",
      model: "",
      reasoningEffort: "",
    };
  }
  return {
    id: automation.id,
    name: automation.name,
    prompt: automation.prompt,
    status: automation.status,
    cwdsText: automation.cwds.join("\n"),
    rrule: automation.rrule,
    recurrencePreset: recurrencePresetForRrule(automation.rrule),
    model: automation.model ?? "",
    reasoningEffort: automation.reasoningEffort ?? "",
  };
}

function parseCwds(value: string): string[] {
  return value
    .split(/[\n,]/)
    .map((entry) => entry.trim())
    .filter((entry, index, entries) => entry.length > 0 && entries.indexOf(entry) === index);
}

function AutomationsRouteView() {
  const providers = useServerProviders();
  const codexProviders = useMemo(
    () =>
      providers.filter((provider) => provider.driver === "codex" && isProviderAvailable(provider)),
    [providers],
  );
  const [selectedInstanceId, setSelectedInstanceId] = useState<ProviderInstanceId | null>(null);
  const [automationsResult, setAutomationsResult] =
    useState<ServerCodexAutomationsListResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState<AutomationDraft | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (codexProviders.length === 0) {
      setSelectedInstanceId(null);
      return;
    }
    if (
      !selectedInstanceId ||
      !codexProviders.some((provider) => provider.instanceId === selectedInstanceId)
    ) {
      setSelectedInstanceId(codexProviders[0]?.instanceId ?? null);
    }
  }, [codexProviders, selectedInstanceId]);

  const selectedProvider =
    codexProviders.find((provider) => provider.instanceId === selectedInstanceId) ??
    codexProviders[0] ??
    null;

  const loadAutomations = useCallback(
    async (instanceId = selectedProvider?.instanceId) => {
      if (!instanceId) {
        setAutomationsResult(null);
        return;
      }
      const api = ensureLocalApi();
      if (!api.server.listCodexAutomations) {
        setErrorMessage("Codex automations are not available on this server.");
        return;
      }
      setLoading(true);
      setErrorMessage(null);
      try {
        const result = await api.server.listCodexAutomations({ instanceId });
        setAutomationsResult(result);
      } catch (cause) {
        setErrorMessage(cause instanceof Error ? cause.message : "Failed to load automations.");
      } finally {
        setLoading(false);
      }
    },
    [selectedProvider?.instanceId],
  );

  useEffect(() => {
    void loadAutomations(selectedProvider?.instanceId);
  }, [loadAutomations, selectedProvider?.instanceId]);

  async function saveDraft(draft: AutomationDraft) {
    if (!selectedProvider) {
      return;
    }
    const api = ensureLocalApi();
    if (!api.server.upsertCodexAutomation) {
      setErrorMessage("Codex automations are not available on this server.");
      return;
    }
    if (!draft.name.trim() || !draft.prompt.trim()) {
      setErrorMessage("Name and prompt are required.");
      return;
    }

    setSaving(true);
    setErrorMessage(null);
    try {
      const result = await api.server.upsertCodexAutomation({
        instanceId: selectedProvider.instanceId,
        automation: {
          ...(draft.id ? { id: draft.id } : {}),
          name: draft.name.trim(),
          prompt: draft.prompt.trim(),
          status: draft.status,
          nextRunAt: null,
          cwds: parseCwds(draft.cwdsText),
          rrule: draft.rrule.trim() || RRULE_PRESETS.daily,
          model: draft.model.trim() || null,
          reasoningEffort: draft.reasoningEffort.trim() || null,
        },
      });
      setAutomationsResult(result);
      setEditing(null);
    } catch (cause) {
      setErrorMessage(cause instanceof Error ? cause.message : "Failed to save automation.");
    } finally {
      setSaving(false);
    }
  }

  async function setAutomationStatus(
    automation: ServerCodexAutomation,
    status: "ACTIVE" | "PAUSED",
  ) {
    await saveDraft({
      ...draftFromAutomation(automation),
      status,
    });
  }

  async function deleteAutomation(automation: ServerCodexAutomation) {
    if (!selectedProvider) {
      return;
    }
    const api = ensureLocalApi();
    if (!api.server.deleteCodexAutomation) {
      setErrorMessage("Codex automations are not available on this server.");
      return;
    }
    const confirmed = await api.dialogs.confirm(`Delete automation "${automation.name}"?`);
    if (!confirmed) {
      return;
    }
    setSaving(true);
    setErrorMessage(null);
    try {
      const result = await api.server.deleteCodexAutomation({
        instanceId: selectedProvider.instanceId,
        id: automation.id,
      });
      setAutomationsResult(result);
    } catch (cause) {
      setErrorMessage(cause instanceof Error ? cause.message : "Failed to delete automation.");
    } finally {
      setSaving(false);
    }
  }

  const automations = automationsResult?.automations ?? [];
  const runs = automationsResult?.runs ?? [];

  return (
    <CodexSectionPage
      title="Automations"
      subtitle={automationsResult ? automationsResult.databasePath : "Codex automation database"}
      actions={
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => void loadAutomations()}
            disabled={!selectedProvider || loading}
          >
            <RefreshCwIcon className={cn("size-4", loading && "animate-spin")} />
            Refresh
          </Button>
          <Button
            size="sm"
            onClick={() => setEditing(draftFromAutomation())}
            disabled={!selectedProvider}
          >
            <PlusIcon className="size-4" />
            New
          </Button>
        </div>
      }
    >
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-4">
        <section className="flex flex-col gap-3 rounded-lg border border-border/60 bg-card/45 p-3 sm:flex-row sm:items-center">
          <Select
            value={selectedProvider?.instanceId ?? ""}
            onValueChange={(value) => setSelectedInstanceId(value as ProviderInstanceId)}
          >
            <SelectTrigger className="min-w-52 sm:w-64" size="sm">
              <SelectValue placeholder="Provider" />
            </SelectTrigger>
            <SelectContent>
              {codexProviders.map((provider) => (
                <SelectItem key={provider.instanceId} value={provider.instanceId}>
                  {providerLabel(provider)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
            <span>{automations.length} automations</span>
            <span>{runs.length} runs</span>
          </div>
        </section>

        {errorMessage ? (
          <p className="rounded-md border border-destructive/25 bg-destructive/5 px-3 py-2 text-sm text-destructive">
            {errorMessage}
          </p>
        ) : null}

        {editing ? (
          <AutomationEditor
            draft={editing}
            disabled={saving}
            onCancel={() => setEditing(null)}
            onChange={setEditing}
            onSave={() => void saveDraft(editing)}
          />
        ) : null}

        {!selectedProvider ? (
          <EmptyPanel>No Codex provider is available.</EmptyPanel>
        ) : automations.length === 0 ? (
          <EmptyPanel>No automations found.</EmptyPanel>
        ) : (
          <div className="grid gap-3">
            {automations.map((automation) => (
              <article
                key={automation.id}
                className="rounded-lg border border-border/60 bg-card/55 p-4 shadow-xs/5"
              >
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="min-w-0 truncate text-sm font-semibold text-foreground">
                        {automation.name}
                      </h2>
                      <Badge
                        variant={automation.status === "ACTIVE" ? "success" : "secondary"}
                        size="sm"
                      >
                        {automation.status === "ACTIVE" ? "Active" : "Paused"}
                      </Badge>
                    </div>
                    <p className="mt-2 line-clamp-2 text-sm leading-6 text-muted-foreground">
                      {automation.prompt}
                    </p>
                    <div className="mt-3 grid gap-2 text-xs text-muted-foreground sm:grid-cols-2">
                      <span className="flex min-w-0 items-center gap-2">
                        <CalendarClockIcon className="size-3.5 shrink-0" />
                        <span className="truncate">{formatTimestamp(automation.nextRunAt)}</span>
                      </span>
                      <span className="truncate font-mono">{automation.rrule}</span>
                    </div>
                    {automation.cwds.length > 0 ? (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {automation.cwds.map((cwd) => (
                          <Badge key={cwd} variant="outline" size="sm">
                            <span className="max-w-64 truncate font-mono">{cwd}</span>
                          </Badge>
                        ))}
                      </div>
                    ) : null}
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Button
                      size="xs"
                      variant="outline"
                      onClick={() =>
                        void setAutomationStatus(
                          automation,
                          automation.status === "ACTIVE" ? "PAUSED" : "ACTIVE",
                        )
                      }
                      disabled={saving}
                    >
                      {automation.status === "ACTIVE" ? "Pause" : "Resume"}
                    </Button>
                    <Button
                      size="xs"
                      variant="outline"
                      onClick={() => setEditing(draftFromAutomation(automation))}
                      disabled={saving}
                    >
                      Edit
                    </Button>
                    <Button
                      size="icon-xs"
                      variant="destructive-outline"
                      aria-label={`Delete ${automation.name}`}
                      onClick={() => void deleteAutomation(automation)}
                      disabled={saving}
                    >
                      <Trash2Icon className="size-3.5" />
                    </Button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}

        {runs.length > 0 ? (
          <section className="rounded-lg border border-border/60 bg-card/40 p-4">
            <h2 className="text-sm font-semibold text-foreground">Runs</h2>
            <div className="mt-3 divide-y divide-border/60">
              {runs.slice(0, 8).map((run) => (
                <div key={run.threadId} className="grid gap-1 py-3 text-sm sm:grid-cols-[1fr_auto]">
                  <span className="min-w-0 truncate text-foreground">
                    {run.threadTitle ?? run.inboxTitle ?? run.threadId}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {formatTimestamp(run.createdAt)}
                  </span>
                  {run.inboxSummary ? (
                    <p className="min-w-0 text-xs text-muted-foreground sm:col-span-2">
                      {run.inboxSummary}
                    </p>
                  ) : null}
                </div>
              ))}
            </div>
          </section>
        ) : null}
      </div>
    </CodexSectionPage>
  );
}

function EmptyPanel(props: { readonly children: string }) {
  return (
    <div className="rounded-lg border border-border/60 bg-card/35 px-4 py-10 text-center text-sm text-muted-foreground">
      {props.children}
    </div>
  );
}

function AutomationEditor(props: {
  readonly draft: AutomationDraft;
  readonly disabled: boolean;
  readonly onCancel: () => void;
  readonly onChange: (draft: AutomationDraft) => void;
  readonly onSave: () => void;
}) {
  const { draft } = props;
  const update = (patch: Partial<AutomationDraft>) => props.onChange({ ...draft, ...patch });

  return (
    <section className="rounded-lg border border-border/70 bg-card/65 p-4 shadow-xs/5">
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Name">
          <Input
            value={draft.name}
            onChange={(event) => update({ name: event.target.value })}
            disabled={props.disabled}
          />
        </Field>
        <Field label="Status">
          <Select
            value={draft.status}
            onValueChange={(value) => update({ status: value === "PAUSED" ? "PAUSED" : "ACTIVE" })}
          >
            <SelectTrigger size="sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ACTIVE">Active</SelectItem>
              <SelectItem value="PAUSED">Paused</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        <Field label="Prompt" className="md:col-span-2">
          <Textarea
            value={draft.prompt}
            onChange={(event) => update({ prompt: event.target.value })}
            disabled={props.disabled}
            className="min-h-32"
          />
        </Field>
        <Field label="Workspaces">
          <Textarea
            value={draft.cwdsText}
            onChange={(event) => update({ cwdsText: event.target.value })}
            disabled={props.disabled}
            className="min-h-24 font-mono text-xs"
          />
        </Field>
        <div className="grid gap-3">
          <Field label="Recurrence">
            <Select
              value={draft.recurrencePreset}
              onValueChange={(value) => {
                const recurrencePreset = (value as RecurrencePreset) || "custom";
                update({
                  recurrencePreset,
                  rrule:
                    recurrencePreset === "custom" ? draft.rrule : RRULE_PRESETS[recurrencePreset],
                });
              }}
            >
              <SelectTrigger size="sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="daily">Daily</SelectItem>
                <SelectItem value="hourly">Hourly</SelectItem>
                <SelectItem value="weekly">Weekly</SelectItem>
                <SelectItem value="custom">Custom</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label="RRULE">
            <Input
              value={draft.rrule}
              onChange={(event) =>
                update({ rrule: event.target.value, recurrencePreset: "custom" })
              }
              disabled={props.disabled}
              className="font-mono text-xs"
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Model">
              <Input
                value={draft.model}
                onChange={(event) => update({ model: event.target.value })}
                disabled={props.disabled}
              />
            </Field>
            <Field label="Reasoning">
              <Input
                value={draft.reasoningEffort}
                onChange={(event) => update({ reasoningEffort: event.target.value })}
                disabled={props.disabled}
              />
            </Field>
          </div>
        </div>
      </div>
      <div className="mt-4 flex justify-end gap-2">
        <Button size="sm" variant="outline" onClick={props.onCancel} disabled={props.disabled}>
          Cancel
        </Button>
        <Button size="sm" onClick={props.onSave} disabled={props.disabled}>
          Save
        </Button>
      </div>
    </section>
  );
}

function Field(props: {
  readonly label: string;
  readonly className?: string;
  readonly children: ReactNode;
}) {
  return (
    <div className={cn("grid gap-1.5", props.className)}>
      <Label className="text-xs font-medium text-muted-foreground">{props.label}</Label>
      {props.children}
    </div>
  );
}

export const Route = createFileRoute("/_chat/automations")({
  component: AutomationsRouteView,
});
