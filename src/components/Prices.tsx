import { useEffect, useState } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import { Plus, TrendingDown, Plane, Bell, UploadCloud } from "lucide-react";
import {
  type Trip,
  type Observation,
  type Watch,
  uid,
  money,
  stats,
  safeUrl,
} from "../lib/model";
import { api, supabase } from "../lib/api";
import { ObservationForm, Modal } from "./Forms";
export default function Prices({
  trip,
  update,
  kind,
  onImport,
}: {
  trip: Trip;
  update: (t: Trip) => void;
  kind: "flight" | "hotel";
  onImport: () => void;
}) {
  const [editing, setEditing] = useState<Observation | null>(),
    [group, setGroup] = useState(""),
    [watching, setWatching] = useState(false),
    [message, setMessage] = useState(""),
    [live, setLive] = useState<Observation[]>([]),
    [runs, setRuns] = useState<
      {
        watch_id: string;
        last_attempt: string;
        last_success: string;
        error?: string;
      }[]
    >([]),
    [alerts, setAlerts] = useState<
      { id: string; message: string; created_at: string }[]
    >([]);
  const [direction, setDirection] = useState("all"),
    [sort, setSort] = useState("price");
  const allObservations = [
    ...trip.observations.filter((o) => o.kind === kind),
    ...live,
  ];
  const observations = allObservations
    .filter(
      (o) =>
        kind !== "flight" ||
        direction === "all" ||
        o.flightDirection === direction,
    )
    .sort((a, b) =>
      sort === "departure"
        ? (a.research?.details.departure || "").localeCompare(
            b.research?.details.departure || "",
          )
        : a.currency.localeCompare(b.currency) || a.amount - b.amount,
    );
  const outbound = allObservations
    .filter((o) => o.flightDirection === "outbound" && o.currency === "USD")
    .sort((a, b) => a.amount - b.amount)[0];
  const inbound = allObservations
    .filter((o) => o.flightDirection === "return" && o.currency === "USD")
    .sort((a, b) => a.amount - b.amount)[0];
  const groups = [
    ...new Set(
      observations.map((o) => JSON.stringify([o.itemId, o.currency, o.basis])),
    ),
  ];
  const selected = groups.includes(group) ? group : groups[0];
  const series = observations
    .filter((o) => JSON.stringify([o.itemId, o.currency, o.basis]) === selected)
    .sort((a, b) => a.at.localeCompare(b.at));
  const summary = stats(series);
  const currency = series[0]?.currency ?? "USD";
  async function load() {
    if (!supabase) return;
    const { data, error } = await supabase
      .from("observations")
      .select("*")
      .eq("trip_id", trip.id)
      .eq("kind", kind)
      .order("observed_at");
    if (error) return;
    setLive(
      (data ?? []).map((o) => ({
        id: o.id,
        itemId: o.item_key,
        name: o.name,
        kind: o.kind,
        amount: Number(o.amount),
        currency: o.currency,
        at: o.observed_at,
        source: o.source,
        basis: o.basis,
        notes: o.notes,
        url: o.url,
      })),
    );
    const a = await supabase
      .from("alerts")
      .select("id,message,created_at")
      .eq("trip_id", trip.id)
      .order("created_at", { ascending: false })
      .limit(20);
    setAlerts(a.data ?? []);
    const r = await supabase
      .from("monitor_status")
      .select("*")
      .eq("trip_id", trip.id);
    setRuns(r.data ?? []);
  }
  useEffect(() => {
    void load();
  }, [trip.id, kind]);
  async function monitor(w: Watch) {
    setMessage("Running a protected price check…");
    try {
      const r = await api("price", { tripId: trip.id, watch: w });
      setMessage(
        `Retrieved ${r.count} observations. Exact baggage and room comparability must be verified.`,
      );
      await load();
    } catch (e) {
      setMessage((e as Error).message);
    }
  }
  return (
    <>
      <div className="section-heading">
        <div>
          <span className="eyebrow">
            {kind === "flight" ? "GETTING THERE" : "STAY PRICE WATCH"}
          </span>
          <h2>
            {kind === "flight"
              ? "The journey starts here."
              : "A good stay, at the right price."}
          </h2>
        </div>
        <div className="row wrap">
          <button className="primary" onClick={onImport}>
            <UploadCloud size={16} />
            Import Research
          </button>
          <button onClick={onImport}>Import researched dataset</button>
          <button onClick={() => setWatching(true)}>
            <Bell size={16} />
            New price watch
          </button>
          <button onClick={() => setEditing(null)}>
            <Plus size={16} />
            Record price
          </button>
        </div>
      </div>
      <div className="notice">
        <b>Recorded observations, not current offers.</b> Initial prices are
        manual research from October 18, 2026. Import new PDFs, screenshots or
        copied text without credentials. Optional live checks need a configured
        backend. Unknown baggage, taxes or room terms are never silently treated
        as equivalent.
      </div>
      {message && (
        <p role="status" className="notice">
          {message}
        </p>
      )}
      {kind === "flight" && (
        <div className="panel">
          <div className="row wrap">
            {[
              ["all", "All flights"],
              ["outbound", "Outbound one-way"],
              ["return", "Return one-way"],
              ["round-trip", "Historical round-trip"],
            ].map(([value, label]) => (
              <button
                key={value}
                className={direction === value ? "primary" : ""}
                onClick={() => setDirection(value)}
              >
                {label}
              </button>
            ))}
            <label>
              Sort flights
              <select value={sort} onChange={(e) => setSort(e.target.value)}>
                <option value="price">Price (within currency)</option>
                <option value="departure">Departure time</option>
              </select>
            </label>
          </div>
          {outbound && inbound && (
            <p className="notice">
              Arithmetic illustration only: {money(outbound.amount, "USD")}{" "}
              outbound + {money(inbound.amount, "USD")} return ={" "}
              {money(outbound.amount + inbound.amount, "USD")} per adult. This
              is NOT a verified round-trip fare or bookable pairing; baggage and
              terms need checking.
            </p>
          )}
        </div>
      )}
      <div className="stats-grid">
        {[
          ["Latest", summary?.latest],
          ["Lowest recorded", summary?.min],
          ["Highest recorded", summary?.max],
        ].map(([label, value]) => (
          <div className="stat" key={String(label)}>
            <small>{label}</small>
            <strong>
              {value === undefined ? "—" : money(Number(value), currency)}
            </strong>
          </div>
        ))}
        <div className="stat">
          <small>Change since first observation</small>
          <strong>{summary ? `${summary.percent.toFixed(1)}%` : "—"}</strong>
          <small>
            {summary ? money(summary.change, currency) : "No observations"}
          </small>
        </div>
      </div>
      <div className="panel">
        <div className="section-heading">
          <h3>
            <TrendingDown size={18} /> Your observed price history
          </h3>
          <select
            aria-label="Price history series"
            value={selected ?? ""}
            onChange={(e) => setGroup(e.target.value)}
          >
            {groups.map((g) => {
              const a = JSON.parse(g);
              return (
                <option key={g} value={g}>
                  {observations.find((o) => o.itemId === a[0])?.name} · {a[1]} ·{" "}
                  {a[2]}
                </option>
              );
            })}
          </select>
        </div>
        <div className="chart">
          <ResponsiveContainer width="100%" height={220}>
            <LineChart
              data={series.map((o) => ({ ...o, date: o.at.slice(0, 10) }))}
            >
              <CartesianGrid strokeDasharray="3 5" vertical={false} />
              <XAxis dataKey="date" />
              <YAxis domain={["auto", "auto"]} />
              <Tooltip />
              <Line
                type="monotone"
                dataKey="amount"
                name={currency}
                stroke="#267663"
                strokeWidth={3}
                dot={{ r: 5 }}
                connectNulls={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
        <small>
          {series.length} observations on the same recorded basis.{" "}
          {series.length < 2
            ? "Add another observation to establish a trend."
            : ""}{" "}
          {series.length
            ? `Last recorded ${series.at(-1)!.at.slice(0, 10)} · ${Math.max(0, Math.floor((Date.now() - new Date(series.at(-1)!.at).getTime()) / 86400000))} days ago.`
            : ""}
        </small>
      </div>
      <div className="price-options">
        {observations.map((o) => (
          <article className="panel price-option" key={o.id}>
            <div className="airline-mark">
              {kind === "flight" ? <Plane /> : "H"}
            </div>
            <div className="grow">
              <h3>{o.name}</h3>
              {o.flightDirection && (
                <span className="badge">
                  {o.flightDirection === "round-trip"
                    ? "Historical round-trip quote"
                    : `${o.flightDirection} · one-way per adult`}
                </span>
              )}
              {kind === "flight" && o.research && (
                <p>Baggage: {o.research.details.baggage || "Unknown"}</p>
              )}
              {kind === "flight" && o.research && (
                <p className="flight-times">
                  <strong>
                    {o.research.details.departure || "Departure time unknown"} →{" "}
                    {o.research.details.arrival || "Arrival time unknown"}
                  </strong>
                </p>
              )}
              <p>{o.notes}</p>
              <small>
                {o.research
                  ? `${o.research.comparable ? "Confirmed" : "Uncertain"} comparison · ${o.research.details.start} – ${o.research.details.end} · ${o.research.details.room || o.research.details.cabin || "Conditions unknown"} · ${o.research.details.priceScope}`
                  : o.basis}
              </small>
              <p className="muted">
                {o.source} · {o.at.slice(0, 10)}
              </p>
            </div>
            <div className="price-action">
              <strong>{money(o.amount, o.currency)}</strong>
              {trip.observations.some((x) => x.id === o.id) && (
                <button onClick={() => setEditing(o)}>Edit observation</button>
              )}
              {o.url && safeUrl(o.url) && (
                <a href={safeUrl(o.url)} target="_blank" rel="noreferrer">
                  Verify at source ↗
                </a>
              )}
            </div>
          </article>
        ))}
      </div>
      <div className="panel">
        <h3>Watchlist</h3>
        <p>
          Scheduled checks run every 12 or 24 hours after backend setup. Each
          search stores its dates, party size and currency. Search-level lowest
          fares are provisional, not exact flight or room matches.
        </p>
        {trip.watches
          .filter((w) => w.kind === kind)
          .map((w) => (
            <div className="watch-row" key={w.id}>
              <div className="grow">
                <b>{w.query || `${w.origin} → ${w.destination}`}</b>
                <p>
                  {money(w.target, w.currency)} target · every {w.hours} hours ·{" "}
                  {w.enabled ? "enabled after backend setup" : "paused"}
                </p>
                {runs
                  .filter((r) => r.watch_id === w.id)
                  .map((r) => (
                    <small key={r.watch_id}>
                      Last attempt {r.last_attempt} ·{" "}
                      {r.error || `Successful ${r.last_success}`}
                    </small>
                  ))}
              </div>
              <button onClick={() => void monitor(w)}>Check now</button>
              <button
                onClick={() =>
                  update({
                    ...trip,
                    watches: trip.watches.map((x) =>
                      x.id === w.id ? { ...x, enabled: !x.enabled } : x,
                    ),
                  })
                }
              >
                {w.enabled ? "Pause" : "Enable"}
              </button>
              <button
                onClick={() =>
                  update({
                    ...trip,
                    watches: trip.watches.filter((x) => x.id !== w.id),
                  })
                }
              >
                Remove
              </button>
            </div>
          ))}
        {!trip.watches.some((w) => w.kind === kind) && (
          <p className="muted">
            No watches yet. Add a watch to prepare your search and target price.
          </p>
        )}
      </div>
      {alerts.length > 0 && (
        <div className="panel">
          <h3>In-app price alerts</h3>
          {alerts.map((a) => (
            <p key={a.id}>
              {a.message}
              <small> · {new Date(a.created_at).toLocaleString()}</small>
            </p>
          ))}
        </div>
      )}
      {editing !== undefined && (
        <ObservationForm
          kind={kind}
          value={editing ?? undefined}
          close={() => setEditing(undefined)}
          save={(o) =>
            update({
              ...trip,
              observations: [
                ...trip.observations.filter((x) => x.id !== o.id),
                o,
              ],
            })
          }
        />
      )}{" "}
      {watching && (
        <WatchForm
          kind={kind}
          close={() => setWatching(false)}
          save={(w) => update({ ...trip, watches: [...trip.watches, w] })}
        />
      )}
    </>
  );
}
function WatchForm({
  kind,
  save,
  close,
}: {
  kind: "flight" | "hotel";
  save: (w: Watch) => void;
  close: () => void;
}) {
  const [w, set] = useState<Watch>({
    id: uid(),
    kind,
    query: "",
    origin: "",
    destination: "KIX",
    target: 400,
    currency: kind === "flight" ? "USD" : "JPY",
    enabled: false,
    hours: 24,
    dropAmount: 0,
    dropPercent: 0,
    newLow: true,
  });
  return (
    <Modal title="New price watch" close={close}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          save(w);
          close();
        }}
      >
        {kind === "flight" ? (
          <div className="form-grid">
            <label>
              Departure airport IATA
              <input
                required
                pattern="[A-Z]{3}"
                maxLength={3}
                placeholder="Choose your Taiwan airport"
                value={w.origin}
                onChange={(e) =>
                  set({ ...w, origin: e.target.value.toUpperCase() })
                }
              />
            </label>
            <label>
              Arrival airport IATA
              <input
                required
                pattern="[A-Z]{3}"
                maxLength={3}
                value={w.destination}
                onChange={(e) =>
                  set({ ...w, destination: e.target.value.toUpperCase() })
                }
              />
            </label>
          </div>
        ) : (
          <label>
            Property / destination query
            <input
              required
              value={w.query}
              onChange={(e) => set({ ...w, query: e.target.value })}
            />
          </label>
        )}
        <div className="form-grid">
          <label>
            Target price
            <input
              type="number"
              required
              min="1"
              value={w.target}
              onChange={(e) => set({ ...w, target: Number(e.target.value) })}
            />
          </label>
          <label>
            Currency
            <select
              value={w.currency}
              onChange={(e) =>
                set({ ...w, currency: e.target.value as Watch["currency"] })
              }
            >
              {["JPY", "TWD", "USD"].map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </label>
          <label>
            Check interval
            <select
              value={w.hours}
              onChange={(e) => set({ ...w, hours: Number(e.target.value) })}
            >
              <option value={24}>Daily</option>
              <option value={12}>Twice daily</option>
            </select>
          </label>
        </div>
        <div className="form-grid">
          <label>
            Drop amount (0 = off)
            <input
              type="number"
              min="0"
              value={w.dropAmount ?? 0}
              onChange={(e) =>
                set({ ...w, dropAmount: Number(e.target.value) })
              }
            />
          </label>
          <label>
            Drop percentage (0 = off)
            <input
              type="number"
              min="0"
              max="100"
              value={w.dropPercent ?? 0}
              onChange={(e) =>
                set({ ...w, dropPercent: Number(e.target.value) })
              }
            />
          </label>
        </div>
        <label className="check">
          <input
            type="checkbox"
            checked={w.newLow ?? false}
            onChange={(e) => set({ ...w, newLow: e.target.checked })}
          />
          Alert on a new observed low
        </label>
        <p className="notice">
          Search uses this trip’s dates and traveler count. Baggage and exact
          room terms may be unavailable; alerts are labeled provisional. A new
          watch starts paused.
        </p>
        <button className="primary">Save watch</button>
      </form>
    </Modal>
  );
}
