import { DatabaseSync } from "node:sqlite";

import {
  ProviderDriverKind,
  type ProviderInstanceId,
  type ServerCodexAutomation,
  type ServerCodexAutomationDeleteInput,
  type ServerCodexAutomationInboxItem,
  type ServerCodexAutomationRun,
  type ServerCodexAutomationRunReadInput,
  type ServerCodexAutomationStatus,
  type ServerCodexAutomationUpsertInput,
  type ServerCodexAutomationsListResult,
} from "@t3tools/contracts";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import type * as FileSystem from "effect/FileSystem";
import type * as Path from "effect/Path";

import { ProviderDriverError } from "../Errors.ts";
import type {
  ProviderAutomationControls,
  ProviderAutomationDeleteInput,
  ProviderAutomationRunReadInput,
  ProviderAutomationUpsertInput,
} from "../ProviderDriver.ts";

const DRIVER_KIND = ProviderDriverKind.make("codex");
const DEFAULT_RRULE = "FREQ=HOURLY;INTERVAL=24;BYMINUTE=0";

interface CodexAutomationStorePaths {
  readonly codexHomePath: string;
  readonly databasePath: string;
}

interface CodexAutomationStoreInput extends CodexAutomationStorePaths {
  readonly instanceId: ProviderInstanceId;
  readonly fileSystem: FileSystem.FileSystem;
  readonly path: Path.Path;
}

interface AutomationRow {
  readonly id: string;
  readonly name: string;
  readonly prompt: string;
  readonly status: string;
  readonly next_run_at: number | null;
  readonly last_run_at: number | null;
  readonly cwds: string;
  readonly rrule: string;
  readonly model: string | null;
  readonly reasoning_effort: string | null;
  readonly created_at: number;
  readonly updated_at: number;
}

interface AutomationRunRow {
  readonly thread_id: string;
  readonly automation_id: string;
  readonly status: string;
  readonly read_at: number | null;
  readonly thread_title: string | null;
  readonly source_cwd: string | null;
  readonly inbox_title: string | null;
  readonly inbox_summary: string | null;
  readonly created_at: number;
  readonly updated_at: number;
  readonly archived_user_message: string | null;
  readonly archived_assistant_message: string | null;
  readonly archived_reason: string | null;
}

interface InboxItemRow {
  readonly id: string;
  readonly title: string | null;
  readonly description: string | null;
  readonly thread_id: string | null;
  readonly read_at: number | null;
  readonly created_at: number | null;
}

function automationDatabasePath(path: Path.Path, codexHomePath: string): string {
  return path.join(codexHomePath, "sqlite", "codex-dev.db");
}

function normalizeTimestamp(value: number | null | undefined): number | null {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return null;
  }
  return Math.max(0, Math.trunc(value));
}

function nullableNonEmpty(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function parseCwds(value: string): string[] {
  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.filter(
      (entry): entry is string => typeof entry === "string" && entry.trim().length > 0,
    );
  } catch {
    return [];
  }
}

function normalizeAutomationStatus(value: string): ServerCodexAutomationStatus {
  return value === "PAUSED" ? "PAUSED" : "ACTIVE";
}

function toAutomation(row: AutomationRow): ServerCodexAutomation {
  return {
    id: row.id,
    name: row.name,
    prompt: row.prompt,
    status: normalizeAutomationStatus(row.status),
    nextRunAt: normalizeTimestamp(row.next_run_at),
    lastRunAt: normalizeTimestamp(row.last_run_at),
    cwds: parseCwds(row.cwds),
    rrule: row.rrule || DEFAULT_RRULE,
    model: nullableNonEmpty(row.model),
    reasoningEffort: nullableNonEmpty(row.reasoning_effort),
    createdAt: Math.max(0, Math.trunc(row.created_at)),
    updatedAt: Math.max(0, Math.trunc(row.updated_at)),
  };
}

function toAutomationRun(row: AutomationRunRow): ServerCodexAutomationRun {
  return {
    threadId: row.thread_id,
    automationId: row.automation_id,
    status: row.status,
    readAt: normalizeTimestamp(row.read_at),
    threadTitle: nullableNonEmpty(row.thread_title),
    sourceCwd: nullableNonEmpty(row.source_cwd),
    inboxTitle: nullableNonEmpty(row.inbox_title),
    inboxSummary: nullableNonEmpty(row.inbox_summary),
    createdAt: Math.max(0, Math.trunc(row.created_at)),
    updatedAt: Math.max(0, Math.trunc(row.updated_at)),
    archivedUserMessage: nullableNonEmpty(row.archived_user_message),
    archivedAssistantMessage: nullableNonEmpty(row.archived_assistant_message),
    archivedReason: nullableNonEmpty(row.archived_reason),
  };
}

function toInboxItem(row: InboxItemRow): ServerCodexAutomationInboxItem {
  return {
    id: row.id,
    title: nullableNonEmpty(row.title),
    description: nullableNonEmpty(row.description),
    threadId: nullableNonEmpty(row.thread_id),
    readAt: normalizeTimestamp(row.read_at),
    createdAt: normalizeTimestamp(row.created_at),
  };
}

function parseRrule(rrule: string): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const rawPart of rrule.split(";")) {
    const [rawKey, ...rawValueParts] = rawPart.split("=");
    const key = rawKey?.trim().toUpperCase();
    const value = rawValueParts.join("=").trim().toUpperCase();
    if (key && value) {
      fields[key] = value;
    }
  }
  return fields;
}

function parseBoundedInt(value: string | undefined, fallback: number, min: number, max: number) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, parsed));
}

function computeNextRunAt(rrule: string, fromMillis: number): number {
  const fields = parseRrule(rrule || DEFAULT_RRULE);
  const frequency = fields.FREQ ?? "HOURLY";
  const interval = parseBoundedInt(fields.INTERVAL, 1, 1, 10_000);
  if (frequency === "WEEKLY") {
    return fromMillis + interval * 7 * 24 * 60 * 60 * 1000;
  }
  if (frequency === "DAILY") {
    return fromMillis + interval * 24 * 60 * 60 * 1000;
  }
  return fromMillis + interval * 60 * 60 * 1000;
}

function ensureSchema(db: DatabaseSync): void {
  db.exec(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS automations (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      prompt TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'ACTIVE',
      next_run_at INTEGER,
      last_run_at INTEGER,
      cwds TEXT NOT NULL DEFAULT '[]',
      rrule TEXT NOT NULL DEFAULT 'FREQ=HOURLY;INTERVAL=24;BYMINUTE=0',
      model TEXT,
      reasoning_effort TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS automation_runs (
      thread_id TEXT PRIMARY KEY,
      automation_id TEXT NOT NULL,
      status TEXT NOT NULL,
      read_at INTEGER,
      thread_title TEXT,
      source_cwd TEXT,
      inbox_title TEXT,
      inbox_summary TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      archived_user_message TEXT,
      archived_assistant_message TEXT,
      archived_reason TEXT
    );
    CREATE INDEX IF NOT EXISTS automation_runs_automation_id_idx
      ON automation_runs(automation_id);
    CREATE TABLE IF NOT EXISTS inbox_items (
      id TEXT PRIMARY KEY,
      title TEXT,
      description TEXT,
      thread_id TEXT,
      read_at INTEGER,
      created_at INTEGER
    );
  `);
}

function toDriverError(
  instanceId: ProviderInstanceId,
  detail: string,
  cause: unknown,
): ProviderDriverError {
  return new ProviderDriverError({
    driver: DRIVER_KIND,
    instanceId,
    detail,
    cause,
  });
}

function toDatabaseError(instanceId: ProviderInstanceId, cause: unknown): ProviderDriverError {
  return toDriverError(
    instanceId,
    cause instanceof Error ? cause.message : "Failed to update Codex automations database.",
    cause,
  );
}

function withDatabase<A>(
  input: CodexAutomationStoreInput,
  use: (db: DatabaseSync) => A,
): Effect.Effect<A, ProviderDriverError> {
  return input.fileSystem
    .makeDirectory(input.path.join(input.codexHomePath, "sqlite"), { recursive: true })
    .pipe(
      Effect.mapError((cause) => toDatabaseError(input.instanceId, cause)),
      Effect.flatMap(() =>
        Effect.try({
          try: () => {
            const db = new DatabaseSync(input.databasePath);
            try {
              ensureSchema(db);
              return use(db);
            } finally {
              db.close();
            }
          },
          catch: (cause) => toDatabaseError(input.instanceId, cause),
        }),
      ),
    );
}

function readCodexAutomationsFromDb(
  db: DatabaseSync,
  input: CodexAutomationStoreInput,
): ServerCodexAutomationsListResult {
  const automations = db
    .prepare("SELECT * FROM automations ORDER BY created_at DESC")
    .all() as unknown as AutomationRow[];
  const runs = db
    .prepare("SELECT * FROM automation_runs ORDER BY created_at DESC")
    .all() as unknown as AutomationRunRow[];
  const inboxItems = db
    .prepare("SELECT * FROM inbox_items ORDER BY created_at DESC")
    .all() as unknown as InboxItemRow[];

  return {
    instanceId: input.instanceId,
    codexHomePath: input.codexHomePath,
    databasePath: input.databasePath,
    automations: automations.map(toAutomation),
    runs: runs.map(toAutomationRun),
    inboxItems: inboxItems.map(toInboxItem),
  };
}

function listCodexAutomations(
  input: CodexAutomationStoreInput,
): Effect.Effect<ServerCodexAutomationsListResult, ProviderDriverError> {
  return withDatabase(input, (db) => readCodexAutomationsFromDb(db, input));
}

function upsertCodexAutomation(
  input: CodexAutomationStoreInput,
  payload: ServerCodexAutomationUpsertInput["automation"],
): Effect.Effect<ServerCodexAutomationsListResult, ProviderDriverError> {
  return Effect.gen(function* () {
    const timestamp = DateTime.toEpochMillis(yield* DateTime.now);
    return yield* withDatabase(input, (db) => {
      const id = payload.id ?? crypto.randomUUID();
      const existing = db
        .prepare("SELECT created_at, last_run_at FROM automations WHERE id = ?")
        .get(id) as unknown as Pick<AutomationRow, "created_at" | "last_run_at"> | undefined;
      const createdAt = existing?.created_at ?? timestamp;
      const rrule = payload.rrule || DEFAULT_RRULE;
      const nextRunAt =
        payload.status === "ACTIVE"
          ? (payload.nextRunAt ?? computeNextRunAt(rrule, timestamp))
          : payload.nextRunAt;

      db.prepare(
        `
      INSERT INTO automations (
        id, name, prompt, status, next_run_at, last_run_at, cwds, rrule,
        model, reasoning_effort, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        name = excluded.name,
        prompt = excluded.prompt,
        status = excluded.status,
        next_run_at = excluded.next_run_at,
        cwds = excluded.cwds,
        rrule = excluded.rrule,
        model = excluded.model,
        reasoning_effort = excluded.reasoning_effort,
        updated_at = excluded.updated_at
      `,
      ).run(
        id,
        payload.name,
        payload.prompt,
        payload.status,
        nextRunAt,
        existing?.last_run_at ?? null,
        JSON.stringify(payload.cwds),
        rrule,
        payload.model,
        payload.reasoningEffort,
        createdAt,
        timestamp,
      );

      return readCodexAutomationsFromDb(db, input);
    });
  });
}

function deleteCodexAutomation(
  input: CodexAutomationStoreInput,
  payload: ServerCodexAutomationDeleteInput,
): Effect.Effect<ServerCodexAutomationsListResult, ProviderDriverError> {
  return withDatabase(input, (db) => {
    db.exec("BEGIN IMMEDIATE");
    try {
      db.prepare("DELETE FROM automation_runs WHERE automation_id = ?").run(payload.id);
      db.prepare("DELETE FROM automations WHERE id = ?").run(payload.id);
      db.exec("COMMIT");
    } catch (cause) {
      db.exec("ROLLBACK");
      throw cause;
    }
    return readCodexAutomationsFromDb(db, input);
  });
}

function markRunRead(
  input: CodexAutomationStoreInput,
  payload: ServerCodexAutomationRunReadInput,
): Effect.Effect<ServerCodexAutomationsListResult, ProviderDriverError> {
  return Effect.gen(function* () {
    const updatedAt = DateTime.toEpochMillis(yield* DateTime.now);
    return yield* withDatabase(input, (db) => {
      const readAt = payload.read ? updatedAt : null;
      db.prepare("UPDATE automation_runs SET read_at = ?, updated_at = ? WHERE thread_id = ?").run(
        readAt,
        updatedAt,
        payload.threadId,
      );
      db.prepare("UPDATE inbox_items SET read_at = ? WHERE thread_id = ?").run(
        readAt,
        payload.threadId,
      );
      return readCodexAutomationsFromDb(db, input);
    });
  });
}

export function makeCodexAutomationControls(input: {
  readonly instanceId: ProviderInstanceId;
  readonly codexHomePath: string;
  readonly fileSystem: FileSystem.FileSystem;
  readonly path: Path.Path;
}): ProviderAutomationControls {
  const store = {
    instanceId: input.instanceId,
    codexHomePath: input.codexHomePath,
    databasePath: automationDatabasePath(input.path, input.codexHomePath),
    fileSystem: input.fileSystem,
    path: input.path,
  } satisfies CodexAutomationStoreInput;

  return {
    list: () => listCodexAutomations(store),
    upsert: (payload: ProviderAutomationUpsertInput) =>
      upsertCodexAutomation(store, {
        ...payload.automation,
        id: payload.automation.id,
      }),
    delete: (payload: ProviderAutomationDeleteInput) =>
      deleteCodexAutomation(store, {
        instanceId: input.instanceId,
        id: payload.id,
      }),
    markRunRead: (payload: ProviderAutomationRunReadInput) =>
      markRunRead(store, {
        instanceId: input.instanceId,
        threadId: payload.threadId,
        read: payload.read,
      }),
  };
}
