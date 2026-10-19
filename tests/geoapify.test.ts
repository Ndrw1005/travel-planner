import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { geoapifyRequest } from "../src/lib/geoapify";
let storage: Map<string, string>;
const result = {
  lat: 34.69,
  lon: 135.5,
  name: "Hotel",
  rank: { confidence: 0.99 },
};
beforeEach(() => {
  storage = new Map();
  vi.stubEnv("VITE_GEOAPIFY_KEY", "restricted-test-key");
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => storage.get(k) || null,
    setItem: (k: string, v: string) => storage.set(k, v),
  });
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValue({
        ok: true,
        json: async () => ({ results: [result] }),
      }),
  );
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
it("uses direct Japanese autocomplete, longitude-first bias and origin-only cross-origin referrer", async () => {
  await geoapifyRequest("autocomplete", {
    text: "大阪",
    center: { lat: 34.69, lng: 135.5 },
  });
  const [url, options] = vi.mocked(fetch).mock.calls[0];
  const u = new URL(String(url));
  expect(u.hostname).toBe("api.geoapify.com");
  expect(u.pathname).toBe("/v1/geocode/autocomplete");
  expect(u.searchParams.get("bias")).toBe("proximity:135.5,34.69");
  expect(u.searchParams.get("lang")).toBe("ja");
  expect(options).toMatchObject({
    credentials: "omit",
    referrerPolicy: "strict-origin-when-cross-origin",
  });
});
it("persists cached responses without storing the credential in cache", async () => {
  await geoapifyRequest("geocode", { text: "Test Hotel" });
  await geoapifyRequest("geocode", { text: "Test Hotel" });
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(storage.get("wayfarer-geoapify-cache-v1")).not.toContain(
    "restricted-test-key",
  );
});
it("blocks network requests at the local daily budget", async () => {
  storage.set(
    "wayfarer-geoapify-budget-v1",
    JSON.stringify({ day: Date.now(), count: 500 }),
  );
  await expect(geoapifyRequest("geocode", { text: "Hotel" })).rejects.toThrow(
    "limit reached",
  );
  expect(fetch).not.toHaveBeenCalled();
});
it("requires a key and valid search coordinates", async () => {
  await expect(
    geoapifyRequest("geocode", {
      text: "Hotel",
      center: { lat: 135, lng: 34 },
    }),
  ).rejects.toThrow("Invalid search area");
  vi.stubEnv("VITE_GEOAPIFY_KEY", "");
  await expect(geoapifyRequest("geocode", { text: "Hotel" })).rejects.toThrow(
    "browser-restricted",
  );
  expect(fetch).not.toHaveBeenCalled();
});
it("rejects invalid provider coordinates", async () => {
  vi.mocked(fetch).mockResolvedValue({
    ok: true,
    json: async () => ({ results: [result, { lat: 135, lon: 34 }, null] }),
  } as Response);
  expect(
    (await geoapifyRequest("geocode", { text: "Hotel" })).results,
  ).toHaveLength(1);
});
it("reports restriction errors without exposing provider URLs or keys", async () => {
  vi.mocked(fetch).mockResolvedValue({ ok: false, status: 403 } as Response);
  await expect(geoapifyRequest("geocode", { text: "Hotel" })).rejects.toThrow(
    "key or website origin",
  );
});
it("fails closed when usage storage is unavailable", async () => {
  vi.stubGlobal("localStorage", {
    getItem: () => {
      throw Error("blocked");
    },
  });
  await expect(geoapifyRequest("geocode", { text: "Hotel" })).rejects.toThrow(
    "usage tracking",
  );
  expect(fetch).not.toHaveBeenCalled();
});
