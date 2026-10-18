# Deployment and provider setup

## GitHub Pages

This repository is separate from the environmental timeline project. The app uses Vite base `/travel-planner/` and hash-based trip URLs; refreshes do not need a server fallback. GitHub Actions runs logic/database tests, backend type checks, a frontend build and desktop/mobile workflows before Pages deployment.

For a new checkout, or to reproduce setup if deployment was unavailable:

```sh
gh auth login -h github.com
git init -b main
git add .
git commit -m "Build initial travel planning workspace"
gh repo create ndrw1005/travel-planner --public --source=. --remote=origin
gh api --method POST repos/ndrw1005/travel-planner/pages -f build_type=workflow
git push -u origin main
```

Do not run `repo create` if the repository already exists; use its existing remote. If the Pages API requires an existing main branch, push first, enable Pages with source GitHub Actions, and rerun the workflow. Intended frontend: https://ndrw1005.github.io/travel-planner/.

## Frontend environment variables

Copy `.env.example` to `.env.local` for development. Set the same keys as GitHub **repository variables** for deployment; all `VITE_*` values are public by design:

| Variable | Value |
|---|---|
| `VITE_SUPABASE_URL` | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Supabase public anon/publishable key, never service role |
| `VITE_GOOGLE_MAPS_KEY` | Browser key restricted to Maps JavaScript + Places APIs and allowed HTTP referrers |

Google referrers should include `https://ndrw1005.github.io/*` and only required localhost development origins. Use a distinct server key for Routes. Enable Maps JavaScript API, Places API (New), and Routes API in the chosen Google project only after approving its billing requirements. Configure provider quotas and billing alerts. The browser key is intentionally visible; restrictions are essential.

## Supabase

Use an existing project or create one yourself after reviewing costs. No external account was created for you.

1. Apply `supabase/migrations/001_initial.sql` with the Supabase SQL editor or CLI migration tooling. It creates private trips, membership, observations, alerts, watch execution status, invitation RPCs and rate-limit RPCs.
2. Enable email-link authentication. Set Site URL to the deployed Pages URL and allowed redirect URLs to that URL plus the local development URL. Configure email delivery as appropriate; built-in delivery limits can constrain invitations/sign-in.
3. Set frontend variables, rebuild and sign in. The first save imports device plans only if the account has no cloud trips. If cloud trips already exist, they replace the displayed local collection. Export a local backup first when merging existing work.
4. Deploy functions using the Supabase CLI:

```sh
supabase login
supabase link --project-ref YOUR_PROJECT_REF
supabase functions deploy travel-api
supabase functions deploy monitor
```

5. In the Supabase dashboard, set function secrets below. Never enter private values into `VITE_*`, GitHub source, shell history or chat.

| Server-only secret | Purpose |
|---|---|
| `GOOGLE_ROUTES_KEY` | Restricted Routes API key |
| `SERPAPI_KEY` | SerpApi pricing key |
| `CRON_SECRET` | Long random secret used only by the scheduled monitor endpoint |
| `ALLOWED_ORIGIN` | `https://ndrw1005.github.io` (local testing: `http://127.0.0.1:5173`) |
| `MAX_PRICE_CHECKS_DAILY` | Default `20`, counts attempted provider searches across the project |
| `MAX_ROUTES_DAILY` | Default `100`, counts route calls across the project |

`SUPABASE_URL`, `SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY` are backend environment values supplied by Supabase. The service role key never reaches the frontend.

Gateway JWT validation is disabled explicitly in config because `travel-api` authenticates the supplied access token with `auth.getUser` and loads the trip with a user-scoped RLS client. `monitor` rejects every request unless its private `x-cron-secret` matches. Do not remove those checks.

## Monitoring and alerts

1. Enable `pg_cron`, `pg_net` and Vault in the Supabase project.
2. Store Vault secrets `travel_project_url` and `travel_cron_secret`; the latter must match the monitor's `CRON_SECRET`.
3. Run `supabase/schedule.sql`. It dispatches every 12 hours, but each watch's atomic claim enforces its configured 12/24 hour interval. At most 10 watches run per invocation, and a project-level daily budget limits API usage.
4. In the app, save a flight or hotel watch. Fill the actual Taiwan departure airport yourself. Watches start paused. After cloud save succeeds, use **Check now**, verify output against the booking source, then enable monitoring.
5. The backend stores timestamped observations with a comparison-basis hash (trip dates, guests, query, airports, currency). It never compares different bases. Target, absolute drop, percentage drop and new observed low checks produce **provisional search alerts**. Exact room and baggage matching is not guaranteed. Identical watch/basis/price alerts are deduplicated.
6. Review the watch's last-attempt/error status and Supabase logs. Failures create no fake observations. Failed scheduled attempts wait until the next interval; no unbounded retry loop. Monitor partial failures return HTTP 207, recorded in `net._http_response`.

Email notifications are not implemented. In-app alerts are fetched when the price view opens or a manual check completes. Disable all monitoring with `select cron.unschedule('wayfarer-price-monitor');`.

## Sharing

The owner creates an invitation token tied to the partner's exact email. Share it privately yourself. The partner signs in with that email, enters the token, and joins the trip. Tokens expire after seven days and are single-use. Collaborators can update trip data but cannot transfer ownership, delete the trip, invite another person or bypass RLS. Concurrent edits are rejected with an export/reload message; there is no silent last-writer-wins overwrite. Reload shared trips to receive partner changes; automatic realtime merging is not implemented.

## Post-configuration acceptance checks

Run these with real credentials before relying on production planning:

- Confirm Google key/referrer restrictions, attribution, Places location resolution and live Japanese transit coverage.
- Hover a verified hotel, pin its route, switch mode/alternative, route a full itinerary and check late-night departure availability.
- Confirm price currency/party/baggage basis and hotel room/tax/refund terms at the original provider; do not book from a provisional comparison alone.
- Sign in as owner and partner, test invitations, simultaneous edits and an unauthorized third account.
- Trigger a monitor, inspect recorded observations and verify an alert is not duplicated.
