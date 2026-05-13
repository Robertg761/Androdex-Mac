// @effect-diagnostics nodeBuiltinImport:off
import { randomUUID } from "node:crypto";

import { ComputerUseError, type ComputerUseTarget } from "@t3tools/contracts";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";

export const MAX_RETAINED_SCREENSHOTS = 12;
export const MAX_RETAINED_AUDIT_ENTRIES = 250;

type ComputerUseErrorCode =
  | "feature-disabled"
  | "not-found"
  | "driver-unavailable"
  | "policy-blocked"
  | "approval-required"
  | "invalid-state"
  | "driver-error";

export const toComputerUseError = (code: ComputerUseErrorCode, message: string, cause?: unknown) =>
  new ComputerUseError({
    code,
    message,
    ...(cause === undefined ? {} : { cause }),
  });

export const makeId = <Id extends string>(prefix: string): Id => `${prefix}:${randomUUID()}` as Id;

export const nowIso = Effect.map(DateTime.now, DateTime.formatIso);

export const pngDataUrl = (bytes: Uint8Array): string =>
  `data:image/png;base64,${Buffer.from(bytes).toString("base64")}`;

export function retainMapTail<K, V>(map: ReadonlyMap<K, V>, maxEntries: number): ReadonlyMap<K, V> {
  if (map.size <= maxEntries) return map;
  return new Map(Array.from(map.entries()).slice(-maxEntries));
}

export function retainArrayTail<T>(items: ReadonlyArray<T>, maxEntries: number): ReadonlyArray<T> {
  return items.length <= maxEntries ? items : items.slice(-maxEntries);
}

export function targetMatchesHint(
  target: ComputerUseTarget,
  targetHint: string | undefined,
): boolean {
  const hint = targetHint?.trim().toLowerCase();
  if (!hint) {
    return false;
  }
  return [target.id, target.title, target.appName, target.display]
    .filter((value): value is string => typeof value === "string" && value.length > 0)
    .some((value) => value.toLowerCase().includes(hint));
}
