import { admin, checkPrice } from "../_shared/service.ts";
// Gateway JWT verification disabled for this function only; a private cron secret is mandatory.
Deno.serve(async (req) => {
  const secret = Deno.env.get("CRON_SECRET");
  if (!secret || req.headers.get("x-cron-secret") !== secret)
    return new Response("Unauthorized", { status: 401 });
  if (req.method !== "POST")
    return new Response("POST required", { status: 405 });
  const db = admin();
  const { data: trips, error } = await db.from("trips").select("id,data");
  if (error) return new Response("Database unavailable", { status: 500 });
  let checked = 0;
  const failures: { watch: string; error: string }[] = [];
  for (const trip of trips ?? []) {
    if (
      trip.data.archived ||
      trip.data.end < new Date().toISOString().slice(0, 10)
    )
      continue;
    for (const watch of trip.data.watches ?? []) {
      if (!watch.enabled || checked >= 10) continue;
      const claim = await db.rpc("claim_watch", {
        p_id: watch.id,
        p_hours: watch.hours === 12 ? 12 : 24,
      });
      if (claim.error || !claim.data) continue;
      checked++;
      const attempted = new Date().toISOString();
      try {
        await checkPrice(db, trip, watch);
        await db
          .from("monitor_status")
          .upsert({
            watch_id: watch.id,
            trip_id: trip.id,
            last_attempt: attempted,
            last_success: new Date().toISOString(),
            error: null,
          });
      } catch (e) {
        await db
          .from("monitor_status")
          .upsert({
            watch_id: watch.id,
            trip_id: trip.id,
            last_attempt: attempted,
            error: (e as Error).message,
          });
        failures.push({ watch: watch.id, error: (e as Error).message });
      }
    }
  }
  return Response.json(
    { checked, failures },
    { status: failures.length ? 207 : 200 },
  );
});
