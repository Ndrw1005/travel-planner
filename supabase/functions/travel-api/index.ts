import { createClient } from "npm:@supabase/supabase-js@2";
import { admin, checkPrice } from "../_shared/service.ts";
const headers = {
  "Access-Control-Allow-Origin":
    Deno.env.get("ALLOWED_ORIGIN") || "https://ndrw1005.github.io",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Content-Type": "application/json",
};
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers });
  try {
    if (req.method !== "POST")
      return new Response(JSON.stringify({ error: "POST required" }), {
        status: 405,
        headers,
      });
    const token = req.headers.get("Authorization")?.replace(/^Bearer /, "");
    if (!token) throw new Error("Sign in required");
    const db = admin();
    const {
      data: { user },
      error,
    } = await db.auth.getUser(token);
    if (error || !user)
      return new Response(JSON.stringify({ error: "Sign in required" }), {
        status: 401,
        headers,
      });
    const body = await req.json();
    const budget = await db.rpc("consume_request", {
      p_key: "api:" + user.id,
      p_limit: 30,
      p_seconds: 60,
    });
    if (budget.error || !budget.data)
      throw new Error("Request limit reached. Please wait one minute.");
    if (body.action === "status")
      return Response.json(
        {
          routes: !!Deno.env.get("GOOGLE_ROUTES_KEY"),
          pricing: !!Deno.env.get("SERPAPI_KEY"),
        },
        { headers },
      );
    const scoped = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: "Bearer " + token } } },
    );
    const { data: trip } = await scoped
      .from("trips")
      .select("id,data")
      .eq("id", body.tripId)
      .single();
    if (!trip)
      return new Response(JSON.stringify({ error: "Trip access denied" }), {
        status: 403,
        headers,
      });
    if (body.action === "price") {
      const watch = trip.data.watches?.find(
        (w: any) => w.id === body.watch?.id,
      );
      if (!watch)
        throw new Error("Save the watch to the cloud before checking.");
      const gate = await db.rpc("consume_request", {
        p_key: "manual-price:" + watch.id,
        p_limit: 1,
        p_seconds: 3600,
      });
      if (gate.error || !gate.data)
        throw new Error(
          "This watch was checked recently. Manual checks are limited to hourly.",
        );
      return Response.json(await checkPrice(db, trip, watch), { headers });
    }
    if (body.action === "route") {
      const key = Deno.env.get("GOOGLE_ROUTES_KEY");
      if (!key) throw new Error("Google Routes is not configured.");
      if (!["TRANSIT", "WALK", "DRIVE"].includes(body.mode))
        throw new Error("Invalid transportation mode");
      const gate = await db.rpc("consume_request", {
        p_key: "routes-daily",
        p_limit: Number(Deno.env.get("MAX_ROUTES_DAILY") || 100),
        p_seconds: 86400,
      });
      if (gate.error || !gate.data)
        throw new Error("Daily route budget reached.");
      const waypoint = (v: any) => {
        if (typeof v?.placeId === "string" && v.placeId.length < 300)
          return { placeId: v.placeId };
        if (
          !Number.isFinite(v?.lat) ||
          !Number.isFinite(v?.lng) ||
          Math.abs(v.lat) > 90 ||
          Math.abs(v.lng) > 180
        )
          throw new Error("Confirmed coordinates required for both locations");
        return { location: { latLng: { latitude: v.lat, longitude: v.lng } } };
      };
      const query: any = {
        origin: waypoint(body.origin),
        destination: waypoint(body.destination),
        travelMode: body.mode,
        computeAlternativeRoutes: true,
        languageCode: "en",
      };
      if (body.mode === "TRANSIT") {
        const when = new Date(body.departureTime);
        if (!Number.isFinite(when.getTime()))
          throw new Error("Valid departure date required");
        if (
          when.getTime() > Date.now() + 100 * 86400000 ||
          when.getTime() < Date.now() - 7 * 86400000
        )
          throw new Error(
            "Transit routing supports only dates within the provider window (up to 100 days ahead / 7 days back).",
          );
        query.departureTime = when.toISOString();
        if (["LESS_WALKING", "FEWER_TRANSFERS"].includes(body.preference))
          query.transitPreferences = { routingPreference: body.preference };
      }
      const response = await fetch(
        "https://routes.googleapis.com/directions/v2:computeRoutes",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Goog-Api-Key": key,
            "X-Goog-FieldMask":
              "routes.duration,routes.distanceMeters,routes.polyline.encodedPolyline,routes.legs.steps,routes.travelAdvisory.transitFare",
          },
          body: JSON.stringify(query),
          signal: AbortSignal.timeout(20000),
        },
      );
      if (!response.ok)
        throw new Error(
          "Route unavailable. Check provider coverage, date window, key permissions and quota.",
        );
      const result = await response.json();
      return Response.json(result, {
        headers: { ...headers, "Cache-Control": "no-store" },
      });
    }
    throw new Error("Unknown operation");
  } catch (e) {
    return new Response(
      JSON.stringify({
        error: e instanceof Error ? e.message : "Operation failed",
      }),
      { status: 400, headers },
    );
  }
});
