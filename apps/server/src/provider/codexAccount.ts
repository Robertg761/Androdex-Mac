export type CodexAccountSnapshot = {
  readonly type: "chatgpt" | "apiKey" | "unknown";
  readonly planType:
    | "free"
    | "go"
    | "plus"
    | "pro"
    | "team"
    | "business"
    | "enterprise"
    | "edu"
    | "unknown"
    | null;
  readonly sparkEnabled: boolean;
  readonly email?: string;
};

type ParsedAccount = {
  readonly type: CodexAccountSnapshot["type"];
  readonly planType: CodexAccountSnapshot["planType"];
  readonly email?: string;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function normalizePlanType(value: unknown): CodexAccountSnapshot["planType"] {
  switch (value) {
    case "free":
    case "go":
    case "plus":
    case "pro":
    case "team":
    case "business":
    case "enterprise":
    case "edu":
    case "unknown":
      return value;
    case "prolite":
      return "pro";
    case "self_serve_business_usage_based":
      return "business";
    case "enterprise_cbp_usage_based":
      return "enterprise";
    default:
      return null;
  }
}

function parseAccount(value: unknown): ParsedAccount {
  const record = asRecord(value);
  const nested = asRecord(record?.account) ?? record;
  if (!nested) {
    return {
      type: "unknown",
      planType: null,
    };
  }

  const rawType = asString(nested.type);
  if (rawType === "apiKey") {
    return {
      type: "apiKey",
      planType: null,
    };
  }

  if (rawType === "chatgpt") {
    const email = asString(nested.email);
    return {
      type: "chatgpt",
      planType: normalizePlanType(nested.planType) ?? "unknown",
      ...(email ? { email } : {}),
    };
  }

  return {
    type: "unknown",
    planType: null,
  };
}

function supportsSpark(planType: CodexAccountSnapshot["planType"]): boolean {
  return (
    planType === "pro" ||
    planType === "team" ||
    planType === "business" ||
    planType === "enterprise" ||
    planType === "edu"
  );
}

export function readCodexAccountSnapshot(value: unknown): CodexAccountSnapshot {
  const account = parseAccount(value);
  if (account.type === "apiKey") {
    return {
      type: "apiKey",
      planType: null,
      sparkEnabled: false,
    };
  }

  if (account.type === "chatgpt") {
    return {
      type: "chatgpt",
      planType: account.planType ?? "unknown",
      sparkEnabled: supportsSpark(account.planType ?? "unknown"),
      ...(account.email ? { email: account.email } : {}),
    };
  }

  return {
    type: "unknown",
    planType: null,
    sparkEnabled: false,
  };
}

export function resolveCodexModelForAccount(
  model: string | undefined,
  account: CodexAccountSnapshot | null | undefined,
): string | undefined {
  if (!model) {
    return undefined;
  }

  if (!model.endsWith("-spark")) {
    return model;
  }

  return account?.sparkEnabled === true ? model : model.replace(/-spark$/u, "");
}
