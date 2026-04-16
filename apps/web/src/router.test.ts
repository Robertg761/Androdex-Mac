import { describe, expect, it } from "vitest";

import { resolveRouterBasepath } from "./routerBasepath";

describe("resolveRouterBasepath", () => {
  it("keeps the relay desktop route prefix for tunneled paths", () => {
    expect(resolveRouterBasepath("/desktop/route-123/pair")).toBe("/desktop/route-123");
    expect(resolveRouterBasepath("/desktop/route-123")).toBe("/desktop/route-123");
    expect(resolveRouterBasepath("/desktop/route-123/threads/thread-1")).toBe(
      "/desktop/route-123",
    );
  });

  it("falls back to the root basepath for non-tunneled paths", () => {
    expect(resolveRouterBasepath("/pair")).toBe("/");
    expect(resolveRouterBasepath("/")).toBe("/");
  });
});
