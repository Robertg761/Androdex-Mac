const PAIRING_TOKEN_PARAM = "token";

function readHashParams(url: URL): URLSearchParams {
  return new URLSearchParams(url.hash.startsWith("#") ? url.hash.slice(1) : url.hash);
}

function assertHttpUrl(url: URL): void {
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Pairing base URL must use http or https.");
  }
}

export function getPairingTokenFromUrl(url: URL): string | null {
  const hashToken = readHashParams(url).get(PAIRING_TOKEN_PARAM)?.trim() ?? "";
  if (hashToken.length > 0) {
    return hashToken;
  }

  const searchToken = url.searchParams.get(PAIRING_TOKEN_PARAM)?.trim() ?? "";
  return searchToken.length > 0 ? searchToken : null;
}

export function stripPairingTokenFromUrl(url: URL): URL {
  const next = new URL(url.toString());
  const hashParams = readHashParams(next);
  if (hashParams.has(PAIRING_TOKEN_PARAM)) {
    hashParams.delete(PAIRING_TOKEN_PARAM);
    next.hash = hashParams.toString();
  }
  next.searchParams.delete(PAIRING_TOKEN_PARAM);
  return next;
}

export function setPairingTokenOnUrl(url: URL, credential: string): URL {
  const next = new URL(url.toString());
  next.searchParams.delete(PAIRING_TOKEN_PARAM);
  next.hash = new URLSearchParams([[PAIRING_TOKEN_PARAM, credential]]).toString();
  return next;
}

export function resolvePairingPathname(pathname: string): string {
  const normalizedPath = pathname.trim().replace(/\/+$/, "");
  if (normalizedPath.length === 0 || normalizedPath === "/") {
    return "/pair";
  }
  return `${normalizedPath}/pair`;
}

export function normalizePairingBaseUrl(rawValue: string): string {
  const trimmed = rawValue.trim();
  if (trimmed.length === 0) {
    throw new Error("Pairing base URL is required.");
  }

  const url = new URL(trimmed);
  assertHttpUrl(url);

  const normalizedPath = url.pathname.trim().replace(/\/+$/, "");
  const next = new URL(url.toString());
  next.username = "";
  next.password = "";
  next.pathname = normalizedPath.length === 0 ? "/" : normalizedPath;
  next.search = "";
  next.hash = "";

  const serialized = next.toString();
  return next.pathname === "/" ? serialized.replace(/\/$/, "") : serialized;
}

export function buildPairingUrl(baseUrl: string | URL, credential: string): string {
  const next = new URL(
    normalizePairingBaseUrl(baseUrl instanceof URL ? baseUrl.toString() : baseUrl),
  );
  next.pathname = resolvePairingPathname(next.pathname);
  return setPairingTokenOnUrl(next, credential).toString();
}
