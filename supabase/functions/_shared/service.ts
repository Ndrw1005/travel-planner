import { createClient } from "npm:@supabase/supabase-js@2";
import { SerpApiProvider } from "./providers.ts";
export const admin = () =>
  createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );
export async function checkPrice(
  db: ReturnType<typeof admin>,
  trip: any,
  watch: any,
) {
  const gate = await db.rpc("consume_request", {
    p_key: "provider-daily",
    p_limit: Number(Deno.env.get("MAX_PRICE_CHECKS_DAILY") || 20),
    p_seconds: 86400,
  });
  if (gate.error || !gate.data)
    throw new Error("Daily price-check budget reached.");
  const q = {
    ...watch,
    start: trip.data.start,
    end: trip.data.end,
    adults: trip.data.travelers.length,
  };
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(q.start) ||
    !/^\d{4}-\d{2}-\d{2}$/.test(q.end) ||
    q.end <= q.start ||
    q.adults < 1 ||
    q.adults > 9
  )
    throw new Error("Invalid dates or traveler count (1–9 adults supported).");
  const basis = JSON.stringify({
    start: q.start,
    end: q.end,
    adults: q.adults,
    currency: q.currency,
    origin: q.origin,
    destination: q.destination,
    query: q.query,
    kind: q.kind,
    comparison: "search-level; baggage/room/taxes unverified",
  });
  const basisKey = Array.from(
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(basis)),
    ),
  )
    .map((x) => x.toString(16).padStart(2, "0"))
    .join("");
  const quotes = await new SerpApiProvider().search(q);
  if (!quotes.length)
    throw new Error(
      "No usable total prices returned. No observation was recorded.",
    );
  const cheapest = quotes.reduce((a, b) => (a.amount < b.amount ? a : b));
  const prior = await db
    .from("observations")
    .select("amount,observed_at")
    .eq("trip_id", trip.id)
    .eq("watch_id", watch.id)
    .eq("basis_key", basisKey)
    .order("observed_at", { ascending: false })
    .limit(1000);
  const now = new Date().toISOString();
  const { error } = await db
    .from("observations")
    .insert(
      quotes.map((p) => ({
        trip_id: trip.id,
        watch_id: watch.id,
        item_key: p.key,
        kind: watch.kind,
        name: p.name,
        amount: p.amount,
        currency: watch.currency,
        observed_at: now,
        source: "SerpApi · API observation",
        basis,
        basis_key: basisKey,
        notes: p.notes,
        url: p.url,
      })),
    );
  if (error) throw new Error("Could not persist price observations.");
  const history = prior.data ?? [];
  const lastTime = history[0]?.observed_at;
  const previous = history.length
    ? Math.min(
        ...history
          .filter((o) => o.observed_at === lastTime)
          .map((o) => Number(o.amount)),
      )
    : undefined;
  const low = history.length
    ? Math.min(...history.map((o) => Number(o.amount)))
    : undefined;
  const drop = previous === undefined ? 0 : previous - cheapest.amount;
  const reasons = [
    cheapest.amount <= watch.target ? "below target" : null,
    watch.dropAmount > 0 && drop >= watch.dropAmount ? "amount drop" : null,
    watch.dropPercent > 0 &&
    previous &&
    (drop / previous) * 100 >= watch.dropPercent
      ? "percentage drop"
      : null,
    watch.newLow && low !== undefined && cheapest.amount < low
      ? "new observed low"
      : null,
  ].filter(Boolean);
  if (reasons.length) {
    const fingerprint = `${watch.id}:${basisKey}:target:${watch.target}:${cheapest.amount}`;
    const { error: alertError } = await db
      .from("alerts")
      .upsert(
        {
          trip_id: trip.id,
          fingerprint,
          message: `Provisional search alert: ${cheapest.name} at ${cheapest.amount} ${watch.currency}, ${reasons.join(", ")}. Verify equivalent baggage / room and taxes before booking.`,
        },
        { onConflict: "fingerprint", ignoreDuplicates: true },
      );
    if (alertError) throw new Error("Prices saved, but alert storage failed.");
  }
  return { count: quotes.length, previous: previous ?? null };
}
