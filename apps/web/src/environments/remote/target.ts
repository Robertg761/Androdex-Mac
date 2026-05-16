import { getPairingTokenFromUrl } from "../../pairingUrl";
import { readHostedPairingRequest } from "../../hostedPairing";

export type ResolvedRemotePairingTransport = "androdex-backend" | "codex-app-server";

export interface ResolvedRemotePairingTarget {
  readonly credential: string;
  readonly httpBaseUrl: string;
  readonly wsBaseUrl: string;
  readonly transport: ResolvedRemotePairingTransport;
}

function normalizeRemoteBaseUrl(rawValue: string): URL {
  const trimmed = rawValue.trim();
  if (!trimmed) {
    throw new Error("Enter a backend URL.");
  }

  const normalizedInput =
    /^[a-zA-Z][a-zA-Z\d+-]*:\/\//.test(trimmed) || trimmed.startsWith("//")
      ? trimmed
      : `https://${trimmed}`;
  const url = new URL(normalizedInput, window.location.origin);
  url.pathname = url.pathname.replace(/\/+$/, "") || "/";
  url.search = "";
  url.hash = "";
  return url;
}

function isCodexAppServerEndpoint(url: URL): boolean {
  return url.protocol === "ws:" || url.protocol === "wss:";
}

function removePairPath(url: URL): URL {
  const next = new URL(url.toString());
  const normalizedPath = next.pathname.replace(/\/+$/, "");
  if (normalizedPath.endsWith("/pair")) {
    next.pathname = normalizedPath.slice(0, -"/pair".length) || "/";
  }
  return next;
}

function toHttpBaseUrl(url: URL): string {
  const next = new URL(url.toString());
  if (next.protocol === "ws:") {
    next.protocol = "http:";
  } else if (next.protocol === "wss:") {
    next.protocol = "https:";
  }
  next.pathname = next.pathname.replace(/\/+$/, "") || "/";
  next.search = "";
  next.hash = "";
  return next.toString();
}

function toWsBaseUrl(url: URL): string {
  const next = new URL(url.toString());
  if (next.protocol === "http:") {
    next.protocol = "ws:";
  } else if (next.protocol === "https:") {
    next.protocol = "wss:";
  }
  next.pathname = next.pathname.replace(/\/+$/, "") || "/";
  next.search = "";
  next.hash = "";
  return next.toString();
}

export function resolveRemotePairingTarget(input: {
  readonly pairingUrl?: string;
  readonly host?: string;
  readonly pairingCode?: string;
}): ResolvedRemotePairingTarget {
  const pairingUrl = input.pairingUrl?.trim() ?? "";
  if (pairingUrl.length > 0) {
    const url = new URL(pairingUrl, window.location.origin);
    const hostedPairingRequest = readHostedPairingRequest(url);
    if (hostedPairingRequest) {
      const hostedBackendUrl = normalizeRemoteBaseUrl(hostedPairingRequest.host);
      return {
        credential: hostedPairingRequest.token,
        httpBaseUrl: toHttpBaseUrl(hostedBackendUrl),
        wsBaseUrl: toWsBaseUrl(hostedBackendUrl),
        transport: isCodexAppServerEndpoint(hostedBackendUrl)
          ? "codex-app-server"
          : "androdex-backend",
      };
    }

    const credential = getPairingTokenFromUrl(url) ?? "";
    if (!credential) {
      throw new Error("Pairing URL is missing its token.");
    }
    const connectionUrl = removePairPath(url);
    return {
      credential,
      httpBaseUrl: toHttpBaseUrl(connectionUrl),
      wsBaseUrl: toWsBaseUrl(connectionUrl),
      transport: isCodexAppServerEndpoint(connectionUrl) ? "codex-app-server" : "androdex-backend",
    };
  }

  const host = input.host?.trim() ?? "";
  const pairingCode = input.pairingCode?.trim() ?? "";
  if (!host) {
    throw new Error("Enter a backend URL.");
  }
  if (!pairingCode) {
    throw new Error("Enter a pairing code.");
  }

  const normalizedHost = normalizeRemoteBaseUrl(host);
  return {
    credential: pairingCode,
    httpBaseUrl: toHttpBaseUrl(normalizedHost),
    wsBaseUrl: toWsBaseUrl(normalizedHost),
    transport: isCodexAppServerEndpoint(normalizedHost) ? "codex-app-server" : "androdex-backend",
  };
}
