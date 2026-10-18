import { describe, it, expect } from "vitest";
import {
  dates,
  localToUtc,
  cashNeed,
  moveStop,
  conflict,
  scoreHotel,
  stats,
  safeUrl,
} from "../src/lib/model";
import { seedTrip } from "../src/lib/seed";
describe("planning transformations", () => {
  it("includes both trip endpoints and crosses years", () =>
    expect(dates("2026-12-30", "2027-01-02")).toEqual([
      "2026-12-30",
      "2026-12-31",
      "2027-01-01",
      "2027-01-02",
    ]));
  it("does not loop on invalid or reversed dates", () => {
    expect(dates("bad", "bad")).toEqual([]);
    expect(dates("2026-12-29", "2026-12-25")).toEqual([]);
  });
  it("preserves uncertainty in imported research", () => {
    const t = seedTrip();
    expect(t.places.find((p) => p.id === "apa")?.lat).toBeUndefined();
    expect(
      t.observations.filter((o) => o.kind === "flight").map((o) => o.amount),
    ).toEqual([412, 415, 507]);
    expect(t.observations.every((o) => o.source === "Manual research")).toBe(
      true,
    );
    expect(t.origin).toContain("choose");
  });
  it("excludes card expenses and actuals from cash estimate", () => {
    const base = {
      id: "a",
      name: "a",
      category: "Food",
      currency: "JPY" as const,
      paidBy: "A",
    };
    const expenses = [
      { ...base, amount: 100, cash: true, actual: false },
      { ...base, amount: 200, cash: false, actual: false },
      { ...base, amount: 1000, cash: true, actual: true },
    ];
    expect(cashNeed(expenses, { JPY: 1, TWD: 5, USD: 150 }, true, 20)).toBe(
      120,
    );
    expect(cashNeed(expenses, { JPY: 1, TWD: 5, USD: 150 }, false, 20)).toBe(
      360,
    );
  });
  it("reorders without mutating stops and detects time conflict", () => {
    const a = [
      { id: "a", placeId: "x", time: "10:00", duration: 60 },
      { id: "b", placeId: "y", time: "10:30", duration: 30 },
    ];
    expect(moveStop(a, 0, 1)[0].id).toBe("b");
    expect(a[0].id).toBe("a");
    expect(conflict(a)[1]).toContain("Overlap");
  });
  it("does not invent a complete score from missing inputs", () => {
    expect(
      scoreHotel(undefined, undefined, undefined, [5, 5, 5]).score,
    ).toBeNull();
    expect(scoreHotel(40000, undefined, undefined, [5, 5, 5])).toMatchObject({
      score: 80,
      coverage: 1,
    });
  });
  it("sorts observations before calculating changes", () => {
    const t = seedTrip();
    const o = t.observations[0];
    expect(
      stats([
        { ...o, amount: 200, at: "2026-10-20" },
        { ...o, amount: 100, at: "2026-10-18" },
      ]),
    ).toMatchObject({
      min: 100,
      max: 200,
      latest: 200,
      change: 100,
      percent: 100,
    });
  });
  it("rejects executable document links", () => {
    expect(safeUrl("javascript:alert(1)")).toBeUndefined();
    expect(safeUrl("https://example.com")).toBe("https://example.com/");
  });
});

it("uses the destination timezone including half-hour offsets", () => {
  expect(localToUtc("2026-12-25T10:00", "Asia/Tokyo")).toBe(
    "2026-12-25T01:00:00.000Z",
  );
  expect(localToUtc("2026-12-25T10:00", "Asia/Kolkata")).toBe(
    "2026-12-25T04:30:00.000Z",
  );
});
