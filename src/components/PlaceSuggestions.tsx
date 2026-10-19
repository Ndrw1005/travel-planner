import { useEffect, useState } from "react";
import { geoapifyConfigured } from "../lib/geoapify";
import type { Trip } from "../lib/model";
import { searchPlaces, type SearchResult } from "../lib/placeSearch";
export default function PlaceSuggestions({
  query,
  submitVersion = 0,
  trip,
  choose,
}: {
  query: string;
  submitVersion?: number;
  trip: Trip;
  choose: (r: SearchResult) => void;
}) {
  const [results, setResults] = useState<SearchResult[]>([]),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const enabled = geoapifyConfigured();
  useEffect(() => {
    setResults([]);
    setError("");
    setBusy(false);
    if (
      !enabled ||
      query.trim().length < (/[\u3040-\u30ff\u3400-\u9fff]/.test(query) ? 2 : 3)
    )
      return;
    const abort = new AbortController();
    const timer = setTimeout(() => {
      setBusy(true);
      void searchPlaces(query, trip, submitVersion === 0, abort.signal)
        .then((rows) => {
          if (!abort.signal.aborted) setResults(rows);
        })
        .catch((e) => {
          if (!abort.signal.aborted) setError(e.message);
        })
        .finally(() => {
          if (!abort.signal.aborted) setBusy(false);
        });
    }, 600);
    return () => {
      clearTimeout(timer);
      abort.abort();
    };
  }, [query, enabled, trip.id, trip.destination, submitVersion]);
  if (!enabled) return null;
  return (
    <div
      className="place-suggestions"
      aria-label="Real-world place suggestions"
    >
      {busy && <p role="status">Searching locations…</p>}
      {error && <p role="status">{error}</p>}
      {results.map((r, i) => (
        <button
          key={i}
          type="button"
          onClick={() => {
            choose(r);
            setResults([]);
          }}
        >
          <strong>{r.name || r.formatted}</strong>
          <br />
          {r.formatted}
          <br />
          <small>
            {r.result_type} · confidence{" "}
            {Math.round(Number(r.rank.confidence || 0) * 100)}%
          </small>
        </button>
      ))}
      {!!results.length && (
        <small>Geoapify · © OpenStreetMap contributors</small>
      )}
    </div>
  );
}
