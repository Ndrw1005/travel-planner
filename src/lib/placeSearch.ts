import { api } from "./api";
import type { Place, Trip } from "./model";
import {
  assessCoordinates,
  canonical,
  distanceKm,
  type CoordinateRow,
} from "./import/coordinates";
export type SearchResult = {
  lat: number;
  lon: number;
  name: string;
  formatted: string;
  city: string;
  state: string;
  country: string;
  postcode: string;
  housenumber: string;
  street: string;
  result_type: string;
  place_id: string;
  rank: Record<string, number | string>;
  datasource: Record<string, string>;
};
const cache = new Map<string, SearchResult[]>(),
  pending = new Map<string, Promise<SearchResult[]>>();
let queue: Promise<unknown> = Promise.resolve(),
  last = 0;
export const locationSignature = (p: Place) =>
  canonical([p.name, p.address, p.mapQuery].join("|"));
export const unresolved = (p: Place) =>
  (p.lat === undefined || p.lng === undefined) &&
  p.coordinateStatus !== "DO_NOT_GEOCODE_NO_UNIQUE_LISTING" &&
  !!p.name.trim();
export function searchCenter(trip: Trip) {
  const base = trip.places.find(
    (p) =>
      p.id === trip.baseId &&
      !p.demo &&
      p.lat !== undefined &&
      p.lng !== undefined,
  );
  if (base) return { lat: base.lat!, lng: base.lng! };
  if (/osaka|大阪/i.test(trip.destination))
    return { lat: 34.6937, lng: 135.5023 };
  const first = trip.places.find(
    (p) => !p.demo && p.lat !== undefined && p.lng !== undefined,
  );
  return first ? { lat: first.lat!, lng: first.lng! } : undefined;
}
export function searchPlaces(
  text: string,
  trip: Trip,
  autocomplete = false,
  signal?: AbortSignal,
): Promise<SearchResult[]> {
  const center = searchCenter(trip),
    action = autocomplete ? "autocomplete" : "geocode";
  const key = JSON.stringify([action, text.trim(), center]);
  if (cache.has(key)) return Promise.resolve(cache.get(key)!);
  if (pending.has(key)) return pending.get(key)!;
  const work = queue
    .catch(() => {})
    .then(async () => {
      await new Promise((r) =>
        setTimeout(r, Math.max(0, 2500 - (Date.now() - last))),
      );
      signal?.throwIfAborted();
      last = Date.now();
      const data = await api(action, { text, center });
      const rows: SearchResult[] = data.results || [];
      if (cache.size >= 500) cache.delete(cache.keys().next().value!);
      cache.set(key, rows);
      return rows;
    });
  queue = work;
  pending.set(key, work);
  void work.finally(() => pending.delete(key)).catch(() => {});
  return work;
}
export function providerRow(r: SearchResult, p: Place): CoordinateRow {
  return {
    original_record_id: p.id,
    original_name: p.name,
    lat: String(r.lat),
    lon: String(r.lon),
    name: r.name,
    formatted: r.formatted,
    city: r.city,
    state: r.state,
    country: r.country,
    postcode: r.postcode,
    housenumber: r.housenumber,
    street: r.street,
    result_type: r.result_type,
    confidence: String(r.rank.confidence ?? 0),
    confidence_building_level: String(r.rank.confidence_building_level ?? 0),
    attribution: r.datasource.attribution || "© OpenStreetMap contributors",
    attribution_license: r.datasource.license || "",
  };
}
export function evaluateResults(
  results: SearchResult[],
  p: Place,
  trip: Trip,
): Partial<Place> {
  const evaluated = results.map((r) => ({
    r,
    decision: assessCoordinates(providerRow(r, p), p, trip),
  }));
  const ready = evaluated.filter((x) => x.decision.status === "ready");
  if (
    ready.length &&
    ready.every(
      (x) =>
        distanceKm(
          { lat: x.r.lat, lng: x.r.lon },
          { lat: ready[0].r.lat, lng: ready[0].r.lon },
        ) < 0.1,
    )
  ) {
    const { r, decision } = ready[0];
    return {
      lat: r.lat,
      lng: r.lon,
      demo: false,
      coordinateStatus: "GEOCODED_EXACT",
      locationEvidence: decision.evidence,
      locationReview: undefined,
    };
  }
  return {
    locationReview: evaluated.length
      ? evaluated.map((x) => ({
          reason:
            ready.length > 1
              ? "Multiple plausible properties; review required."
              : x.decision.reason,
          evidence: x.decision.evidence,
        }))
      : [{ reason: "No location found. Check the name/address and retry." }],
  };
}
export async function resolvePlace(p: Place, trip: Trip, signal?: AbortSignal) {
  const queries = [
    p.mapQuery,
    `${p.name}, ${trip.destination}`,
    p.address ? `${p.name}, ${p.address}` : undefined,
    p.address,
  ].filter(Boolean) as string[];
  let results: SearchResult[] = [];
  for (const query of [...new Set(queries)].slice(0, 3)) {
    signal?.throwIfAborted();
    results = [...results, ...(await searchPlaces(query, trip, false, signal))];
    const patch = evaluateResults(results, p, trip);
    if (patch.lat !== undefined) return patch;
  }
  return evaluateResults(results, p, trip);
}

export function selectedLocation(r: SearchResult): Partial<Place> {
  const approximate = [
    "city",
    "district",
    "suburb",
    "postcode",
    "street",
    "county",
    "state",
    "country",
  ].includes(r.result_type);
  return {
    lat: r.lat,
    lng: r.lon,
    demo: false,
    coordinateStatus: "SEARCH_SELECTED",
    locationReview: undefined,
    locationEvidence: {
      latitude: r.lat,
      longitude: r.lon,
      precision: approximate ? "approximate" : r.name ? "property" : "building",
      provider: "Geoapify (selected result)",
      attribution: r.datasource.attribution || "© OpenStreetMap contributors",
      license: r.datasource.license || "",
      importedAt: new Date().toISOString(),
    },
  };
}
