import { describe, expect, it } from "vitest";

import {
  buildPairingUrl,
  getPairingTokenFromUrl,
  normalizePairingBaseUrl,
  resolvePairingPathname,
  setPairingTokenOnUrl,
  stripPairingTokenFromUrl,
} from "./pairingUrl.ts";

describe("resolvePairingPathname", () => {
  it("targets the root pairing route for root-hosted backends", () => {
    expect(resolvePairingPathname("/")).toBe("/pair");
    expect(resolvePairingPathname("")).toBe("/pair");
  });

  it("preserves non-root base paths", () => {
    expect(resolvePairingPathname("/androdex")).toBe("/androdex/pair");
    expect(resolvePairingPathname("/androdex/")).toBe("/androdex/pair");
  });
});

describe("normalizePairingBaseUrl", () => {
  it("strips query and hash from the base url", () => {
    expect(
      normalizePairingBaseUrl(" https://remote.example.com/androdex/?ignored=true#fragment "),
    ).toBe("https://remote.example.com/androdex");
  });

  it("rejects non-http schemes", () => {
    expect(() => normalizePairingBaseUrl("wss://remote.example.com/androdex")).toThrow(
      "Pairing base URL must use http or https.",
    );
  });
});

describe("pairing token helpers", () => {
  it("prefers the hash token and strips both token locations", () => {
    const url = new URL("https://remote.example.com/pair?token=old#token=new");

    expect(getPairingTokenFromUrl(url)).toBe("new");
    expect(stripPairingTokenFromUrl(url).toString()).toBe("https://remote.example.com/pair");
  });

  it("stores pairing tokens in the hash", () => {
    expect(
      setPairingTokenOnUrl(new URL("https://remote.example.com/pair"), "pair_123").toString(),
    ).toBe("https://remote.example.com/pair#token=pair_123");
  });
});

describe("buildPairingUrl", () => {
  it("builds a shareable pairing url from a root-hosted endpoint", () => {
    expect(buildPairingUrl("https://remote.example.com", "pair_123")).toBe(
      "https://remote.example.com/pair#token=pair_123",
    );
  });

  it("preserves a configured base path", () => {
    expect(buildPairingUrl("https://remote.example.com/androdex", "pair_123")).toBe(
      "https://remote.example.com/androdex/pair#token=pair_123",
    );
  });
});
