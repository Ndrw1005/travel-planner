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
  ).toBeDisabled();
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
  await page
    .getByLabel("Research files")
    .setInputFiles({
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
