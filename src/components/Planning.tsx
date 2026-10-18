import { useState } from "react";
import { ArrowDown, ArrowUp, GripVertical, Plus, Trash2 } from "lucide-react";
import {
  type Trip,
  type Place,
  uid,
  dates,
  conflict,
  moveStop,
  scoreHotel,
  money,
  exportFile,
} from "../lib/model";
export function Itinerary({
  trip,
  update,
}: {
  trip: Trip;
  update: (t: Trip) => void;
}) {
  const days = dates(trip.start, trip.end);
  const [day, setDay] = useState(days[0]),
    [place, setPlace] = useState(""),
    [drag, setDrag] = useState<number>();
  const stops = trip.itinerary[day] ?? [];
  const problems = conflict(stops);
  const save = (next: typeof stops) =>
    update({ ...trip, itinerary: { ...trip.itinerary, [day]: next } });
  function calendar() {
    const escape = (s: string) =>
      s
        .replace(/\\/g, "\\\\")
        .replace(/\n/g, "\\n")
        .replace(/,/g, "\\,")
        .replace(/;/g, "\\;");
    const events = Object.entries(trip.itinerary).flatMap(([d, ss]) =>
      ss.map((s) => {
        const p = trip.places.find((p) => p.id === s.placeId);
        return [
          "BEGIN:VEVENT",
          `UID:${s.id}@wayfarer`,
          `DTSTAMP:${new Date()
            .toISOString()
            .replace(/[-:]/g, "")
            .replace(/\.\d{3}/, "")}`,
          `DTSTART;TZID=${trip.timezone}:${d.replace(/-/g, "")}T${s.time.replace(":", "")}00`,
          `DURATION:PT${s.duration}M`,
          `SUMMARY:${escape(p?.name ?? "Activity")}`,
          `DESCRIPTION:${escape(p?.notes ?? "")}`,
          "END:VEVENT",
        ].join("\r\n");
      }),
    );
    exportFile(
      "itinerary.ics",
      [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "PRODID:-//Wayfarer//Travel planner//EN",
        ...events,
        "END:VCALENDAR",
      ].join("\r\n"),
      "text/calendar",
    );
  }
  return (
    <>
      <div className="section-heading">
        <div>
          <span className="eyebrow">MAKE ROOM FOR DISCOVERY</span>
          <h2>A little structure. A lot to explore.</h2>
        </div>
        <div className="row">
          <button onClick={calendar}>Export calendar</button>
          <button onClick={() => window.print()}>Print / PDF</button>
        </div>
      </div>
      <div className="day-tabs">
        {days.map((d, i) => (
          <button
            key={d}
            className={day === d ? "active" : ""}
            onClick={() => setDay(d)}
          >
            <small>DAY {i + 1}</small>
            {new Date(d + "T12:00:00").toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
            })}
            <span>{trip.itinerary[d]?.length ?? 0} stops</span>
          </button>
        ))}
      </div>
      <div className="panel">
        <div className="row wrap">
          <select
            aria-label="Place to add"
            value={place}
            onChange={(e) => setPlace(e.target.value)}
          >
            <option value="">Choose a saved place</option>
            {trip.places.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <button
            className="primary"
            disabled={!place}
            onClick={() => {
              const p = trip.places.find((p) => p.id === place)!;
              save([
                ...stops,
                {
                  id: uid(),
                  placeId: place,
                  time: "10:00",
                  duration: p.minutes || 60,
                },
              ]);
            }}
          >
            <Plus size={16} />
            Add stop
          </button>
        </div>
        <p className="muted">
          Times are local to {trip.timezone}. Drag to reorder or use the arrows.
          Allow at least 15 minutes between visits; actual travel may take
          longer.
        </p>
        {!stops.length && (
          <div className="empty">
            <span>01</span>
            <h3>Your day is an open book</h3>
            <p>Add a saved place to start shaping the day.</p>
          </div>
        )}
        {stops.map((s, i) => {
          const p = trip.places.find((p) => p.id === s.placeId);
          return (
            <div
              key={s.id}
              draggable
              onDragStart={() => setDrag(i)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => {
                if (drag !== undefined) save(moveStop(stops, drag, i));
                setDrag(undefined);
              }}
              className="itinerary-stop"
            >
              <GripVertical size={16} />
              <span className="stop-number">{i + 1}</span>
              <div className="grow">
                <h3>{p?.name ?? "Removed place"}</h3>
                <small>
                  {p?.opening || "Opening hours unverified"} · Travel estimate
                  unavailable until routed
                </small>
                {problems[i] && <p className="warning">{problems[i]}</p>}
              </div>
              <label>
                Start
                <input
                  aria-label={`Start ${p?.name}`}
                  type="time"
                  value={s.time}
                  onChange={(e) =>
                    save(
                      stops.map((x) =>
                        x.id === s.id ? { ...x, time: e.target.value } : x,
                      ),
                    )
                  }
                />
              </label>
              <label>
                Minutes
                <input
                  aria-label={`Duration ${p?.name}`}
                  type="number"
                  min="5"
                  value={s.duration}
                  onChange={(e) =>
                    save(
                      stops.map((x) =>
                        x.id === s.id
                          ? { ...x, duration: Number(e.target.value) }
                          : x,
                      ),
                    )
                  }
                />
              </label>
              <div className="row">
                <button
                  aria-label="Move up"
                  disabled={!i}
                  onClick={() => save(moveStop(stops, i, i - 1))}
                >
                  <ArrowUp size={14} />
                </button>
                <button
                  aria-label="Move down"
                  disabled={i === stops.length - 1}
                  onClick={() => save(moveStop(stops, i, i + 1))}
                >
                  <ArrowDown size={14} />
                </button>
                <button
                  aria-label="Remove stop"
                  onClick={() => save(stops.filter((x) => x.id !== s.id))}
                >
                  <Trash2 size={14} />
                </button>
              </div>
              <select
                aria-label="Move to day"
                value={day}
                onChange={(e) =>
                  update({
                    ...trip,
                    itinerary: {
                      ...trip.itinerary,
                      [day]: stops.filter((x) => x.id !== s.id),
                      [e.target.value]: [
                        ...(trip.itinerary[e.target.value] ?? []),
                        s,
                      ],
                    },
                  })
                }
              >
                {days.map((d) => (
                  <option key={d}>{d}</option>
                ))}
              </select>
            </div>
          );
        })}
      </div>
    </>
  );
}
export function Hotels({
  trip,
  update,
  edit,
  travelMinutes,
}: {
  trip: Trip;
  update: (t: Trip) => void;
  edit: (p?: Place) => void;
  travelMinutes: Record<string, number>;
}) {
  const [weights, setWeights] = useState([5, 5, 3]);
  const hotels = trip.places.filter((p) => p.kind === "hotel");
  return (
    <>
      <div className="section-heading">
        <div>
          <span className="eyebrow">FIND YOUR HOME BASE</span>
          <h2>Stay somewhere that fits your trip.</h2>
        </div>
        <button className="primary" onClick={() => edit()}>
          <Plus size={16} />
          Add hotel
        </button>
      </div>
      <div className="panel weights">
        <div>
          <h3>What matters most?</h3>
          <p className="muted">
            Adjust your priorities. Missing data is excluded, never scored as
            zero.
          </p>
        </div>
        {["Stay price", "Travel time", "Quality"].map((w, i) => (
          <label key={w}>
            {w} <b>{weights[i]}</b>
            <input
              aria-label={`${w} weight`}
              type="range"
              min="0"
              max="10"
              value={weights[i]}
              onChange={(e) =>
                setWeights(
                  weights.map((v, j) => (j === i ? Number(e.target.value) : v)),
                )
              }
            />
          </label>
        ))}
      </div>
      <div className="cards-grid">
        {hotels.map((p) => {
          const score = scoreHotel(
            p.cost || undefined,
            travelMinutes[p.id],
            p.rating,
            weights,
          );
          return (
            <article className="panel hotel-card" key={p.id}>
              <div className="hotel-illustration">
                <span>
                  {p.name.includes("Umeda")
                    ? "梅田"
                    : p.name.includes("Namba")
                      ? "難波"
                      : "大阪"}
                </span>
                <small>
                  {p.demo ? "ILLUSTRATIVE HOTEL OPTION" : "PROPERTY TO VERIFY"}
                </small>
              </div>
              <span className="badge">
                {trip.baseId === p.id
                  ? "Selected base"
                  : p.demo
                    ? "Demo · no availability"
                    : "Research candidate"}
              </span>
              <h2>{p.name}</h2>
              <p>{p.address}</p>
              <div className="price">
                {p.cost ? money(p.cost, "JPY") : "No price recorded"}
                <small> total stay estimate</small>
              </div>
              {trip.observations
                .filter(
                  (o) => o.kind === "hotel" && o.itemId === p.id && o.research,
                )
                .sort((a, b) => b.at.localeCompare(a.at))
                .slice(0, 1)
                .map((o) => (
                  <div className="hotel-research-price" key={o.id}>
                    <small>LATEST IMPORTED OBSERVATION</small>
                    <p>
                      {money(o.amount, o.currency)} ·{" "}
                      {o.research!.details.priceScope} · {o.at.slice(0, 10)}
                    </p>
                    <small>
                      {o.research!.comparable
                        ? "Confirmed comparison basis"
                        : "Conditions uncertain"}{" "}
                      · {o.research!.details.room || "Room not confirmed"}
                    </small>
                    {o.currency === "JPY" &&
                      o.research!.details.priceScope === "stay total" &&
                      o.research!.details.start === trip.start &&
                      o.research!.details.end === trip.end &&
                      Number(o.research!.details.passengers) ===
                        trip.travelers.length &&
                      o.research!.comparable && (
                        <button
                          onClick={() =>
                            update({
                              ...trip,
                              places: trip.places.map((x) =>
                                x.id === p.id ? { ...x, cost: o.amount } : x,
                              ),
                            })
                          }
                        >
                          Use as stay estimate
                        </button>
                      )}
                  </div>
                ))}
              <dl>
                <dt>Room</dt>
                <dd>{p.room || "Unknown"}</dd>
                <dt>Amenities</dt>
                <dd>{p.amenities || "Unknown"}</dd>
                <dt>Cancellation</dt>
                <dd>{p.cancellation || "Unknown"}</dd>
                <dt>Attraction access</dt>
                <dd>
                  {travelMinutes[p.id] !== undefined
                    ? `${travelMinutes[p.id]} min average · session result`
                    : "Calculate in map workspace"}
                </dd>
              </dl>
              <details>
                <summary>
                  Score {score.score ?? "—"} / 100 · {score.coverage}/3 inputs
                </summary>
                <p>
                  Weighted mean of available inputs. Price: max(0, 100 − JPY
                  stay total / 2,000); travel: max(0, 100 − average minutes);
                  quality: rating × 20. Travel-time input uses the most recent
                  accessibility calculation in this session. Room, amenities and
                  transport cost require manual comparison.
                </p>
              </details>
              <div className="row">
                <button onClick={() => edit(p)}>Edit details</button>
                <button
                  className="primary"
                  onClick={() => update({ ...trip, baseId: p.id })}
                >
                  {trip.baseId === p.id ? "✓ Selected" : "Choose base"}
                </button>
              </div>
            </article>
          );
        })}
      </div>
    </>
  );
}
export function Attractions({
  trip,
  update,
  edit,
}: {
  trip: Trip;
  update: (t: Trip) => void;
  edit: (p?: Place) => void;
}) {
  const [query, setQuery] = useState(""),
    [traveler, setTraveler] = useState(trip.travelers[0]);
  return (
    <>
      <div className="section-heading">
        <div>
          <span className="eyebrow">THE REASON WE TRAVEL</span>
          <h2>Places worth making time for.</h2>
        </div>
        <button className="primary" onClick={() => edit()}>
          Add place
        </button>
      </div>
      <div className="row">
        <input
          placeholder="Filter saved places"
          aria-label="Filter attractions"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <select
          aria-label="Voting traveler"
          value={traveler}
          onChange={(e) => setTraveler(e.target.value)}
        >
          {trip.travelers.map((t) => (
            <option key={t}>{t}</option>
          ))}
        </select>
      </div>
      <div className="cards-grid">
        {trip.places
          .filter(
            (p) =>
              ["attraction", "restaurant"].includes(p.kind) &&
              p.name.toLowerCase().includes(query.toLowerCase()),
          )
          .map((p) => (
            <article className="panel" key={p.id}>
              <span className="badge">{p.priority}</span>
              <h2>{p.name}</h2>
              <p>{p.notes}</p>
              <p>
                {p.minutes} min planned ·{" "}
                {p.cost ? money(p.cost, "JPY") : "Admission unknown"}
              </p>
              <small>{p.source}</small>
              <div className="row">
                <button onClick={() => edit(p)}>Edit details</button>
                <button
                  onClick={() =>
                    update({
                      ...trip,
                      places: trip.places.map((x) =>
                        x.id === p.id
                          ? {
                              ...x,
                              votes: x.votes.includes(traveler)
                                ? x.votes.filter((v) => v !== traveler)
                                : [...x.votes, traveler],
                            }
                          : x,
                      ),
                    })
                  }
                >
                  {p.votes.includes(traveler) ? "♥" : "♡"} {p.votes.length}{" "}
                  votes
                </button>
              </div>
            </article>
          ))}
      </div>
    </>
  );
}
