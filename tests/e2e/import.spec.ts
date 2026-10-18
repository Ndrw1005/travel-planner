import { readFile } from "node:fs/promises";
import { test, expect, type Page } from "@playwright/test";
async function openImport(page: Page) {
  await page.goto("./");
  await page.getByRole("button", { name: "Open trip", exact: true }).click();
  const menu = page.getByRole("button", { name: "Open navigation" });
  if (await menu.isVisible()) await menu.click();
  await page
    .locator("nav")
    .getByRole("button", { name: "Flights", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Import Research", exact: true })
    .click();
}
const pasted =
  "Airline: Example Air\nDeparture time: 10:00 AM\nArrival time: 1:30 PM\nUSD 450\nNonstop\n3 hr 30 min";
test("paste, edit, confirm and deduplicate without credentials", async ({
  page,
}) => {
  await openImport(page);
  await page.getByLabel("Or paste copied website text").fill(pasted);
  await page.getByRole("button", { name: "Extract pasted text" }).click();
  const entry = page.locator(".import-entry").first();
  await expect(entry.getByLabel("Name", { exact: true })).toHaveValue(
    "Example Air",
  );
  await entry.getByLabel("Displayed price").fill("440");
  await entry
    .getByRole("checkbox", { name: "I checked this entry", exact: false })
    .check();
  await entry.getByRole("checkbox", { name: "Select entry 1" }).check();
  await page
    .getByRole("button", { name: "Confirm import", exact: true })
    .click();
  await expect(
    page.getByText("1 price observations added;", { exact: false }),
  ).toBeVisible();
  await page.getByLabel("Or paste copied website text").fill(pasted);
  await page.getByRole("button", { name: "Extract pasted text" }).click();
  await expect(
    page.getByRole("checkbox", { name: "Select entry 1" }),
  ).toBeEnabled();
  const saved = await page.evaluate(
    () => JSON.parse(localStorage.getItem("wayfarer-v1")!)[0],
  );
  expect(
    saved.observations.filter(
      (o: { name: string }) => o.name === "Example Air",
    ),
  ).toHaveLength(1);
  expect(saved.observations.at(-1).amount).toBe(440);
  expect(saved.observations.at(-1).research.comparable).toBe(false);
});
test("eight-page embedded-text PDF produces separate property/price groups", async ({
  page,
  browser,
}) => {
  test.skip(
    test.info().project.name === "mobile",
    "PDF generation fixture runs once; mobile review is covered separately.",
  );
  const print = await browser.newPage();
  await print.setContent(
    `<html><head><style>section{break-after:page;font:18px Arial;line-height:2}</style></head><body>${Array.from({ length: 8 }, (_, i) => `<section>APA Hotel Fixture ${i}<br>Room: Double room<br>Beds: One double bed<br>Total stay: JPY ${40000 + i}<br>Property ID: ${100 + i}</section>`).join("")}</body></html>`,
  );
  const pdf = await print.pdf({ format: "A4" });
  await print.close();
  await openImport(page);
  await page.getByLabel("Research files").setInputFiles({
    name: "synthetic-eight-page.pdf",
    mimeType: "application/pdf",
    buffer: pdf,
  });
  await expect(page.locator(".import-entry")).toHaveCount(8, {
    timeout: 30000,
  });
  for (let i = 0; i < 8; i++) {
    const entry = page.locator(".import-entry").nth(i);
    await expect(entry.getByLabel("Name", { exact: true })).toHaveValue(
      "APA Hotel Fixture " + i,
    );
    await expect(entry.getByLabel("Displayed price")).toHaveValue(
      String(40000 + i),
    );
  }
  const first = page.locator(".import-entry").first();
  await first
    .getByRole("checkbox", { name: "I checked this entry", exact: false })
    .check();
  await first.getByRole("checkbox", { name: "Select entry 1" }).check();
  await page
    .getByRole("button", { name: "Confirm import", exact: true })
    .click();
  const saved = await page.evaluate(
    () => JSON.parse(localStorage.getItem("wayfarer-v1")!)[0],
  );
  expect(
    saved.places.find((p: { name: string }) => p.name === "APA Hotel Fixture 0")
      .lat,
  ).toBeUndefined();
  expect(
    saved.places.find((p: { name: string }) => p.name === "APA Hotel Fixture 0")
      .cost,
  ).toBe(0);
  expect(saved.observations.at(-1).research.source.page).toBe(1);
});
test("PNG screenshot OCR uses only locally served processing assets", async ({
  page,
  browser,
}) => {
  test.skip(
    test.info().project.name === "mobile",
    "OCR engine exercised once; mobile review remains covered.",
  );
  test.setTimeout(90000);
  const canvas = await browser.newPage({
    viewport: { width: 1100, height: 500 },
  });
  await canvas.setContent(
    '<div style="padding:35px;font:30px Arial;line-height:1.8;color:black;background:white">APA Hotel OCR Test<br>Room: Double room<br>JPY 31500</div>',
  );
  const image = await canvas.screenshot();
  await canvas.close();
  await openImport(page);
  const processingRequests: string[] = [];
  page.on("request", (r) => {
    if (/traineddata|tesseract|worker.min/.test(r.url()))
      processingRequests.push(r.url());
  });
  await page.getByLabel("Research files").setInputFiles({
    name: "synthetic-ocr.png",
    mimeType: "image/png",
    buffer: image,
  });
  await expect(page.locator(".import-entry")).toHaveCount(1, {
    timeout: 75000,
  });
  await expect(
    page.locator(".import-entry").getByLabel("Displayed price"),
  ).toHaveValue("31500");
  expect(processingRequests.length).toBeGreaterThan(0);
  expect(
    processingRequests.every((u) => u.startsWith("http://127.0.0.1:5173/")),
  ).toBe(true);
  await expect(
    page
      .locator(".import-entry")
      .getByRole("checkbox", { name: "Select entry 1" }),
  ).not.toBeChecked();
});
test("invalid PDF leaves trip data untouched with a useful error", async ({
  page,
}) => {
  await openImport(page);
  const before = await page.evaluate(() => localStorage.getItem("wayfarer-v1"));
  await page.getByLabel("Research files").setInputFiles({
    name: "broken.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from("this is not a pdf"),
  });
  await expect(page.locator(".import-message")).toContainText("broken.pdf", {
    timeout: 20000,
  });
  await expect(page.locator(".import-entry")).toHaveCount(0);
  expect(await page.evaluate(() => localStorage.getItem("wayfarer-v1"))).toBe(
    before,
  );
});

test("image-only PDF and JPEG use OCR; cancellation leaves data intact", async ({
  page,
  browser,
}) => {
  test.skip(
    test.info().project.name === "mobile",
    "OCR formats covered on desktop.",
  );
  test.setTimeout(90000);
  const fixture = await browser.newPage({
    viewport: { width: 1000, height: 350 },
  });
  await fixture.setContent(
    '<div style="padding:24px;font:30px Arial;line-height:1.8;background:white;color:black">APA Hotel Scanned Fixture<br>Room: Twin room<br>JPY 47800</div>',
  );
  const jpeg = await fixture.screenshot({ type: "jpeg", quality: 95 });
  await fixture.setContent(
    `<img width="750" src="data:image/jpeg;base64,${jpeg.toString("base64")}">`,
  );
  await fixture
    .locator("img")
    .evaluate((img: HTMLImageElement) => img.decode());
  const pdf = await fixture.pdf({ format: "A4" });
  await fixture.close();
  await openImport(page);
  await page.getByLabel("Research files").setInputFiles([
    { name: "synthetic-scan.pdf", mimeType: "application/pdf", buffer: pdf },
    { name: "synthetic-photo.jpg", mimeType: "image/jpeg", buffer: jpeg },
  ]);
  await expect(page.locator(".import-entry")).toHaveCount(2, {
    timeout: 75000,
  });
  await expect(
    page.locator(".import-entry").first().getByLabel("Displayed price"),
  ).toHaveValue("47800");
  await expect(
    page.locator(".import-entry").nth(1).getByLabel("Displayed price"),
  ).toHaveValue("47800");
  const saved = await page.evaluate(() => localStorage.getItem("wayfarer-v1"));
  await page.getByLabel("Research files").setInputFiles({
    name: "cancelled.jpg",
    mimeType: "image/jpeg",
    buffer: jpeg,
  });
  await page.getByRole("button", { name: "Cancel extraction" }).click();
  await expect(
    page.getByRole("button", { name: "Choose files", exact: true }),
  ).toBeEnabled({ timeout: 10000 });
  expect(await page.evaluate(() => localStorage.getItem("wayfarer-v1"))).toBe(
    saved,
  );
});

test("research JSON export can be reviewed and merged without duplicating history", async ({
  page,
}) => {
  await openImport(page);
  const downloadPromise = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Export research", exact: true })
    .click();
  const download = await downloadPromise;
  const path = await download.path();
  await page.getByLabel("Research files").setInputFiles({
    name: "wayfarer-research.json",
    mimeType: "application/json",
    buffer: await readFile(path!),
  });
  await expect(
    page.getByRole("heading", { name: "Review research backup merge" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Confirm backup merge" }).click();
  await expect(
    page.getByText(
      "Research backup merged: 0 observations added, 4 duplicates skipped.",
    ),
  ).toBeVisible();
  const trip = await page.evaluate(
    () => JSON.parse(localStorage.getItem("wayfarer-v1")!)[0],
  );
  expect(trip.places).toHaveLength(7);
  expect(trip.observations).toHaveLength(4);
});

test("approve all selects and reviews the batch while excluding skips and duplicates", async ({
  page,
}) => {
  await openImport(page);
  const hotel = pasted.replace("Airline:", "Hotel:");
  const batch =
    hotel +
    "\n\n" +
    hotel.replace("Example Air", "Second Air") +
    "\n\n" +
    hotel.replace("Example Air", "Skipped Air");
  await page.getByLabel("Or paste copied website text").fill(batch);
  await page.getByRole("button", { name: "Extract pasted text" }).click();
  const entries = page.locator(".import-entry");
  await expect(entries).toHaveCount(3);
  await entries.nth(2).getByLabel("What should happen?").selectOption("skip");
  await page
    .getByRole("button", { name: "Approve all entries", exact: true })
    .click();
  for (let i = 0; i < 2; i++) {
    await expect(
      entries.nth(i).getByRole("checkbox", { name: `Select entry ${i + 1}` }),
    ).toBeChecked();
    await expect(
      entries
        .nth(i)
        .getByRole("checkbox", { name: "I checked this entry", exact: false }),
    ).toBeChecked();
    await expect(
      entries.nth(i).getByRole("checkbox", {
        name: "I confirm these travel/stay",
        exact: false,
      }),
    ).toBeChecked();
  }
  await expect(
    entries.nth(2).getByRole("checkbox", { name: "Select entry 3" }),
  ).not.toBeChecked();
  await page
    .getByRole("button", { name: "Confirm import", exact: true })
    .click();
  await expect(
    page.getByText("2 price observations added;", { exact: false }),
  ).toBeVisible();
  await page.getByLabel("Or paste copied website text").fill(batch);
  await page.getByRole("button", { name: "Extract pasted text" }).click();
  await page
    .getByRole("button", { name: "Approve all entries", exact: true })
    .click();
  for (let i = 0; i < 2; i++) {
    await expect(
      entries.nth(i).getByRole("checkbox", { name: `Select entry ${i + 1}` }),
    ).not.toBeChecked();
  }
});

test("bottom action approves and saves all parsed entries in one click", async ({
  page,
}) => {
  await openImport(page);
  await page
    .getByLabel("Or paste copied website text")
    .fill(pasted + "\n\n" + pasted.replace("Example Air", "Second Air"));
  await page.getByRole("button", { name: "Extract pasted text" }).click();
  const footer = page.getByLabel("Save reviewed research");
  const lastEntry = page.locator(".import-entry").last();
  const entryBox = await lastEntry.boundingBox();
  const footerBox = await footer.boundingBox();
  expect(footerBox!.y).toBeGreaterThanOrEqual(entryBox!.y + entryBox!.height);
  await footer
    .getByRole("button", { name: "Approve & import all entries", exact: true })
    .click();
  await expect(
    page.getByText("2 price observations added;", { exact: false }),
  ).toBeVisible();
  await expect(page.locator(".import-entry")).toHaveCount(0);
  const saved = await page.evaluate(
    () => JSON.parse(localStorage.getItem("wayfarer-v1")!)[0],
  );
  expect(
    saved.observations.filter((o: { name: string }) =>
      ["Example Air", "Second Air"].includes(o.name),
    ),
  ).toHaveLength(2);
});

test("unknown dollar currency is resolved once and flight imports replace the previous batch", async ({
  page,
}) => {
  await openImport(page);
  const batch =
    "Airline: New Flight A\n3pm ~ 5pm\n$410\nAirline: New Flight B\n7am ~ 9am\n$450";
  await page.getByLabel("Or paste copied website text").fill(batch);
  await page.getByRole("button", { name: "Extract pasted text" }).click();
  await page
    .getByRole("button", { name: "Approve & import all entries", exact: true })
    .click();
  const footer = page.getByLabel("Save reviewed research");
  await expect(footer.getByRole("alert")).toContainText(
    "Choose a supported currency",
  );
  await expect(
    footer.getByRole("button", { name: "Confirm import", exact: true }),
  ).toBeEnabled();
  await page
    .getByLabel("Currency for entries with an unknown currency", {
      exact: false,
    })
    .selectOption("USD");
  await footer
    .getByRole("button", { name: "Confirm import", exact: true })
    .click();
  await expect(
    page.getByText("2 price observations added;", { exact: false }),
  ).toBeVisible();
  let saved = await page.evaluate(
    () => JSON.parse(localStorage.getItem("wayfarer-v1")!)[0],
  );
  expect(
    saved.observations.filter((o: { kind: string }) => o.kind === "flight"),
  ).toHaveLength(2);
  await page
    .getByLabel("Or paste copied website text")
    .fill("Airline: Latest Flight\n11am ~ 1pm\nUSD 500");
  await page.getByRole("button", { name: "Extract pasted text" }).click();
  await page
    .getByRole("button", { name: "Approve & import all entries", exact: true })
    .click();
  saved = await page.evaluate(
    () => JSON.parse(localStorage.getItem("wayfarer-v1")!)[0],
  );
  expect(
    saved.observations.filter((o: { kind: string }) => o.kind === "flight"),
  ).toHaveLength(1);
  const menu = page.getByRole("button", { name: "Open navigation" });
  if (await menu.isVisible()) await menu.click();
  await page
    .locator("nav")
    .getByRole("button", { name: "Flights", exact: true })
    .click();
  await expect(page.locator(".flight-times")).toContainText("11am → 1pm");
});
