export type LocationResult = { lat: number; lng: number; label: string };
type Result = LocationResult;
let lastRequest = 0;
let queue: Promise<unknown> = Promise.resolve();
export function findLocations(
  query: string,
  signal?: AbortSignal,
): Promise<LocationResult[]> {
  const request = queue
    .catch(() => {})
    .then(async () => {
      signal?.throwIfAborted();
      const key = "wayfarer-geocode:" + query.trim().toLowerCase();
      const cached = localStorage.getItem(key);
      if (cached) {
        return JSON.parse(cached);
      }
      await new Promise((resolve) =>
        setTimeout(resolve, Math.max(0, 1500 - (Date.now() - lastRequest))),
      );
      signal?.throwIfAborted();
      const today = new Date().toISOString().slice(0, 10),
        quota = JSON.parse(
          localStorage.getItem("wayfarer-geocode-quota") || "{}",
        );
      if (quota.day === today && quota.count >= 30)
        throw new Error(
          "Daily limit reached. Paste verified Google Maps coordinates instead.",
        );
      lastRequest = Date.now();
      localStorage.setItem(
        "wayfarer-geocode-quota",
        JSON.stringify({
          day: today,
          count: quota.day === today ? quota.count + 1 : 1,
        }),
      );
      const response = await fetch(
        `https://photon.komoot.io/api/?q=${encodeURIComponent(query)}&limit=5`,
        {
          signal: signal
            ? AbortSignal.any([signal, AbortSignal.timeout(15000)])
            : AbortSignal.timeout(15000),
        },
      );
      if (!response.ok) throw new Error("Address search unavailable");
      const data = await response.json();
      const rows: Result[] = (data.features || [])
        .map(
          (f: {
            geometry: { coordinates: number[] };
            properties: Record<string, string>;
          }) => ({
            lat: f.geometry.coordinates[1],
            lng: f.geometry.coordinates[0],
            label: [
              f.properties.name,
              f.properties.housenumber,
              f.properties.street,
              f.properties.city,
              f.properties.postcode,
              f.properties.country,
              f.properties.osm_value,
            ]
              .filter((v) => typeof v === "string")
              .join(", "),
          }),
        )
        .filter(
          (r: Result) =>
            Number.isFinite(r.lat) &&
            Number.isFinite(r.lng) &&
            Math.abs(r.lat) <= 90 &&
            Math.abs(r.lng) <= 180,
        );

      if (rows.length) localStorage.setItem(key, JSON.stringify(rows));
      return rows;
    });
  queue = request;
  return request;
}
