import type { SearchResult } from "./placeSearch";
export const geoapifyConfigured = () =>
  !!import.meta.env.VITE_GEOAPIFY_KEY?.trim();
type Entry = { at: number; results: SearchResult[] };
const CACHE = "wayfarer-geoapify-cache-v1",
  BUDGET = "wayfarer-geoapify-budget-v1";
function cacheEntries(): Record<string, Entry> {
  try {
    const value = JSON.parse(localStorage.getItem(CACHE) || "{}");
    return value && typeof value === "object" && !Array.isArray(value)
      ? value
      : {};
  } catch {
    return {};
  }
}
async function reserveRequest() {
  const reserve = () => {
    const now = Date.now();
    let old: {
      day?: number;
      count?: number;
      minute?: number;
      recent?: number;
    } = {};
    try {
      old = JSON.parse(localStorage.getItem(BUDGET) || "{}");
    } catch {
      throw new Error(
        "Browser usage tracking is unavailable. Enable local storage to use automatic geocoding.",
      );
    }
    const day = old.day && now - old.day < 86400000 ? old.day : now,
      minute = old.minute && now - old.minute < 60000 ? old.minute : now;
    const count = day === old.day ? old.count || 0 : 0,
      recent = minute === old.minute ? old.recent || 0 : 0;
    if (count >= 500 || recent >= 30)
      throw new Error(
        "Browser geocoding limit reached. Wait before retrying; saved pins are preserved.",
      );
    localStorage.setItem(
      BUDGET,
      JSON.stringify({ day, count: count + 1, minute, recent: recent + 1 }),
    );
  };
  if (typeof navigator !== "undefined" && navigator.locks)
    await navigator.locks.request("wayfarer-geoapify-budget", reserve);
  else reserve();
}
export async function geoapifyRequest(
  action: string,
  { text, center }: { text: string; center?: { lat: number; lng: number } },
): Promise<{ results: SearchResult[] }> {
  const key = import.meta.env.VITE_GEOAPIFY_KEY?.trim();
  if (!key)
    throw new Error(
      "Configure a browser-restricted Geoapify key to enable location search.",
    );
  text = text.trim();
  if (
    text.length < (/[\u3040-\u30ff\u3400-\u9fff]/.test(text) ? 2 : 3) ||
    text.length > 500
  )
    throw new Error(
      "Enter a shorter place name or address (up to 500 characters).",
    );
  const mode = action === "autocomplete" ? "autocomplete" : "search";
  const params = new URLSearchParams({
    text,
    format: "json",
    limit: "5",
    lang: /[\u3040-\u30ff\u3400-\u9fff]/.test(text) ? "ja" : "en",
  });
  if (center) {
    if (
      !Number.isFinite(center.lat) ||
      !Number.isFinite(center.lng) ||
      Math.abs(center.lat) > 90 ||
      Math.abs(center.lng) > 180
    )
      throw new Error("Invalid search area.");
    params.set("bias", `proximity:${center.lng},${center.lat}`);
  }
  const cacheKey = mode + ":" + params.toString(),
    entries = cacheEntries(),
    cached = entries[cacheKey];
  if (
    cached &&
    Array.isArray(cached.results) &&
    Date.now() - cached.at < (cached.results.length ? 30 : 1) * 86400000
  )
    return { results: cached.results };
  await reserveRequest();
  params.set("apiKey", key);
  const response = await fetch(
    `https://api.geoapify.com/v1/geocode/${mode}?${params}`,
    {
      signal: AbortSignal.timeout(15000),
      credentials: "omit",
      referrerPolicy: "strict-origin-when-cross-origin",
    },
  ).catch(() => {
    throw new Error(
      "Geoapify could not be reached. Check your connection and allowed website origins.",
    );
  });
  if (!response.ok)
    throw new Error(
      response.status === 429
        ? "Geoapify usage limit reached. Try later; no paid upgrade was enabled."
        : [401, 403].includes(response.status)
          ? "Geoapify rejected the key or website origin. Check the key restrictions in your Geoapify dashboard."
          : "Geoapify search is temporarily unavailable.",
    );
  const data = await response.json().catch(() => {
    throw new Error("Invalid Geoapify response.");
  });
  const results: SearchResult[] = (
    Array.isArray(data.results) ? data.results : []
  )
    .slice(0, 5)
    .filter(
      (r: SearchResult) =>
        r &&
        Number.isFinite(r.lat) &&
        Number.isFinite(r.lon) &&
        Math.abs(r.lat) <= 90 &&
        Math.abs(r.lon) <= 180,
    )
    .map((r: SearchResult) => ({
      ...r,
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
  const next = Object.entries({
    ...cacheEntries(),
    [cacheKey]: { at: Date.now(), results },
  })
    .filter(([, v]) => Date.now() - v.at < 30 * 86400000)
    .sort((a, b) => b[1].at - a[1].at)
    .slice(0, 200);
  try {
    localStorage.setItem(CACHE, JSON.stringify(Object.fromEntries(next)));
  } catch {
    /* The in-memory cache and saved place still work if the cache is full. */
  }
  return { results };
}
