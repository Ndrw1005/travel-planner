# Structured research imports

Use **Import researched dataset** in Flights, Hotels or Attractions, or open **Import research**. Upload the supplied `osaka_research_master.json` to preview all 122 records together. You can also import each lodging, one-way flight or attraction CSV separately. The files are read privately in your browser; the website does not contain a public copy of them. Accepted records follow the app's existing device/cloud storage setting.

1. Upload one JSON/ZIP or CSV at a time. No PDF extraction is needed for structured files.
2. Review the dry-run list. Expand any record to inspect all source fields. Uncheck unwanted records.
3. For matching saved places, choose **Keep my saved value** or **Use incoming value** for each conflicting field. Existing edits and verified coordinates are kept by default. APA property numbers and supplier IDs match before exact property names. Airbnb candidates are never merged solely by description/name.
4. Choose **Import selected dataset records**. A version-1 trip backup downloads before changes. Restore that file with the app's **Import backup** control if needed.
5. Check **Dataset import history** for added/matched/skipped counts and unresolved conditions. Reimporting the same observations is idempotent.

## Prices and flight direction

Hotel cards now display the latest saved observation as their main price, including currency, capture date and price scope. An unverified room price is not silently turned into a four-night budget estimate. Provider ratings retain their original scale (/10 or /5).

Structured datasets merge observations and preserve existing history, as requested in the v2 specification. The earlier PDF/paste flight workflow still replaces the previous flight batch. Flights have outbound one-way, return one-way and historical round-trip views. Any cross-option sum is an arithmetic illustration only, not a round-trip quote or bookable itinerary. Baggage and local departure/arrival times remain explicit.

## Addresses and map pins

For geocoded datasets, use the automatic coordinate CSV import described below; no manual confirmation is needed for reliable matches. For addresses without geocoding results, on **Interactive map**, use **Locate saved places**, then **Find locations** to search up to 10 missing locations at a time. Review each candidate name, address and category, select the appropriate matches, then **Save selected pins**. Pins are saved immediately and persist after reload. Uncertain matches are never selected automatically. You can stop a lookup and retain completed results, or search/paste exact coordinates for an individual place directly in the review panel. Listings without a unique identity are excluded. Existing pins are preserved.

For an individual place, you can also open **Edit details**, then **Find address on map**. The on-demand Photon search sends only the entered query and returns candidate locations. Check the candidate's map link, choose **Confirm this location**, then **Save place**. Queries are cached and limited to 30 per device per day with a minimum interval; there is no background geocoding. Map batches run sequentially through the same cache and rate limit as individual searches. Availability and completeness of the public service are not guaranteed. [Photon service documentation](https://github.com/komoot/photon) permits reasonable use and explains its limits.

The provided Kishiwada address can return nearby station results instead of the exact hotel. Do not confirm a station as the hotel. The reliable fallback is to locate the exact building on Google Maps, right-click it, copy the latitude/longitude, and paste that pair into **Google Maps coordinates or full place URL**. Preview, confirm and save. Full place URLs with `!3d`/`!4d` coordinates also work; viewport `@` coordinates and short links are not treated as a precise pin.

Candidates marked `DO_NOT_GEOCODE_NO_UNIQUE_LISTING` remain in **Location unknown**, without geocoding or invented pins. Verified locations participate in the existing map/routing workflows; live route calculations retain their original integration requirements.

## Photos, closures and safety

ZIPs can include the master JSON and `hotel_photos/apa-*.webp` (or PNG/JPEG). Choose the private-photo checkbox to store these in IndexedDB on this device. They are not published or cloud-synced; JSON backups preserve photo references, not the photo bytes, so keep the original ZIP for transfer. No photo files were supplied with this request, so missing assets display placeholders. A saved approved photo URL is also supported.

Attraction records retain official URLs, duration estimates, holiday-hour uncertainty and supplied closure warnings. The itinerary displays closure warnings alongside scheduled places, including the museum closures specified in the supplied research. These are attributed research claims, not a new independent hours verification. Sample itinerary prose and arithmetic scenarios in the JSON are not automatically scheduled or imported as real fares.

CSV parsing supports UTF-8 BOMs, quoted commas/newlines and escaped quotes. Fields are rendered as text; exports use JSON, so spreadsheet formulas are not executed. Unsafe links, object-valued fields and invalid prices/dates are rejected or flagged. ZIP traversal paths and excessive expanded sizes are rejected. Files are capped at 25 MB, datasets at 1,000 records, and ZIPs at 200 entries / 30 MB expanded.

## Ask ChatGPT for future research

Ask it to use the same headers as your supplied CSVs or the same v2 master JSON schema, preserve stable IDs, separate one-way flights from actual round-trip quotes, and leave unknown information blank or explicitly unverified. Require source URLs, observation dates, currency, party/room/stay basis, and local departure/arrival times. Do not reuse an ID for an unrelated listing. Use `metadata.version: "2.0"` and the arrays `lodging`, `flights_one_way`, `flight_round_trip_history`, and `attractions` for JSON.

The provided PDF guide remains a human-readable companion; the importer uses the supplied JSON/CSV values directly rather than re-extracting that PDF.

## Automatic coordinate CSV import

Upload a coordinate CSV using **Import research → Research dataset files**. It updates the active trip immediately, downloading a full trip backup first. It never creates a new place. Use a Wayfarer place ID, supplier/property ID, research record ID, or research-key alias:

```csv
record_id,latitude,longitude
HOTEL-001,51.5074,-0.1278
ATTRACTION-002,51.5081,-0.0759
```

Geoapify CSVs accept `original_record_id` or an exact `original_geocode_query` / `query.text` / `geocode_query`, plus `lat` and `lon`. Source queries match stored queries, addresses, or `name, address`; accents, case and punctuation are normalized. IDs take priority, but contradictory IDs/queries, ambiguous identities and conflicting coordinates for the same record are flagged. Row order is never used for reconciliation. Unmatched rows remain unapplied; import the research records first.

Provider confidence is not proof of a building match. Geoapify rows require confidence ≥0.85, a matching returned city/area, and either the exact property name or building confidence ≥0.9 with a matching house number and street. Explicit district/postcode/street results are approximate and require review. Plausibility checks flag coordinates more than 300 km from every known non-demo trip place or more than 5 km from the record's existing pin. These conservative checks may flag legitimate multi-city travel and renamed properties. They are not a worldwide address verifier. Plain `record_id,latitude,longitude` files are treated as explicitly supplied coordinates, not as independently verified building locations; supply trustworthy coordinates. Numeric bounds alone cannot detect all swapped coordinates when both axes are in range, so geographic checks are also used where trip anchors exist. No axis swap is silently performed.

Reliable results save as `[latitude, longitude]`, appear on Leaflet immediately, and survive reloads, full backups, research backups and future research merges. Provider attribution, precision and review reasons are saved with places. Existing pins remain when results fail validation. Research CSV/JSON records can also include `latitude,longitude` (or `lat,lon`) for new places; existing coordinates are retained during research merges.

Coordinate files are limited to 5 MB and processed entirely in the browser. No credentials, geocoding network calls, paid service activation or public Nominatim requests are needed. Live Geoapify search and automatic geocoding are now implemented separately; see [browser key setup and limitations](AUTOMATIC_GEOCODING.md). Coordinate CSV import remains independent of that configuration. See [Geoapify batch result fields](https://apidocs.geoapify.com/docs/geocoding/batch/) and [confidence semantics](https://apidocs.geoapify.com/docs/geocoding/forward-geocoding/).

Private regression check: the supplied 47-row Geoapify file contains 18 missing coordinate pairs and 29 results requiring review (district/postcode, low-confidence, wrong-property or inconsistent-area matches). It contains no result that passes the automatic property-level acceptance checks. The original file is not included in this repository or deployment.
