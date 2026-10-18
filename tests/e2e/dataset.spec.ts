import { readFile } from "node:fs/promises";
import { test, expect, type Page } from "@playwright/test";
async function nav(page: Page, name: string) {
  const menu = page.getByRole("button", { name: "Open navigation" });
  if (await menu.isVisible()) await menu.click();
  await page.locator("nav").getByRole("button", { name, exact: true }).click();
}
const data = {
  metadata: { version: "2.0" },
  lodging: [
    {
      listing_id: "APA-999",
      hotel_id: "APA-999",
      name: "Synthetic Research Hotel",
      price_total: "46000",
      price_currency: "JPY",
      price_observed_on: "2026-10-18",
      price_scope: "stay dates UNVERIFIED",
      room_label: "Double room",
      platform: "APA official",
      address: "Synthetic test address",
      amenities_list: "Wi-Fi",
    },
  ],
  attractions: [
    {
      attraction_id: "TEST-1",
      name: "Synthetic Museum",
      closure_or_date_warning: "CLOSED 2026-12-28 and 2026-12-29",
      typical_visit_hours: "1.5",
      exact_holiday_hours_verified: "no",
    },
  ],
  flights_one_way: [
    {
      flight_id: "TEST-OUT-1",
      direction: "outbound",
      airline_display: "Synthetic Air",
      departure_date: "2026-12-25",
      departure_time_local: "15:00",
      arrival_time_local: "17:00",
      fare_usd_one_person: 150,
      recorded_on: "2026-10-18",
      price_type: "ONE-WAY per adult; NOT round trip",
    },
  ],
};
async function upload(page: Page) {
  await page.getByLabel("Research dataset files").setInputFiles({
    name: "research.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(data)),
  });
}
test("structured import keeps history, shows hotel price and supports confirmed map locations", async ({
  page,
}) => {
  await page.goto("./");
  await page.getByRole("button", { name: "Open trip", exact: true }).click();
  await nav(page, "Import research");
  await upload(page);
  await expect(page.getByText("Dry-run preview · 3 records")).toBeVisible();
  const download = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Import selected dataset records" })
    .click();
  const backup = await download;
  const backupData = JSON.parse(await readFile((await backup.path())!, "utf8"));
  expect(backupData.version).toBe(1);
  expect(backupData.trips).toHaveLength(1);
  await expect(
    page.getByRole("status").filter({ hasText: "Dataset saved" }),
  ).toBeVisible();
  const before = await page.evaluate(
    () => JSON.parse(localStorage.getItem("wayfarer-v1")!)[0],
  );
  await upload(page);
  await page
    .getByRole("button", { name: "Import selected dataset records" })
    .click();
  await expect(
    page.getByRole("status").filter({ hasText: "Dataset saved" }),
  ).toBeVisible();
  const after = await page.evaluate(
    () => JSON.parse(localStorage.getItem("wayfarer-v1")!)[0],
  );
  expect(after.observations).toHaveLength(before.observations.length);
  expect(after.places).toHaveLength(before.places.length);
  await nav(page, "Hotels");
  const hotel = page
    .locator(".hotel-card")
    .filter({ hasText: "Synthetic Research Hotel" });
  await expect(hotel.locator(".price")).toContainText("46,000");
  await expect(hotel.locator(".price")).toContainText("UNVERIFIED");
  await hotel.getByRole("button", { name: "Edit details" }).click();
  await page
    .getByLabel("Google Maps coordinates or full place URL")
    .fill("34.1, 135.2");
  await page.getByRole("button", { name: "Preview pasted location" }).click();
  await page.getByRole("button", { name: "Confirm this location" }).click();
  await page.getByRole("button", { name: "Save place", exact: true }).click();
  await nav(page, "Interactive map");
  await expect(
    page.locator('.leaflet-marker-icon[title="Synthetic Research Hotel"]'),
  ).toHaveCount(1);
  await nav(page, "Flights");
  await page
    .getByRole("button", { name: "Outbound one-way", exact: true })
    .click();
  await expect(page.locator(".price-options")).toContainText("Synthetic Air");
  await expect(page.locator(".price-options")).not.toContainText("Jetstar");
  await nav(page, "Daily itinerary");
  const saved = await page.evaluate(
    () => JSON.parse(localStorage.getItem("wayfarer-v1")!)[0],
  );
  const attraction = saved.places.find(
    (p: { name: string }) => p.name === "Synthetic Museum",
  );
  await page.getByRole("button", { name: /DAY 4.*Dec 28/ }).click();
  await page.getByLabel("Place to add").selectOption(attraction.id);
  await page.getByRole("button", { name: "Add stop", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("CLOSED 2026-12-28");
});
test("address lookup requires confirmation before saving coordinates", async ({
  page,
}) => {
  await page.route("https://photon.komoot.io/**", (route) =>
    route.fulfill({
      json: {
        features: [
          {
            geometry: { coordinates: [135.2, 34.1] },
            properties: { name: "Synthetic lookup result", city: "Test city" },
          },
        ],
      },
    }),
  );
  await page.goto("./");
  await page.getByRole("button", { name: "Open trip", exact: true }).click();
  await nav(page, "Interactive map");
  await page.getByRole("button", { name: "Add place", exact: true }).click();
  await page.getByLabel("Name", { exact: true }).fill("Lookup test");
  await page
    .getByLabel("Address or exact property name")
    .fill("Synthetic address");
  await page.getByRole("button", { name: "Find address on map" }).click();
  await expect(page.getByLabel("Latitude (verified by you)")).toHaveValue("");
  await page.getByRole("button", { name: "Confirm this location" }).click();
  await expect(page.getByLabel("Latitude (verified by you)")).toHaveValue(
    "34.1",
  );
  await page.getByRole("button", { name: "Save place", exact: true }).click();
  await expect(
    page.locator('.leaflet-marker-icon[title="Lookup test"]'),
  ).toHaveCount(1);
});
test("actual private Osaka master imports all 122 records", async ({
  page,
}) => {
  test.skip(
    !process.env.WAYFARER_RESEARCH_DIR,
    "Private user files remain outside repository and CI",
  );
  await page.goto("./");
  await page.getByRole("button", { name: "Open trip", exact: true }).click();
  await nav(page, "Import research");
  await page
    .getByLabel("Research dataset files")
    .setInputFiles(
      `${process.env.WAYFARER_RESEARCH_DIR}/osaka_research_master.json`,
    );
  await expect(page.getByText("Dry-run preview · 122 records")).toBeVisible();
  await page
    .getByRole("button", { name: "Import selected dataset records" })
    .click();
  await expect(
    page.getByRole("status").filter({ hasText: "Dataset saved" }),
  ).toBeVisible();
  await nav(page, "Hotels");
  const hotel = page
    .locator(".hotel-card")
    .filter({ hasText: "APA Hotel Midosuji Hommachi Ekihigashi" });
  await expect(hotel.locator(".price")).toContainText("46,000");
  await expect(hotel).toContainText("Double Room - Non-Smoking");
});

test("ZIP photos stay in IndexedDB and unsafe ZIP paths are rejected", async ({
  page,
}) => {
  const { zipSync, strToU8 } = await import("fflate");
  const withPhoto = {
    ...data,
    lodging: [
      { ...data.lodging[0], photo_asset_path: "hotel_photos/apa-999.png" },
    ],
  };
  const image = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jK1sAAAAASUVORK5CYII=",
    "base64",
  );
  await page.goto("./");
  await page.getByRole("button", { name: "Open trip", exact: true }).click();
  await nav(page, "Import research");
  await page.getByLabel("Research dataset files").setInputFiles({
    name: "package.zip",
    mimeType: "application/zip",
    buffer: Buffer.from(
      zipSync({
        "osaka_research_master.json": strToU8(JSON.stringify(withPhoto)),
        "hotel_photos/apa-999.png": image,
      }),
    ),
  });
  await page
    .getByRole("checkbox", {
      name: "Save bundled photos privately",
      exact: false,
    })
    .check();
  await page
    .getByRole("button", { name: "Import selected dataset records" })
    .click();
  await expect(
    page.getByRole("status").filter({ hasText: "Dataset saved" }),
  ).toBeVisible();
  await nav(page, "Hotels");
  const hotel = page
    .locator(".hotel-card")
    .filter({ hasText: "Synthetic Research Hotel" });
  await expect(hotel.locator("img")).toHaveAttribute("src", /^blob:/);
  await nav(page, "Import research");
  await page.getByLabel("Research dataset files").setInputFiles({
    name: "unsafe.zip",
    mimeType: "application/zip",
    buffer: Buffer.from(zipSync({ "../unsafe.json": strToU8("{}") })),
  });
  await expect(page.getByRole("status")).toContainText("Unsafe ZIP path");
});

test("saved addresses can be located together directly on the map and persist after reload", async ({
  page,
}) => {
  const queries: string[] = [];
  await page.route("https://photon.komoot.io/**", async (route) => {
    queries.push(new URL(route.request().url()).searchParams.get("q")!);
    await route.fulfill({
      json: {
        features: [
          {
            geometry: { coordinates: [135.2, 34.1] },
            properties: {
              name: "Review this hotel",
              osm_value: "hotel",
              city: "Test city",
            },
          },
          {
            geometry: { coordinates: [135.3, 34.2] },
            properties: { name: "Nearby station", osm_value: "station" },
          },
        ],
      },
    });
  });
  await page.goto("./");
  await page.getByRole("button", { name: "Open trip", exact: true }).click();
  await nav(page, "Import research");
  await upload(page);
  await page
    .getByRole("button", { name: "Import selected dataset records" })
    .click();
  await expect(
    page.getByRole("status").filter({ hasText: "Dataset saved" }),
  ).toBeVisible();
  await nav(page, "Interactive map");
  await page
    .getByRole("button", { name: "Locate saved places", exact: true })
    .click();
  const review = page.getByRole("region", { name: "Locate saved places" });
  await review.getByRole("button", { name: /^Find locations/ }).click();
  await expect(review.getByRole("status")).toContainText("Review the matches", {
    timeout: 20000,
  });
  const hotel = review
    .locator(".location-review-item")
    .filter({ hasText: "Synthetic Research Hotel" });
  const museum = review
    .locator(".location-review-item")
    .filter({ hasText: "Synthetic Museum" });
  await expect(hotel.getByRole("radio")).toHaveCount(2);
  await expect(
    page.locator('.leaflet-marker-icon[title="Synthetic Research Hotel"]'),
  ).toHaveCount(0);
  await expect(
    review.getByRole("button", { name: "Save selected pins (0)" }),
  ).toBeDisabled();
  await hotel.getByRole("radio").first().check();
  await museum.getByRole("radio").last().check();
  await review.getByRole("button", { name: "Save selected pins (2)" }).click();
  await expect(
    page.locator('.leaflet-marker-icon[title="Synthetic Research Hotel"]'),
  ).toHaveCount(1);
  await expect(
    page.locator('.leaflet-marker-icon[title="Synthetic Museum"]'),
  ).toHaveCount(1);
  await expect(page.locator(".map-canvas")).toHaveAttribute("data-zoom", "16");
  const saved = await page.evaluate(
    () => JSON.parse(localStorage.getItem("wayfarer-v1")!)[0].places,
  );
  expect(
    saved.find((p: { name: string }) => p.name === "Synthetic Research Hotel"),
  ).toMatchObject({
    lat: 34.1,
    lng: 135.2,
    coordinateStatus: "USER_CONFIRMED",
  });
  expect(
    saved.find((p: { name: string }) => p.name === "Synthetic Museum"),
  ).toMatchObject({ lat: 34.2, lng: 135.3 });
  expect(queries.some((q) => q.includes("Synthetic Research Hotel"))).toBe(
    true,
  );
  const lookupCount = queries.length;
  await page.reload();
  await nav(page, "Interactive map");
  await expect(
    page.locator('.leaflet-marker-icon[title="Synthetic Research Hotel"]'),
  ).toHaveCount(1);
  expect(queries).toHaveLength(lookupCount);
});
