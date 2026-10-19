import { useEffect, useRef, useState } from "react";
import { api } from "../lib/api";
import type { Place, Trip } from "../lib/model";
import {
  locationSignature,
  resolvePlace,
  unresolved,
} from "../lib/placeSearch";
export default function AutoGeocode({
  trip,
  signedIn,
  patch,
}: {
  trip: Trip;
  signedIn: boolean;
  patch: (id: string, signature: string, value: Partial<Place>) => void;
}) {
  const latest = useRef({ trip, patch });
  latest.current = { trip, patch };
  const [ready, setReady] = useState(false),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [blocked, setBlocked] = useState(false),
    [retry, setRetry] = useState(0);
  const running = useRef(false),
    abort = useRef<AbortController | null>(null);
  useEffect(() => {
    let alive = true;
    setReady(false);
    if (signedIn)
      void api("status", {})
        .then((s) => {
          if (alive) {
            setReady(!!s.geocoding);
            setMessage(
              s.geocoding
                ? ""
                : "Configure Geoapify on the backend to enable automatic location search.",
            );
          }
        })
        .catch((e) => {
          if (alive) setMessage(e.message);
        });
    return () => {
      alive = false;
      abort.current?.abort();
    };
  }, [signedIn, retry]);
  useEffect(() => {
    if (!ready || blocked || running.current) return;
    const places = trip.places.filter(
      (p) => unresolved(p) && p.geocodeAttempt !== locationSignature(p),
    );
    if (!places.length) return;
    running.current = true;
    setBusy(true);
    const controller = new AbortController();
    abort.current = controller;
    void (async () => {
      try {
        for (const original of places) {
          if (controller.signal.aborted) break;
          const p = latest.current.trip.places.find(
            (p) => p.id === original.id,
          );
          if (!p || !unresolved(p)) continue;
          const signature = locationSignature(p);
          setMessage(`Finding ${p.name}…`);
          const result = await resolvePlace(
            p,
            latest.current.trip,
            controller.signal,
          );
          if (controller.signal.aborted) break;
          latest.current.patch(p.id, signature, {
            ...result,
            geocodeAttempt: signature,
          });
        }
        if (!controller.signal.aborted)
          setMessage(
            "Location search complete. Reliable matches are saved on the map; uncertain matches are listed below.",
          );
      } catch (e) {
        if (!controller.signal.aborted) {
          setMessage((e as Error).message);
          setBlocked(true);
        }
      } finally {
        running.current = false;
        setBusy(false);
      }
    })();
  }, [trip.places, ready, blocked, busy]);
  const reviews = trip.places.filter(
    (p) => unresolved(p) && p.locationReview?.length,
  );
  const missing = trip.places.filter(unresolved).length;
  if (!missing && !busy) return null;
  return (
    <section className="notice" aria-label="Automatic location search">
      <strong>Automatic location search</strong>
      <p role={signedIn ? "status" : undefined}>
        {signedIn
          ? message || "Checking geocoding service…"
          : "Sign in and configure the Geoapify backend to automatically find and save locations. Coordinate CSV import remains available without an account."}
      </p>
      {busy ? (
        <button
          onClick={() => {
            abort.current?.abort();
            setBlocked(true);
            setMessage("Location search paused. Saved pins are preserved.");
          }}
        >
          Pause location search
        </button>
      ) : (
        signedIn && (
          <button
            onClick={() => {
              setBlocked(false);
              setRetry((n) => n + 1);
              for (const p of trip.places.filter(unresolved))
                latest.current.patch(p.id, locationSignature(p), {
                  geocodeAttempt: undefined,
                });
            }}
          >
            Retry unresolved locations
          </button>
        )
      )}
      {!!reviews.length && (
        <details>
          <summary>{reviews.length} locations need review</summary>
          {reviews.map((p) => (
            <p key={p.id}>
              <strong>{p.name}</strong>: {p.locationReview?.[0]?.reason}
            </p>
          ))}
        </details>
      )}
      <small>
        Geocoding by Geoapify · © OpenStreetMap contributors. Unresolved names
        and addresses are sent to Geoapify when this service is configured.
      </small>
    </section>
  );
}
