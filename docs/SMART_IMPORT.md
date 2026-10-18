## Flight imports replace the previous batch

Each successful PDF/image/pasted/manual research import containing selected flights replaces all saved flight observations for the current trip. Hotels and their history are retained. Validation runs first; a failed or empty flight import does not delete anything. Reimporting the same flight document replaces the batch without double counting. JSON backup merging remains a separate recovery operation.

The footer shows exact validation errors instead of silently disabling Confirm import. If the source only displays `$`, choose **Currency for entries with an unknown currency** once to fill all missing currencies. Explicit currency settings such as `Currency USD` are read automatically. Departure and arrival times support `3pm ~ 5pm`, `3:00 PM – 5:00 PM`, 24-hour times, dotted a.m./p.m., and next-day offsets; saved flights show the time range prominently. Return schedules are still not invented.

# Smart Research Import

Use **Import Research** on Flights or Hotels, or **Import research** in the sidebar. Normal price updates happen entirely inside the website. They do not need Codex, a new GitHub deployment, an API key, or a Supabase account.

## Updating your research

1. Save your booking search as a PDF or screenshot, or copy its text. Include the search dates, guests and fare/room conditions when possible.
2. Choose files or drop them onto Import Research. Multiple PDFs and screenshots can be mixed in one batch. You can also paste text or add a manual entry.
3. Review each detected offer against **View original** / **Source excerpt**. Expand **Edit all offer details** to correct dates, guests, itinerary, room, baggage, tax/refund conditions and the price basis. A bare dollar sign is deliberately not assumed to mean USD.
4. Choose **Create a separate candidate**, **Add observation to an existing candidate**, **Update hotel description only**, or **Skip**. A suggested name match is not a guarantee that two hotels are the same property. Flight matching needs itinerary details; airline name alone is insufficient.
5. Confirm the context if you can establish it, check **I checked this entry against the source**, select the entry, then choose **Confirm import**. Missing details may remain unknown; the resulting history is explicitly marked uncertain and separated from comparable observations.
6. Review the saved observations in Flights or Hotels. Existing history stays intact. Use **Export research** for a JSON backup; upload it later and confirm its merge to transfer research between devices. The original full-trip backup remains available too.

Dates copied from the active trip are suggestions, not extracted facts. The capture date defaults to PDF creation metadata when available, otherwise the import date. It is always editable and never proves that a fare is currently bookable.

## What is processed locally

PDF.js extracts embedded text page by page, reconstructing rows from text coordinates. Tesseract.js handles PNG/JPEG screenshots and pages without usable embedded text. English is the default OCR language; English + Japanese can be selected. OCR workers, WebAssembly files and language models are served by this website, not an AI service. The initial OCR model download can take time on slow connections. Models may be cached by the browser.

File limits: 10 per batch, 25 MB per PDF/image, 30 pages per PDF, 40 megapixels per image. Excessive files are rejected rather than silently truncated. Extraction can be cancelled. Password-protected PDFs must be saved as unlocked copies. No PDF script is run by the importer.

Original documents and full extracted text exist only in the current import screen's memory. Selected records retain a bounded source excerpt, source filename, page, extraction method, capture-date provenance and a document hash. These records follow the existing storage mode: device-only localStorage, or your configured private Supabase trip. Leaving the screen discards unsaved previews; full source files are not stored or uploaded. All detected offers start unselected.

## Comparison and duplicate rules

- Confirmed series require dates, guests, price basis, taxes and cancellation/refund conditions. Hotels also need room/bed details; flights also need itinerary, cabin, baggage and return details, plus an explicit per-person or party round-trip basis.
- Incomplete offers get a source-specific uncertain basis, so two unknown fares are not treated as directly comparable simply because their prices changed.
- A document-content hash, page and offer identity form a stable fingerprint. Reimporting the same source entry skips it even if its price was corrected during review. A new capture produces a new historical observation. OCR changes or radically edited source text can change offer identity, so check the preview when reprocessing a source differently.
- Adding a hotel observation does not overwrite its description, estimate or coordinates. An explicit description update preserves verified coordinates. A new hotel gets no map location by guesswork.
- A new confirmed JPY whole-stay offer for the active trip can initialize its estimate. Existing hotels expose **Use as stay estimate** only for suitable confirmed imported observations; choosing it is an explicit action.
- With Google Places configured, map search can link a result to a saved hotel through **Review property link**. Otherwise use manually verified coordinates. Imports never silently make billable geocoding requests.
- JSON merges add missing records and deduplicate known observation IDs/fingerprints. Existing hotel descriptions and coordinates win. New hotels transferred through research-only JSON require map location confirmation. Full-trip backups retain the complete trip.

## Tested formats and honest limits

**The user's original Google Flights PDF and eight-page APA PDF were not present in the attachment folder or project during this implementation. Their exact layouts have not been tested. Please supply both before treating support for those specific exports as validated.**

Tests run against clearly identified synthetic fixtures:

- Multiple Google-Flights-style English listings with time/price rows preceding airline names, separate offers, and alternate-date summary prices.
- Eight pages of independently grouped APA-style property/room/price text, including multiple room options per property.
- A real Chromium-generated eight-page embedded-text PDF, passed through PDF.js in the browser.
- A PNG screenshot and JPEG image passed through the real local OCR engine.
- An image-only PDF rendered and passed through OCR.
- Editable review, confirmation, uncertain comparison grouping, history preservation, duplicate import prevention, missing coordinates, malformed PDFs, cancellation, and JSON export/merge.
- Desktop and emulated-mobile planning/import UI regressions. Heavy OCR/PDF fixture tests run once on desktop; they are not a claim of testing on physical mobile hardware.

The parsers are conservative heuristics, not general document understanding. Common English airline names and explicit `Airline:` / `Hotel:` headings are supported; APA-style names, room labels and currency amounts are recognized. Complex columns, unrecognized airline names, cards split across pages, localization, heavily compressed screenshots and unusual layouts can need manual correction. Pages with obviously interleaved hotel headings are left for manual review. OCR recognition scores are not guarantees of field accuracy. Japanese OCR is available, but Japanese site-layout parsing has not been validated against an actual sample.

No return flight, baggage allowance, exact hotel identity, four-night total, availability or coordinates are inferred to fill missing information. Summary/promotional figures are excluded where identifiable. Review remains necessary: unsupported layouts can misorder text or fail to produce an offer.

## Implementation

- `src/lib/import/readDocument.ts`: browser PDF/OCR reading, progress, cancellation and source dates.
- `src/lib/import/parser.ts`: deterministic draft extraction; add format-specific parsers here or split them into adapters as real samples become available.
- `src/lib/import/reconcile.ts`: explicit match actions, comparison bases, append-only import behavior, duplicate checks and JSON merging.
- `src/lib/import/types.ts`: additive research metadata; existing saved trips require no reset or destructive migration.
- `src/components/ResearchImport.tsx`: review workflow styled with the existing components and tokens.
- `scripts/copy-import-assets.mjs`: prepares locally served OCR assets before development/build.

Provider references: [PDF.js examples](https://mozilla.github.io/pdf.js/examples/) and [Tesseract.js API](https://github.com/naptha/tesseract.js/blob/master/docs/api.md).

### Approve and save a whole batch

After skimming the parsed entries, use **Approve & import all entries** at the bottom of the list. This confirms the displayed context, selects the batch, and saves it directly to Flights or Hotels in one click. Duplicate entries and entries set to Skip are excluded. Required-field errors still need correction; the batch is not partially saved if validation fails. The footer stays below the list instead of floating over it.

For individual selections, use the existing checkboxes and **Confirm import**.

### Map place details

Click a marker, a saved-place card, or its **Details** button to zoom to the place and show the details panel on the right (below the map on smaller screens). Places without confirmed coordinates cannot be zoomed to. The panel shows saved prices and conditions, room information, amenities, opening hours, notes, and source information. Use **Edit place details / photo** to add a photo URL or update saved details.

If Google Places is already configured and the place has a Google Place ID, the panel can retrieve photos, hours, address, and rating for this session. Photos include author attribution. This follows the [Google Place Photos documentation](https://developers.google.com/maps/documentation/javascript/place-photos). Without that connection, missing photos and hours are labeled as unavailable; they are not invented. Google details remain in memory and do not replace saved information.
