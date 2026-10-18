import { mergeResearch, exportResearch } from "../src/lib/import/reconcile";
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { seedTrip } from "../src/lib/seed";
import {
  reconcileCoordinates,
  applyCoordinates,
  assessCoordinates,
  isCoordinateCSV,
} from "../src/lib/import/coordinates";
import { csvRows, parseDataset, mergeDataset } from "../src/lib/import/dataset";
import type { Place } from "../src/lib/model";
const place = (id = "H-1", name = "Example Hotel"): Place => ({
  id,
  name,
  kind: "hotel",
  address: "10 Main Street, London, United Kingdom",
  notes: "",
  source: "test",
  priority: "Interested",
  minutes: 0,
  cost: 0,
  votes: [],
  researchKey: `lodging:${id}`,
});
const trip = () => ({
  ...seedTrip(),
  destination: "London, United Kingdom",
  places: [
    place(),
    { ...place("A-1", "Example Museum"), kind: "attraction" as const },
  ],
});
const exact = () => ({
  original_record_id: "H-1",
  original_name: "Example Hotel",
  lat: "51.5",
  lon: "-0.12",
  name: "Example Hotel",
  city: "London",
  result_type: "amenity",
  confidence: "0.99",
});
describe("coordinate import", () => {
  it("recognizes plain and provider schemas and matches shuffled IDs without adding records", () => {
    const t = trip(),
      rows = csvRows(
        "record_id,latitude,longitude\nA-1,51.51,-0.13\nH-1,51.5,-0.12",
      );
    expect(isCoordinateCSV(rows)).toBe(true);
    const result = applyCoordinates(t, reconcileCoordinates(t, rows));
    expect(result.places).toHaveLength(2);
    expect(result.places[0]).toMatchObject({ lat: 51.5, lng: -0.12 });
    expect(result.places[1]).toMatchObject({ lat: 51.51, lng: -0.13 });
    expect(JSON.parse(JSON.stringify(result))).toEqual(result);
    expect(t.places[0].lat).toBeUndefined();
  });
  it("matches provider results by exact query when there are no IDs", () => {
    const t = trip(),
      r = {
        ...exact(),
        original_record_id: "",
        "query.text": `${t.places[0].name}, ${t.places[0].address}`,
      };
    expect(reconcileCoordinates(t, [r])[0]).toMatchObject({
      status: "ready",
      placeId: "H-1",
    });
    r["query.text"] = "unknown query";
    expect(reconcileCoordinates(t, [r])[0].status).toBe("unmatched");
  });
  it("handles property IDs and research aliases without name guessing", () => {
    const t = trip();
    t.places[0].propertyId = "125";
    t.places[1].researchKeys = ["attractions:OS-001"];
    expect(
      reconcileCoordinates(t, [
        { record_id: "APA-125", latitude: "51.5", longitude: "-0.12" },
      ])[0].placeId,
    ).toBe("H-1");
    expect(
      reconcileCoordinates(t, [
        { record_id: "OS-001", latitude: "51.5", longitude: "-0.12" },
      ])[0].placeId,
    ).toBe("A-1");
  });
  it("does not use ambiguous queries, row positions or contradictory IDs", () => {
    const t = trip();
    t.places[1].address = t.places[0].address;
    expect(
      reconcileCoordinates(t, [
        {
          ...exact(),
          original_record_id: "",
          "query.text": t.places[0].address,
        },
      ])[0].status,
    ).toBe("unmatched");
    expect(
      reconcileCoordinates(t, [
        {
          ...exact(),
          "query.text": `${t.places[1].name}, ${t.places[1].address}`,
        },
      ])[0].status,
    ).toBe("review");
  });
  it("requires actual finite coordinates and never swaps axes", () => {
    for (const [lat, lon] of [
      ["", ""],
      ["NaN", "1"],
      ["91", "1"],
      ["1", "181"],
      ["135.4", "34.6"],
    ])
      expect(
        assessCoordinates({ latitude: lat, longitude: lon }, place()).status,
      ).toBe("invalid");
  });
  it("checks plausible-but-reversed axes and distant results against known locations", () => {
    const t = trip();
    t.places[1].lat = 51.5;
    t.places[1].lng = -0.12;
    expect(
      reconcileCoordinates(t, [
        { record_id: "H-1", latitude: "-0.12", longitude: "51.5" },
      ])[0].status,
    ).toBe("review");
  });
  it("distinguishes districts, wrong businesses, low confidence and wrong city", () => {
    const t = trip();
    for (const r of [
      { ...exact(), result_type: "district" },
      { ...exact(), name: "Nearby restaurant" },
      { ...exact(), confidence: "0.2" },
      { ...exact(), city: "Paris" },
    ])
      expect(reconcileCoordinates(t, [r])[0].status).toBe("review");
    expect(reconcileCoordinates(t, [exact()])[0].evidence?.precision).toBe(
      "property",
    );
  });
  it("accepts a strong exact street/building match when the property name is unavailable", () => {
    const r = {
      ...exact(),
      name: "",
      result_type: "building",
      housenumber: "10",
      street: "Main Street",
      confidence_building_level: "1",
    };
    expect(reconcileCoordinates(trip(), [r])[0]).toMatchObject({
      status: "ready",
      evidence: { precision: "building" },
    });
  });
  it("preserves coordinates on weak results and records review reasons", () => {
    const t = trip();
    t.places[0].lat = 51.5;
    t.places[0].lng = -0.1;
    const updated = applyCoordinates(
      t,
      reconcileCoordinates(t, [{ ...exact(), result_type: "postcode" }]),
    );
    expect(updated.places[0].lng).toBe(-0.1);
    expect(updated.places[0].locationReview).toHaveLength(1);
  });
  it("does not apply conflicting duplicates in either order", () => {
    const rows = [exact(), { ...exact(), lat: "51.51" }];
    for (const rs of [rows, [...rows].reverse()]) {
      const decisions = reconcileCoordinates(trip(), rs);
      expect(decisions.every((d) => d.status === "review")).toBe(true);
      expect(applyCoordinates(trip(), decisions).places[0].lat).toBeUndefined();
    }
  });
  it("protects unknown listings and existing distant pins", () => {
    const p = place();
    p.coordinateStatus = "DO_NOT_GEOCODE_NO_UNIQUE_LISTING";
    expect(assessCoordinates(exact(), p).status).toBe("review");
    p.coordinateStatus = "USER_CONFIRMED";
    p.lat = 48.8;
    p.lng = 2.3;
    expect(assessCoordinates(exact(), p).status).toBe("review");
  });
  it("preserves geocoding through future research imports, including field overrides", () => {
    const t = applyCoordinates(trip(), reconcileCoordinates(trip(), [exact()]));
    const dataset = parseDataset(
      [
        {
          listing_id: "H-1",
          price_total: "100",
          price_observed_on: "2026-10-18",
          name: "Example Hotel",
          coordinate_status: "DO_NOT_GEOCODE_NO_UNIQUE_LISTING",
          address: place().address,
        },
      ],
      "new.csv",
    );
    const next = mergeDataset(
      t,
      dataset,
      new Set(dataset.rows.map((r) => r.key)),
      { "lodging:H-1": ["coordinateStatus"] },
    ).trip;
    expect(next.places[0]).toMatchObject({
      lat: 51.5,
      lng: -0.12,
      coordinateStatus: "GEOCODED_EXACT",
    });
    expect(next.places[0].locationEvidence).toEqual(
      t.places[0].locationEvidence,
    );
  });
  it("imports coordinates embedded in new research records for any destination", () => {
    const t = trip();
    t.places = [];
    const dataset = parseDataset([
      {
        listing_id: "NEW",
        price_total: "100",
        price_observed_on: "2026-10-18",
        name: "New Hotel",
        latitude: "51.5",
        longitude: "-0.12",
        address: place().address,
      },
    ]);
    const next = mergeDataset(
      t,
      dataset,
      new Set(dataset.rows.map((r) => r.key)),
    ).trip;
    expect(next.places[0]).toMatchObject({ lat: 51.5, lng: -0.12 });
  });
  it("keeps coordinates when transferring a research backup", () => {
    const p = {
      ...place(),
      lat: 51.5,
      lng: -0.12,
      coordinateStatus: "IMPORTED_COORDINATES",
    };
    const t = trip();
    t.places = [];
    const source = trip();
    source.places = [
      p,
      { ...p, id: "museum", name: "Museum", kind: "attraction" },
    ];
    source.observations = [];
    const input = exportResearch(source);
    const result = mergeResearch(t, input);
    expect(result.trip.places).toHaveLength(2);
    expect(result.trip.places[0]).toMatchObject({ lat: 51.5, lng: -0.12 });
    expect(result.trip.places[1]).toMatchObject({
      lat: 51.5,
      lng: -0.12,
      kind: "attraction",
    });
    const invalid = structuredClone(input);
    invalid.places[0].lat = 200;
    expect(() => mergeResearch(t, invalid)).toThrow("Invalid place");
  });
  it.skipIf(!process.env.WAYFARER_GEOCODE_CSV)(
    "checks the private Geoapify CSV without publishing it",
    () => {
      const rows = csvRows(
        readFileSync(process.env.WAYFARER_GEOCODE_CSV!, "utf8"),
      );
      expect(rows).toHaveLength(47);
      expect(isCoordinateCSV(rows)).toBe(true);
      const t = trip();
      t.destination = "Osaka, Japan";
      t.places = rows.map((r) => ({
        ...place(r.original_record_id, r.original_name),
        address: r.original_address,
        kind: r.original_record_type as "hotel" | "attraction",
      }));
      const ds = reconcileCoordinates(t, rows);
      expect(ds.filter((d) => d.status === "invalid")).toHaveLength(18);
      expect(ds.filter((d) => d.status === "review")).toHaveLength(29);
      expect(ds.filter((d) => d.status === "ready")).toHaveLength(0);
    },
  );
});
