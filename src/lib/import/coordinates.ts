import type { Place, Trip } from "../model";
export type CoordinateRow = Record<string, string>;
export type LocationEvidence = {
  latitude: number;
  longitude: number;
  precision: "property" | "building" | "approximate" | "supplied";
  provider: string;
  query?: string;
  attribution?: string;
  license?: string;
  importedAt: string;
};
export type CoordinateDecision = {
  record: string;
  placeId?: string;
  name: string;
  status: "ready" | "review" | "unmatched" | "invalid";
  reason: string;
  evidence?: LocationEvidence;
};
export const canonical = (s: string) =>
  s
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[‐‑–—]/g, "-")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
const same = (a?: string, b?: string) =>
  !!a && !!b && canonical(a) === canonical(b);
const pick = (r: CoordinateRow, ...keys: string[]) =>
  keys.map((k) => r[k]?.trim()).find(Boolean) || "";
export function isCoordinateCSV(rows: CoordinateRow[]) {
  const r = rows[0] || {};
  return (
    (("latitude" in r && "longitude" in r) || ("lat" in r && "lon" in r)) &&
    [
      "record_id",
      "original_record_id",
      "query.text",
      "original_geocode_query",
      "geocode_query",
    ].some((k) => k in r)
  );
}
export function distanceKm(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
) {
  const rad = Math.PI / 180,
    dlat = (b.lat - a.lat) * rad,
    dlng = (b.lng - a.lng) * rad;
  return (
    6371 *
    2 *
    Math.asin(
      Math.min(
        1,
        Math.sqrt(
          Math.sin(dlat / 2) ** 2 +
            Math.cos(a.lat * rad) *
              Math.cos(b.lat * rad) *
              Math.sin(dlng / 2) ** 2,
        ),
      ),
    )
  );
}
export function sourceQueries(p: Place) {
  return [
    p.mapQuery,
    p.researchData?.geocode_query,
    p.researchData?.map_query,
    p.researchData?.original_geocode_query,
    p.researchData?.address && p.researchData?.name
      ? `${p.researchData.name}, ${p.researchData.address}`
      : undefined,
    p.address,
    p.address ? `${p.name}, ${p.address}` : undefined,
  ].filter(Boolean) as string[];
}
function ids(p: Place) {
  return [
    p.id,
    p.researchKey,
    ...(p.researchKeys || []),
    p.propertyId,
    p.researchData?.record_id,
    p.researchData?.listing_id,
    p.researchData?.hotel_id,
    p.researchData?.attraction_id,
    ...[p.researchKey, ...(p.researchKeys || [])].map((k) =>
      k?.split(":").slice(1).join(":"),
    ),
  ].filter(Boolean) as string[];
}
function idMatches(p: Place, id: string) {
  return (
    ids(p).some((k) => same(k, id)) ||
    (p.kind === "hotel" &&
      /^APA-\d+$/i.test(id) &&
      !!p.propertyId &&
      same(p.propertyId.replace(/^APA[- ]?/i, ""), id.slice(4)))
  );
}
export function assessCoordinates(
  r: CoordinateRow,
  p: Place,
  trip?: Trip,
): Omit<CoordinateDecision, "record" | "placeId" | "name"> {
  const latText = pick(r, "latitude", "lat"),
    lngText = pick(r, "longitude", "lon");
  const lat = Number(latText),
    lng = Number(lngText);
  if (
    !latText ||
    !lngText ||
    !Number.isFinite(lat) ||
    !Number.isFinite(lng) ||
    Math.abs(lat) > 90 ||
    Math.abs(lng) > 180
  )
    return {
      status: "invalid",
      reason:
        "Missing or invalid latitude/longitude. Coordinates are never silently swapped.",
    };
  const provider = [
    "original_record_id",
    "query.text",
    "confidence",
    "rank.confidence",
    "formatted",
    "result_type",
  ].some((k) => k in r);
  const query = pick(
    r,
    "original_geocode_query",
    "query.text",
    "geocode_query",
  );
  const returnedName = pick(r, "name", "address_line1"),
    expectedName = pick(r, "original_name") || p.name;
  const exactName = same(returnedName, expectedName);
  const type = pick(r, "result_type");
  const approximate =
    [
      "city",
      "district",
      "suburb",
      "postcode",
      "street",
      "county",
      "state",
      "country",
    ].includes(type) ||
    (!exactName && !r.housenumber);
  const precision = !provider
    ? "supplied"
    : approximate
      ? "approximate"
      : exactName
        ? "property"
        : "building";
  const evidence: LocationEvidence = {
    latitude: lat,
    longitude: lng,
    precision,
    provider: provider ? "Geoapify" : "Coordinate CSV",
    query,
    attribution: pick(r, "attribution", "datasource.attribution"),
    license: pick(r, "attribution_license", "datasource.license"),
    importedAt: new Date().toISOString(),
  };
  const review = (
    reason: string,
  ): Omit<CoordinateDecision, "record" | "placeId" | "name"> => ({
    status: "review",
    reason,
    evidence,
  });
  if (p.coordinateStatus === "DO_NOT_GEOCODE_NO_UNIQUE_LISTING")
    return review("No unique property identity; existing location preserved.");
  const point = { lat, lng };
  const anchors =
    trip?.places.filter(
      (a) =>
        !a.demo && a.id !== p.id && a.lat !== undefined && a.lng !== undefined,
    ) || [];
  if (
    anchors.length &&
    anchors.every((a) => distanceKm(point, { lat: a.lat!, lng: a.lng! }) > 300)
  )
    return review(
      "Coordinates are over 300 km from all known trip locations; verify city or reversed coordinates.",
    );
  if (
    p.lat !== undefined &&
    p.lng !== undefined &&
    !p.demo &&
    distanceKm(point, { lat: p.lat, lng: p.lng }) > 5
  )
    return review(
      "Result conflicts with the existing pin by more than 5 km; existing location preserved.",
    );
  if (provider) {
    const expectedPostcode = p.address.match(/\b\d{3}-\d{4}\b/)?.[0];
    if (
      expectedPostcode &&
      r.postcode &&
      canonical(expectedPostcode) !== canonical(r.postcode)
    )
      return review("Returned postcode differs from the saved full address.");
    const area = pick(r, "city", "county", "state");
    const expected = canonical(
      [p.address, p.mapQuery, trip?.destination].filter(Boolean).join(" "),
    );
    const areaText = canonical(area);
    if (!areaText || !(" " + expected + " ").includes(" " + areaText + " "))
      return review(
        "Returned city/area does not match the saved address or trip destination.",
      );
    if (approximate)
      return review(
        "Approximate district, postcode or street result; not an exact property location.",
      );
    const confidence = Number(pick(r, "confidence", "rank.confidence") || "0");
    const building = Number(
      pick(r, "confidence_building_level", "rank.confidence_building_level") ||
        "0",
    );
    const address = canonical(p.address);
    const house = canonical(r.housenumber || ""),
      street = canonical(r.street || "");
    const exactBuilding =
      building >= 0.9 &&
      !!house &&
      !!street &&
      address.includes(house) &&
      address.includes(street);
    if (confidence < 0.85 || !(exactName || exactBuilding))
      return review(
        "Low confidence or property identity mismatch; verify the returned business/building.",
      );
  }
  return {
    status: "ready",
    reason: provider
      ? "Reliable property/building match and consistent area."
      : "Explicit record coordinates validated; no provider accuracy claim.",
    evidence,
  };
}
export function reconcileCoordinates(
  trip: Trip,
  rows: CoordinateRow[],
): CoordinateDecision[] {
  if (!rows.length || rows.length > 1000)
    throw new Error("Coordinate CSV must contain 1–1,000 rows.");
  const decisions = rows.map((r, i): CoordinateDecision => {
    const record = pick(r, "record_id", "original_record_id"),
      query = pick(r, "original_geocode_query", "query.text", "geocode_query");
    const eligible = trip.places.filter(
      (p) => p.kind === "hotel" || p.kind === "attraction",
    );
    const byId = record ? eligible.filter((p) => idMatches(p, record)) : [];
    const byQuery = query
      ? eligible.filter((p) => sourceQueries(p).some((q) => same(q, query)))
      : [];
    const matches = byId.length ? byId : byQuery;
    const base = {
      record: record || query || `Row ${i + 2}`,
      name: pick(r, "original_name", "name") || record,
    };
    if (matches.length !== 1)
      return {
        ...base,
        status: "unmatched",
        reason: matches.length
          ? "Identifier/query matches multiple saved places."
          : "No saved place matches this ID or exact source query.",
      };
    const p = matches[0];
    if (byId.length && byQuery.length && !byQuery.some((q) => q.id === p.id))
      return {
        ...base,
        status: "review",
        reason: "Record ID and source query identify different places.",
      };
    return {
      ...base,
      name: p.name,
      placeId: p.id,
      ...assessCoordinates(r, p, trip),
    };
  });
  // Conflicting rows for one record are never resolved by file order.
  for (const d of decisions) {
    if (!d.placeId || !d.evidence) continue;
    if (
      decisions.some(
        (other) =>
          other !== d &&
          other.placeId === d.placeId &&
          other.evidence &&
          (other.evidence.latitude !== d.evidence!.latitude ||
            other.evidence.longitude !== d.evidence!.longitude),
      )
    ) {
      d.status = "review";
      d.reason = "Conflicting coordinates for the same saved record.";
    }
  }
  return decisions;
}
export function applyCoordinates(
  trip: Trip,
  decisions: CoordinateDecision[],
): Trip {
  const next = structuredClone(trip);
  for (const p of next.places) {
    const ds = decisions.filter((d) => d.placeId === p.id);
    const ready = ds.find((d) => d.status === "ready" && d.evidence);
    if (ready?.evidence) {
      p.lat = ready.evidence.latitude;
      p.lng = ready.evidence.longitude;
      p.demo = false;
      p.coordinateStatus =
        ready.evidence.precision === "supplied"
          ? "IMPORTED_COORDINATES"
          : "GEOCODED_EXACT";
      p.locationEvidence = ready.evidence;
      delete p.locationReview;
    } else if (ds.length)
      p.locationReview = ds.map((d) => ({
        reason: d.reason,
        evidence: d.evidence,
      }));
  }
  return next;
}
