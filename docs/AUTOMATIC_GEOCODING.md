# Automatic geocoding and place search

Wayfarer calls Geoapify directly from the browser. No Supabase account or sign-in is needed for geocoding. The key is visible in the deployed JavaScript and requests; provider access restrictions are essential. No account, key, billing plan or live provider coverage has been configured or verified for you.

## Enable it on GitHub Pages

1. Create a Geoapify account and a project on the **Free** plan. Do not enable a paid plan or billing upgrade. Create a dedicated Wayfarer API key.
2. Expand the key's restrictions in Geoapify's **API keys** settings. Set **Allowed origins** to `https://ndrw1005.github.io` (no path). If also using **Allowed HTTP referrers**, use the regular expression `^https://ndrw1005\.github\.io/.*$`. Browsers send the origin, so restricting to `/travel-planner/` would reject valid requests. Do not allow all origins. CORS response headers alone are not access restrictions. See [Geoapify's official key restriction guide](https://myprojects.geoapify.com/help/api-keys/).
3. In the travel-planner GitHub repository, open **Settings → Secrets and variables → Actions → Variables**. Add a repository variable named `VITE_GEOAPIFY_KEY` with that restricted key. Do not paste the key into chat or commit it to source.
4. Open **Actions → Test and deploy travel planner → Run workflow**, select `main`, and run it. Wait for the Pages deployment to succeed. Vite reads the variable at build time, so a new deployment is required after changing it.
5. Refresh Wayfarer, open your trip and import the research file. **Automatic location search** processes unresolved places and saves reliable pins automatically. Existing unresolved records are processed too. Names and addresses are sent to Geoapify. Review uncertain matches in the separate review list.

Use a separate restricted development key and an ignored `.env.local` for localhost development. Existing optional Supabase sharing/routing features are independent of geocoding.

## Behavior

- Imports and new records queue unresolved hotels, attractions, airports and stations. Existing coordinates and intentionally unidentified listings are skipped. Coordinate CSV imports still work without any credentials.
- Up to three distinct searches use the stored query, property name/destination and fuller address context. English and Japanese suggestions are debounced by 600 ms. Requests are serialized at least 2.5 seconds apart.
- Osaka trips receive a proximity bias. Future trips use their selected hotel/known coordinates or worldwide search if no anchor exists. Bias is not a restrictive country filter.
- Reliable property/building matches must pass name/address, confidence and geographic checks. Competing properties, generic districts, postcode conflicts and weak results remain for review. Selecting a search suggestion fills coordinates without manual map placement.
- Coordinates, attribution and review metadata are saved in the trip, survive refreshes/backups and are retained by subsequent research imports. Stale responses cannot overwrite a changed record. Existing research and pricing observations remain intact.
- Completed name/address signatures and cached requests avoid repeated calls. Editing a location or explicitly retrying allows another attempt. Existing route previews use saved coordinates and retain their existing provider configuration requirements.

## Usage limits and caching

The browser allows at most 500 requests per rolling 24 hours and 30 per minute per browser storage profile. Cross-tab Web Locks coordinate these limits where supported. Errors pause automatic work rather than retrying indefinitely. Cached responses consume no provider requests. Persistent cache holds up to 200 queries: positive results for 30 days, empty results for one day. The in-memory cache deduplicates concurrent requests and holds up to 500 queries. Saved place coordinates do not expire.

These are client safeguards, **not enforceable global quotas**: another device or cleared browser storage has a separate budget, and client code can be modified. Restrict the key in Geoapify, keep the account on Free, and monitor project usage. Multiple keys within a project can share its quota. No paid upgrade is enabled by this application. Provider/data attribution is retained and displayed.

## Verification

Tests use mocked provider responses to verify direct browser access without Supabase, automatic imported-property placement, ambiguous results, preservation of pricing, reload persistence, Japanese suggestions, request budgets, caching, geographic validation and query fallback. Existing planner/import tests also run. These tests do not establish live Geoapify coverage of the private Osaka research database; that can be measured after you configure the restricted key.

Provider references: [geocoding](https://apidocs.geoapify.com/docs/geocoding/forward-geocoding/), [autocomplete](https://apidocs.geoapify.com/docs/geocoding/address-autocomplete/), [API key restrictions](https://myprojects.geoapify.com/help/api-keys/).
