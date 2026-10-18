# Architecture

## Frontend

React 19 + TypeScript + Vite, Lucide icons and Recharts. A small custom component system and CSS tokens keep the responsive interface cohesive without a large UI dependency. Leaflet provides a genuinely interactive map without paid credentials; Google Maps is used whenever a browser key is supplied. Google route output is never placed on the OSM fallback.

- `src/lib/model.ts`: data types, calculations, timezone conversion and export helpers.
- `src/lib/seed.ts`: editable Osaka research; uncertainty and demo provenance preserved.
- `src/lib/store.ts`: device persistence and authenticated optimistic-concurrency cloud saves.
- `src/lib/api.ts`: public configuration, authenticated function calls and Google loader.
- `src/components/MapWorkspace.tsx`: map layers, synchronized selection, Places, routes and accessibility.
- `src/components/Planning.tsx`: hotels, attractions and itinerary.
- `src/components/Prices.tsx`: manual/API observations, histories, watch settings and alerts.
- `src/components/Utilities.tsx`: budget, weather, packing and bookings.
- `src/components/Integrations.tsx`: configuration visibility, authentication and invitations.

Public route paths use `#trip/<uuid>`; tabs are view state. The static app does not contain private backend secrets. The initial seed is public research supplied for the project. User edits remain on the device or in RLS-protected Supabase storage.

## Storage and collaboration

A trip is a versioned JSON aggregate because the initial two-person workflow benefits from simple atomic updates. Price observations, alerts, monitor status and membership are separate relational tables. `save_trip` checks membership and the expected version before committing an update. The frontend serializes saves and exposes errors. Invitations use email-bound random tokens with expiry. Only the owner deletes a trip; foreign keys cascade its dependent data.

The security tests run the actual migration in embedded PostgreSQL (PGlite), with a minimal Supabase auth shim. They verify owner/member/outsider behavior, invitation email binding, denied direct mutations, version conflicts and service-only rate gates. This does not replace testing a configured Supabase deployment.

## Providers and cost controls

`PriceProvider` is a replaceable server-side interface. `SerpApiProvider` maps documented flight and hotel search responses to a conservative quote representation. It does not scrape pages. Flights are search-level advertised round-trip results accompanying outbound selections, not finalized booking offers. Hotel results use full-stay prices only; nightly-only records are discarded. Exact return selections, baggage add-ons and room-category matching are future enhancements.

`travel-api` authenticates with Supabase Auth, reads the authorized trip through RLS, validates inputs, gates per-user requests and project quotas, then calls the provider. Protected watch definitions come from the saved trip, not client-supplied query fields. Price checks are limited to one manual check per watch per hour. The scheduled monitor uses a private secret and atomic interval claims. Price alert fingerprints deduplicate repeated equivalent notifications.

Google requests are debounced, in-flight deduplicated and throttled. Results remain transient component state; route geometries, durations and provider-place coordinates are not stored in browser/database caches. Saving a Google place persists its place ID and an editable user-selected name. Place details are refetched for map display. Provider caching restrictions take precedence over the brief's general cache preference. A selected response stays visible until selection changes; no persistent route-history cache is provided.

## Limits and failure behavior

No route result means a visible unavailable state, no geometric shortcut and no invented duration. Future forecasts remain unavailable outside the returned dates. Historical weather averages have not been imported. Manual prices remain separate from API history, and series group by comparison basis. Network errors do not prevent local planning.

Daily routes request each consecutive leg. Local itinerary times are interpreted in the destination IANA timezone. Arrival feasibility is shown alongside returned journey time; opening hours are editable notes, not an automated provider-backed closure database. Hotel accessibility requests are capped at eight saved attractions per calculation to limit cost. Sample routes are explicitly illustrative and do not have fares or travel times.
