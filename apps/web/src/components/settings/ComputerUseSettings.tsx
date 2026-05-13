import {
  CameraIcon,
  CheckIcon,
  MonitorDotIcon,
  PlayIcon,
  RefreshCwIcon,
  ShieldAlertIcon,
  SquareIcon,
  XIcon,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  DEFAULT_COMPUTER_USE_SETTINGS,
  type ComputerUseApprovalId,
  type ComputerUseDriverKind,
  type ComputerUseSessionId,
  type ComputerUseTargetId,
  type ComputerUseSnapshot,
  ProviderInstanceId,
  ThreadId,
} from "@t3tools/contracts";

import { useSettings, useUpdateSettings } from "../../hooks/useSettings";
import { ensureLocalApi } from "../../localApi";
import { Button } from "../ui/button";
import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from "../ui/select";
import { Switch } from "../ui/switch";
import { SettingsPageContainer, SettingsRow, SettingsSection } from "./settingsLayout";

const DRIVER_LABELS: Record<ComputerUseDriverKind, string> = {
  container: "Isolated display",
  browser: "Isolated browser",
  "linux-x11": "Host X11",
  "linux-wayland": "Wayland",
};

function statusTone(status: string): string {
  switch (status) {
    case "available":
      return "text-emerald-600 dark:text-emerald-400";
    case "missing-dependencies":
      return "text-amber-600 dark:text-amber-400";
    case "unsupported":
    case "disabled":
      return "text-muted-foreground";
    default:
      return "text-foreground";
  }
}

export function ComputerUseSettingsPanel() {
  const settings = useSettings((value) => value.computerUse ?? DEFAULT_COMPUTER_USE_SETTINGS);
  const { updateSettings } = useUpdateSettings();
  const [snapshot, setSnapshot] = useState<ComputerUseSnapshot | null>(null);
  const [selectedTargetId, setSelectedTargetId] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const loadSnapshot = useCallback(async () => {
    setBusyKey("refresh");
    setError(null);
    try {
      setSnapshot(await ensureLocalApi().computerUse.getSnapshot());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Failed to load Computer Use state.");
    } finally {
      setBusyKey(null);
    }
  }, []);

  useEffect(() => {
    void loadSnapshot();
  }, [loadSnapshot]);

  useEffect(() => {
    if (!selectedTargetId && snapshot?.targets[0]) {
      setSelectedTargetId(snapshot.targets[0].id);
    }
  }, [selectedTargetId, snapshot?.targets]);

  const updateComputerUseSettings = useCallback(
    (patch: Partial<typeof settings>) => {
      updateSettings({ computerUse: { ...settings, ...patch } });
      void loadSnapshot();
    },
    [loadSnapshot, settings, updateSettings],
  );

  const activeSessions = useMemo(
    () => snapshot?.sessions.filter((session) => session.status !== "stopped") ?? [],
    [snapshot],
  );

  const recentAuditEntries = useMemo(
    () => (snapshot?.auditLog ?? []).slice(-20).reverse(),
    [snapshot],
  );

  const handleStart = useCallback(async () => {
    setBusyKey("start");
    setError(null);
    try {
      await ensureLocalApi().computerUse.startSession({
        threadId: ThreadId.make("computer-use-settings"),
        providerId: ProviderInstanceId.make("manual"),
        ...(selectedTargetId ? { targetId: selectedTargetId as ComputerUseTargetId } : {}),
        driver: settings.defaultDriver,
        reason: "Started from Computer Use settings.",
      });
      await loadSnapshot();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Failed to start Computer Use session.");
      await loadSnapshot();
    } finally {
      setBusyKey(null);
    }
  }, [loadSnapshot, selectedTargetId, settings.defaultDriver]);

  const handleStop = useCallback(
    async (sessionId: string) => {
      setBusyKey(`stop:${sessionId}`);
      setError(null);
      try {
        await ensureLocalApi().computerUse.stopSession({
          sessionId: sessionId as ComputerUseSessionId,
          reason: "Stopped from settings.",
        });
        await loadSnapshot();
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "Failed to stop Computer Use session.");
      } finally {
        setBusyKey(null);
      }
    },
    [loadSnapshot],
  );

  const handleCapture = useCallback(
    async (sessionId: string) => {
      setBusyKey(`capture:${sessionId}`);
      setError(null);
      try {
        await ensureLocalApi().computerUse.captureScreenshot({
          sessionId: sessionId as ComputerUseSessionId,
        });
        await loadSnapshot();
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "Failed to capture screenshot.");
      } finally {
        setBusyKey(null);
      }
    },
    [loadSnapshot],
  );

  const handleApproval = useCallback(async (approvalId: string, decision: "allow" | "deny") => {
    setBusyKey(`approval:${approvalId}`);
    setError(null);
    try {
      setSnapshot(
        await ensureLocalApi().computerUse.respondToApproval({
          approvalId: approvalId as ComputerUseApprovalId,
          decision,
        }),
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Failed to resolve approval.");
    } finally {
      setBusyKey(null);
    }
  }, []);

  return (
    <SettingsPageContainer>
      <SettingsSection
        title="Computer Use"
        icon={<MonitorDotIcon className="size-3.5" />}
        headerAction={
          <Button size="xs" variant="outline" onClick={() => void loadSnapshot()}>
            <RefreshCwIcon className="size-3.5" />
            Refresh
          </Button>
        }
      >
        <SettingsRow
          title="Enable"
          description={
            snapshot?.featureFlagEnabled
              ? "Allow server-managed computer-use sessions."
              : "Requires ANDRODEX_COMPUTER_USE=1 before sessions can start."
          }
          status={error}
          control={
            <Switch
              checked={settings.enabled}
              onCheckedChange={(enabled) => updateComputerUseSettings({ enabled })}
            />
          }
        />
        <SettingsRow
          title="Default mode"
          description="Choose the preferred driver for new sessions."
          control={
            <Select
              value={settings.defaultDriver}
              onValueChange={(value) => {
                if (
                  value === "container" ||
                  value === "browser" ||
                  value === "linux-x11" ||
                  value === "linux-wayland"
                ) {
                  updateComputerUseSettings({ defaultDriver: value });
                }
              }}
            >
              <SelectTrigger className="w-full sm:w-44" aria-label="Computer Use mode">
                <SelectValue>{DRIVER_LABELS[settings.defaultDriver]}</SelectValue>
              </SelectTrigger>
              <SelectPopup align="end" alignItemWithTrigger={false}>
                {Object.entries(DRIVER_LABELS).map(([value, label]) => (
                  <SelectItem hideIndicator key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectPopup>
            </Select>
          }
        />
        <SettingsRow
          title="Safety gates"
          description="Keep high-risk operations behind explicit review."
        >
          <div className="grid gap-2 py-3 sm:grid-cols-2">
            {(
              [
                ["askBeforeNewTarget", "New target approval"],
                ["askBeforeSensitiveAction", "Sensitive action approval"],
                ["clipboardEnabled", "Clipboard access"],
                ["hostDesktopEnabled", "Host desktop control"],
              ] as const
            ).map(([key, label]) => (
              <label
                key={key}
                className="flex items-center justify-between gap-3 rounded-md border border-border/60 px-3 py-2 text-xs"
              >
                <span>{label}</span>
                <Switch
                  checked={Boolean(settings[key as keyof typeof settings])}
                  onCheckedChange={(checked) => updateComputerUseSettings({ [key]: checked })}
                />
              </label>
            ))}
          </div>
        </SettingsRow>
      </SettingsSection>

      <SettingsSection title="Driver Status">
        {(snapshot?.health ?? []).map((driver) => (
          <SettingsRow
            key={driver.driver}
            title={DRIVER_LABELS[driver.driver]}
            description={driver.message}
            status={
              <span className={statusTone(driver.status)}>
                {driver.status.replaceAll("-", " ")}
              </span>
            }
          >
            <div className="flex flex-wrap gap-1.5 py-3">
              {driver.dependencies.map((dependency) => (
                <span
                  key={`${driver.driver}:${dependency.name}`}
                  className="inline-flex items-center gap-1 rounded-md border border-border/60 px-2 py-1 text-[11px] text-muted-foreground"
                >
                  {dependency.found ? (
                    <CheckIcon className="size-3 text-emerald-500" />
                  ) : (
                    <XIcon className="size-3 text-amber-500" />
                  )}
                  {dependency.name}
                </span>
              ))}
            </div>
          </SettingsRow>
        ))}
      </SettingsSection>

      <SettingsSection title="Targets">
        {(snapshot?.targets ?? []).length === 0 ? (
          <SettingsRow
            title="No targets"
            description="Available targets will appear after driver dependencies are present."
          />
        ) : (
          <SettingsRow
            title="Target"
            description="Start a scoped session against an isolated or approved target."
            control={
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <Select
                  value={selectedTargetId}
                  onValueChange={(value) => setSelectedTargetId(value ?? "")}
                >
                  <SelectTrigger className="w-full sm:w-72" aria-label="Computer Use target">
                    <SelectValue>
                      {snapshot?.targets.find((target) => target.id === selectedTargetId)?.title ??
                        "Select target"}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectPopup align="end" alignItemWithTrigger={false}>
                    {snapshot?.targets.map((target) => (
                      <SelectItem hideIndicator key={target.id} value={target.id}>
                        {target.title}
                      </SelectItem>
                    ))}
                  </SelectPopup>
                </Select>
                <Button
                  size="xs"
                  disabled={busyKey === "start" || !selectedTargetId}
                  onClick={() => void handleStart()}
                >
                  <PlayIcon className="size-3.5" />
                  Start
                </Button>
              </div>
            }
          />
        )}
      </SettingsSection>

      <SettingsSection title="Sessions">
        {activeSessions.length === 0 ? (
          <SettingsRow
            title="No active sessions"
            description="Computer-use sessions started by providers will appear here."
          />
        ) : (
          activeSessions.map((session) => {
            const screenshot = snapshot?.screenshots.find(
              (candidate) => candidate.id === session.lastScreenshotId,
            );
            return (
              <SettingsRow
                key={session.id}
                title={`${DRIVER_LABELS[session.driver]} session`}
                description={`${session.status} · ${session.displaySize.width}x${session.displaySize.height}`}
                control={
                  <div className="flex gap-2">
                    <Button
                      size="xs"
                      variant="outline"
                      disabled={busyKey === `capture:${session.id}`}
                      onClick={() => void handleCapture(session.id)}
                    >
                      <CameraIcon className="size-3.5" />
                      Capture
                    </Button>
                    <Button
                      size="xs"
                      variant="destructive"
                      disabled={busyKey === `stop:${session.id}`}
                      onClick={() => void handleStop(session.id)}
                    >
                      <SquareIcon className="size-3.5" />
                      Stop
                    </Button>
                  </div>
                }
              >
                {screenshot?.dataUrl ? (
                  <div className="py-3">
                    <img
                      src={screenshot.dataUrl}
                      alt=""
                      className="max-h-80 w-full rounded-md border border-border/60 object-contain"
                    />
                  </div>
                ) : null}
              </SettingsRow>
            );
          })
        )}
      </SettingsSection>

      <SettingsSection title="Approvals" icon={<ShieldAlertIcon className="size-3.5" />}>
        {(snapshot?.approvals.filter((approval) => approval.status === "pending") ?? []).length ===
        0 ? (
          <SettingsRow
            title="No pending approvals"
            description="Target and sensitive-action approvals will appear here."
          />
        ) : (
          snapshot?.approvals
            .filter((approval) => approval.status === "pending")
            .map((approval) => (
              <SettingsRow
                key={approval.id}
                title={approval.title}
                description={approval.description}
                control={
                  <div className="flex gap-2">
                    <Button
                      size="xs"
                      variant="outline"
                      disabled={busyKey === `approval:${approval.id}`}
                      onClick={() => void handleApproval(approval.id, "deny")}
                    >
                      <XIcon className="size-3.5" />
                      Deny
                    </Button>
                    <Button
                      size="xs"
                      disabled={busyKey === `approval:${approval.id}`}
                      onClick={() => void handleApproval(approval.id, "allow")}
                    >
                      <CheckIcon className="size-3.5" />
                      Allow
                    </Button>
                  </div>
                }
              />
            ))
        )}
      </SettingsSection>

      <SettingsSection title="Audit Log">
        {recentAuditEntries.length === 0 ? (
          <SettingsRow
            title="No audit entries"
            description="Computer-use activity will appear here."
          />
        ) : (
          recentAuditEntries.map((entry) => (
            <SettingsRow
              key={entry.id}
              title={entry.type}
              description={`${entry.createdAt} · ${entry.message}`}
            />
          ))
        )}
      </SettingsSection>
    </SettingsPageContainer>
  );
}
