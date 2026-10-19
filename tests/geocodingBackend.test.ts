import { it, expect, vi, afterEach } from "vitest";
import { geocode } from "../supabase/functions/_shared/geocoding";
function setup(cached?: object) {
  vi.stubGlobal("Deno", { env: { get: () => "private-test-key" } });
  const upsert = vi.fn().mockResolvedValue({ error: null });
  const db = {
    from: vi.fn(() => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: cached, error: null }),
        }),
      }),
      upsert,
    })),
    rpc: vi.fn().mockResolvedValue({ data: true, error: null }),
  };
  const fetcher = vi.fn().mockResolvedValue(
    new Response(
      JSON.stringify({
        results: [
          { lat: 34.6, lon: 135.5, name: "ホテル", rank: { confidence: 1 } },
        ],
      }),
      { status: 200 },
    ),
  );
  vi.stubGlobal("fetch", fetcher);
  return { db, fetcher, upsert };
}
afterEach(() => vi.unstubAllGlobals());
it("keeps keys server side and correctly orders provider proximity coordinates", async () => {
  const { db, fetcher } = setup();
  const r = await geocode(db, "user", {
    action: "autocomplete",
    text: "大阪 ホテル",
    center: { lat: 34.6, lng: 135.5 },
  });
  const url = new URL(fetcher.mock.calls[0][0]);
  expect(url.pathname).toBe("/v1/geocode/autocomplete");
  expect(url.searchParams.get("lang")).toBe("ja");
  expect(url.searchParams.get("bias")).toBe("proximity:135.5,34.6");
  expect(JSON.stringify(r)).not.toContain("private-test-key");
  expect(db.rpc.mock.calls.map((c) => c[1].p_limit)).toEqual([500, 300, 1]);
});
it("uses cached responses without spending provider quota", async () => {
  const { db, fetcher } = setup({
    results: [],
    expires_at: new Date(Date.now() + 60000).toISOString(),
  });
  expect(
    await geocode(db, "user", { text: "hotel", action: "geocode" }),
  ).toEqual({ results: [] });
  expect(fetcher).not.toHaveBeenCalled();
  expect(db.rpc).not.toHaveBeenCalled();
});
it("fails closed when budget or credentials are unavailable", async () => {
  const { db, fetcher } = setup();
  db.rpc.mockResolvedValue({ data: false, error: null });
  await expect(geocode(db, "user", { text: "hotel" })).rejects.toThrow(
    "usage limit",
  );
  expect(fetcher).not.toHaveBeenCalled();
  vi.stubGlobal("Deno", { env: { get: () => undefined } });
  await expect(geocode(db, "user", { text: "hotel" })).rejects.toThrow(
    "not configured",
  );
});
it("does not expose the provider URL/key in provider errors", async () => {
  const { db, fetcher } = setup();
  fetcher.mockResolvedValue(new Response("private-test-key", { status: 429 }));
  await expect(geocode(db, "user", { text: "hotel" })).rejects.toThrow(
    "rate limit",
  );
});

it("sanitizes network exceptions that may contain a provider key", async () => {
  const { db, fetcher } = setup();
  fetcher.mockRejectedValue(
    new Error("failed https://api.geoapify.com?apiKey=private-test-key"),
  );
  await expect(geocode(db, "user", { text: "hotel" })).rejects.toThrow(
    "timed out or is unavailable",
  );
});
