import { test, expect } from "@playwright/test";
import { seedTrip } from "../../src/lib/seed";
test("automatic imported-property geocoding, review, persistence and Japanese suggestions", async ({
  page,
}) => {
  test.setTimeout(60000);
  let saved = seedTrip();
  saved.places = saved.places.filter((p) => p.kind === "airport");
  saved.observations = [];
  let version = 0;
  const queries: string[] = [];
  const user = {
    id: "11111111-1111-4111-8111-111111111111",
    aud: "authenticated",
    role: "authenticated",
    email: "test@example.com",
    app_metadata: {},
    user_metadata: {},
    created_at: new Date().toISOString(),
  };
  await page.addInitScript(
    ({ trip, user }) => {
      if (!localStorage.getItem("wayfarer-v1"))
        localStorage.setItem("wayfarer-v1", JSON.stringify([trip]));
      const exp = Math.floor(Date.now() / 1000) + 3600;
      const token =
        btoa(JSON.stringify({ alg: "HS256", typ: "JWT" })) +
        "." +
        btoa(JSON.stringify({ sub: user.id, exp })) +
        ".test";
      localStorage.setItem(
        "sb-wayfarer-test-auth-token",
        JSON.stringify({
          access_token: token,
          refresh_token: "test-refresh",
          expires_at: exp,
          expires_in: 3600,
          token_type: "bearer",
          user,
        }),
      );
    },
    { trip: saved, user },
  );
  await page.route("https://wayfarer-test.supabase.co/**", async (route) => {
    const request = route.request(),
      url = request.url();
    if (url.includes("/functions/v1/travel-api")) {
      const body = request.postDataJSON();
      if (body.action === "status")
        return route.fulfill({ json: { geocoding: true, routes: false } });
      queries.push(body.text);
      const name = body.text.includes("Osaka Test Hotel")
        ? "Osaka Test Hotel"
        : body.text.includes("大阪駅")
          ? "大阪駅"
          : "Osaka";
      return route.fulfill({
        json: {
          results: [
            {
              lat: 34.69,
              lon: 135.5,
              name,
              formatted: name + ", Osaka, Japan",
              city: "Osaka",
              state: "Osaka",
              country: "Japan",
              result_type: name === "Osaka" ? "city" : "amenity",
              rank: { confidence: 0.99 },
              datasource: { attribution: "© OpenStreetMap contributors" },
              place_id: "test",
              housenumber: "",
              street: "",
              postcode: "",
            },
          ],
        },
      });
    }
    if (url.includes("/rpc/save_trip")) {
      saved = request.postDataJSON().p_data;
      return route.fulfill({ json: ++version });
    }
    if (url.includes("/rest/v1/trips"))
      return route.fulfill({ json: [{ id: saved.id, data: saved, version }] });
    if (url.includes("/auth/v1/user")) return route.fulfill({ json: user });
    return route.fulfill({ json: {} });
  });
  await page.goto("./");
  await page.getByRole("button", { name: "Open trip", exact: true }).click();
  await page
    .locator("nav")
    .getByRole("button", { name: "Import research", exact: true })
    .click();
  const dataset = {
    metadata: { version: "2.0" },
    lodging: [
      {
        listing_id: "LIVE-1",
        name: "Osaka Test Hotel",
        address: "10 Main Street, Osaka, Japan",
        price_total: 46000,
        price_observed_on: "2026-10-18",
        price_currency: "JPY",
      },
    ],
    attractions: [
      {
        attraction_id: "LIVE-2",
        name: "Unknown Test Museum",
        address: "Osaka, Japan",
      },
    ],
  };
  await page.getByLabel("Research dataset files").setInputFiles({
    name: "research.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(dataset)),
  });
  await page
    .getByRole("button", { name: "Import selected dataset records" })
    .click();
  await expect(
    page.getByRole("region", { name: "Automatic location search" }),
  ).toContainText("1 locations need review", { timeout: 30000 });
  await expect
    .poll(() => saved.places.find((p) => p.name === "Osaka Test Hotel")?.lat)
    .toBe(34.69);
  expect(saved.observations[0].amount).toBe(46000);
  expect(
    saved.places.find((p) => p.name === "Unknown Test Museum")?.lat,
  ).toBeUndefined();
  await page
    .locator("nav")
    .getByRole("button", { name: "Interactive map", exact: true })
    .click();
  await expect(
    page.locator('.leaflet-marker-icon[title="Osaka Test Hotel"]'),
  ).toHaveCount(1);
  await expect
    .poll(
      () =>
        saved.places.find((p) => p.name === "Unknown Test Museum")
          ?.geocodeAttempt,
    )
    .toBeTruthy();
  const count = queries.length;
  await page.reload();
  await page
    .locator("nav")
    .getByRole("button", { name: "Interactive map", exact: true })
    .click();
  await expect(
    page.locator('.leaflet-marker-icon[title="Osaka Test Hotel"]'),
  ).toHaveCount(1);
  expect(queries.length).toBe(count);
  await page.getByLabel("Search places", { exact: true }).fill("大阪駅");
  await page.getByRole("button", { name: /大阪駅.*confidence/ }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.getByLabel("Latitude (verified by you)")).toHaveValue(
    "34.69",
  );
  await page.getByRole("button", { name: "Save place", exact: true }).click();
  await page.getByLabel("Search places", { exact: true }).fill("");
  await expect(
    page.locator('.leaflet-marker-icon[title="大阪駅"]'),
  ).toHaveCount(1);
});
