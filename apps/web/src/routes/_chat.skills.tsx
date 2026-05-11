import { createFileRoute } from "@tanstack/react-router";
import { RefreshCwIcon, SearchIcon } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import {
  isProviderAvailable,
  type ProviderInstanceId,
  type ServerProvider,
  type ServerProviderSkill,
} from "@t3tools/contracts";
import { CodexSectionPage } from "~/components/codex/CodexSectionPage";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import { Switch } from "~/components/ui/switch";
import { ensureLocalApi } from "~/localApi";
import { cn } from "~/lib/utils";
import {
  formatProviderSkillDisplayName,
  formatProviderSkillInstallSource,
} from "~/providerSkillPresentation";
import { applyProvidersUpdated, useServerProviders } from "~/rpc/serverState";

type SkillStatusFilter = "all" | "enabled" | "disabled";

function providerLabel(provider: ServerProvider): string {
  return provider.displayName ?? provider.instanceId;
}

function skillKey(skill: ServerProviderSkill): string {
  return `${skill.path}\u0000${skill.name}`;
}

function skillMatchesQuery(skill: ServerProviderSkill, query: string): boolean {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) {
    return true;
  }
  const haystack = [
    skill.name,
    formatProviderSkillDisplayName(skill),
    skill.shortDescription ?? "",
    skill.description ?? "",
    skill.scope ?? "",
    skill.path,
  ]
    .join("\n")
    .toLowerCase();
  return haystack.includes(normalizedQuery);
}

function SkillsRouteView() {
  const providers = useServerProviders();
  const codexProviders = useMemo(
    () =>
      providers.filter((provider) => provider.driver === "codex" && isProviderAvailable(provider)),
    [providers],
  );
  const [selectedInstanceId, setSelectedInstanceId] = useState<ProviderInstanceId | null>(null);
  const [statusFilter, setStatusFilter] = useState<SkillStatusFilter>("all");
  const [query, setQuery] = useState("");
  const [pendingSkillKeys, setPendingSkillKeys] = useState<ReadonlySet<string>>(() => new Set());
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

  const filteredSkills = useMemo(() => {
    const skills = selectedProvider?.skills ?? [];
    return skills
      .filter((skill) => {
        if (statusFilter === "enabled") {
          return skill.enabled;
        }
        if (statusFilter === "disabled") {
          return !skill.enabled;
        }
        return true;
      })
      .filter((skill) => skillMatchesQuery(skill, query))
      .toSorted((left, right) =>
        formatProviderSkillDisplayName(left).localeCompare(formatProviderSkillDisplayName(right)),
      );
  }, [query, selectedProvider?.skills, statusFilter]);

  const enabledCount = selectedProvider?.skills.filter((skill) => skill.enabled).length ?? 0;
  const totalCount = selectedProvider?.skills.length ?? 0;

  async function refreshProvider() {
    if (!selectedProvider) {
      return;
    }
    setErrorMessage(null);
    try {
      const result = await ensureLocalApi().server.refreshProviders({
        instanceId: selectedProvider.instanceId,
      });
      applyProvidersUpdated(result);
    } catch (cause) {
      setErrorMessage(cause instanceof Error ? cause.message : "Failed to refresh skills.");
    }
  }

  async function setSkillEnabled(skill: ServerProviderSkill, enabled: boolean) {
    if (!selectedProvider) {
      return;
    }
    const api = ensureLocalApi();
    if (!api.server.setProviderSkillEnabled) {
      setErrorMessage("Skill configuration is not available on this server.");
      return;
    }

    const key = skillKey(skill);
    setPendingSkillKeys((previous) => new Set(previous).add(key));
    setErrorMessage(null);
    try {
      const result = await api.server.setProviderSkillEnabled({
        instanceId: selectedProvider.instanceId,
        name: skill.name,
        path: skill.path,
        enabled,
      });
      applyProvidersUpdated({ providers: result.providers });
    } catch (cause) {
      setErrorMessage(cause instanceof Error ? cause.message : "Failed to update skill.");
    } finally {
      setPendingSkillKeys((previous) => {
        const next = new Set(previous);
        next.delete(key);
        return next;
      });
    }
  }

  return (
    <CodexSectionPage
      title="Skills"
      subtitle={
        selectedProvider ? `${enabledCount} enabled / ${totalCount} installed` : "No Codex provider"
      }
      actions={
        <Button size="sm" variant="outline" onClick={refreshProvider} disabled={!selectedProvider}>
          <RefreshCwIcon className="size-4" />
          Refresh
        </Button>
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

          <Select
            value={statusFilter}
            onValueChange={(value) => setStatusFilter((value as SkillStatusFilter) || "all")}
          >
            <SelectTrigger className="min-w-36 sm:w-40" size="sm">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="enabled">Enabled</SelectItem>
              <SelectItem value="disabled">Disabled</SelectItem>
            </SelectContent>
          </Select>

          <div className="relative min-w-0 flex-1">
            <SearchIcon className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground/70" />
            <Input
              className="h-8 pl-8"
              placeholder="Search skills"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>
        </section>

        {errorMessage ? (
          <p className="rounded-md border border-destructive/25 bg-destructive/5 px-3 py-2 text-sm text-destructive">
            {errorMessage}
          </p>
        ) : null}

        {!selectedProvider ? (
          <div className="rounded-lg border border-border/60 bg-card/35 px-4 py-10 text-center text-sm text-muted-foreground">
            No Codex provider is available.
          </div>
        ) : filteredSkills.length === 0 ? (
          <div className="rounded-lg border border-border/60 bg-card/35 px-4 py-10 text-center text-sm text-muted-foreground">
            No skills match the current filters.
          </div>
        ) : (
          <div className="grid gap-3">
            {filteredSkills.map((skill) => {
              const key = skillKey(skill);
              const source = formatProviderSkillInstallSource(skill);
              const pending = pendingSkillKeys.has(key);
              return (
                <article
                  key={key}
                  className={cn(
                    "rounded-lg border border-border/60 bg-card/55 p-4 shadow-xs/5",
                    !skill.enabled && "bg-muted/20",
                  )}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="min-w-0 truncate text-sm font-semibold text-foreground">
                          {formatProviderSkillDisplayName(skill)}
                        </h2>
                        <Badge variant={skill.enabled ? "default" : "secondary"} size="sm">
                          {skill.enabled ? "Enabled" : "Disabled"}
                        </Badge>
                        {source ? (
                          <Badge variant="outline" size="sm">
                            {source}
                          </Badge>
                        ) : null}
                      </div>
                      <p className="mt-1 text-sm leading-6 text-muted-foreground">
                        {skill.shortDescription ?? skill.description ?? skill.name}
                      </p>
                      <p className="mt-3 truncate font-mono text-[11px] text-muted-foreground/70">
                        {skill.path}
                      </p>
                    </div>
                    <Switch
                      checked={skill.enabled}
                      disabled={pending}
                      aria-label={`${formatProviderSkillDisplayName(skill)} enabled`}
                      onCheckedChange={(checked) => void setSkillEnabled(skill, Boolean(checked))}
                    />
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>
    </CodexSectionPage>
  );
}

export const Route = createFileRoute("/_chat/skills")({
  component: SkillsRouteView,
});
