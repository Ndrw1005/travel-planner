import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import {
  MapPin,
  Plane,
  Hotel,
  Search,
  Navigation,
  X,
  Layers,
} from "lucide-react";
import { api, googleKey, loadGoogle } from "../lib/api";
import {
  type Trip,
  type Place,
  type Kind,
  dates,
  localToUtc,
} from "../lib/model";
const colors: Record<Kind, string> = {
  airport: "#264e71",
  hotel: "#b67c45",
  attraction: "#267663",
  restaurant: "#a05270",
  station: "#68717e",
};
export interface Route {
  duration: string;
  distanceMeters: number;
  polyline: { encodedPolyline: string };
  legs: {
    steps: {
      travelMode: string;
      staticDuration: string;
      distanceMeters: number;
      polyline?: { encodedPolyline: string };
      transitDetails?: {
        transitLine?: { name: string; nameShort?: string; color?: string };
        stopDetails?: {
          departureStop?: { name: string };
          arrivalStop?: { name: string };
          arrivalTime?: string;
        };
        headsign?: string;
      };
      navigationInstruction?: { instructions: string };
    }[];
  }[];
  travelAdvisory?: {
    transitFare?: { currencyCode: string; units: string; nanos?: number };
  };
}
export default function MapWorkspace({
  trip,
  update,
  editPlace,
  onAccessibility,
}: {
  trip: Trip;
  update: (t: Trip) => void;
  editPlace: (p?: Place) => void;
  onAccessibility?: (id: string, minutes: number) => void;
}) {
  const root = useRef<HTMLDivElement>(null),
    map = useRef<L.Map | google.maps.Map | null>(null),
    markers = useRef<(L.Marker | google.maps.Marker)[]>([]),
    lines = useRef<(L.Polyline | google.maps.Polyline)[]>([]);
  const [loaded, setLoaded] = useState(false),
    [error, setError] = useState(""),
    [panelOpen, setPanelOpen] = useState(true),
    [query, setQuery] = useState(""),
    [selected, setSelected] = useState<string>(),
    [hover, setHover] = useState<string>(),
    [filters, setFilters] = useState<Kind[]>([
      "airport",
      "hotel",
      "attraction",
      "restaurant",
      "station",
    ]),
    [mode, setMode] = useState("TRANSIT"),
    [departure, setDeparture] = useState(trip.start + "T10:00"),
    [preference, setPreference] = useState(""),
    [routes, setRoutes] = useState<Route[]>([]),
    [alternative, setAlternative] = useState(0),
    [routeState, setRouteState] = useState(
      "Select a hotel to explore airport access.",
    ),
    [day, setDay] = useState(""),
    [dailyRoutes, setDailyRoutes] = useState<Route[]>([]),
    [searchResults, setSearchResults] = useState<google.maps.places.Place[]>(
      [],
    ),
    [demoRoutes, setDemoRoutes] = useState(false),
    [resolved, setResolved] = useState<
      Record<string, { lat: number; lng: number }>
    >({}),
    [access, setAccess] = useState<{ id: string; minutes: number }[]>([]),
    [accessMessage, setAccessMessage] = useState("");
  const mapPlaces = trip.places.map((p) => ({ ...p, ...resolved[p.id] }));
  const active = hover ?? selected;
  useEffect(() => {
    if (active) setPanelOpen(true);
  }, [active]);
  const target = trip.places.find((p) => p.id === active);
  const origin = trip.places.find(
    (p) => p.id === (target?.kind === "hotel" ? trip.airportId : trip.baseId),
  );
  const onHover = useRef(setHover);
  onHover.current = setHover;
  const onSelect = useRef(setSelected);
  onSelect.current = setSelected;
  useEffect(() => {
    let disposed = false;
    if (googleKey) {
      loadGoogle()
        .then(() => {
          if (disposed || !root.current) return;
          map.current = new google.maps.Map(root.current, {
            center: {
              lat: trip.places.find((p) => p.lat !== undefined)?.lat ?? 0,
              lng: trip.places.find((p) => p.lng !== undefined)?.lng ?? 0,
            },
            zoom: 11,
            mapTypeControl: false,
            streetViewControl: false,
          });
          setLoaded(true);
        })
        .catch((e) => setError(e.message));
    } else if (root.current) {
      const m = L.map(root.current, { zoomControl: false }).setView(
        [
          trip.places.find((p) => p.lat !== undefined)?.lat ?? 0,
          trip.places.find((p) => p.lng !== undefined)?.lng ?? 0,
        ],
        11,
      );
      L.control.zoom({ position: "bottomright" }).addTo(m);
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution:
          '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        maxZoom: 19,
      }).addTo(m);
      map.current = m;
      setLoaded(true);
    }
    return () => {
      disposed = true;
      if (map.current instanceof L.Map) map.current.remove();
      map.current = null;
    };
  }, []);
  useEffect(() => {
    if (!loaded || !map.current) return;
    markers.current.forEach((m) =>
      m instanceof L.Marker ? m.remove() : m.setMap(null),
    );
    markers.current = [];
    const points = mapPlaces.filter(
      (p) =>
        p.lat !== undefined && p.lng !== undefined && filters.includes(p.kind),
    );
    for (const p of points) {
      const index = day
        ? (trip.itinerary[day] ?? []).findIndex((s) => s.placeId === p.id)
        : -1;
      const label =
        index >= 0
          ? String(index + 1)
          : p.kind === "airport"
            ? "✈"
            : p.kind === "hotel"
              ? "H"
              : p.kind === "restaurant"
                ? "•"
                : "●";
      if (map.current instanceof L.Map) {
        const icon = L.divIcon({
          className: "",
          html: `<span class="map-pin ${active === p.id ? "active" : ""}" style="background:${colors[p.kind]}">${label}</span>`,
          iconSize: [34, 34],
          iconAnchor: [17, 17],
        });
        const m = L.marker([p.lat!, p.lng!], { icon, title: p.name })
          .addTo(map.current)
          .on("click", () => {
            setDay("");
            onSelect.current(p.id);
          })
          .on("mouseover", () => onHover.current(p.id))
          .on("mouseout", () => onHover.current(undefined));
        m.bindTooltip(p.name);
        markers.current.push(m);
      } else {
        const m = new google.maps.Marker({
          map: map.current,
          position: { lat: p.lat!, lng: p.lng! },
          title: p.name,
          label: { text: label, color: "white" },
          icon: {
            path: google.maps.SymbolPath.CIRCLE,
            scale: active === p.id ? 19 : 14,
            fillColor: colors[p.kind],
            fillOpacity: 1,
            strokeColor: "white",
            strokeWeight: 3,
          },
        });
        m.addListener("click", () => {
          setDay("");
          onSelect.current(p.id);
        });
        m.addListener("mouseover", () => onHover.current(p.id));
        m.addListener("mouseout", () => onHover.current(undefined));
        markers.current.push(m);
      }
    }
  }, [loaded, trip.places, filters, active, day, trip.itinerary, resolved]);
  useEffect(() => {
    let cancelled = false;
    if (!loaded || !googleKey) return;
    async function resolve() {
      try {
        const { Place } = (await google.maps.importLibrary(
          "places",
        )) as google.maps.PlacesLibrary;
        const points: Record<string, { lat: number; lng: number }> = {};
        for (const p of trip.places.filter((p) => p.placeId)) {
          const place = new Place({ id: p.placeId! });
          await place.fetchFields({ fields: ["location"] });
          if (place.location) points[p.id] = place.location.toJSON();
        }
        if (!cancelled) setResolved(points);
      } catch {
        if (!cancelled)
          setError("Some saved Google places could not be located.");
      }
    }
    void resolve();
    return () => {
      cancelled = true;
    };
  }, [
    loaded,
    trip.places
      .filter((p) => p.placeId)
      .map((p) => p.placeId)
      .join(","),
  ]);
  // Results stay in component memory only. No Google route data is persisted.
  const inflight = useRef(new Map<string, Promise<Route[]>>());
  const lastRequest = useRef(0);
  async function getRoutes(a: Place, b: Place, when: string) {
    const key = JSON.stringify([a.id, b.id, mode, when, preference]);
    let request = inflight.current.get(key);
    if (!request) {
      const elapsed = Date.now() - lastRequest.current;
      if (elapsed < 1100)
        await new Promise((r) => setTimeout(r, 1100 - elapsed));
      lastRequest.current = Date.now();
      request = api("route", {
        tripId: trip.id,
        origin: a.placeId ? { placeId: a.placeId } : { lat: a.lat, lng: a.lng },
        destination: b.placeId
          ? { placeId: b.placeId }
          : { lat: b.lat, lng: b.lng },
        mode,
        departureTime:
          mode === "TRANSIT"
            ? when.endsWith("Z")
              ? when
              : localToUtc(when, trip.timezone)
            : undefined,
        preference,
      }).then((d) => d.routes as Route[]);
      inflight.current.set(key, request);
      request.finally(() => inflight.current.delete(key)).catch(() => {});
    }
    return request;
  }
  useEffect(() => {
    let cancelled = false;
    setRoutes([]);
    setAlternative(0);
    if (day) return;
    if (!target) return;
    if (!origin) {
      setRouteState(
        target.kind === "hotel"
          ? "Select an arrival airport in trip settings."
          : "Select a hotel as your base first.",
      );
      return;
    }
    if (target.lat === undefined && !target.placeId) {
      setRouteState(
        "Location unverified. Add confirmed coordinates before routing.",
      );
      return;
    }
    if (!googleKey) {
      setRouteState(
        "Demo map · live routes require Google Maps and Supabase. No travel time is assumed.",
      );
      return;
    }
    setRouteState("Looking up route…");
    const timer = setTimeout(() => {
      getRoutes(origin, target, departure)
        .then((r) => {
          if (cancelled) return;
          setRoutes(r);
          setRouteState(
            r.length
              ? "Google Routes · retrieved " + new Date().toLocaleTimeString()
              : "No route returned. Transit dates or local coverage may be unavailable.",
          );
        })
        .catch((e) => {
          if (!cancelled) setRouteState(e.message);
        });
    }, 550);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [
    active,
    trip.baseId,
    trip.airportId,
    mode,
    departure,
    trip.timezone,
    preference,
    day,
  ]);
  useEffect(() => {
    if (!map.current || !loaded) return;
    lines.current.forEach((l) =>
      l instanceof L.Polyline ? l.remove() : l.setMap(null),
    );
    lines.current = [];
    if (map.current instanceof L.Map) {
      if (demoRoutes && !googleKey) {
        const path: L.LatLngExpression[] = [
          [34.4347, 135.244],
          [34.418, 135.272],
          [34.411, 135.3],
          [34.433, 135.335],
          [34.46, 135.373],
          [34.5, 135.405],
          [34.55, 135.45],
          [34.59, 135.477],
          [34.63, 135.49],
          [34.662, 135.501],
        ];
        lines.current.push(
          L.polyline(path, {
            color: "#a05270",
            dashArray: "8 10",
            weight: 4,
          }).addTo(map.current),
        );
      }
      return;
    }
    const shown = day
      ? dailyRoutes
      : routes[alternative]
        ? [routes[alternative]]
        : [];
    const bounds = new google.maps.LatLngBounds();
    for (const r of shown) {
      const steps = r.legs.flatMap((l) => l.steps);
      for (const step of steps) {
        if (!step.polyline) continue;
        const path = google.maps.geometry.encoding.decodePath(
          step.polyline.encodedPolyline,
        );
        path.forEach((p) => bounds.extend(p));
        lines.current.push(
          new google.maps.Polyline({
            map: map.current,
            path,
            strokeColor:
              step.travelMode === "WALK"
                ? "#6d7a86"
                : step.transitDetails?.transitLine?.color || "#267663",
            strokeWeight: step.travelMode === "WALK" ? 3 : 5,
            strokeOpacity: 0.85,
          }),
        );
      }
    }
    if (shown.length && !bounds.isEmpty()) map.current.fitBounds(bounds, 65);
  }, [routes, alternative, day, dailyRoutes, loaded, demoRoutes]);
  async function search() {
    setError("");
    if (!query.trim()) return;
    if (!googleKey) {
      setError(
        "Filtering saved places. Connect Google Places for worldwide search, or add a place manually.",
      );
      return;
    }
    try {
      await loadGoogle();
      const { Place } = (await google.maps.importLibrary(
        "places",
      )) as google.maps.PlacesLibrary;
      const { places } = await Place.searchByText({
        textQuery: query + " " + trip.destination,
        fields: ["id", "displayName", "location", "formattedAddress"],
        maxResultCount: 8,
      });
      setSearchResults(places);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  const fitted = useRef(false);
  useEffect(() => {
    if (!loaded || fitted.current || !map.current) return;
    const points = mapPlaces.filter(
      (p) => p.lat !== undefined && p.lng !== undefined,
    );
    if (!points.length) return;
    fitted.current = true;
    if (map.current instanceof L.Map)
      map.current.fitBounds(
        points.map((p) => [p.lat!, p.lng!] as L.LatLngTuple),
        { padding: [70, 70], maxZoom: 13 },
      );
    else {
      const bounds = new google.maps.LatLngBounds();
      points.forEach((p) => bounds.extend({ lat: p.lat!, lng: p.lng! }));
      map.current.fitBounds(bounds, 70);
    }
  }, [loaded, resolved]);
  const dayGeneration = useRef(0);
  useEffect(() => {
    if (!day) dayGeneration.current++;
  }, [day]);
  async function routeDay(value: string) {
    const generation = ++dayGeneration.current;
    setDay(value);
    setHover(undefined);
    setSelected(undefined);
    setRoutes([]);
    setDailyRoutes([]);
    if (!value) return;
    if (!googleKey) {
      setRouteState(
        "Daily routes require live routing. Stops are numbered on the map.",
      );
      return;
    }
    const stops = (trip.itinerary[value] ?? []).map((s) => ({
      place: trip.places.find((p) => p.id === s.placeId),
      stop: s,
    }));
    const base = trip.places.find((p) => p.id === trip.baseId);
    if (!base) {
      setRouteState("Choose a hotel base to calculate a full-day route.");
      return;
    }
    const points = [
      { place: base, stop: { time: "08:00", duration: 0 } },
      ...stops,
      { place: base, stop: { time: "20:00", duration: 0 } },
    ];
    try {
      const result: Route[] = [];
      for (let i = 1; i < points.length; i++) {
        if (generation !== dayGeneration.current) return;
        const a = points[i - 1],
          b = points[i];
        if (!a.place || !b.place) continue;
        const time = new Date(
          localToUtc(value + "T" + a.stop.time, trip.timezone),
        );
        const when = new Date(
          time.getTime() + a.stop.duration * 60000,
        ).toISOString();
        const leg = await getRoutes(a.place, b.place, when);
        if (!leg.length)
          throw new Error(
            "One or more legs unavailable. No complete day route can be shown.",
          );
        result.push(leg[0]);
      }
      if (generation !== dayGeneration.current) return;
      setDailyRoutes(result);
      setRouteState(
        `${result.length} consecutive legs · ${Math.round(result.reduce((s, r) => s + parseInt(r.duration), 0) / 60)} min travel. Verify arrival times against planned stops.`,
      );
    } catch (e) {
      if (generation === dayGeneration.current)
        setRouteState((e as Error).message);
    }
  }
  useEffect(() => {
    if (day) void routeDay(day);
  }, [JSON.stringify(trip.itinerary), trip.baseId]);
  async function accessibility() {
    const base = trip.places.find((p) => p.id === trip.baseId);
    if (!base || !googleKey) {
      setAccessMessage("Choose a hotel base and configure live routes first.");
      return;
    }
    setAccessMessage("Calculating up to 8 saved attraction routes…");
    const attractions = trip.places
      .filter((p) => ["attraction", "restaurant"].includes(p.kind))
      .slice(0, 8);
    const results: { id: string; minutes: number }[] = [];
    for (const p of attractions) {
      try {
        const r = await getRoutes(base, p, departure);
        if (r[0])
          results.push({
            id: p.id,
            minutes: Math.round(parseInt(r[0].duration) / 60),
          });
      } catch {
        /* Missing routes are excluded, never zero-filled. */
      }
    }
    setAccess(results);
    const avg = results.length
      ? Math.round(results.reduce((n, r) => n + r.minutes, 0) / results.length)
      : undefined;
    setAccessMessage(
      avg === undefined
        ? "No routes available."
        : `${avg} min average · ${results.length}/${attractions.length} places routed · Google Routes, retrieved ${new Date().toLocaleTimeString()}. Missing routes excluded.`,
    );
    if (avg !== undefined) onAccessibility?.(base.id, avg);
  }
  useEffect(() => {
    setAccess([]);
    setAccessMessage("");
  }, [trip.baseId, mode, departure]);
  const route = routes[alternative];
  const shownPlaces = trip.places.filter(
    (p) =>
      filters.includes(p.kind) &&
      p.name.toLowerCase().includes(query.toLowerCase()),
  );
  return (
    <div className="map-workspace">
      <div className="map-list">
        <div className="section-heading">
          <div>
            <span className="eyebrow">YOUR PLACES</span>
            <h2>Explore the possibilities</h2>
          </div>
          <button
            className="icon-button"
            aria-label="Add place"
            onClick={() => editPlace()}
          >
            <MapPin size={18} />
          </button>
        </div>
        <form
          className="search"
          onSubmit={(e) => {
            e.preventDefault();
            void search();
          }}
        >
          <Search size={17} />
          <input
            aria-label="Search places"
            placeholder="Search places or an address"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <button type="submit">Go</button>
        </form>
        {error && <p className="notice">{error}</p>}
        {searchResults.map((p) => (
          <div className="place-card" key={p.id}>
            <b>{p.displayName}</b>
            <p>{p.formattedAddress}</p>
            <button
              onClick={() => {
                editPlace({
                  id: crypto.randomUUID(),
                  name: p.displayName || "Place",
                  kind: "attraction",
                  placeId: p.id,
                  address: "",
                  source: "Google Place ID · name supplied by user on save",
                  notes: "",
                  priority: "Interested",
                  minutes: 90,
                  cost: 0,
                  votes: [],
                });
                setSearchResults([]);
              }}
            >
              Save place reference
            </button>
          </div>
        ))}
        <div className="filter-chips">
          {(
            [
              "hotel",
              "attraction",
              "restaurant",
              "airport",
              "station",
            ] as Kind[]
          ).map((k) => (
            <button
              key={k}
              className={filters.includes(k) ? "active" : ""}
              onClick={() =>
                setFilters(
                  filters.includes(k)
                    ? filters.filter((f) => f !== k)
                    : [...filters, k],
                )
              }
            >
              {k}s
            </button>
          ))}
        </div>
        <div className="places-scroll">
          {shownPlaces.map((p) => (
            <article
              tabIndex={0}
              key={p.id}
              className={`place-card ${active === p.id ? "selected" : ""}`}
              onMouseEnter={() => {
                if (!day) setHover(p.id);
              }}
              onMouseLeave={() => setHover(undefined)}
              onFocus={() => setHover(p.id)}
              onBlur={() => setHover(undefined)}
              onClick={() => {
                setDay("");
                setSelected(p.id);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") setSelected(p.id);
              }}
            >
              <div className="place-top">
                <span
                  className="place-symbol"
                  style={{ color: colors[p.kind] }}
                >
                  {p.kind === "hotel" ? (
                    <Hotel size={20} />
                  ) : p.kind === "airport" ? (
                    <Plane size={20} />
                  ) : (
                    <MapPin size={20} />
                  )}
                </span>
                <div>
                  <h3>{p.name}</h3>
                  <small>{p.demo ? "DEMO LOCATION" : p.source}</small>
                </div>
              </div>
              <p>{p.address}</p>
              {p.lat === undefined && !p.placeId && (
                <span className="badge amber">
                  Location unverified · no pin
                </span>
              )}
              <div className="row">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    editPlace(p);
                  }}
                >
                  Details
                </button>
                {p.kind === "hotel" && (
                  <button
                    className={trip.baseId === p.id ? "primary" : "text-button"}
                    onClick={(e) => {
                      e.stopPropagation();
                      update({ ...trip, baseId: p.id });
                      setSelected(p.id);
                    }}
                  >
                    {trip.baseId === p.id ? "✓ Your base" : "Use as base"}
                  </button>
                )}
              </div>
            </article>
          ))}
        </div>
        <details className="accessibility">
          <summary>Hotel accessibility</summary>
          <button onClick={() => void accessibility()}>
            Compare access from base
          </button>
          <p>
            {accessMessage ||
              "Calculate travel times to your saved attractions."}
          </p>
          {access.map((a) => (
            <button key={a.id} onClick={() => setSelected(a.id)}>
              {trip.places.find((p) => p.id === a.id)?.name} · {a.minutes} min
            </button>
          ))}
        </details>
        <div className="list-foot">
          {shownPlaces.length} places saved <span>•</span> Hover to preview ·
          click to pin
        </div>
      </div>
      <div className="map-area">
        <div ref={root} className="map-canvas" />
        <div className="map-top">
          <span className="map-label">
            <Layers size={14} />
            {googleKey ? "Google Maps" : "Explore mode · demo markers"}
          </span>
          <button
            onClick={() => {
              const pts = mapPlaces.filter(
                (p) => p.lat !== undefined && p.lng !== undefined,
              );
              if (map.current instanceof L.Map && pts.length)
                map.current.fitBounds(
                  pts.map((p) => [p.lat!, p.lng!] as L.LatLngTuple),
                  { padding: [45, 45] },
                );
              else if (map.current && pts.length) {
                const b = new google.maps.LatLngBounds();
                pts.forEach((p) => b.extend({ lat: p.lat!, lng: p.lng! }));
                (map.current as google.maps.Map).fitBounds(b);
              }
            }}
          >
            Fit places
          </button>
        </div>
        {!panelOpen && (
          <button className="route-reopen" onClick={() => setPanelOpen(true)}>
            Route explorer
          </button>
        )}
        {panelOpen && (
          <div className="route-panel">
            <div className="row">
              <span className="eyebrow">
                <Navigation size={14} /> ROUTE EXPLORER
              </span>
              <button
                aria-label="Dismiss route"
                className="icon-button"
                onClick={() => {
                  setPanelOpen(false);
                  setSelected(undefined);
                  setHover(undefined);
                  setDay("");
                  setRoutes([]);
                  setRouteState("Select a hotel to explore airport access.");
                }}
              >
                <X size={16} />
              </button>
            </div>
            <h3>
              {day
                ? "Your day, connected"
                : target
                  ? `${origin?.name ?? "Choose a base"} → ${target.name}`
                  : "A better sense of place"}
            </h3>
            <div className="row wrap">
              <select
                aria-label="Transport mode"
                value={mode}
                onChange={(e) => {
                  setMode(e.target.value);
                  setDay("");
                }}
              >
                <option value="TRANSIT">Public transit</option>
                <option value="WALK">Walking</option>
                <option value="DRIVE">Driving</option>
              </select>
              <select
                aria-label="Route day"
                value={day}
                onChange={(e) => void routeDay(e.target.value)}
              >
                <option value="">Single route</option>
                {dates(trip.start, trip.end).map((d) => (
                  <option key={d}>{d}</option>
                ))}
              </select>
            </div>
            <details>
              <summary>Departure & preferences</summary>
              <label>
                Local departure
                <input
                  type="datetime-local"
                  value={departure}
                  onChange={(e) => {
                    setDeparture(e.target.value);
                    setDay("");
                  }}
                />
              </label>
              <p>Destination timezone: {trip.timezone}</p>
              <label>
                Transit preference
                <select
                  value={preference}
                  onChange={(e) => setPreference(e.target.value)}
                >
                  <option value="">Default</option>
                  <option value="LESS_WALKING">Less walking</option>
                  <option value="FEWER_TRANSFERS">Fewer transfers</option>
                </select>
              </label>
            </details>
            <p className="muted">{routeState}</p>
            {!googleKey && (
              <label className="check">
                <input
                  type="checkbox"
                  checked={demoRoutes}
                  onChange={(e) => setDemoRoutes(e.target.checked)}
                />
                Show illustrative KIX–Namba path
              </label>
            )}
            {demoRoutes && !googleKey && (
              <p className="notice">
                Illustration only. Not a transport route; no times or fares.
              </p>
            )}
            {routes.length > 1 && (
              <select
                aria-label="Alternative route"
                value={alternative}
                onChange={(e) => setAlternative(Number(e.target.value))}
              >
                {routes.map((r, i) => (
                  <option value={i} key={i}>
                    Option {i + 1} · {Math.round(parseInt(r.duration) / 60)} min
                  </option>
                ))}
              </select>
            )}
            {route && (
              <>
                <div className="route-metrics">
                  <strong>
                    {Math.round(parseInt(route.duration) / 60)}
                    <small> minutes</small>
                  </strong>
                  <span>{(route.distanceMeters / 1000).toFixed(1)} km</span>
                </div>
                <p>
                  Estimated arrival{" "}
                  {new Date(
                    new Date(localToUtc(departure, trip.timezone)).getTime() +
                      parseInt(route.duration) * 1000,
                  ).toLocaleString("en-US", { timeZone: trip.timezone })}
                </p>
                <p>
                  {Math.max(
                    0,
                    route.legs
                      .flatMap((l) => l.steps)
                      .filter((s) => s.transitDetails).length - 1,
                  )}{" "}
                  transfers ·{" "}
                  {Math.round(
                    route.legs
                      .flatMap((l) => l.steps)
                      .filter((s) => s.travelMode === "WALK")
                      .reduce(
                        (n, s) => n + parseInt(s.staticDuration || "0"),
                        0,
                      ) / 60,
                  )}{" "}
                  min walking
                </p>
                {route.travelAdvisory?.transitFare && (
                  <p>
                    Fare: {route.travelAdvisory.transitFare.currencyCode}{" "}
                    {route.travelAdvisory.transitFare.units}
                  </p>
                )}
                <ol className="route-steps">
                  {route.legs
                    .flatMap((l) => l.steps)
                    .map((s, i) => (
                      <li key={i}>
                        {s.transitDetails?.transitLine?.name ||
                          s.navigationInstruction?.instructions ||
                          s.travelMode}
                        {s.transitDetails?.headsign &&
                          ` toward ${s.transitDetails.headsign}`}
                      </li>
                    ))}
                </ol>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
