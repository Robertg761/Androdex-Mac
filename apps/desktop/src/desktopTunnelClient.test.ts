import { describe, expect, it, vi } from "vitest";

import {
  buildDesktopTunnelControlUrl,
  buildDesktopTunnelPublicBaseUrl,
  DesktopTunnelClient,
} from "./desktopTunnelClient";

class FakeWebSocket {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;

  readonly url: string;
  readyState = FakeWebSocket.CONNECTING;
  readonly sent: unknown[] = [];
  private readonly listeners = new Map<string, Set<(event: any) => void>>();

  constructor(url: string) {
    this.url = url;
  }

  addEventListener(type: string, listener: (event: any) => void): void {
    const listeners = this.listeners.get(type) ?? new Set();
    listeners.add(listener);
    this.listeners.set(type, listeners);
  }

  send(value: unknown): void {
    this.sent.push(value);
  }

  close(code = 1000, reason = ""): void {
    this.readyState = FakeWebSocket.CLOSED;
    this.dispatch("close", { code, reason });
  }

  open(): void {
    this.readyState = FakeWebSocket.OPEN;
    this.dispatch("open", {});
  }

  message(data: unknown): void {
    this.dispatch("message", { data });
  }

  error(): void {
    this.dispatch("error", {});
  }

  private dispatch(type: string, event: any): void {
    for (const listener of this.listeners.get(type) ?? []) {
      listener(event);
    }
  }
}

describe("desktopTunnelClient", () => {
  it("builds stable public and control URLs with preserved base paths", () => {
    expect(buildDesktopTunnelPublicBaseUrl("https://relay.example.com/androdex", "route-123")).toBe(
      "https://relay.example.com/androdex/desktop/route-123",
    );
    expect(
      buildDesktopTunnelControlUrl("https://relay.example.com/androdex", "route-123", "token-456"),
    ).toBe(
      "wss://relay.example.com/androdex/desktop-tunnel/connect?routeId=route-123&routeToken=token-456",
    );
  });

  it("forwards HTTP requests from the control socket to the local backend", async () => {
    const sockets: FakeWebSocket[] = [];
    const fetchFn = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: {
          "content-type": "application/json",
        },
      }),
    );
    const client = new DesktopTunnelClient({
      origin: "https://relay.example.com",
      routeId: "route-1",
      routeToken: "token-1",
      localHttpUrl: "http://127.0.0.1:3773",
      fetchFn,
      createWebSocket: (url) => {
        const socket = new FakeWebSocket(url);
        sockets.push(socket);
        return socket as unknown as WebSocket;
      },
    });

    client.start();
    const controlSocket = sockets[0]!;
    controlSocket.open();
    controlSocket.message(
      JSON.stringify({
        type: "http-request",
        requestId: "request-1",
        method: "POST",
        path: "/desktop/route-1/api/orchestration/dispatch?via=tunnel",
        headers: {
          authorization: "Bearer abc",
          "content-type": "application/json",
        },
        bodyBase64: Buffer.from(JSON.stringify({ hello: "world" })).toString("base64"),
      }),
    );

    await vi.waitFor(() => {
      expect(fetchFn).toHaveBeenCalledWith(
        "http://127.0.0.1:3773/desktop/route-1/api/orchestration/dispatch?via=tunnel",
        expect.objectContaining({
          method: "POST",
        }),
      );
    });

    await vi.waitFor(() => {
      const responseMessage = JSON.parse(String(controlSocket.sent.at(-1))) as {
        readonly type: string;
        readonly requestId: string;
        readonly status: number;
      };
      expect(responseMessage).toMatchObject({
        type: "http-response",
        requestId: "request-1",
        status: 200,
      });
    });
  });

  it("proxies websocket frames between the control socket and the local backend", async () => {
    const sockets: FakeWebSocket[] = [];
    const client = new DesktopTunnelClient({
      origin: "https://relay.example.com",
      routeId: "route-1",
      routeToken: "token-1",
      localHttpUrl: "http://127.0.0.1:3773",
      createWebSocket: (url) => {
        const socket = new FakeWebSocket(url);
        sockets.push(socket);
        return socket as unknown as WebSocket;
      },
    });

    client.start();
    const controlSocket = sockets[0]!;
    controlSocket.open();
    controlSocket.message(
      JSON.stringify({
        type: "ws-open",
        sessionId: "session-1",
        path: "/ws?wsToken=token-123",
      }),
    );

    const localSocket = sockets[1]!;
    expect(localSocket.url).toBe("ws://127.0.0.1:3773/ws?wsToken=token-123");

    localSocket.open();
    expect(JSON.parse(String(controlSocket.sent.at(-1)))).toMatchObject({
      type: "ws-opened",
      sessionId: "session-1",
    });

    controlSocket.message(
      JSON.stringify({
        type: "ws-frame",
        sessionId: "session-1",
        text: "from-public-client",
      }),
    );
    expect(localSocket.sent.at(-1)).toBe("from-public-client");

    localSocket.message("from-local-backend");

    await vi.waitFor(() => {
      expect(JSON.parse(String(controlSocket.sent.at(-1)))).toMatchObject({
        type: "ws-frame",
        sessionId: "session-1",
        text: "from-local-backend",
      });
    });
  });
});
