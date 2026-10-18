import { test, expect, type Page } from "@playwright/test";
async function nav(page: Page, name: string) {
  const menu = page.getByRole("button", { name: "Open navigation" });
  if (await menu.isVisible()) await menu.click();
  await page.locator("nav").getByRole("button", { name, exact: true }).click();
}
async function open(page: Page) {
  await page.goto("./");
  await page.getByRole("button", { name: "Open trip", exact: true }).click();
}
test("map selection, category filters and honest unverified hotel", async ({
  page,
}) => {
  await open(page);
  await nav(page, "Interactive map");
  await expect(page.getByText("Location unverified · no pin")).toBeVisible();
  const hotel = page.locator(".place-card").filter({ hasText: "Namba base" });
  await hotel.getByRole("button", { name: "Use as base" }).click();
  await expect(
    hotel.getByRole("button", { name: "✓ Your base" }),
  ).toBeVisible();
  await expect(page.locator(".route-panel")).toContainText("Demo map");
  await page
    .locator(".filter-chips")
    .getByRole("button", { name: "hotels", exact: true })
    .click();
  await expect(hotel).toHaveCount(0);
  await page.getByLabel("Show illustrative KIX–Namba path").check();
  await expect(
    page.getByText("Illustration only.", { exact: false }),
  ).toBeVisible();
});
test("itinerary, packing and notes persist through reload", async ({
  page,
}) => {
  await open(page);
  await nav(page, "Daily itinerary");
  await page.getByLabel("Place to add").selectOption("castle");
  await page.getByRole("button", { name: "Add stop", exact: true }).click();
  await expect(page.locator(".itinerary-stop")).toHaveCount(1);
  await nav(page, "Packing");
  const item = page.getByRole("checkbox", { name: "Passport" }).first();
  await item.check();
  await nav(page, "Bookings & notes");
  await page.getByLabel("Trip notes").fill("Reserve a quiet dinner.");
  await page.reload();
  await nav(page, "Bookings & notes");
  await expect(page.getByLabel("Trip notes")).toHaveValue(
    "Reserve a quiet dinner.",
  );
  await nav(page, "Daily itinerary");
  await expect(page.locator(".itinerary-stop")).toHaveCount(1);
  await nav(page, "Packing");
  await expect(
    page.getByRole("checkbox", { name: "Passport" }).first(),
  ).toBeChecked();
});
test("create trip and retain metadata", async ({ page }) => {
  await page.goto("./");
  await page.getByRole("button", { name: "Plan a trip", exact: true }).click();
  await page.getByLabel("Trip name", { exact: true }).fill("Kyoto weekend");
  await page.getByLabel("Origin / departure airport").fill("TPE");
  await page.getByLabel("Destination", { exact: true }).fill("Kyoto, Japan");
  await page.getByRole("button", { name: "Save trip", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Kyoto weekend" }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Kyoto weekend" }),
  ).toBeVisible();
});
test("manual price history does not mix currencies or bases", async ({
  page,
}) => {
  await open(page);
  await nav(page, "Flights");
  await expect(
    page.getByText("Recorded observations, not current offers."),
  ).toBeVisible();
  await page.getByRole("button", { name: "Record price", exact: true }).click();
  await page.getByLabel("Airline / property").fill("Test airline");
  await page.getByLabel("Amount", { exact: true }).fill("500");
  await page
    .getByLabel("Comparison basis", { exact: false })
    .fill("2 adults; round trip; baggage unknown");
  await page.getByRole("button", { name: "Save observation" }).click();
  await expect(
    page.getByRole("heading", { name: "Test airline" }),
  ).toBeVisible();
  await expect(
    page.getByLabel("Price history series").locator("option"),
  ).toHaveCount(4);
});
