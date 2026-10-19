import { it, expect, vi, beforeEach } from "vitest";
import { seedTrip } from "../src/lib/seed";
import type { SearchResult } from "../src/lib/placeSearch";
vi.mock("../src/lib/api", () => ({ api: vi.fn() }));
import {
  evaluateResults,
  searchCenter,
  locationSignature,
  searchPlaces,
  resolvePlace,
} from "../src/lib/placeSearch";
import { api } from "../src/lib/api";
const result: SearchResult = {
  lat: 34.68,
  lon: 135.5,
  name: "Test Hotel",
  formatted: "10 Test Street, Osaka",
  city: "Osaka",
  state: "Osaka",
  country: "Japan",
  postcode: "",
  housenumber: "10",
  street: "Test Street",
  result_type: "amenity",
  place_id: "test",
  rank: { confidence: 0.99 },
  datasource: { attribution: "© OpenStreetMap contributors" },
};
const trip = () => {
  const t = seedTrip();
  t.places = [
    {
      ...t.places[0],
      id: "test",
      kind: "hotel",
      name: "Test Hotel",
      address: result.formatted,
      lat: undefined,
      lng: undefined,
      demo: false,
    },
  ];
  return t;
};
beforeEach(() => vi.mocked(api).mockReset());
it("accepts a reliable hotel and retains metadata independently of price/research", () => {
  const t = trip();
  const patch = evaluateResults([result], t.places[0], t);
  expect(patch).toMatchObject({
    lat: 34.68,
    lng: 135.5,
    coordinateStatus: "GEOCODED_EXACT",
  });
  expect(patch).not.toHaveProperty("cost");
});
it("flags competing properties, wrong towns and generic districts", () => {
  const t = trip();
  for (const rows of [
    [result, { ...result, lat: 34.71 }],
    [{ ...result, city: "Tokyo" }],
    [{ ...result, name: "Osaka", result_type: "city" }],
  ])
    expect(evaluateResults(rows, t.places[0], t).lat).toBeUndefined();
});
it("biases Osaka but does not impose Osaka on a new destination", () => {
  const t = trip();
  expect(searchCenter(t)).toMatchObject({ lat: 34.6937 });
  t.destination = "Paris, France";
  expect(searchCenter(t)).toBeUndefined();
  t.places[0].lat = 48.85;
  t.places[0].lng = 2.35;
  expect(searchCenter(t)).toEqual({ lat: 48.85, lng: 2.35 });
});
it("invalidates attempted queries when addresses change", () => {
  const p = trip().places[0];
  expect(locationSignature(p)).not.toBe(
    locationSignature({ ...p, address: "Other address" }),
  );
});
it("deduplicates requests and reuses cached results", async () => {
  vi.mocked(api).mockResolvedValue({ results: [result] });
  const t = trip();
  await Promise.all([
    searchPlaces("dedup test", t),
    searchPlaces("dedup test", t),
  ]);
  await searchPlaces("dedup test", t);
  expect(api).toHaveBeenCalledTimes(1);
});
it("tries another query when the first result is not a property", async () => {
  vi.useFakeTimers();
  vi.mocked(api)
    .mockResolvedValueOnce({
      results: [{ ...result, name: "Osaka", result_type: "city" }],
    })
    .mockResolvedValueOnce({ results: [result] });
  const t = trip();
  const work = resolvePlace(t.places[0], t);
  await vi.runAllTimersAsync();
  expect(await work).toMatchObject({ lat: 34.68, lng: 135.5 });
  expect(api).toHaveBeenCalledTimes(2);
  vi.useRealTimers();
});
