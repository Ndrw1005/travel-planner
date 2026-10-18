# Wayfarer — personal travel planner

A working React + TypeScript travel workspace for Osaka Christmas 2026 and future trips. Built for `https://ndrw1005.github.io/travel-planner/`, with optional Supabase and Google Maps services. This is an initial usable release, not a claim that every advanced feature in the project brief is complete.

## Update prices without APIs

Use **Import Research** in Flights or Hotels to upload PDFs/screenshots or paste search text. Review and edit offers, then explicitly add observations or candidates. Processing uses browser-side PDF.js and locally served Tesseract OCR; no paid API, account or redeployment is required for future imports. Existing plans/history are preserved. See the [Smart Import guide](docs/SMART_IMPORT.md), including tested fixtures and the pending validation against your two original PDFs.

## Run locally

```sh
npm ci
npm run dev
# http://127.0.0.1:5173/travel-planner/
npm test
npm run build
npx playwright install chromium
npm run test:e2e
npm run check:backend
```

No credentials are needed for device-only planning. Browser storage is specific to this site and browser; export backups before clearing it. The demo contains approximate attraction pins and two explicitly fictional hotel-base markers. The real APA research candidate has **no coordinates** until you confirm the property. Initial flight/hotel prices are manually recorded October 18, 2026 observations, not current offers. No Osaka PDF was found in the project or attachment folders.

## Implemented

- Trip creation, editing, duplication, archiving, deletion, backup export/import; responsive home and workspace navigation.
- Real interactive OpenStreetMap/Leaflet fallback; categorized markers, card/marker selection, filters, base selection, and optional clearly labeled illustrative path. Production Google Maps and Places integration.
- Authenticated Google Routes adapter: hotel hover preview with 550 ms debounce, click pinning, transit/walking/driving, alternatives, returned transit steps/fares, day-by-day consecutive route legs, and hotel accessibility calculation. No invented times or straight-line substitute for failed routes.
- Editable hotel records, side-by-side cards, transparent weighted price/access/quality scoring; missing values excluded.
- Saved attractions, priority, traveler votes, daily itinerary, drag/arrow reordering, moving between days, activity duration, overlap/buffer warnings, ICS export and browser print/PDF.
- Manual flight/hotel observations and interactive history grouped by item, currency and comparison basis. Secure SerpApi adapters, watchlist and scheduled check backend, target/amount/percentage/new-low alerts, deduplication and daily request budgets.
- Budget estimates and actual expenses, JPY/TWD/USD reference conversion, card/cash planning, equal traveler splits, traveler packing lists, booking notes and external private-document links.
- Live key-free weather and exchange-rate retrieval; future weather outside the forecast window remains unavailable, rather than showing invented averages.
- Optional Supabase email-link sign-in, private trips with RLS, email-bound invitation tokens, version-checked shared saves, cloud price history and in-app alerts.

## Integration status

| Integration | Without credentials | Setup needed |
|---|---|---|
| Device persistence | Working | None |
| OSM map tiles | Working online | None; keep attribution and respect public tile usage policy |
| Open-Meteo forecast | Working online, retrieved on request | None for personal noncommercial usage |
| ExchangeRate-API open reference rates | Working online, retrieved on request | None; attribution included |
| Google Maps / Places | Unconfigured, fallback shown | Restricted public browser key; enabled APIs and billing account |
| Google Routes | Inactive | Authenticated Supabase function + private restricted server key |
| Flight/hotel API prices | Inactive; manual observations work | Supabase + SerpApi account/key/quota |
| Shared trips, sign-in, invitations | Inactive | Supabase project, migration and Auth configuration |
| Scheduled monitoring | Inactive | Deploy monitor; set secrets; schedule SQL; enable individual watches |

See [deployment and configuration](docs/SETUP.md), [architecture and security](docs/ARCHITECTURE.md), and [release verification and remaining work](docs/STATUS.md).

## Provider sources and costs

No accounts, subscriptions or billable services were activated during development. Current documentation was checked October 18, 2026; recheck pricing before activation.

- [SerpApi plans](https://serpapi.com/pricing): free plan lists 250 searches/month; Starter lists $25/month for 1,000. Two watches checked twice daily use roughly 120 searches/month, excluding manual checks. A search is not guaranteed to cover every airline or return an exact baggage/room match. See [Flights](https://serpapi.com/google-flights-api) and [Hotels](https://serpapi.com/google-hotels-api) docs.
- [Supabase pricing](https://supabase.com/pricing): a free project is a reasonable starting point, subject to limits, pauses and retention. Paid plans are optional and have not been enabled.
- [Google Maps pricing](https://developers.google.com/maps/billing-and-pricing/pricing): pay-as-you-go by SKU with free usage caps. Billing setup is generally required. Set provider quotas; app request limits are not a guaranteed billing cap.
- [Open-Meteo](https://open-meteo.com/en/docs) and [ExchangeRate-API open access](https://www.exchangerate-api.com/docs/free) support the key-free personal-use functionality. No forecast for December is claimed while it is outside the available window.
- [Duffel](https://duffel.com/docs/guides/getting-started-with-flights) was evaluated but not chosen: its booking-oriented integration and live onboarding are less direct for this personal monitoring workflow. A modular provider interface allows a future replacement.
- [Google transit documentation](https://developers.google.com/maps/documentation/routes/transit-route): requests support up to 100 days ahead and 7 days back, but actual schedule availability varies. [Google storage/display policies](https://developers.google.com/maps/documentation/routes/policies): routes are displayed on Google Maps; place IDs may be persisted. No route geometry or provider-place coordinates are written to localStorage or the database.
