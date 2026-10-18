import { useState } from "react";
import { Check, Plus, CloudSun, Trash2 } from "lucide-react";
import {
  type Trip,
  type Currency,
  uid,
  cashNeed,
  money,
  dates,
  safeUrl,
} from "../lib/model";
import { Modal } from "./Forms";
export function Budget({
  trip,
  update,
}: {
  trip: Trip;
  update: (t: Trip) => void;
}) {
  const [name, setName] = useState(""),
    [amount, setAmount] = useState(""),
    [currency, setCurrency] = useState<Currency>("JPY"),
    [category, setCategory] = useState("Food"),
    [actual, setActual] = useState(false),
    [cash, setCash] = useState(true),
    [paidBy, setPaidBy] = useState(trip.travelers[0]),
    [message, setMessage] = useState("");
  const missing = trip.expenses.some((e) => !trip.rates[e.currency]);
  const total = (actual: boolean) =>
    trip.expenses
      .filter((e) => e.actual === actual)
      .reduce((s, e) => s + e.amount * trip.rates[e.currency], 0);
  async function rates() {
    setMessage("Retrieving reference rates…");
    try {
      const r = await fetch("https://open.er-api.com/v6/latest/JPY");
      if (!r.ok) throw new Error("Exchange service unavailable");
      const d = await r.json();
      if (!d.rates?.TWD || !d.rates?.USD)
        throw new Error("Required rates not returned");
      update({
        ...trip,
        rates: { JPY: 1, TWD: 1 / d.rates.TWD, USD: 1 / d.rates.USD },
        ratesAt: "ExchangeRate-API · " + d.time_last_update_utc,
      });
      setMessage(
        "Reference rates updated. Card and cash conversion fees are not included.",
      );
    } catch (e) {
      setMessage((e as Error).message);
    }
  }
  return (
    <>
      <div className="section-heading">
        <div>
          <span className="eyebrow">SPEND WITH INTENTION</span>
          <h2>More memories. Fewer surprises.</h2>
        </div>
      </div>
      <div className="stats-grid">
        <div className="stat">
          <small>Estimated trip total</small>
          <strong>
            {missing ? "Rates needed" : money(total(false), "JPY")}
          </strong>
        </div>
        <div className="stat">
          <small>Actual expenses</small>
          <strong>
            {missing ? "Rates needed" : money(total(true), "JPY")}
          </strong>
        </div>
        <div className="stat">
          <small>Suggested local cash</small>
          <strong>
            {missing
              ? "Rates needed"
              : money(
                  cashNeed(trip.expenses, trip.rates, trip.cards, trip.margin),
                  "JPY",
                )}
          </strong>
        </div>
      </div>
      <div className="two-col">
        <div className="panel">
          <h3>Cash & cards</h3>
          <label className="check">
            <input
              type="checkbox"
              checked={trip.cards}
              onChange={(e) => update({ ...trip, cards: e.target.checked })}
            />
            We’re bringing credit cards
          </label>
          <label>
            Safety margin (%)
            <input
              type="number"
              min="0"
              max="100"
              value={trip.margin}
              onChange={(e) =>
                update({ ...trip, margin: Number(e.target.value) })
              }
            />
          </label>
          <p>
            {trip.cards ? "Cash-only budget items" : "All estimated expenses"}{" "}
            plus {trip.margin}% contingency. This is a planning estimate;
            exclude prepaid items from your remaining budget.
          </p>
        </div>
        <div className="panel">
          <h3>Currency conversion</h3>
          <p className="muted">
            JPY per unit. Manual overrides are allowed. Zero means unknown.
          </p>
          <div className="row">
            {(["USD", "TWD"] as Currency[]).map((c) => (
              <label key={c}>
                {c}
                <input
                  type="number"
                  min="0"
                  step="0.0001"
                  value={trip.rates[c]}
                  onChange={(e) =>
                    update({
                      ...trip,
                      rates: { ...trip.rates, [c]: Number(e.target.value) },
                      ratesAt: "Manual override · " + new Date().toISOString(),
                    })
                  }
                />
              </label>
            ))}
          </div>
          <small>{trip.ratesAt}</small>
          <div className="row">
            <button onClick={() => void rates()}>Refresh rates</button>
            <a
              href="https://www.exchangerate-api.com"
              target="_blank"
              rel="noreferrer"
            >
              Rates by ExchangeRate-API ↗
            </a>
          </div>
          {message && <p role="status">{message}</p>}
        </div>
      </div>
      <div className="panel">
        <h3>Budget & expense ledger</h3>
        <form
          className="expense-form"
          onSubmit={(e) => {
            e.preventDefault();
            update({
              ...trip,
              expenses: [
                ...trip.expenses,
                {
                  id: uid(),
                  name,
                  amount: Number(amount),
                  currency,
                  category,
                  actual,
                  cash,
                  paidBy,
                },
              ],
            });
            setName("");
            setAmount("");
          }}
        >
          <label>
            Description
            <input
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Dinner in Namba"
            />
          </label>
          <label>
            Amount
            <input
              required
              type="number"
              min="0"
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </label>
          <label>
            Currency
            <select
              value={currency}
              onChange={(e) => setCurrency(e.target.value as Currency)}
            >
              {["JPY", "TWD", "USD"].map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </label>
          <label>
            Category
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            >
              {[
                "Flights",
                "Accommodation",
                "Transportation",
                "Food",
                "Attractions",
                "Shopping",
                "Insurance",
                "Miscellaneous",
                "Emergency",
              ].map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </label>
          <label>
            Paid by
            <select value={paidBy} onChange={(e) => setPaidBy(e.target.value)}>
              {trip.travelers.map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
          </label>
          <label className="check">
            <input
              type="checkbox"
              checked={actual}
              onChange={(e) => setActual(e.target.checked)}
            />
            Actual
          </label>
          <label className="check">
            <input
              type="checkbox"
              checked={cash}
              onChange={(e) => setCash(e.target.checked)}
            />
            Cash-only
          </label>
          <button className="primary">Add</button>
        </form>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Expense</th>
                <th>Category</th>
                <th>Type</th>
                <th>Paid by</th>
                <th>Amount</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {trip.expenses.map((e) => (
                <tr key={e.id}>
                  <td>{e.name}</td>
                  <td>{e.category}</td>
                  <td>
                    {e.actual ? "Actual" : "Estimate"}
                    {e.cash ? " · cash" : ""}
                  </td>
                  <td>{e.paidBy}</td>
                  <td>{money(e.amount, e.currency)}</td>
                  <td>
                    <button
                      aria-label={`Delete ${e.name}`}
                      onClick={() =>
                        update({
                          ...trip,
                          expenses: trip.expenses.filter((x) => x.id !== e.id),
                        })
                      }
                    >
                      <Trash2 size={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <h3>Equal split settlement</h3>
        <p className="muted">
          Actual expenses are split evenly among {trip.travelers.length}{" "}
          travelers.
        </p>
        {trip.travelers.map((t) => {
          const paid = trip.expenses
            .filter((e) => e.actual && e.paidBy === t)
            .reduce((n, e) => n + e.amount * trip.rates[e.currency], 0);
          const balance = paid - total(true) / trip.travelers.length;
          return (
            <p key={t}>
              {t}:{" "}
              {missing
                ? "Rates needed"
                : `${balance >= 0 ? "receives" : "owes"} ${money(Math.abs(balance), "JPY")}`}
            </p>
          );
        })}
      </div>
    </>
  );
}
export function Packing({
  trip,
  update,
}: {
  trip: Trip;
  update: (t: Trip) => void;
}) {
  const [name, setName] = useState(""),
    [traveler, setTraveler] = useState(trip.travelers[0]);
  return (
    <>
      <div className="section-heading">
        <div>
          <span className="eyebrow">READY WHEN YOU ARE</span>
          <h2>The little things, remembered.</h2>
        </div>
        <span className="badge">
          {trip.packing.filter((p) => p.done).length} / {trip.packing.length}{" "}
          packed
        </span>
      </div>
      <div className="notice">
        For a winter city trip, consider warm layers, comfortable shoes, an
        umbrella and an adapter. These are general suggestions, not a forecast.
        Verify baggage allowances against your selected fare.
      </div>
      <form
        className="row panel"
        onSubmit={(e) => {
          e.preventDefault();
          update({
            ...trip,
            packing: [
              ...trip.packing,
              { id: uid(), name, traveler, done: false },
            ],
          });
          setName("");
        }}
      >
        <input
          required
          aria-label="Packing item"
          placeholder="Add something to pack…"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <select
          aria-label="Traveler"
          value={traveler}
          onChange={(e) => setTraveler(e.target.value)}
        >
          {trip.travelers.map((t) => (
            <option key={t}>{t}</option>
          ))}
        </select>
        <button className="primary">
          <Plus size={16} />
          Add
        </button>
      </form>
      <div className="two-col">
        {trip.travelers.map((t) => (
          <div className="panel" key={t}>
            <h2>{t === "You" ? "Your bag" : t + "’s bag"}</h2>
            {trip.packing
              .filter((p) => p.traveler === t)
              .map((p) => (
                <div className="packing-item" key={p.id}>
                  <label className={`check grow ${p.done ? "done" : ""}`}>
                    <input
                      type="checkbox"
                      checked={p.done}
                      onChange={(e) =>
                        update({
                          ...trip,
                          packing: trip.packing.map((x) =>
                            x.id === p.id
                              ? { ...x, done: e.target.checked }
                              : x,
                          ),
                        })
                      }
                    />
                    {p.name}
                  </label>
                  <button
                    aria-label={`Remove ${p.name}`}
                    onClick={() =>
                      update({
                        ...trip,
                        packing: trip.packing.filter((x) => x.id !== p.id),
                      })
                    }
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
          </div>
        ))}
      </div>
    </>
  );
}
export function Weather({ trip }: { trip: Trip }) {
  const [data, setData] = useState<{
      time: string[];
      temperature_2m_max: number[];
      temperature_2m_min: number[];
      precipitation_sum: number[];
      wind_speed_10m_max: number[];
    }>(),
    [message, setMessage] = useState(
      "Forecasts are only available close to departure. No seasonal average is presented as a forecast.",
    );
  const location =
    trip.places.find((p) => p.id === trip.baseId && p.lat !== undefined) ??
    trip.places.find((p) => p.kind === "airport" && p.lat !== undefined);
  async function refresh() {
    if (!location) {
      setMessage(
        "Add a place with coordinates to locate the weather forecast.",
      );
      return;
    }
    setMessage("Loading Open-Meteo forecast…");
    try {
      const r = await fetch(
        `https://api.open-meteo.com/v1/forecast?latitude=${location.lat}&longitude=${location.lng}&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,wind_speed_10m_max&timezone=${encodeURIComponent(trip.timezone)}&forecast_days=16`,
      );
      const d = await r.json();
      if (!r.ok) throw new Error(d.reason || "Weather unavailable");
      setData(d.daily);
      setMessage(
        "Open-Meteo forecast retrieved " +
          new Date().toLocaleString() +
          ". Location: " +
          location.name,
      );
    } catch (e) {
      setMessage((e as Error).message);
    }
  }
  return (
    <>
      <div className="section-heading">
        <div>
          <span className="eyebrow">A LOOK AT THE SKIES</span>
          <h2>Plan for a change in weather.</h2>
        </div>
        <button className="primary" onClick={() => void refresh()}>
          Check forecast
        </button>
      </div>
      <p className="notice" role="status">
        {message}
      </p>
      <div className="weather-grid">
        {dates(trip.start, trip.end).map((d) => {
          const i = data?.time.indexOf(d) ?? -1;
          return (
            <div className="panel weather-day" key={d}>
              <small>{d}</small>
              <CloudSun size={42} />
              <h2>{i >= 0 ? `${data!.temperature_2m_max[i]}°` : "—"}</h2>
              {i >= 0 ? (
                <>
                  <p>Low {data!.temperature_2m_min[i]}°C</p>
                  <p>{data!.precipitation_sum[i]} mm rain</p>
                  <p>Wind {data!.wind_speed_10m_max[i]} km/h</p>
                  <span className="badge">Forecast</span>
                </>
              ) : (
                <p>
                  Forecast unavailable
                  <br />
                  <small>Check closer to departure</small>
                </p>
              )}
            </div>
          );
        })}
      </div>
      <div className="panel">
        <h3>Keep a rainy-day option</h3>
        <p>
          Save an indoor attraction and leave flexible time in your itinerary.
          Seasonal climate data has not been imported.
        </p>
        <a href="https://open-meteo.com" target="_blank" rel="noreferrer">
          Weather data by Open-Meteo ↗
        </a>
      </div>
    </>
  );
}
export function Bookings({
  trip,
  update,
}: {
  trip: Trip;
  update: (t: Trip) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [b, setB] = useState({
    id: uid(),
    name: "",
    reference: "",
    url: "",
    deadline: "",
    notes: "",
  });
  return (
    <>
      <div className="section-heading">
        <div>
          <span className="eyebrow">EVERYTHING IN ITS PLACE</span>
          <h2>Your trip, all together.</h2>
        </div>
        <button
          className="primary"
          onClick={() => {
            setB({
              id: uid(),
              name: "",
              reference: "",
              url: "",
              deadline: "",
              notes: "",
            });
            setAdding(true);
          }}
        >
          Add booking
        </button>
      </div>
      <p className="notice">
        Store reservation notes and links to documents in your own private
        storage. File upload is not enabled. Device-only mode stores these notes
        in this browser; use only on a trusted device.
      </p>
      <div className="cards-grid">
        {trip.bookings.map((x) => (
          <article className="panel" key={x.id}>
            <Check size={24} />
            <h2>{x.name}</h2>
            <p>Reference: {x.reference || "Not entered"}</p>
            {x.deadline && (
              <span className="badge amber">Deadline {x.deadline}</span>
            )}
            <p>{x.notes}</p>
            {safeUrl(x.url) && (
              <a href={safeUrl(x.url)} target="_blank" rel="noreferrer">
                Open reservation / document ↗
              </a>
            )}
            <div className="row">
              <button
                onClick={() => {
                  setB(x);
                  setAdding(true);
                }}
              >
                Edit
              </button>
              <button
                onClick={() =>
                  update({
                    ...trip,
                    bookings: trip.bookings.filter((y) => y.id !== x.id),
                  })
                }
              >
                Remove
              </button>
            </div>
          </article>
        ))}
      </div>
      <div className="panel">
        <h3>Shared trip notes</h3>
        <textarea
          rows={6}
          aria-label="Trip notes"
          placeholder="Ideas, entry-document checks, things to remember…"
          value={trip.notes}
          onChange={(e) => update({ ...trip, notes: e.target.value })}
        />
      </div>
      {adding && (
        <Modal title="Booking details" close={() => setAdding(false)}>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              update({
                ...trip,
                bookings: [...trip.bookings.filter((x) => x.id !== b.id), b],
              });
              setAdding(false);
            }}
          >
            <label>
              Booking name
              <input
                required
                value={b.name}
                onChange={(e) => setB({ ...b, name: e.target.value })}
              />
            </label>
            <label>
              Reference
              <input
                value={b.reference}
                onChange={(e) => setB({ ...b, reference: e.target.value })}
              />
            </label>
            <label>
              Private document / booking URL
              <input
                type="url"
                value={b.url}
                onChange={(e) => setB({ ...b, url: e.target.value })}
              />
            </label>
            <label>
              Cancellation / reservation deadline
              <input
                type="date"
                value={b.deadline}
                onChange={(e) => setB({ ...b, deadline: e.target.value })}
              />
            </label>
            <label>
              Notes
              <textarea
                value={b.notes}
                onChange={(e) => setB({ ...b, notes: e.target.value })}
              />
            </label>
            <button className="primary">Save booking</button>
          </form>
        </Modal>
      )}
    </>
  );
}
