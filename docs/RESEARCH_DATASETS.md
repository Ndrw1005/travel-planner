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

An address string is not a coordinate. Open **Edit details**, then **Find address on map**. The on-demand Photon search sends only the entered query and returns candidate locations. Check the candidate's map link, choose **Confirm this location**, then **Save place**. Queries are cached and limited to 30 per device per day with a minimum interval; there is no background or bulk geocoding. Availability and completeness of the public service are not guaranteed. [Photon service documentation](https://github.com/komoot/photon) permits reasonable use and explains its limits.

The provided Kishiwada address can return nearby station results instead of the exact hotel. Do not confirm a station as the hotel. The reliable fallback is to locate the exact building on Google Maps, right-click it, copy the latitude/longitude, and paste that pair into **Google Maps coordinates or full place URL**. Preview, confirm and save. Full place URLs with `!3d`/`!4d` coordinates also work; viewport `@` coordinates and short links are not treated as a precise pin.

Candidates marked `DO_NOT_GEOCODE_NO_UNIQUE_LISTING` remain in **Location unknown**, without geocoding or invented pins. Verified locations participate in the existing map/routing workflows; live route calculations retain their original integration requirements.

## Photos, closures and safety

ZIPs can include the master JSON and `hotel_photos/apa-*.webp` (or PNG/JPEG). Choose the private-photo checkbox to store these in IndexedDB on this device. They are not published or cloud-synced; JSON backups preserve photo references, not the photo bytes, so keep the original ZIP for transfer. No photo files were supplied with this request, so missing assets display placeholders. A saved approved photo URL is also supported.

Attraction records retain official URLs, duration estimates, holiday-hour uncertainty and supplied closure warnings. The itinerary displays closure warnings alongside scheduled places, including the museum closures specified in the supplied research. These are attributed research claims, not a new independent hours verification. Sample itinerary prose and arithmetic scenarios in the JSON are not automatically scheduled or imported as real fares.

CSV parsing supports UTF-8 BOMs, quoted commas/newlines and escaped quotes. Fields are rendered as text; exports use JSON, so spreadsheet formulas are not executed. Unsafe links, object-valued fields and invalid prices/dates are rejected or flagged. ZIP traversal paths and excessive expanded sizes are rejected. Files are capped at 25 MB, datasets at 1,000 records, and ZIPs at 200 entries / 30 MB expanded.

## Ask ChatGPT for future research

Ask it to use the same headers as your supplied CSVs or the same v2 master JSON schema, preserve stable IDs, separate one-way flights from actual round-trip quotes, and leave unknown information blank or explicitly unverified. Require source URLs, observation dates, currency, party/room/stay basis, and local departure/arrival times. Do not reuse an ID for an unrelated listing. Use `metadata.version: "2.0"` and the arrays `lodging`, `flights_one_way`, `flight_round_trip_history`, and `attractions` for JSON.

The provided PDF guide remains a human-readable companion; the importer uses the supplied JSON/CSV values directly rather than re-extracting that PDF.
