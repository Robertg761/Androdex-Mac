import { describe, expect, it } from "vitest";

import { resolveAndrodexPairingDeepLink } from "./ConnectionsSettings";

describe("resolveAndrodexPairingDeepLink", () => {
  it("wraps a browser pairing url in the Androdex app deep link", () => {
    expect(resolveAndrodexPairingDeepLink("https://mac.example.com/pair#token=pair_123")).toBe(
      "androdex://pair?payload=https%3A%2F%2Fmac.example.com%2Fpair%23token%3Dpair_123",
    );
  });
});
