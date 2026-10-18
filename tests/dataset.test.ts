import { closureOnDate } from "../src/lib/closures";
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { seedTrip } from "../src/lib/seed";
import {
  csvRows,
  parseDataset,
  mergeDataset,
  matchPlace,
  safePhotoPath,
} from "../src/lib/import/dataset";
import { coordinatesFromText } from "../src/components/LocationResolver";
const lodging = {
  listing_id: "APA-999",
  hotel_id: "APA-999",
  name: "Synthetic hotel",
  price_total: "46000",
  price_currency: "JPY",
  price_observed_on: "2026-10-18",
  price_scope: "stay UNVERIFIED",
  room_label: "Double room",
  platform: "APA official",
  address: "Synthetic address",
  amenities_list: "Wi-Fi",
};
const master = (rows: unknown[]) => ({
  metadata: { version: "2.0" },
  lodging: rows,
});
describe("structured research safety and merging", () => {
  it("handles BOM, quoted commas, escaped quotes and multiline CSV", () => {
    expect(
      csvRows('\uFEFFname,notes\r\n"A, B","a ""quote""\nnext line"\r\n'),
    ).toEqual([{ name: "A, B", notes: 'a "quote"\nnext line' }]);
    expect(() => csvRows('a,b\n"broken')).toThrow();
  });
  it("preserves edits and coordinates, matches APA IDs and is idempotent", () => {
    const trip = seedTrip();
    trip.places.push({
      id: "existing",
      kind: "hotel",
      name: "My edited name",
      address: "My address",
      notes: "My notes",
      source: "Me",
      priority: "Interested",
      minutes: 0,
      cost: 0,
      votes: [],
      propertyId: "999",
      lat: 34,
      lng: 135,
    });
    const data = parseDataset(master([lodging]));
    expect(matchPlace(trip, data.rows[0])?.id).toBe("existing");
    const once = mergeDataset(
      trip,
      data,
      new Set(data.rows.map((r) => r.key)),
    ).trip;
    expect(once.places.find((p) => p.id === "existing")).toMatchObject({
      name: "My edited name",
      lat: 34,
      address: "My address",
      amenities: "Wi-Fi",
    });
    const twice = mergeDataset(
      once,
      data,
      new Set(data.rows.map((r) => r.key)),
    ).trip;
    expect(twice.observations).toHaveLength(once.observations.length);
    expect(twice.places).toHaveLength(once.places.length);
    expect(
      trip.places.find((p) => p.id === "existing")?.amenities,
    ).toBeUndefined();
  });
  it("allows explicit field overrides and separates Airbnb identities", () => {
    const data = parseDataset(
      master([
        {
          ...lodging,
          listing_id: "AIR-1",
          hotel_id: "",
          platform: "Airbnb",
          coordinate_status: "DO_NOT_GEOCODE_NO_UNIQUE_LISTING",
        },
        { ...lodging, listing_id: "AIR-2", hotel_id: "", platform: "Airbnb" },
      ]),
    );
    const next = mergeDataset(
      seedTrip(),
      data,
      new Set(data.rows.map((r) => r.key)),
    ).trip;
    expect(next.places.filter((p) => p.name === lodging.name)).toHaveLength(2);
    expect(data.rows[0].place?.lat).toBeUndefined();
    expect(data.rows[0].issues.join()).toContain("geocoding disabled");
  });
  it("validates field types and unsafe paths", () => {
    expect(() =>
      parseDataset(master([{ ...lodging, name: { html: "bad" } }])),
    ).toThrow();
    expect(safePhotoPath("hotel_photos/apa-999.webp")).toBe(true);
    expect(safePhotoPath("../x.webp")).toBe(false);
    expect(() =>
      parseDataset(master([{ ...lodging, photo_asset_path: "../x.webp" }])),
    ).toThrow();
    const d = parseDataset(master([{ ...lodging, price_currency: "BAD" }]));
    expect(() =>
      mergeDataset(seedTrip(), d, new Set(d.rows.map((r) => r.key))),
    ).toThrow();
  });
  it("parses explicit Google place coordinates without mistaking viewport coordinates for a location", () => {
    expect(coordinatesFromText("34.1, 135.2")).toMatchObject({
      lat: 34.1,
      lng: 135.2,
    });
    expect(
      coordinatesFromText(
        "https://google.com/maps/place/x/data=!3d34.1!4d135.2",
      ),
    ).toMatchObject({ lat: 34.1, lng: 135.2 });
    expect(
      coordinatesFromText("https://google.com/maps/@34.1,135.2,12z"),
    ).toBeUndefined();
    expect(coordinatesFromText("300, 800")).toBeUndefined();
  });
});
const folder = process.env.WAYFARER_RESEARCH_DIR;
it.skipIf(!folder)(
  "validates the actual privately supplied Osaka JSON and CSVs without publishing fixtures",
  () => {
    const data = parseDataset(
      JSON.parse(readFileSync(`${folder}/osaka_research_master.json`, "utf8")),
    );
    expect(data.rows).toHaveLength(122);
    expect(data.rows.filter((r) => r.kind === "hotel")).toHaveLength(45);
    expect(
      data.rows.filter((r) => r.issues.some((i) => i.startsWith("BLOCKED"))),
    ).toHaveLength(0);
    let next = mergeDataset(
      seedTrip(),
      data,
      new Set(data.rows.map((r) => r.key)),
    ).trip;
    const count = next.observations.length;
    for (const file of [
      "osaka_lodging_master.csv",
      "osaka_one_way_flights.csv",
      "osaka_attractions.csv",
    ]) {
      const csv = parseDataset(
        csvRows(readFileSync(`${folder}/${file}`, "utf8")),
      );
      next = mergeDataset(next, csv, new Set(csv.rows.map((r) => r.key))).trip;
    }
    expect(next.observations).toHaveLength(count);
    expect(next.places.find((p) => p.propertyId === "APA-270")?.room).toBe(
      "Double Room - Non-Smoking",
    );
    expect(
      next.places.find((p) => p.name === "Osaka Castle Museum")?.closureWarning,
    ).toContain("2026-12-28");
    expect(
      next.places.find((p) => p.name === "Osaka Museum of Housing and Living")
        ?.closureWarning,
    ).toContain("2027-01-05");
    expect(
      next.observations.filter((o) => o.flightDirection === "outbound"),
    ).toHaveLength(18);
  },
);

it("honors field-by-field conflict choices", () => {
  const trip = seedTrip();
  const data = parseDataset(master([lodging]));
  const first = mergeDataset(
    trip,
    data,
    new Set(data.rows.map((r) => r.key)),
  ).trip;
  first.places.find((p) => p.researchKey === data.rows[0].key)!.address =
    "My saved address";
  const imported = mergeDataset(
    first,
    data,
    new Set(data.rows.map((r) => r.key)),
    { [data.rows[0].key]: ["address"] },
  ).trip;
  expect(
    imported.places.find((p) => p.researchKey === data.rows[0].key)?.address,
  ).toBe(lodging.address);
});

it("flags only matching closure dates and multi-month closure ranges", () => {
  const p = seedTrip().places[0];
  p.closureWarning = "CLOSED 2026-12-28 and 2026-12-29";
  expect(closureOnDate(p, "2026-12-27")).toBe("");
  expect(closureOnDate(p, "2026-12-28")).toContain("CLOSED");
  p.closureWarning =
    "CLOSED ENTIRE TRIP: temporary closure 2026-09-01 through 2027-01-05";
  expect(closureOnDate(p, "2026-12-25")).toContain("CLOSED");
  expect(closureOnDate(p, "2027-01-06")).toBe("");
});
