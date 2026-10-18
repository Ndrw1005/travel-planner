# Structured research v2 — October 18, 2026

Added private CSV/JSON/ZIP research import, field-level conflict review, stable property identities, idempotent observations, automatic version-1 trip backups, import history, private IndexedDB photos, separate one-way/round-trip flight views, date-specific closure warnings, and confirmed address/coordinate lookup. Hotel cards display their latest imported prices with scope and currency. Existing saved trip storage is additive and is not reset.

Validated the supplied master JSON (122 records), three CSVs, desktop/mobile import workflows, hotel price display, photo ZIP handling and location confirmation. Actual research files are read locally for validation and are not committed or published. Missing photo assets remain placeholders. See [Research datasets](RESEARCH_DATASETS.md).

---

# Smart Import enhancement — October 18, 2026

Added browser-only PDF/screenshot/text import, editable review and explicit reconciliation actions, additive source metadata, history-safe comparison grouping, duplicate fingerprints, research JSON backup/merge, and optional saved-hotel linking through map search. Existing storage keys and trip formats remain intact.

Verified: 28 unit/database tests; 17 desktop/mobile browser workflows passed, with three redundant heavy-format mobile cases intentionally skipped. Real PDF.js and Tesseract pipelines exercised with synthetic text PDFs, an eight-page PDF, PNG/JPEG screenshots and image-only PDF. The actual user Google Flights/APA PDFs were unavailable; no claim is made that their specific layouts have passed extraction tests. See [Smart Import](SMART_IMPORT.md).

---

# Initial release status

## Verified during implementation

- TypeScript and Vite production build.
- Data transformation tests: dates, cash calculations, immutable reordering, conflict detection, missing-score inputs, historical price statistics, URL safety and destination timezone conversion.
- Real PostgreSQL migration tests: private access, optimistic concurrency, outsider denial, invitation email binding, collaborator permissions and service-only rate limits.
- Chromium workflows on desktop and an emulated iPhone viewport: map/category/base interactions, honest demo states, itinerary changes, packing and notes persistence, trip creation, manual prices and series separation.
- Desktop/mobile screenshots inspected. No horizontal overflow detected. A mobile sidebar scrolling defect was fixed.
- OpenStreetMap tiles loaded in the browser. Open-Meteo returned a real forecast response, while December travel days correctly remained unavailable. ExchangeRate-API returned real reference rates. No runtime errors in those live checks.
- Dependency audit after updates: zero known vulnerabilities.

## Requires credentials and deployment validation

Google Maps/Places/Routes, Supabase sign-in and cross-device sharing, SerpApi pricing and scheduled alerts are implemented but have not been exercised against a configured production backend. No subscription or paid API was activated. The committed migration has been tested locally; the real Supabase project still needs setup.

## Remaining enhancements from the full brief

- Flexible-date flight comparison grid; finalized return-flight selection and baggage-inclusive equivalent offers; specific-flight rather than search-level monitoring.
- Verified exact-property hotel availability, room/refund/tax matching, photo attribution workflows, and more complete airline/hotel fields.
- Hotel ranking currently weights total JPY stay price, measured attraction access and quality. Separate weights for airport time, transport cost, beds and amenities remain to be added.
- Automatic route recalculation inside the itinerary editor itself, efficient-order suggestions, structured opening-hours/closed-attraction detection, and travel-time heatmaps. The map's day selector routes the saved order; itinerary warnings currently use activity durations and a 15-minute minimum buffer.
- Email alerts, background cancellation reminders, private binary document upload, realtime collaborative merge/presence and membership revocation UI.
- Full offline application-shell support (device data survives offline but initial application/maps need network); custom designed PDF export (browser print/PDF exists).
- Historical seasonal weather and forecast-driven packing suggestions. Packing guidance is explicitly generic.
- Currency list currently JPY/TWD/USD with JPY as the budget/cash base; arbitrary currencies and destination-local cash denominations remain future work.

No unknown fare, route, room availability or climate value is fabricated to fill these gaps. The app is an initial working release with explicit setup and scope limits.
