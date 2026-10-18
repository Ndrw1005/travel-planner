import { useEffect, useState } from "react";
import { type Place } from "../lib/model";
type Result = { lat: number; lng: number; label: string };
import { findLocations } from "../lib/geocode";
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
  savedImmediately = false,
}: {
  savedImmediately?: boolean;
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
      const rows = await findLocations(query);
      setResults(rows);
      if (!rows.length)
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
                    savedImmediately
                      ? "Location saved on the map."
                      : "Location confirmed. Save place to display the pin.",
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
