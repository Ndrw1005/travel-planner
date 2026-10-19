// Server-only provider access. Never return/log provider URLs or secret keys.
export async function geocode(db: any, userId: string, body: any) {
  const key = Deno.env.get("GEOAPIFY_API_KEY");
  if (!key) throw new Error("Geoapify is not configured on the server.");
  const text = typeof body.text === "string" ? body.text.trim() : "";
  if (
    text.length < (/[\u3040-\u30ff\u3400-\u9fff]/.test(text) ? 2 : 3) ||
    text.length > 500
  )
    throw new Error(
      "Search must contain 3–500 characters (2 minimum for Japanese).",
    );
  const mode = body.action === "autocomplete" ? "autocomplete" : "search";
  const params = new URLSearchParams({
    text,
    format: "json",
    limit: "5",
    lang: /[\u3040-\u30ff\u3400-\u9fff]/.test(text) ? "ja" : "en",
  });
  if (body.center) {
    const { lat, lng } = body.center;
    if (
      !Number.isFinite(lat) ||
      !Number.isFinite(lng) ||
      Math.abs(lat) > 90 ||
      Math.abs(lng) > 180
    )
      throw new Error("Invalid search area.");
    params.set("bias", `proximity:${lng},${lat}`);
  }
  const hash = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(userId + mode + params.toString()),
  );
  const cacheKey = Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  const { data: cached, error: cacheError } = await db
    .from("geocode_cache")
    .select("results,expires_at")
    .eq("key", cacheKey)
    .maybeSingle();
  if (cacheError) throw new Error("Geocoding cache migration is required.");
  if (cached && Date.parse(cached.expires_at) > Date.now())
    return { results: cached.results };
  // Fixed ceilings cannot be raised through a browser request or configuration typo.
  for (const [gate, limit, seconds] of [
    ["geo:daily", 500, 86400],
    ["geo:user:" + userId, 300, 86400],
    ["geo:second", 1, 1],
  ] as const) {
    const { data, error } = await db.rpc("consume_request", {
      p_key: gate,
      p_limit: limit,
      p_seconds: seconds,
    });
    if (error || !data)
      throw new Error(
        "Geocoding usage limit reached. Try again later; saved locations are unchanged.",
      );
  }
  params.set("apiKey", key);
  const response = await fetch(
    `https://api.geoapify.com/v1/geocode/${mode}?${params}`,
    { signal: AbortSignal.timeout(15000) },
  ).catch(() => {
    throw new Error("Geoapify search timed out or is unavailable.");
  });
  if (!response.ok)
    throw new Error(
      response.status === 429
        ? "Geoapify rate limit reached. Try again later."
        : "Geoapify search unavailable. Check the server configuration.",
    );
  const data = await response.json().catch(() => {
    throw new Error("Invalid Geoapify response.");
  });
  const results = (Array.isArray(data.results) ? data.results : [])
    .slice(0, 5)
    .filter(
      (r: any) =>
        Number.isFinite(r.lat) &&
        Number.isFinite(r.lon) &&
        Math.abs(r.lat) <= 90 &&
        Math.abs(r.lon) <= 180,
    )
    .map((r: any) => ({
      lat: r.lat,
      lon: r.lon,
      name: r.name || "",
      formatted: r.formatted || "",
      city: r.city || "",
      state: r.state || "",
      country: r.country || "",
      postcode: r.postcode || "",
      housenumber: r.housenumber || "",
      street: r.street || "",
      result_type: r.result_type || "",
      rank: r.rank || {},
      datasource: r.datasource || {},
      place_id: r.place_id || "",
    }));
  const { error: saveError } = await db.from("geocode_cache").upsert({
    key: cacheKey,
    results,
    expires_at: new Date(
      Date.now() + (results.length ? 30 : 1) * 86400000,
    ).toISOString(),
  });
  if (saveError) throw new Error("Could not cache geocoding results.");
  return { results };
}
