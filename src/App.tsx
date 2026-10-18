import { useState, useEffect } from "react";
import {
  Compass,
  LayoutDashboard,
  Map,
  Plane,
  Hotel,
  Heart,
  CalendarDays,
  Wallet,
  CloudSun,
  Luggage,
  FolderOpen,
  Settings,
  ArrowUpRight,
  ChevronLeft,
  Plus,
  Users,
  Download,
  Copy,
  Archive,
  Trash2,
  Menu,
  FileInput,
} from "lucide-react";
import { useTrips } from "./lib/store";
import { newTrip } from "./lib/seed";
import { type Trip, type Place, uid, dates, exportFile } from "./lib/model";
import { supabase } from "./lib/api";
import MapWorkspace from "./components/MapWorkspace";
import { TripForm, PlaceForm } from "./components/Forms";
import { Itinerary, Hotels, Attractions } from "./components/Planning";
import Prices from "./components/Prices";
import { Budget, Packing, Weather, Bookings } from "./components/Utilities";
import Integrations from "./components/Integrations";
import ResearchImport from "./components/ResearchImport";
const tabs = [
  ["Overview", LayoutDashboard],
  ["Interactive map", Map],
  ["Flights", Plane],
  ["Hotels", Hotel],
  ["Import research", FileInput],
  ["Attractions", Heart],
  ["Daily itinerary", CalendarDays],
  ["Budget", Wallet],
  ["Weather", CloudSun],
  ["Packing", Luggage],
  ["Bookings & notes", FolderOpen],
] as const;
export default function App() {
  const { trips, setTrips, status, user, reload } = useTrips();
  const [selected, setSelected] = useState<string>(() =>
      location.hash.startsWith("#trip/") ? location.hash.split("/")[1] : "",
    ),
    [tab, setTab] = useState("Overview"),
    [importKind, setImportKind] = useState<"auto" | "flight" | "hotel">("auto"),
    [tripEdit, setTripEdit] = useState<Trip>(),
    [placeEdit, setPlaceEdit] = useState<Place | null>(),
    [archived, setArchived] = useState(false),
    [menu, setMenu] = useState(false),
    [accessibility, setAccessibility] = useState<Record<string, number>>({});
  useEffect(() => {
    const onHash = () =>
      setSelected(
        location.hash.startsWith("#trip/") ? location.hash.split("/")[1] : "",
      );
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);
  const trip = trips.find((t) => t.id === selected);
  const update = (t: Trip) =>
    setTrips((prev) =>
      prev.some((p) => p.id === t.id)
        ? prev.map((p) => (p.id === t.id ? t : p))
        : [...prev, t],
    );
  const choose = (t: Trip) => {
    setSelected(t.id);
    location.hash = "trip/" + t.id;
    setTab("Overview");
  };
  const editPlace = (p?: Place) => setPlaceEdit(p ?? null);
  const backup = () =>
    exportFile(
      "wayfarer-backup.json",
      JSON.stringify({ version: 1, trips }, null, 2),
    );
  async function remove(t: Trip) {
    if (
      !confirm(
        "Permanently delete " + t.name + "? Export a backup first if needed.",
      )
    )
      return;
    if (user && supabase) {
      const { error } = await supabase
        .from("trips")
        .delete()
        .eq("id", t.id)
        .select()
        .then((r) => ({
          ...r,
          error:
            r.error ??
            (!r.data?.length
              ? new Error("Only the trip owner may delete this trip.")
              : null),
        }));
      if (error) {
        alert(error.message);
        return;
      }
    }
    setTrips((prev) => prev.filter((p) => p.id !== t.id));
  }
  return (
    <div className={`app ${!trip ? "home-app" : ""}`}>
      <aside className={menu ? "sidebar open" : "sidebar"}>
        <a
          className="brand"
          href="#"
          onClick={() => {
            setSelected("");
            setMenu(false);
          }}
        >
          <span>
            <Compass size={25} />
          </span>
          wayfarer<span className="brand-dot">.</span>
        </a>
        <p className="brand-sub">GOOD PLANS. GREAT STORIES.</p>
        <button
          className="all-trips"
          onClick={() => {
            setSelected("");
            location.hash = "";
            setMenu(false);
          }}
        >
          <ChevronLeft size={16} />
          All trips
        </button>
        {trip && (
          <>
            <div className="sidebar-trip">
              <span className="eyebrow">YOUR NEXT CHAPTER</span>
              <h3>{trip.destination}</h3>
              <small>
                {new Date(trip.start + "T12:00:00").toLocaleDateString(
                  "en-US",
                  { month: "short", day: "numeric" },
                )}{" "}
                –{" "}
                {new Date(trip.end + "T12:00:00").toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                })}
              </small>
            </div>
            <nav>
              {tabs.map(([name, Icon]) => (
                <button
                  key={name}
                  className={tab === name ? "active" : ""}
                  onClick={() => {
                    setTab(name);
                    setMenu(false);
                  }}
                >
                  <Icon size={18} />
                  {name}
                  {name === "Interactive map" && <span className="nav-dot" />}
                </button>
              ))}
            </nav>
          </>
        )}
        <div className="sidebar-bottom">
          {trip && (
            <button
              onClick={() => {
                setTab("Integrations");
                setMenu(false);
              }}
            >
              <Settings size={17} />
              Integrations & sharing
            </button>
          )}
          <div className="local-status">
            <span className="status-dot on" />
            <div>
              <b>{user ? "Shared workspace" : "Personal workspace"}</b>
              <small>{status}</small>
            </div>
          </div>
        </div>
      </aside>
      <main>
        <header className="topbar">
          <button
            className="mobile-menu icon-button"
            aria-label="Open navigation"
            onClick={() => setMenu(!menu)}
          >
            <Menu />
          </button>
          <div className="breadcrumbs">
            My trips{" "}
            {trip && (
              <>
                <span>/</span>
                {trip.destination}
                <span>/</span>
                <b>{tab}</b>
              </>
            )}
          </div>
          <div className="row">
            <span className="save-status">{status}</span>
            <button
              className="avatar"
              aria-label="Open sharing settings"
              disabled={!trip}
              onClick={() => (trip ? setTab("Integrations") : null)}
            >
              {user ? "✓" : "A"}
            </button>
          </div>
        </header>
        {!trip ? (
          <div className="page home">
            <div className="section-heading">
              <div>
                <span className="eyebrow">A WORLD OF POSSIBILITIES</span>
                <h1>Where to next?</h1>
                <p className="subtitle">
                  A home for your plans, from the first idea to the last day.
                </p>
              </div>
              <button
                className="primary"
                onClick={() => setTripEdit(newTrip())}
              >
                <Plus size={17} />
                Plan a trip
              </button>
            </div>
            <div className="row home-tools">
              <button
                className={!archived ? "selected" : ""}
                onClick={() => setArchived(false)}
              >
                Upcoming trips
              </button>
              <button
                className={archived ? "selected" : ""}
                onClick={() => setArchived(true)}
              >
                Archived
              </button>
              <span className="grow" />
              <button onClick={backup}>
                <Download size={16} />
                Export backup
              </button>
              <label className="file-button">
                Import backup
                <input
                  type="file"
                  accept="application/json"
                  onChange={async (e) => {
                    const f = e.target.files?.[0];
                    if (!f) return;
                    try {
                      const d = JSON.parse(await f.text());
                      if (
                        d.version !== 1 ||
                        !Array.isArray(d.trips) ||
                        !d.trips.every(
                          (t: Trip) =>
                            t.name &&
                            t.start &&
                            Array.isArray(t.places) &&
                            Array.isArray(t.observations) &&
                            Array.isArray(t.expenses) &&
                            t.itinerary &&
                            t.rates,
                        )
                      )
                        throw new Error("Invalid backup");
                      setTrips((prev) => [
                        ...prev,
                        ...d.trips.map((t: Trip) => ({
                          ...t,
                          id: uid(),
                          watches: t.watches.map((w) => ({
                            ...w,
                            id: uid(),
                            enabled: false,
                          })),
                        })),
                      ]);
                    } catch {
                      alert(
                        "Could not import this backup. Use a Wayfarer version 1 export.",
                      );
                    }
                    e.target.value = "";
                  }}
                />
              </label>
            </div>
            <div className="trip-grid">
              {trips
                .filter((t) => t.archived === archived)
                .map((t) => (
                  <article className="trip-card" key={t.id}>
                    <button className="trip-art" onClick={() => choose(t)}>
                      <div className="sun" />
                      <div className="mountain" />
                      <span className="art-kanji">旅</span>
                      <div className="art-caption">
                        <span>YOUR NEXT ADVENTURE</span>
                        <h2>{t.destination}</h2>
                      </div>
                      <ArrowUpRight size={26} />
                    </button>
                    <div className="trip-card-body">
                      <button
                        className="title-button"
                        onClick={() => choose(t)}
                      >
                        <h2>{t.name}</h2>
                      </button>
                      <p>
                        {t.start} — {t.end}
                      </p>
                      <div className="row">
                        <span>
                          <Users size={15} /> {t.travelers.length} travelers
                        </span>
                        <span>{dates(t.start, t.end).length} days</span>
                      </div>
                      <div className="row trip-actions">
                        <button onClick={() => setTripEdit(t)}>Edit</button>
                        <button
                          aria-label={`Duplicate ${t.name}`}
                          onClick={() =>
                            update({
                              ...structuredClone(t),
                              id: uid(),
                              name: t.name + " · copy",
                              watches: t.watches.map((w) => ({
                                ...w,
                                id: uid(),
                                enabled: false,
                              })),
                            })
                          }
                        >
                          <Copy size={15} />
                        </button>
                        <button
                          aria-label={`Archive ${t.name}`}
                          onClick={() =>
                            update({ ...t, archived: !t.archived })
                          }
                        >
                          <Archive size={15} />
                        </button>
                        <button
                          aria-label={`Delete ${t.name}`}
                          onClick={() => void remove(t)}
                        >
                          <Trash2 size={15} />
                        </button>
                        <button className="primary" onClick={() => choose(t)}>
                          Open trip <ArrowUpRight size={15} />
                        </button>
                      </div>
                    </div>
                  </article>
                ))}
              <button
                className="new-trip-card"
                onClick={() => setTripEdit(newTrip())}
              >
                <span>
                  <Plus size={28} />
                </span>
                <h3>Start a new story</h3>
                <p>Any destination. Your kind of trip.</p>
              </button>
            </div>
            <div className="home-note">
              <Compass size={30} />
              <div>
                <h3>Less juggling tabs. More looking forward.</h3>
                <p>
                  Your places, routes, prices and plans, together in one
                  thoughtful workspace.
                </p>
              </div>
            </div>
          </div>
        ) : (
          <>
            <div className="trip-heading">
              <div>
                <span className="eyebrow">
                  {trip.destination.toUpperCase()}{" "}
                  <span className="heading-dot">•</span>{" "}
                  {dates(trip.start, trip.end).length} DAYS TO MAKE YOUR OWN
                </span>
                <h1>{trip.name}</h1>
                <div className="trip-meta">
                  <span>
                    <CalendarDays size={15} />
                    {trip.start} — {trip.end}
                  </span>
                  <span>
                    <Users size={15} />
                    {trip.travelers.length} travelers
                  </span>
                  <span className="badge">Planning</span>
                </div>
              </div>
              <div className="row">
                <button onClick={() => setTripEdit(trip)}>Trip settings</button>
                <button
                  className="primary"
                  onClick={() => setTab("Integrations")}
                >
                  <Users size={16} />
                  Invite partner
                </button>
              </div>
            </div>
            <div className="page workspace">
              {tab === "Overview" && (
                <>
                  <div className="overview-banner">
                    <div>
                      <span className="eyebrow">
                        A LITTLE PLANNING, A LOT TO LOOK FORWARD TO
                      </span>
                      <h2>
                        Your next chapter starts in{" "}
                        {trip.destination.split(",")[0]}.
                      </h2>
                      <p>
                        Find your base, connect your favorite places, and make
                        room for the unexpected.
                      </p>
                      <button onClick={() => setTab("Interactive map")}>
                        Explore your trip <ArrowUpRight size={17} />
                      </button>
                    </div>
                    <div className="banner-art">
                      旅<span>THE ART OF GETTING AWAY</span>
                    </div>
                  </div>
                  <div className="stats-grid overview-stats">
                    {[
                      [
                        Map,
                        "Saved places",
                        trip.places.length,
                        "Interactive map",
                      ],
                      [
                        Hotel,
                        "Hotel candidates",
                        trip.places.filter((p) => p.kind === "hotel").length,
                        "Hotels",
                      ],
                      [
                        CalendarDays,
                        "Planned activities",
                        Object.values(trip.itinerary).flat().length,
                        "Daily itinerary",
                      ],
                      [
                        Plane,
                        "Flight observations",
                        trip.observations.filter((o) => o.kind === "flight")
                          .length,
                        "Flights",
                      ],
                    ].map(([Icon, label, count, target]) => {
                      const I = Icon as typeof Map;
                      return (
                        <button
                          className="stat"
                          key={String(label)}
                          onClick={() => setTab(String(target))}
                        >
                          <I size={20} />
                          <small>{String(label)}</small>
                          <strong>
                            {String(count)}
                            <ArrowUpRight size={18} />
                          </strong>
                        </button>
                      );
                    })}
                  </div>
                  <div className="section-heading">
                    <div>
                      <span className="eyebrow">GET YOUR BEARINGS</span>
                      <h2>See how it all connects</h2>
                    </div>
                    <button onClick={() => setTab("Interactive map")}>
                      Open map workspace ↗
                    </button>
                  </div>
                  <MapWorkspace
                    key={trip.id}
                    trip={trip}
                    update={update}
                    editPlace={editPlace}
                    onAccessibility={(id, minutes) =>
                      setAccessibility((a) => ({ ...a, [id]: minutes }))
                    }
                  />
                </>
              )}
              {tab === "Interactive map" && (
                <MapWorkspace
                  key={trip.id}
                  trip={trip}
                  update={update}
                  editPlace={editPlace}
                  onAccessibility={(id, minutes) =>
                    setAccessibility((a) => ({ ...a, [id]: minutes }))
                  }
                />
              )}{" "}
              {tab === "Flights" && (
                <Prices
                  trip={trip}
                  update={update}
                  kind="flight"
                  onImport={() => {
                    setImportKind("flight");
                    setTab("Import research");
                  }}
                />
              )}
              {tab === "Hotels" && (
                <>
                  <Hotels
                    trip={trip}
                    travelMinutes={accessibility}
                    update={update}
                    edit={(p) =>
                      setPlaceEdit(
                        p ?? {
                          id: uid(),
                          name: "",
                          kind: "hotel",
                          address: "",
                          notes: "",
                          source: "Manual entry",
                          priority: "Interested",
                          minutes: 0,
                          cost: 0,
                          votes: [],
                        },
                      )
                    }
                  />
                  <div className="divider" />
                  <Prices
                    trip={trip}
                    update={update}
                    kind="hotel"
                    onImport={() => {
                      setImportKind("hotel");
                      setTab("Import research");
                    }}
                  />
                </>
              )}
              {tab === "Attractions" && (
                <Attractions trip={trip} update={update} edit={editPlace} />
              )}{" "}
              {tab === "Daily itinerary" && (
                <Itinerary
                  key={trip.id + trip.start}
                  trip={trip}
                  update={update}
                />
              )}{" "}
              {tab === "Budget" && <Budget trip={trip} update={update} />}{" "}
              {tab === "Weather" && <Weather trip={trip} />}{" "}
              {tab === "Packing" && <Packing trip={trip} update={update} />}{" "}
              {tab === "Bookings & notes" && (
                <Bookings trip={trip} update={update} />
              )}{" "}
              {tab === "Import research" && (
                <ResearchImport
                  key={trip.id}
                  trip={trip}
                  update={update}
                  initialKind={importKind}
                  openMap={() => setTab("Interactive map")}
                />
              )}
              {tab === "Integrations" && (
                <Integrations trip={trip} user={user} reload={reload} />
              )}
              <footer>
                <span>wayfarer · Made for the journey.</span>
                <button onClick={backup}>Export data backup</button>
                <button onClick={() => setTab("Integrations")}>
                  Privacy & integrations
                </button>
              </footer>
            </div>
          </>
        )}
      </main>
      {tripEdit && (
        <TripForm
          trip={tripEdit}
          save={update}
          close={() => setTripEdit(undefined)}
        />
      )}{" "}
      {placeEdit !== undefined && trip && (
        <PlaceForm
          place={placeEdit ?? undefined}
          close={() => setPlaceEdit(undefined)}
          save={(p) =>
            update({
              ...trip,
              places: [...trip.places.filter((x) => x.id !== p.id), p],
            })
          }
          remove={(id) =>
            update({
              ...trip,
              places: trip.places.filter((p) => p.id !== id),
              itinerary: Object.fromEntries(
                Object.entries(trip.itinerary).map(([d, s]) => [
                  d,
                  s.filter((x) => x.placeId !== id),
                ]),
              ),
              baseId: trip.baseId === id ? undefined : trip.baseId,
            })
          }
        />
      )}
    </div>
  );
}
