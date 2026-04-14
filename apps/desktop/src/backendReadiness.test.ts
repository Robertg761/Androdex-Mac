import { describe, expect, it, vi } from "vitest";

import {
  BackendReadinessAbortedError,
  isBackendReadinessAborted,
  waitForHttpReady,
  waitForHttpReadyWithGrace,
} from "./backendReadiness";

describe("waitForHttpReady", () => {
  it("returns once the backend reports a successful session endpoint", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(null, { status: 503 }))
      .mockResolvedValueOnce(new Response(null, { status: 200 }));

    await waitForHttpReady("http://127.0.0.1:3773", {
      fetchImpl,
      timeoutMs: 1_000,
      intervalMs: 0,
    });

    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("retries after a readiness request stalls past the per-request timeout", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockImplementationOnce(
        (_input, init) =>
          new Promise((_resolve, reject) => {
            init?.signal?.addEventListener(
              "abort",
              () => {
                reject(new Error("request timed out"));
              },
              { once: true },
            );
          }) as ReturnType<typeof fetch>,
      )
      .mockResolvedValueOnce(new Response(null, { status: 200 }));

    await waitForHttpReady("http://127.0.0.1:3773", {
      fetchImpl,
      timeoutMs: 100,
      intervalMs: 0,
      requestTimeoutMs: 1,
    });

    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("aborts an in-flight readiness wait", async () => {
    const controller = new AbortController();
    const fetchImpl = vi.fn<typeof fetch>().mockImplementation(
      () =>
        new Promise((_resolve, reject) => {
          controller.signal.addEventListener(
            "abort",
            () => {
              reject(new BackendReadinessAbortedError());
            },
            { once: true },
          );
        }) as ReturnType<typeof fetch>,
    );

    const waitPromise = waitForHttpReady("http://127.0.0.1:3773", {
      fetchImpl,
      timeoutMs: 1_000,
      intervalMs: 0,
      signal: controller.signal,
    });

    controller.abort();

    await expect(waitPromise).rejects.toBeInstanceOf(BackendReadinessAbortedError);
  });

  it("recognizes aborted readiness errors", () => {
    expect(isBackendReadinessAborted(new BackendReadinessAbortedError())).toBe(true);
    expect(isBackendReadinessAborted(new Error("nope"))).toBe(false);
  });

  it("extends the wait when the backend is still alive after the initial timeout", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(null, { status: 503 }))
      .mockResolvedValueOnce(new Response(null, { status: 200 }));
    const onGracePeriodStart = vi.fn();

    await waitForHttpReadyWithGrace("http://127.0.0.1:3773", {
      fetchImpl,
      initialTimeoutMs: 0,
      graceTimeoutMs: 100,
      intervalMs: 0,
      shouldExtendWait: () => true,
      onGracePeriodStart,
    });

    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(onGracePeriodStart).toHaveBeenCalledWith({
      initialTimeoutMs: 0,
      graceTimeoutMs: 100,
    });
  });

  it("preserves the initial timeout when the backend is no longer alive", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 503 }));

    await expect(
      waitForHttpReadyWithGrace("http://127.0.0.1:3773", {
        fetchImpl,
        initialTimeoutMs: 0,
        graceTimeoutMs: 100,
        intervalMs: 0,
        shouldExtendWait: () => false,
      }),
    ).rejects.toThrow("Timed out waiting for backend readiness");

    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("fails after the grace period if the backend never becomes ready", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 503 }));

    await expect(
      waitForHttpReadyWithGrace("http://127.0.0.1:3773", {
        fetchImpl,
        initialTimeoutMs: 0,
        graceTimeoutMs: 0,
        intervalMs: 0,
        shouldExtendWait: () => true,
      }),
    ).rejects.toThrow("Timed out waiting for backend readiness");

    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });
});
