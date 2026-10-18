import { describe, it, expect } from "vitest";
import { seedTrip } from "../src/lib/seed";
import { parseDocument, blankDraft, prices } from "../src/lib/import/parser";
import {
  applyDrafts,
  comparisonBasis,
  suggestMatches,
  mergeResearch,
  exportResearch,
  comparable,
  validation,
} from "../src/lib/import/reconcile";
import { metadataDate, textRows } from "../src/lib/import/readDocument";
import type { ExtractedDocument, Draft } from "../src/lib/import/types";
const trip = seedTrip();
const document = (text: string, hash = "fixture"): ExtractedDocument => ({
  name: "Synthetic test fixture (not user PDF)",
  hash,
  pages: [{ page: 1, text, method: "pdf-text" }],
  capturedAt: "2026-10-18",
  dateOrigin: "Test fixture",
});
const confirm = (d: Draft): Draft => ({
  ...d,
  selected: true,
  reviewed: true,
  contextConfirmed: true,
});
const hotelText = (name: string, amount: number) =>
  `${name}\nProperty ID: 123\nRoom: Double room\nBeds: One double bed\nTotal stay: JPY ${amount}\nTaxes: included\nCancellation: refundable until December 20\nLocation: Osaka\n3 minutes walk from Kishiwada Station`;
describe("conservative synthetic document parsers (actual user PDFs not yet supplied)", () => {
  it("associates flight prices with their preceding time row and following airline", () => {
    const ds = parseDocument(
      document(
        `Google Flights\nRound trip\nTPE → KIX\n2026-12-25 to 2026-12-29\n2 passengers\nEconomy\n6:15 PM – 9:45 PM US$ 412\nJetstar\nNonstop\n3 hr 30 min\n6:50 PM – 10:20 PM US$ 415\nPeach\nNonstop\n3 hr 30 min\nCheapest from US$ 299 for different dates 2026-12-24 to 2026-12-30`,
      ),
      trip,
    );
    expect(
      ds.map((d) => [
        d.name,
        d.amount,
        d.details.departure.trim(),
        d.details.arrival.trim(),
      ]),
    ).toEqual([
      ["Jetstar", "412", "6:15 PM", "9:45 PM"],
      ["Peach", "415", "6:50 PM", "10:20 PM"],
    ]);
    expect(ds[1].details.start).toBe("2026-12-25");
    expect(
      ds.every(
        (d) =>
          d.details.returnSchedule === "" &&
          d.details.baggage === "" &&
          !d.selected,
      ),
    ).toBe(true);
  });
  it("processes eight independent pages and multiple room offers without crossing hotel names", () => {
    const doc = document("");
    doc.pages = Array.from({ length: 8 }, (_, i) => ({
      page: i + 1,
      method: "pdf-text",
      text: `${hotelText("APA Hotel Test " + i, 50000 + i)}\nRoom: Twin room\nBeds: Two single beds\nTotal stay: JPY ${60000 + i}\nAPA Hotel Other ${i}\nRoom: Single room\nJPY ${30000 + i}`,
    }));
    const ds = parseDocument(doc, trip);
    expect(ds).toHaveLength(24);
    expect(ds[1]).toMatchObject({
      name: "APA Hotel Test 0",
      amount: "60000",
      details: { room: "Twin room", beds: "Two single beds" },
    });
    expect(ds[2]).toMatchObject({
      name: "APA Hotel Other 0",
      amount: "30000",
      details: { room: "Single room", priceScope: "unknown" },
    });
    expect(ds.at(-1)!.source.page).toBe(8);
    expect(ds[0].warnings.join(" ")).toContain("prefilled");
  });
  it("does not invent listings from summaries or arbitrary text", () => {
    expect(
      parseDocument(
        document(
          "Cheapest from USD 299\nExplore destinations\nFlights from $100",
        ),
        trip,
      ),
    ).toEqual([]);
  });
  it("keeps ambiguous dollar symbols unassigned and handles yen suffix", () => {
    expect(prices("$415")[0].currency).toBe("");
    expect(prices("36,900円")[0]).toEqual({ amount: "36900", currency: "JPY" });
    expect(prices("NT$ 12,300")[0].currency).toBe("TWD");
  });
  it("reconstructs PDF rows by coordinates rather than arbitrary text-object order", () => {
    expect(
      textRows([
        { str: "USD 412", transform: [1, 0, 0, 1, 200, 100] },
        { str: "Jetstar", transform: [1, 0, 0, 1, 20, 100] },
        { str: "Next row", transform: [1, 0, 0, 1, 20, 80] },
      ]),
    ).toBe("Jetstar USD 412\nNext row");
  });
  it("uses metadata as a date default only", () =>
    expect(metadataDate("D:20261018121500+09'00'")).toBe("2026-10-18"));
});
describe("review, matching, history and safe persistence", () => {
  it("preserves all existing data and never pins an unresolved imported hotel", () => {
    const d = confirm(
      parseDocument(document(hotelText("APA Hotel Test", 50000)), trip)[0],
    );
    const r = applyDrafts(trip, [d]);
    expect(r.trip.observations).toHaveLength(trip.observations.length + 1);
    expect(r.trip.places).toHaveLength(trip.places.length + 1);
    expect(r.trip.places.at(-1)?.lat).toBeUndefined();
    expect(r.trip.packing).toEqual(trip.packing);
    expect(trip.observations).toHaveLength(4);
  });
  it("appends comparable history and skips reimported document fingerprints", () => {
    const first = confirm(
      parseDocument(
        document(hotelText("APA Hotel Test", 50000), "first"),
        trip,
      )[0],
    );
    const a = applyDrafts(trip, [first]);
    const second = confirm(
      suggestMatches(
        parseDocument(
          document(hotelText("APA Hotel Test", 45000), "second"),
          a.trip,
        )[0],
        a.trip,
      ),
    );
    expect(second.action).toBe("observation");
    const b = applyDrafts(a.trip, [second]);
    expect(b.trip.observations.slice(-2).map((o) => o.amount)).toEqual([
      50000, 45000,
    ]);
    expect(b.trip.observations.at(-1)!.basis).toBe(
      b.trip.observations.at(-2)!.basis,
    );
    expect(applyDrafts(b.trip, [second]).duplicates).toBe(1);
  });
  it("does not merge unknown room terms into comparable series", () => {
    const a = confirm(
      parseDocument(document("APA Hotel Test\nJPY 40000", "a"), trip)[0],
    );
    const b = { ...a, fingerprint: "b" };
    expect(comparable(a)).toBe(false);
    expect(comparisonBasis(a)).not.toBe(comparisonBasis(b));
  });
  it("requires explicit review and currency before saving a price", () => {
    const d = { ...blankDraft(trip), selected: true };
    expect(validation(d, trip).length).toBeGreaterThan(0);
    expect(() => applyDrafts(trip, [d])).toThrow();
  });
  it("preserves verified coordinates and description for an observation-only import", () => {
    const t = structuredClone(trip);
    t.places.push({
      ...t.places[1],
      id: "verified",
      name: "APA Hotel Test",
      lat: 34.6,
      lng: 135.5,
    });
    const d = confirm(
      suggestMatches(
        parseDocument(document(hotelText("APA Hotel Test", 45000)), t)[0],
        t,
      ),
    );
    const r = applyDrafts(t, [d]);
    expect(r.trip.places.find((p) => p.id === "verified")).toEqual(
      t.places.at(-1),
    );
  });
  it("updates descriptions only when explicitly selected, without a price write", () => {
    const d = confirm({
      ...parseDocument(
        document(hotelText("APA Hotel near Kishiwada Station", 45000)),
        trip,
      )[0],
      matchId: "apa",
      action: "update",
    });
    const result = applyDrafts(trip, [d]);
    expect(result.added).toBe(0);
    expect(result.updated).toBe(1);
    expect(result.trip.observations).toEqual(trip.observations);
  });
  it("never matches flight candidates on airline alone", () => {
    const d = confirm(parseDocument(document("Jetstar\nUSD 400"), trip)[0]);
    expect(suggestMatches(d, trip).matchId).toBe("");
  });
  it("research JSON merges preserve saved coordinates and deduplicate records", () => {
    const d = confirm(
      parseDocument(document(hotelText("APA Hotel Test", 50000)), trip)[0],
    );
    const saved = applyDrafts(trip, [d]).trip;
    const result = mergeResearch(saved, exportResearch(saved));
    expect(result.added).toBe(0);
    expect(result.trip.observations).toEqual(saved.observations);
    expect(result.trip.places).toEqual(saved.places);
    expect(() => mergeResearch(trip, { format: "bad" })).toThrow();
  });
});

it("imports shorthand and dotted flight times and explicit footer currency", () => {
  const rows = parseDocument(
    document(
      "Google Flights\n3pm ~ 5pm\nPeach\n$410\n7:30 a.m. – 10:00 a.m. +1\nJetstar\n$450\nCurrency USD",
    ),
    trip,
  );
  expect(
    rows.map((d) => [
      d.details.departure.trim(),
      d.details.arrival.trim(),
      d.currency,
    ]),
  ).toEqual([
    ["3pm", "5pm", "USD"],
    ["7:30 a.m.", "10:00 a.m. +1", "USD"],
  ]);
});
it("replaces flights atomically, retains hotels, and allows repeating a replacement", () => {
  const rows = parseDocument(
    document("Airline: Replacement Air\n3pm ~ 5pm\nUSD 410"),
    trip,
  ).map(confirm);
  const oldHotels = trip.observations.filter((o) => o.kind === "hotel");
  const result = applyDrafts(trip, rows, { replaceFlights: true }).trip;
  expect(result.observations.filter((o) => o.kind === "flight")).toHaveLength(
    1,
  );
  expect(result.observations.filter((o) => o.kind === "hotel")).toEqual(
    oldHotels,
  );
  expect(
    applyDrafts(result, rows, {
      replaceFlights: true,
    }).trip.observations.filter((o) => o.kind === "flight"),
  ).toHaveLength(1);
  const original = structuredClone(result);
  expect(() =>
    applyDrafts(
      result,
      rows.map((d) => ({ ...d, currency: "" })),
      { replaceFlights: true },
    ),
  ).toThrow("currency");
  expect(result).toEqual(original);
});
