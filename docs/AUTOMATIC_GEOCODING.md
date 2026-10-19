# Automatic geocoding and place search

The code supports authenticated Geoapify geocoding and autocomplete on the existing Leaflet map. GitHub Pages hosts the browser app; a Supabase Edge Function keeps the provider key private. Deploying the static site alone does **not** activate Geoapify. No key or backend was configured at implementation time, so real provider coverage of the private Osaka database remains unverified.

## Enable on a free-tier account

1. Use a Geoapify **Free** project, with no paid upgrade or billing/overage opt-in. Use a dedicated key for Wayfarer. Do not put it in a `VITE_` variable, GitHub Pages bundle, repository, chat, or browser storage.
2. In the existing/free Supabase project, apply `supabase/migrations/001_initial.sql` if not already installed, then `002_geocoding.sql`. The cache is service-role-only; browser roles cannot read it directly.
3. Set `GEOAPIFY_API_KEY` using Supabase's Edge Function Secrets dashboard. Keep `ALLOWED_ORIGIN=https://ndrw1005.github.io`. Use provider IP restrictions if the deployment has a stable outbound IP; do not use browser referrer restrictions for server-to-server calls or claim dynamic Supabase IPs are fixed. The backend verifies authenticated users and browser origins and enforces limits independently of the client.
4. Deploy the checked-in `travel-api` function, including `_shared/geocoding.ts`, to that project. Example after authenticated Supabase CLI login: `supabase functions deploy travel-api --project-ref YOUR_PROJECT_REF`. The existing function verifies bearer tokens itself; preserve `supabase/config.toml`.
5. Set GitHub repository variables `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` to that project's public URL/anon key. These are intentionally public; never substitute a service-role or Geoapify secret. Re-run the existing Pages deployment. Configure Supabase email auth redirects for the site and sign in through Integrations & sharing.
6. Check backend status in Integrations & sharing. Import the existing Osaka master research file and observe **Automatic location search**. Review actual source-result quality before claiming broad provider coverage. Do not expose the research file in `public/`.

## Behavior

- Opening a trip or importing/adding new hotel, attraction, airport or station records starts sequential geocoding for unresolved records when signed in and the backend is configured. Existing coordinates and intentionally unidentified listings are skipped.
- Up to three distinct searches try a stored query, property name plus destination, and fuller address context. The browser sends at most one queued request every 2.5 seconds. Limits pause work and show a retry action instead of looping.
- Osaka trips get a proximity bias (not a restrictive country filter). Other trips use their selected hotel or known trip coordinates, or worldwide matching when no anchor exists.
- Map and place-form fields offer debounced search suggestions in English/Japanese. Selecting a real result fills coordinates; no map pin dragging is needed. The map's Go button performs a full geocoding search. Existing records selected by unique identity retain their prices and research; unmatched choices open a prefilled place form with category selection.
- Automatic placement requires a reliable property/building match, geographic consistency and confidence checks. Multiple plausible properties, generic district results, postcode conflicts or low confidence remain in a separate review list. No claim is made that every accurate address exists in the provider database.
- Name/address signatures prevent repeating completed unresolved searches. Editing an address or explicitly retrying permits another lookup. Coordinate updates apply only if the record still exists, remains unresolved and has the same name/address signature; later user edits are not overwritten by stale responses.
- Existing cloud save behavior persists coordinates and attempt/review metadata; wait for **Saved to cloud** before closing/reloading. Backups preserve these fields. Existing coordinate-CSV import continues to work without credentials.
- Existing route requests consume these saved coordinates. This does not enable a paid route provider: live route previews retain the existing server routing configuration requirements.

## Quotas, caching and attribution

Hard backend ceilings are 500 provider requests per rolling 24-hour window across the app, 300 per authenticated user per rolling 24 hours, and 1 per second globally. Cached requests consume no provider quota. These ceilings are intentionally conservative and cannot be raised from the browser. Use a dedicated free-tier key; these limits cannot govern unrelated applications using the same provider account.

Successful server results are cached for 30 days, empty results for one day, scoped by authenticated user/query/language/bias. Browser cache deduplicates concurrent identical requests and has a 500-query bound. Keys and provider error URLs are not returned to the browser. Saved results retain provider/data attribution, shown in details and on the map.

Provider references: [geocoding](https://apidocs.geoapify.com/docs/geocoding/forward-geocoding/), [autocomplete and bias](https://apidocs.geoapify.com/docs/geocoding/address-autocomplete/), [storage and free-tier attribution](https://www.geoapify.com/).

## Verification

Unit tests cover candidate validation, multiple candidates, cache/deduplication, query fallback, non-Osaka bias, server budgets, cache permissions and secret-safe errors. A dedicated Playwright server uses a fake Supabase project and mocked Geoapify responses to test automatic imported-hotel placement, ambiguous attractions, preservation of observations, cloud reloads and Japanese search. These are integration tests, not a live-provider accuracy benchmark. Existing planner/import tests still run against the unconfigured local app.
