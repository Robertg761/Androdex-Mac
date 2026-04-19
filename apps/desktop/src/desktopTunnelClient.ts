const DESKTOP_TUNNEL_CONTROL_PATH = "/desktop-tunnel/connect";
const DESKTOP_TUNNEL_PUBLIC_PREFIX = "/desktop";
const DEFAULT_RECONNECT_DELAY_MS = 3_000;
const DEFAULT_REQUEST_TIMEOUT_MS = 30_000;
const HOP_BY_HOP_HEADERS = new Set([
  "connection",
  "content-length",
  "host",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
]);

type DesktopTunnelLogger = (message: string) => void;

type DesktopTunnelWebSocketFactory = (url: string) => WebSocket;

interface DesktopTunnelRequestMessage {
  readonly type: "http-request";
  readonly requestId: string;
  readonly method: string;
  readonly path: string;
  readonly headers?: Record<string, string>;
  readonly bodyBase64?: string;
}

interface DesktopTunnelWebSocketOpenMessage {
  readonly type: "ws-open";
  readonly sessionId: string;
  readonly path: string;
}

interface DesktopTunnelWebSocketFrameMessage {
  readonly type: "ws-frame";
  readonly sessionId: string;
  readonly text?: string;
  readonly bodyBase64?: string;
}

interface DesktopTunnelWebSocketCloseMessage {
  readonly type: "ws-close";
  readonly sessionId: string;
  readonly code?: number;
  readonly reason?: string;
}

interface DesktopTunnelPingMessage {
  readonly type: "ping";
}

type DesktopTunnelInboundMessage =
  | DesktopTunnelRequestMessage
  | DesktopTunnelWebSocketOpenMessage
  | DesktopTunnelWebSocketFrameMessage
  | DesktopTunnelWebSocketCloseMessage
  | DesktopTunnelPingMessage;

interface DesktopTunnelHttpResponseMessage {
  readonly type: "http-response";
  readonly requestId: string;
  readonly status: number;
  readonly headers?: Record<string, string>;
  readonly bodyBase64?: string;
}

interface DesktopTunnelWebSocketOpenedMessage {
  readonly type: "ws-opened";
  readonly sessionId: string;
}

interface DesktopTunnelWebSocketOutboundFrameMessage {
  readonly type: "ws-frame";
  readonly sessionId: string;
  readonly text?: string;
  readonly bodyBase64?: string;
}

interface DesktopTunnelWebSocketOutboundCloseMessage {
  readonly type: "ws-close";
  readonly sessionId: string;
  readonly code?: number;
  readonly reason?: string;
}

interface DesktopTunnelPongMessage {
  readonly type: "pong";
}

type DesktopTunnelOutboundMessage =
  | DesktopTunnelHttpResponseMessage
  | DesktopTunnelWebSocketOpenedMessage
  | DesktopTunnelWebSocketOutboundFrameMessage
  | DesktopTunnelWebSocketOutboundCloseMessage
  | DesktopTunnelPongMessage;

export interface DesktopTunnelClientOptions {
  readonly origin: string;
  readonly routeId: string;
  readonly routeToken: string;
  readonly localHttpUrl: string;
  readonly logger?: DesktopTunnelLogger;
  readonly fetchFn?: typeof fetch;
  readonly createWebSocket?: DesktopTunnelWebSocketFactory;
  readonly reconnectDelayMs?: number;
  readonly requestTimeoutMs?: number;
}

function replaceProtocol(url: URL, protocol: "http:" | "https:" | "ws:" | "wss:"): URL {
  const next = new URL(url.toString());
  next.protocol = protocol;
  return next;
}

function trimTrailingSlash(pathname: string): string {
  return pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
}

function normalizeBaseUrl(rawValue: string): URL {
  const trimmed = rawValue.trim();
  if (!trimmed) {
    throw new Error("Desktop tunnel origin is required.");
  }

  const normalized = new URL(trimmed);
  if (!["http:", "https:", "ws:", "wss:"].includes(normalized.protocol)) {
    throw new Error("Desktop tunnel origin must use http, https, ws, or wss.");
  }
  normalized.pathname = trimTrailingSlash(normalized.pathname || "/");
  normalized.search = "";
  normalized.hash = "";
  return normalized;
}

export function buildDesktopTunnelPublicBaseUrl(origin: string, routeId: string): string {
  const normalizedOrigin = normalizeBaseUrl(origin);
  const base = replaceProtocol(
    normalizedOrigin,
    normalizedOrigin.protocol === "http:" || normalizedOrigin.protocol === "ws:"
      ? "http:"
      : "https:",
  );
  const basePath = trimTrailingSlash(base.pathname || "/");
  base.pathname = `${basePath === "/" ? "" : basePath}${DESKTOP_TUNNEL_PUBLIC_PREFIX}/${encodeURIComponent(routeId)}`;
  base.search = "";
  base.hash = "";
  return trimTrailingSlash(base.toString());
}

export function buildDesktopTunnelControlUrl(
  origin: string,
  routeId: string,
  routeToken: string,
): string {
  const baseUrl = normalizeBaseUrl(origin);
  const protocol = baseUrl.protocol === "http:" || baseUrl.protocol === "ws:" ? "ws:" : "wss:";
  const controlUrl = replaceProtocol(baseUrl, protocol);
  const basePath = trimTrailingSlash(controlUrl.pathname || "/");
  controlUrl.pathname = `${basePath === "/" ? "" : basePath}${DESKTOP_TUNNEL_CONTROL_PATH}`;
  controlUrl.searchParams.set("routeId", routeId);
  controlUrl.searchParams.set("routeToken", routeToken);
  controlUrl.hash = "";
  return controlUrl.toString();
}

function localWebSocketUrl(localHttpUrl: string, path: string): string {
  const normalizedBase = new URL(localHttpUrl);
  const wsProtocol = normalizedBase.protocol === "https:" ? "wss:" : "ws:";
  const wsBase = replaceProtocol(normalizedBase, wsProtocol);
  return new URL(path, wsBase).toString();
}

function localHttpRequestUrl(localHttpUrl: string, path: string): string {
  return new URL(path, localHttpUrl).toString();
}

function normalizeTunnelTargetPath(path: string, routeId: string): string {
  const trimmed = path.trim();
  if (!trimmed) {
    return "/";
  }

  const normalized = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  const routePrefix = `${DESKTOP_TUNNEL_PUBLIC_PREFIX}/${encodeURIComponent(routeId)}`;
  if (normalized === routePrefix) {
    return "/";
  }
  if (!normalized.startsWith(`${routePrefix}/`) && !normalized.startsWith(`${routePrefix}?`)) {
    return normalized;
  }

  const stripped = normalized.slice(routePrefix.length);
  return stripped.length > 0 ? stripped : "/";
}

function normalizeHeaders(headers: Record<string, string> | undefined): Record<string, string> {
  if (!headers) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(headers).filter(([name, value]) => {
      if (HOP_BY_HOP_HEADERS.has(name.toLowerCase())) {
        return false;
      }
      return typeof value === "string";
    }),
  );
}

function headersToRecord(headers: Headers): Record<string, string> {
  const result: Record<string, string> = {};
  headers.forEach((value, key) => {
    if (HOP_BY_HOP_HEADERS.has(key.toLowerCase())) {
      return;
    }
    result[key] = value;
  });
  return result;
}

async function readWebSocketMessagePayload(data: MessageEvent["data"]): Promise<{
  readonly text?: string;
  readonly bodyBase64?: string;
}> {
  if (typeof data === "string") {
    return { text: data };
  }

  if (data instanceof ArrayBuffer) {
    return { bodyBase64: Buffer.from(data).toString("base64") };
  }

  if (ArrayBuffer.isView(data)) {
    return {
      bodyBase64: Buffer.from(data.buffer, data.byteOffset, data.byteLength).toString("base64"),
    };
  }

  if (data instanceof Blob) {
    return { bodyBase64: Buffer.from(await data.arrayBuffer()).toString("base64") };
  }

  return { text: String(data) };
}

function encodeErrorResponseBody(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return Buffer.from(
    JSON.stringify({
      ok: false,
      error: `Failed to reach the local desktop backend (${message}).`,
    }),
  ).toString("base64");
}

export class DesktopTunnelClient {
  private readonly origin: string;
  private readonly routeId: string;
  private readonly routeToken: string;
  private readonly logger: DesktopTunnelLogger;
  private readonly fetchFn: typeof fetch;
  private readonly createWebSocket: DesktopTunnelWebSocketFactory;
  private readonly reconnectDelayMs: number;
  private readonly requestTimeoutMs: number;
  private localHttpUrl: string;
  private shouldRun = false;
  private controlSocket: WebSocket | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly localSockets = new Map<string, WebSocket>();
  private readonly pendingLocalSocketFrames = new Map<
    string,
    Array<Pick<DesktopTunnelWebSocketFrameMessage, "text" | "bodyBase64">>
  >();

  constructor(options: DesktopTunnelClientOptions) {
    this.origin = options.origin;
    this.routeId = options.routeId;
    this.routeToken = options.routeToken;
    this.localHttpUrl = options.localHttpUrl;
    this.logger = options.logger ?? (() => undefined);
    this.fetchFn = options.fetchFn ?? fetch;
    this.createWebSocket = options.createWebSocket ?? ((url) => new WebSocket(url));
    this.reconnectDelayMs = options.reconnectDelayMs ?? DEFAULT_RECONNECT_DELAY_MS;
    this.requestTimeoutMs = options.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;
  }

  get publicBaseUrl(): string {
    return buildDesktopTunnelPublicBaseUrl(this.origin, this.routeId);
  }

  updateLocalHttpUrl(localHttpUrl: string): void {
    this.localHttpUrl = localHttpUrl;
  }

  start(): void {
    this.shouldRun = true;
    if (this.controlSocket) {
      return;
    }
    this.connect();
  }

  async stop(): Promise<void> {
    this.shouldRun = false;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.closeAllLocalSockets(1012, "Desktop tunnel stopped");
    const socket = this.controlSocket;
    this.controlSocket = null;
    socket?.close(1000, "Desktop tunnel stopped");
  }

  private connect(): void {
    const controlUrl = buildDesktopTunnelControlUrl(this.origin, this.routeId, this.routeToken);
    this.logger(`desktop tunnel connecting controlUrl=${controlUrl}`);
    const socket = this.createWebSocket(controlUrl);
    this.controlSocket = socket;

    socket.addEventListener("open", () => {
      this.logger(`desktop tunnel connected routeId=${this.routeId}`);
    });

    socket.addEventListener("message", (event) => {
      void this.handleControlMessage(event.data);
    });

    socket.addEventListener("close", (event) => {
      if (this.controlSocket === socket) {
        this.controlSocket = null;
      }
      this.closeAllLocalSockets(1012, "Desktop tunnel disconnected");
      this.logger(
        `desktop tunnel disconnected routeId=${this.routeId} code=${event.code} reason=${event.reason || "none"}`,
      );
      if (this.shouldRun) {
        this.scheduleReconnect();
      }
    });

    socket.addEventListener("error", () => {
      this.logger(`desktop tunnel socket error routeId=${this.routeId}`);
    });
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) {
      return;
    }
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (!this.shouldRun || this.controlSocket) {
        return;
      }
      this.connect();
    }, this.reconnectDelayMs);
    this.reconnectTimer.unref?.();
  }

  private async handleControlMessage(rawData: MessageEvent["data"]): Promise<void> {
    const rawText = typeof rawData === "string" ? rawData : String(rawData);
    let message: DesktopTunnelInboundMessage;
    try {
      message = JSON.parse(rawText) as DesktopTunnelInboundMessage;
    } catch {
      this.logger("desktop tunnel ignored invalid control payload");
      return;
    }

    switch (message.type) {
      case "ping":
        this.sendControlMessage({ type: "pong" });
        return;
      case "http-request":
        await this.handleHttpRequest(message);
        return;
      case "ws-open":
        this.openLocalWebSocket(message);
        return;
      case "ws-frame":
        this.forwardWebSocketFrameToLocal(message);
        return;
      case "ws-close":
        this.closeLocalWebSocket(message.sessionId, message.code, message.reason);
        return;
      default:
        return;
    }
  }

  private async handleHttpRequest(message: DesktopTunnelRequestMessage): Promise<void> {
    const abortController = new AbortController();
    const timeout = setTimeout(() => abortController.abort(), this.requestTimeoutMs);
    timeout.unref?.();

    try {
      const response = await this.fetchFn(
        localHttpRequestUrl(
          this.localHttpUrl,
          normalizeTunnelTargetPath(message.path, this.routeId),
        ),
        {
          method: message.method,
          headers: normalizeHeaders(message.headers),
          ...(message.bodyBase64 ? { body: Buffer.from(message.bodyBase64, "base64") } : {}),
          signal: abortController.signal,
        },
      );
      const body = Buffer.from(await response.arrayBuffer());

      this.sendControlMessage({
        type: "http-response",
        requestId: message.requestId,
        status: response.status,
        headers: headersToRecord(response.headers),
        ...(body.length > 0 ? { bodyBase64: body.toString("base64") } : {}),
      });
    } catch (error) {
      this.sendControlMessage({
        type: "http-response",
        requestId: message.requestId,
        status: 502,
        headers: {
          "content-type": "application/json; charset=utf-8",
        },
        bodyBase64: encodeErrorResponseBody(error),
      });
    } finally {
      clearTimeout(timeout);
    }
  }

  private openLocalWebSocket(message: DesktopTunnelWebSocketOpenMessage): void {
    this.closeLocalWebSocket(message.sessionId, 1012, "Replaced by new session");
    this.pendingLocalSocketFrames.set(message.sessionId, []);

    const socket = this.createWebSocket(
      localWebSocketUrl(this.localHttpUrl, normalizeTunnelTargetPath(message.path, this.routeId)),
    );
    this.localSockets.set(message.sessionId, socket);

    socket.addEventListener("open", () => {
      this.flushPendingLocalSocketFrames(message.sessionId, socket);
      this.sendControlMessage({
        type: "ws-opened",
        sessionId: message.sessionId,
      });
    });

    socket.addEventListener("message", (event) => {
      void (async () => {
        const payload = await readWebSocketMessagePayload(event.data);
        this.sendControlMessage({
          type: "ws-frame",
          sessionId: message.sessionId,
          ...payload,
        });
      })();
    });

    socket.addEventListener("close", (event) => {
      if (this.localSockets.get(message.sessionId) === socket) {
        this.localSockets.delete(message.sessionId);
      }
      this.pendingLocalSocketFrames.delete(message.sessionId);
      this.sendControlMessage({
        type: "ws-close",
        sessionId: message.sessionId,
        code: event.code,
        reason: event.reason,
      });
    });

    socket.addEventListener("error", () => {
      this.sendControlMessage({
        type: "ws-close",
        sessionId: message.sessionId,
        code: 1011,
        reason: "Failed to connect to the local desktop websocket.",
      });
      this.closeLocalWebSocket(
        message.sessionId,
        1011,
        "Failed to connect to the local desktop websocket.",
      );
    });
  }

  private forwardWebSocketFrameToLocal(message: DesktopTunnelWebSocketFrameMessage): void {
    const socket = this.localSockets.get(message.sessionId);
    if (!socket) {
      return;
    }

    if (socket.readyState === WebSocket.CONNECTING) {
      const pendingFrames = this.pendingLocalSocketFrames.get(message.sessionId);
      if (!pendingFrames) {
        return;
      }
      pendingFrames.push({
        ...(message.text !== undefined ? { text: message.text } : {}),
        ...(message.bodyBase64 ? { bodyBase64: message.bodyBase64 } : {}),
      });
      return;
    }

    if (socket.readyState !== WebSocket.OPEN) {
      return;
    }

    this.sendFrameToLocalSocket(socket, message);
  }

  private closeLocalWebSocket(sessionId: string, code = 1000, reason = ""): void {
    const socket = this.localSockets.get(sessionId);
    if (!socket) {
      return;
    }
    this.localSockets.delete(sessionId);
    this.pendingLocalSocketFrames.delete(sessionId);
    if (socket.readyState === WebSocket.CLOSING || socket.readyState === WebSocket.CLOSED) {
      return;
    }
    socket.close(code, reason);
  }

  private closeAllLocalSockets(code: number, reason: string): void {
    for (const sessionId of this.localSockets.keys()) {
      this.closeLocalWebSocket(sessionId, code, reason);
    }
  }

  private sendControlMessage(message: DesktopTunnelOutboundMessage): void {
    const socket = this.controlSocket;
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      return;
    }
    socket.send(JSON.stringify(message));
  }

  private flushPendingLocalSocketFrames(sessionId: string, socket: WebSocket): void {
    const pendingFrames = this.pendingLocalSocketFrames.get(sessionId);
    if (!pendingFrames || pendingFrames.length === 0) {
      return;
    }

    for (const frame of pendingFrames) {
      this.sendFrameToLocalSocket(socket, frame);
    }
    this.pendingLocalSocketFrames.delete(sessionId);
  }

  private sendFrameToLocalSocket(
    socket: WebSocket,
    frame: Pick<DesktopTunnelWebSocketFrameMessage, "text" | "bodyBase64">,
  ): void {
    if (frame.text !== undefined) {
      socket.send(frame.text);
      return;
    }

    if (frame.bodyBase64) {
      socket.send(Buffer.from(frame.bodyBase64, "base64"));
    }
  }
}
