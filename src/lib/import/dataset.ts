import { assessCoordinates } from "./coordinates";
import { type Place, type Observation, type Trip, uid } from "../model";
import { emptyDetails } from "./types";
import { normalize } from "./parser";
export type DataRow = {
  key: string;
  kind: "hotel" | "flight" | "attraction";
  name: string;
  place?: Place;
  observation?: Observation;
  raw: Record<string, string>;
  issues: string[];
};
export type Dataset = {
  name: string;
  rows: DataRow[];
  photos: Record<string, Uint8Array>;
  issues: string[];
};
export function csvRows(text: string): Record<string, string>[] {
  text = text.replace(/^\uFEFF/, "");
  const records: string[][] = [];
  let row: string[] = [],
    cell = "",
    quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      if (quoted && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (quoted || !cell) quoted = !quoted;
      else throw new Error("Malformed CSV quote");
    } else if (!quoted && (c === "," || c === "\n" || c === "\r")) {
      row.push(cell);
      cell = "";
      if (c !== ",") {
        if (c === "\r" && text[i + 1] === "\n") i++;
        if (row.some(Boolean)) records.push(row);
        row = [];
      }
    } else cell += c;
  }
  if (quoted) throw new Error("Unclosed CSV quote");
  if (cell || row.length) {
    row.push(cell);
    records.push(row);
  }
  const headers = records.shift()?.map((h) => h.trim()) ?? [];
  if (
    !headers.length ||
    new Set(headers).size !== headers.length ||
    headers.some((h) => ["__proto__", "constructor", "prototype"].includes(h))
  )
    throw new Error("Invalid CSV headers");
  return records.map((values, i) => {
    if (values.length !== headers.length)
      throw new Error(`CSV row ${i + 2}: column count mismatch`);
    return Object.fromEntries(headers.map((h, j) => [h, values[j]]));
  });
}
function scalars(v: unknown): Record<string, string> {
  if (!v || typeof v !== "object" || Array.isArray(v))
    throw new Error("Expected a research record");
  return Object.fromEntries(
    Object.entries(v).map(([k, x]) => {
      if (
        ["__proto__", "constructor", "prototype"].includes(k) ||
        !["string", "number", "boolean"].includes(typeof x) ||
        String(x).length > 12000
      )
        throw new Error(`Invalid field ${k}`);
      return [k, String(x)];
    }),
  );
}
export function safePhotoPath(p: string) {
  return /^hotel_photos\/[a-zA-Z0-9_-]+\.(webp|png|jpe?g)$/.test(p);
}
export function parseDataset(
  data: unknown,
  name = "Research dataset",
): Dataset {
  let sections: [string, unknown[]][] = [];
  if (Array.isArray(data)) {
    const f = scalars(data[0]);
    const type = f.attraction_id
      ? "attractions"
      : f.flight_id
        ? "flights_one_way"
        : f.flight_record_id
          ? "flight_round_trip_history"
          : f.listing_id || f.hotel_id
            ? "lodging"
            : "";
    if (!type) throw new Error("Unrecognized CSV schema");
    sections = [[type, data]];
  } else {
    if (!data || typeof data !== "object") throw new Error("Invalid JSON");
    const obj = data as Record<string, unknown>;
    if (String((obj.metadata as Record<string, unknown>)?.version) !== "2.0")
      throw new Error("Expected metadata.version 2.0");
    for (const k of [
      "lodging",
      "flights_one_way",
      "flight_round_trip_history",
      "attractions",
    ])
      if (obj[k] !== undefined) {
        if (!Array.isArray(obj[k])) throw new Error(`${k} must be an array`);
        sections.push([k, obj[k] as unknown[]]);
      }
  }
  if (sections.reduce((n, [, r]) => n + r.length, 0) > 1000)
    throw new Error("Maximum 1,000 records");
  const rows: DataRow[] = [];
  for (const [section, values] of sections)
    for (const value of values) {
      const r = scalars(value),
        attraction = section === "attractions",
        flight = section.includes("flight"),
        one = section === "flights_one_way";
      const kind = flight ? "flight" : attraction ? "attraction" : "hotel";
      const external =
          r.listing_id ||
          r.hotel_id ||
          r.attraction_id ||
          r.flight_id ||
          r.flight_record_id,
        title = r.name || r.hotel_name || r.airline_display || r.airline;
      if (!external || !title)
        throw new Error("Record needs stable ID and name");
      const key = `${section}:${external}`,
        issues: string[] = [];
      const d = emptyDetails();
      Object.assign(d, {
        start: r.price_stay_start || r.departure_date || r.outbound_date || "",
        end: r.price_stay_end || r.return_date || "",
        passengers: r.price_rooms_guests || r.adults || (one ? "1" : ""),
        priceScope: r.price_scope || r.price_type || r.price_basis || "unknown",
        room: r.room_label || r.room_type_as_listed || "",
        beds: r.bed_arrangement || "",
        amenities: r.amenities_list || r.hotel_amenities || "",
        location: r.address || r.street_address || "",
        propertyId: r.hotel_id || "",
        taxes:
          r.included_taxes ||
          r.tax_included ||
          r.taxes_required_fees_included ||
          "",
        notes: r.notes || r.description || "",
        departure: r.departure_time_local || r.outbound_departure_local || "",
        arrival:
          (r.arrival_time_local || r.outbound_arrival_local || "") +
          (r.arrival_next_day &&
          !["false", "0", "no"].includes(r.arrival_next_day.toLowerCase())
            ? " +1"
            : ""),
        origin: r.origin_airport || r.outbound_origin || "",
        destination: r.destination_airport || r.outbound_destination || "",
        cabin: r.cabin || "",
        duration: r.duration || r.outbound_duration || "",
        stops: r.stops || "",
        baggage: r.baggage || r.baggage_allowance || "",
        returnSchedule: r.return_departure_local
          ? `${r.return_departure_local} → ${r.return_arrival_local || "unknown"}`
          : "",
        availability: r.availability_at_capture || "",
        proximity: r.nearest_station || "",
      });
      if (one && !["outbound", "return"].includes(r.direction))
        issues.push(
          "BLOCKED: one-way flight direction must be outbound or return",
        );
      const row: DataRow = { key, kind, name: title, raw: r, issues };
      if (!flight) {
        const blocked =
          r.coordinate_status === "DO_NOT_GEOCODE_NO_UNIQUE_LISTING";
        const p: Place = {
          id: uid(),
          name: title,
          kind: attraction ? "attraction" : "hotel",
          address: d.location,
          notes: d.notes,
          source:
            r.data_provenance || r.source_reference || r.price_source || name,
          priority:
            r.priority_suggestion === "high" ? "Must visit" : "Interested",
          minutes: attraction
            ? Math.round((parseFloat(r.typical_visit_hours) || 1.5) * 60)
            : 0,
          cost: 0,
          votes: [],
          propertyId: r.hotel_id || undefined,
          room: d.room,
          amenities: d.amenities,
          opening:
            r.closure_or_date_warning ||
            (r.exact_holiday_hours_verified === "no"
              ? "Holiday hours unverified"
              : ""),
          researchKey: key,
          researchData: r,
          coordinateStatus: r.coordinate_status,
          mapQuery: r.map_query,
          officialUrl: r.official_url || r.listing_source_url,
          closureWarning: r.closure_or_date_warning,
          ratingScale: r.rating_scale ? Number(r.rating_scale) : undefined,
          ratingProvider: r.platform,
          rating: r.rating_score ? Number(r.rating_score) : undefined,
        };
        if (r.latitude || r.longitude || r.lat || r.lon) {
          const result = assessCoordinates(r, p);
          if (result.status === "ready" && result.evidence) {
            p.lat = result.evidence.latitude;
            p.lng = result.evidence.longitude;
            p.locationEvidence = result.evidence;
            p.coordinateStatus =
              result.evidence.precision === "supplied"
                ? "IMPORTED_COORDINATES"
                : "GEOCODED_EXACT";
          } else {
            p.locationReview = [
              { reason: result.reason, evidence: result.evidence },
            ];
            issues.push(result.reason);
          }
        }
        if (p.lat === undefined)
          issues.push(
            blocked
              ? "Location unknown — unique listing required; geocoding disabled."
              : "Confirm map location before placing a pin.",
          );
        if (r.photo_asset_path) {
          if (!safePhotoPath(r.photo_asset_path))
            throw new Error("Unsafe photo path");
          p.photoKey = `${key}:${r.photo_asset_path}`;
        }
        row.place = p;
      }
      if (!attraction) {
        const amount = Number(
            r.price_total ||
              r.listed_price_jpy ||
              r.fare_usd_one_person ||
              r.round_trip_price_usd_per_adult,
          ),
          currency = r.price_currency || r.currency || (flight ? "USD" : "JPY"),
          at =
            r.price_observed_on ||
            r.observed_on ||
            r.recorded_on ||
            r.observation_date ||
            "";
        if (!Number.isFinite(amount) || amount <= 0)
          issues.push("BLOCKED: positive price required");
        if (!["USD", "JPY", "TWD"].includes(currency))
          issues.push("BLOCKED: unsupported currency");
        if (!/^\d{4}-\d{2}-\d{2}$/.test(at) || isNaN(Date.parse(at)))
          issues.push("BLOCKED: valid capture date required");
        const source =
          r.price_source || r.source_file || r.price_source_file || name;
        row.observation = {
          id: uid(),
          itemId: row.place?.id || key,
          name: title,
          kind: flight ? "flight" : "hotel",
          amount,
          currency: currency as Observation["currency"],
          at,
          source,
          basis: d.priceScope,
          notes: d.notes,
          url: r.source_url || r.listing_source_url,
          researchKey: key,
          flightDirection: flight
            ? one
              ? r.direction === "return"
                ? "return"
                : "outbound"
              : "round-trip"
            : undefined,
          research: {
            details: d,
            source: {
              name: source,
              hash: key,
              page: Number(r.source_page || r.source_pdf_page) || 1,
              method: "paste",
              capturedAt: at,
              dateOrigin:
                r.observed_on_basis || r.date_basis || "Supplied capture date",
              excerpt: JSON.stringify(r).slice(0, 8000),
            },
            fingerprint: JSON.stringify([
              key,
              at,
              amount,
              currency,
              d.start,
              d.end,
              d.room,
              d.priceScope,
            ]),
            comparable: false,
          },
        };
        if (/unverified|unknown/i.test(d.priceScope) || !d.start)
          issues.push("Price/stay conditions remain unverified.");
      }
      rows.push(row);
    }
  if (!rows.length) throw new Error("No supported records");
  return { name, rows, photos: {}, issues: [] };
}
export function matchPlace(trip: Trip, row: DataRow) {
  if (!row.place) return;
  const exact = trip.places.find(
    (p) => p.researchKey === row.key || p.researchKeys?.includes(row.key),
  );
  if (exact) return exact;
  if (row.place.propertyId) {
    const id = normalize(row.place.propertyId).replace(/^apa/, "");
    const p = trip.places.find(
      (p) =>
        p.kind === "hotel" &&
        p.propertyId &&
        normalize(p.propertyId).replace(/^apa/, "") === id,
    );
    if (p) return p;
  }
  if (row.raw.platform?.toLowerCase().includes("airbnb")) return;
  return trip.places.find(
    (p) => p.kind === row.kind && normalize(p.name) === normalize(row.name),
  );
}
export const mergeFields = [
  "name",
  "address",
  "notes",
  "room",
  "amenities",
  "opening",
  "rating",
  "ratingScale",
  "ratingProvider",
  "officialUrl",
  "closureWarning",
  "mapQuery",
  "coordinateStatus",
] as const;
export function mergeDataset(
  trip: Trip,
  dataset: Dataset,
  selected: Set<string>,
  overwrite: Record<string, string[]> = {},
) {
  const next = structuredClone(trip);
  let added = 0,
    matched = 0,
    skipped = 0,
    needingConfirmation = 0;
  for (const row of dataset.rows) {
    if (!selected.has(row.key)) {
      skipped++;
      continue;
    }
    if (row.issues.some((i) => i.startsWith("BLOCKED:")))
      throw new Error(`${row.name}: ${row.issues.join("; ")}`);
    let itemId = row.key;
    if (row.place) {
      const existing = matchPlace(next, row);
      if (existing) {
        matched++;
        itemId = existing.id;
        const patch: Record<string, unknown> = {
          researchKey: existing.researchKey || row.key,
          researchKeys: [
            ...new Set([
              ...(existing.researchKeys || []),
              ...(existing.researchKey ? [existing.researchKey] : []),
              row.key,
            ]),
          ],
          researchData: { ...row.raw, ...existing.researchData },
          propertyId: existing.propertyId || row.place.propertyId,
          photoKey: existing.photoKey || row.place.photoKey,
        };
        if (
          existing.lat === undefined &&
          existing.lng === undefined &&
          row.place.lat !== undefined
        ) {
          const checked = assessCoordinates(row.raw, existing, next);
          if (checked.status === "ready" && checked.evidence) {
            patch.lat = checked.evidence.latitude;
            patch.lng = checked.evidence.longitude;
            patch.locationEvidence = checked.evidence;
            patch.coordinateStatus = row.place.coordinateStatus;
          } else
            patch.locationReview = [
              { reason: checked.reason, evidence: checked.evidence },
            ];
        }
        for (const field of mergeFields)
          if (
            field === "coordinateStatus" &&
            (existing.lat !== undefined || patch.lat !== undefined)
          )
            continue;
          else if (
            existing[field] === undefined ||
            existing[field] === "" ||
            overwrite[row.key]?.includes(field)
          )
            patch[field] = row.place[field];
        next.places = next.places.map((p) =>
          p.id === itemId ? { ...p, ...patch } : p,
        );
      } else {
        const addedPlace = structuredClone(row.place);
        if (addedPlace.lat !== undefined) {
          const checked = assessCoordinates(row.raw, addedPlace, next);
          if (checked.status !== "ready") {
            delete addedPlace.lat;
            delete addedPlace.lng;
            delete addedPlace.locationEvidence;
            addedPlace.coordinateStatus = "NEEDS_REVIEW";
            addedPlace.locationReview = [
              { reason: checked.reason, evidence: checked.evidence },
            ];
          }
        }
        next.places.push(addedPlace);
        itemId = row.place.id;
        added++;
      }
    }
    if (row.observation) {
      if (
        next.observations.some(
          (o) =>
            o.research?.fingerprint === row.observation!.research!.fingerprint,
        )
      )
        skipped++;
      else {
        next.observations.push({ ...structuredClone(row.observation), itemId });
        if (!row.place) added++;
      }
    }
    if (row.issues.length) needingConfirmation++;
  }
  const log = {
    id: uid(),
    at: new Date().toISOString(),
    name: dataset.name,
    added,
    matched,
    skipped,
    needingConfirmation,
    issues: dataset.rows.flatMap((r) => r.issues.map((i) => `${r.name}: ${i}`)),
  };
  next.datasetImports = [log, ...(next.datasetImports || [])].slice(0, 20);
  return { trip: next, log };
}
export async function readDatasetFile(file: File): Promise<Dataset> {
  if (file.size > 25 * 1024 * 1024) throw new Error("File exceeds 25 MB");
  if (/\.csv$/i.test(file.name))
    return parseDataset(csvRows(await file.text()), file.name);
  if (/\.json$/i.test(file.name))
    return parseDataset(JSON.parse(await file.text()), file.name);
  if (!/\.zip$/i.test(file.name)) throw new Error("Choose CSV, JSON or ZIP");
  const { unzipSync, strFromU8 } = await import("fflate");
  let expanded = 0,
    count = 0;
  const entries = unzipSync(new Uint8Array(await file.arrayBuffer()), {
    filter: (e) => {
      if (
        ++count > 200 ||
        e.name.includes("..") ||
        e.name.startsWith("/") ||
        e.name.includes("\\") ||
        e.name.includes(":")
      )
        throw new Error("Unsafe ZIP path or excessive entries");
      expanded += e.originalSize;
      if (
        expanded > 30 * 1024 * 1024 ||
        e.originalSize > 10 * 1024 * 1024 ||
        e.originalSize / Math.max(1, e.size) > 200
      )
        throw new Error("ZIP extraction limits exceeded");
      return (
        /\.json$/i.test(e.name) ||
        safePhotoPath(e.name.slice(e.name.indexOf("hotel_photos/")))
      );
    },
  });
  const names = Object.keys(entries).filter((n) => n.endsWith(".json"));
  const master =
    names.find((n) => n.endsWith("osaka_research_master.json")) ||
    (names.length === 1 ? names[0] : undefined);
  if (!master) throw new Error("ZIP needs one master research JSON");
  const result = parseDataset(
    JSON.parse(strFromU8(entries[master])),
    file.name,
  );
  result.photos = Object.fromEntries(
    Object.entries(entries)
      .map(
        ([p, bytes]) =>
          [
            p.startsWith(master.slice(0, master.lastIndexOf("/") + 1))
              ? p.slice(master.lastIndexOf("/") + 1)
              : p,
            bytes,
          ] as const,
      )
      .filter(([p]) => safePhotoPath(p)),
  );
  return result;
}
