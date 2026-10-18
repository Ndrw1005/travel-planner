import { useEffect, useState } from "react";
import { type Place } from "../lib/model";
type Result = { lat: number; lng: number; label: string };
let lastRequest = 0;
export function coordinatesFromText(text: string): Result | undefined {
  const decoded = decodeURIComponent(text);
  const pair =
    decoded.match(/!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/) ||
    decoded.match(
      /(?:^|[?&](?:q|query)=)\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)(?:\s*$|&)/,
    );
  if (!pair) return;
  const lat = Number(pair[1]),
    lng = Number(pair[2]);
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return;
  return { lat, lng, label: "Coordinates supplied by you" };
}
export default function LocationResolver({
  place,
  onConfirm,
}: {
  place: Place;
  onConfirm: (lat: number, lng: number) => void;
}) {
  const [query, setQuery] = useState(
      place.address || place.mapQuery || place.name,
    ),
    [results, setResults] = useState<Result[]>([]),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [pasted, setPasted] = useState("");
  useEffect(() => {
    setQuery(place.address || place.mapQuery || place.name);
    setResults([]);
  }, [place.address, place.mapQuery, place.name]);
  const blocked = place.coordinateStatus === "DO_NOT_GEOCODE_NO_UNIQUE_LISTING";
  async function find() {
    if (blocked) return;
    setBusy(true);
    setMessage("");
    try {
      const key = "wayfarer-geocode:" + query.trim().toLowerCase();
      const cached = localStorage.getItem(key);
      if (cached) {
        setResults(JSON.parse(cached));
        return;
      }
      if (Date.now() - lastRequest < 1500)
        throw new Error("Wait a moment before another lookup.");
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
        { signal: AbortSignal.timeout(15000) },
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
            label: Object.values(f.properties)
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
      setResults(rows);
      if (rows.length) localStorage.setItem(key, JSON.stringify(rows));
      else
        setMessage(
          "No match. Try the property name, or paste coordinates from Google Maps.",
        );
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="location-resolver">
      <h3>Place this address on the map</h3>
      {blocked ? (
        <p className="notice">
          Location unknown: this research has no unique listing. Add a verified
          property identity before geocoding.
        </p>
      ) : (
        <>
          <label>
            Address or exact property name
            <input value={query} onChange={(e) => setQuery(e.target.value)} />
          </label>
          <button
            type="button"
            disabled={busy || !query.trim()}
            onClick={() => void find()}
          >
            Find address on map
          </button>
          <p className="muted">
            Sends this query to Photon / OpenStreetMap only when clicked. Review
            a result before confirming. Limited to 30 lookups per device per
            day.
          </p>
          <a
            href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`}
            target="_blank"
            rel="noreferrer"
          >
            Find this place on Google Maps ↗
          </a>
          <p>
            In Google Maps, right-click the exact building and copy its
            latitude/longitude. Address text alone cannot create a pin.
          </p>
          <label>
            Google Maps coordinates or full place URL
            <input
              value={pasted}
              onChange={(e) => setPasted(e.target.value)}
              placeholder="34.123456, 135.123456"
            />
          </label>
          <button
            type="button"
            onClick={() => {
              try {
                const r = coordinatesFromText(pasted);
                if (!r)
                  throw new Error(
                    "Paste a latitude, longitude pair or a full place URL containing !3d and !4d coordinates.",
                  );
                setResults([r]);
              } catch (e) {
                setMessage((e as Error).message);
              }
            }}
          >
            Preview pasted location
          </button>
          {results.map((r, i) => (
            <div className="notice" key={i}>
              <p>
                {r.label} · {r.lat}, {r.lng}
              </p>
              <a
                target="_blank"
                rel="noreferrer"
                href={`https://www.google.com/maps/search/?api=1&query=${r.lat},${r.lng}`}
              >
                Check pin ↗
              </a>{" "}
              <button
                type="button"
                onClick={() => {
                  onConfirm(r.lat, r.lng);
                  setMessage(
                    "Location confirmed. Save place to display the pin.",
                  );
                  setResults([]);
                }}
              >
                Confirm this location
              </button>
            </div>
          ))}
          <small>Geocoding: Photon · © OpenStreetMap contributors</small>
        </>
      )}
      {message && <p role="status">{message}</p>}
    </div>
  );
}
