import { useEffect, useRef, useState } from "react";
import { type Place } from "../lib/model";
import { findLocations, type LocationResult } from "../lib/geocode";
import LocationResolver from "./LocationResolver";

export default function LocatePlaces({
  places,
  destination,
  save,
}: {
  places: Place[];
  destination: string;
  save: (locations: Record<string, LocationResult>) => void;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<Record<string, LocationResult[]>>({});
  const [chosen, setChosen] = useState<Record<string, LocationResult>>({});
  const [messages, setMessages] = useState<Record<string, string>>({});
  const [manual, setManual] = useState<string>();
  const [status, setStatus] = useState("");
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);
  const missing = places.filter(
    (p) =>
      (p.lat === undefined || p.lng === undefined) &&
      p.coordinateStatus !== "DO_NOT_GEOCODE_NO_UNIQUE_LISTING",
  );
  const pending = missing.filter((p) => !results[p.id] && !messages[p.id]);
  async function locate() {
    const abort = new AbortController();
    controller.current = abort;
    setBusy(true);
    setStatus("");
    try {
      for (const [i, p] of pending.slice(0, 10).entries()) {
        setStatus(
          `Looking up ${i + 1} of ${Math.min(10, pending.length)}: ${p.name}`,
        );
        try {
          const rows = await findLocations(
            p.mapQuery || `${p.name}, ${p.address || destination}`,
            abort.signal,
          );
          if (abort.signal.aborted) break;
          setResults((old) => ({ ...old, [p.id]: rows }));
          if (!rows.length)
            setMessages((old) => ({
              ...old,
              [p.id]:
                "No match. Try another search or paste exact coordinates below.",
            }));
        } catch (error) {
          if (abort.signal.aborted) break;
          setMessages((old) => ({ ...old, [p.id]: (error as Error).message }));
          // Stop after a service or quota failure instead of issuing more requests.
          break;
        }
      }
    } finally {
      setBusy(false);
      setStatus(
        abort.signal.aborted
          ? "Lookup stopped. Completed results remain available."
          : "Review the matches below, then save your selected pins.",
      );
    }
  }
  if (!missing.length) return null;
  return (
    <section className="locate-places notice" aria-label="Locate saved places">
      <strong>{missing.length} saved places need map pins</strong>
      <p>
        Addresses are saved. Find their coordinates to display them on the map.
      </p>
      <button type="button" onClick={() => setOpen(!open)}>
        {open ? "Hide location review" : "Locate saved places"}
      </button>
      {open && (
        <>
          <p>
            Searches Photon / OpenStreetMap in groups of up to 10, with 30
            lookups per device per day. Review each match; results may refer to
            nearby places.
          </p>
          <button
            type="button"
            disabled={busy || !pending.length}
            onClick={() => void locate()}
          >
            Find locations ({Math.min(10, pending.length)})
          </button>
          {busy && (
            <button type="button" onClick={() => controller.current?.abort()}>
              Stop lookup
            </button>
          )}
          {status && <p role="status">{status}</p>}
          <div className="location-review-list">
            {missing.map((p) => (
              <div key={p.id} className="location-review-item">
                <strong>{p.name}</strong>
                <p>{p.address || p.mapQuery || "Address not supplied"}</p>
                {messages[p.id] && <p>{messages[p.id]}</p>}
                {results[p.id]?.map((r, i) => (
                  <label className="location-candidate" key={i}>
                    <input
                      type="radio"
                      name={`location-${p.id}`}
                      checked={chosen[p.id] === r}
                      onChange={() =>
                        setChosen((old) => ({ ...old, [p.id]: r }))
                      }
                    />
                    <span>
                      {r.label}
                      <br />
                      {r.lat}, {r.lng} ·{" "}
                      <a
                        href={`https://www.google.com/maps/search/?api=1&query=${r.lat},${r.lng}`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Check pin ↗
                      </a>
                    </span>
                  </label>
                ))}
                {chosen[p.id] && (
                  <button
                    type="button"
                    onClick={() =>
                      setChosen((old) => {
                        const next = { ...old };
                        delete next[p.id];
                        return next;
                      })
                    }
                  >
                    Clear selection
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setManual(manual === p.id ? undefined : p.id)}
                >
                  Search or paste coordinates for {p.name}
                </button>
                {manual === p.id && (
                  <LocationResolver
                    place={p}
                    savedImmediately
                    onConfirm={(lat, lng) => {
                      save({ [p.id]: { lat, lng, label: p.name } });
                      setManual(undefined);
                    }}
                  />
                )}
              </div>
            ))}
          </div>
          <button
            className="primary"
            type="button"
            disabled={!missing.some((p) => chosen[p.id])}
            onClick={() => {
              const selected = Object.fromEntries(
                missing
                  .filter((p) => chosen[p.id])
                  .map((p) => [p.id, chosen[p.id]]),
              );
              save(selected);
              setChosen({});
              setStatus(
                `${Object.keys(selected).length} locations saved on the map.`,
              );
            }}
          >
            Save selected pins ({missing.filter((p) => chosen[p.id]).length})
          </button>
          <small>Geocoding: Photon · © OpenStreetMap contributors</small>
        </>
      )}
    </section>
  );
}
