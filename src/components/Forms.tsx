import LocationResolver from "./LocationResolver";
import { useState, type ReactNode } from "react";
import { X } from "lucide-react";
import {
  uid,
  type Trip,
  type Place,
  type Observation,
  type Currency,
} from "../lib/model";
export function Modal({
  title,
  children,
  close,
}: {
  title: string;
  children: ReactNode;
  close: () => void;
}) {
  return (
    <div className="modal-backdrop" onClick={close}>
      <section
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="modal"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="section-heading">
          <h2>{title}</h2>
          <button
            aria-label="Close dialog"
            className="icon-button"
            onClick={close}
          >
            <X />
          </button>
        </div>
        {children}
      </section>
    </div>
  );
}
export function TripForm({
  trip,
  save,
  close,
}: {
  trip: Trip;
  save: (t: Trip) => void;
  close: () => void;
}) {
  const [value, set] = useState(trip);
  return (
    <Modal title="Trip settings" close={close}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          try {
            new Intl.DateTimeFormat("en-US", {
              timeZone: value.timezone,
            }).format();
          } catch {
            alert("Enter a valid IANA timezone, such as Asia/Tokyo.");
            return;
          }
          if (!value.travelers.length) {
            alert("Add at least one traveler.");
            return;
          }
          save(value);
          close();
        }}
      >
        <label>
          Trip name
          <input
            required
            value={value.name}
            onChange={(e) => set({ ...value, name: e.target.value })}
          />
        </label>
        <div className="form-grid">
          <label>
            Origin / departure airport
            <input
              required
              value={value.origin}
              onChange={(e) => set({ ...value, origin: e.target.value })}
            />
          </label>
          <label>
            Destination
            <input
              required
              value={value.destination}
              onChange={(e) => set({ ...value, destination: e.target.value })}
            />
          </label>
          <label>
            Start date
            <input
              type="date"
              required
              value={value.start}
              onChange={(e) => set({ ...value, start: e.target.value })}
            />
          </label>
          <label>
            End date
            <input
              type="date"
              required
              min={value.start}
              value={value.end}
              onChange={(e) => set({ ...value, end: e.target.value })}
            />
          </label>
          <label>
            Display currency
            <select
              value={value.currency}
              onChange={(e) =>
                set({ ...value, currency: e.target.value as Currency })
              }
            >
              {["JPY", "TWD", "USD"].map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </label>
          <label>
            IANA destination timezone
            <input
              required
              value={value.timezone}
              onChange={(e) => set({ ...value, timezone: e.target.value })}
            />
          </label>
        </div>
        <label>
          Travelers (comma separated, unique names)
          <input
            required
            value={value.travelers.join(", ")}
            onChange={(e) =>
              set({
                ...value,
                travelers: [
                  ...new Set(
                    e.target.value
                      .split(",")
                      .map((s) => s.trim())
                      .filter(Boolean),
                  ),
                ],
              })
            }
          />
        </label>
        <label>
          Arrival airport
          <select
            value={value.airportId ?? ""}
            onChange={(e) => set({ ...value, airportId: e.target.value })}
          >
            <option value="">Choose a saved airport</option>
            {value.places
              .filter((p) => p.kind === "airport")
              .map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
          </select>
        </label>
        <button className="primary" type="submit">
          Save trip
        </button>
      </form>
    </Modal>
  );
}
export function PlaceForm({
  place,
  save,
  remove,
  close,
}: {
  place?: Place;
  save: (p: Place) => void;
  remove?: (id: string) => void;
  close: () => void;
}) {
  const [p, set] = useState<Place>(
    place ?? {
      id: uid(),
      name: "",
      kind: "attraction",
      address: "",
      notes: "",
      source: "Manual entry · " + new Date().toISOString().slice(0, 10),
      priority: "Interested",
      minutes: 90,
      cost: 0,
      votes: [],
    },
  );
  return (
    <Modal title={place ? "Place details" : "Add a place"} close={close}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          save(p);
          close();
        }}
      >
        <label>
          Name
          <input
            required
            value={p.name}
            onChange={(e) => set({ ...p, name: e.target.value })}
          />
        </label>
        <div className="form-grid">
          <label>
            Category
            <select
              value={p.kind}
              onChange={(e) =>
                set({ ...p, kind: e.target.value as Place["kind"] })
              }
            >
              {["hotel", "attraction", "restaurant", "airport", "station"].map(
                (k) => (
                  <option key={k}>{k}</option>
                ),
              )}
            </select>
          </label>
          <label>
            Priority
            <select
              value={p.priority}
              onChange={(e) =>
                set({ ...p, priority: e.target.value as Place["priority"] })
              }
            >
              {["Must visit", "Interested", "Optional"].map((k) => (
                <option key={k}>{k}</option>
              ))}
            </select>
          </label>
          <label>
            Latitude (verified by you)
            <input
              type="number"
              step="any"
              min="-90"
              max="90"
              value={p.lat ?? ""}
              onChange={(e) =>
                set({
                  ...p,
                  lat:
                    e.target.value === "" ? undefined : Number(e.target.value),
                  demo: false,
                })
              }
            />
          </label>
          <label>
            Longitude
            <input
              type="number"
              step="any"
              min="-180"
              max="180"
              value={p.lng ?? ""}
              onChange={(e) =>
                set({
                  ...p,
                  lng:
                    e.target.value === "" ? undefined : Number(e.target.value),
                  demo: false,
                })
              }
            />
          </label>
        </div>
        <label>
          Address
          <input
            value={p.address}
            onChange={(e) => set({ ...p, address: e.target.value })}
          />
        </label>
        <LocationResolver
          key={p.id}
          place={p}
          onConfirm={(lat, lng) =>
            set({
              ...p,
              lat,
              lng,
              demo: false,
              coordinateStatus: "USER_CONFIRMED",
            })
          }
        />
        <div className="form-grid">
          <label>
            {p.kind === "hotel"
              ? "Total stay estimate (JPY)"
              : "Admission estimate (JPY)"}
            <input
              min="0"
              type="number"
              value={p.cost}
              onChange={(e) => set({ ...p, cost: Number(e.target.value) })}
            />
          </label>
          <label>
            Visit duration (minutes)
            <input
              type="number"
              min="0"
              value={p.minutes}
              onChange={(e) => set({ ...p, minutes: Number(e.target.value) })}
            />
          </label>
        </div>
        {p.kind === "hotel" && (
          <>
            <label>
              Room / beds
              <input
                value={p.room ?? ""}
                onChange={(e) => set({ ...p, room: e.target.value })}
              />
            </label>
            <label>
              Amenities and breakfast
              <input
                value={p.amenities ?? ""}
                onChange={(e) => set({ ...p, amenities: e.target.value })}
              />
            </label>
            <label>
              Cancellation / check-in / check-out
              <input
                value={p.cancellation ?? ""}
                onChange={(e) => set({ ...p, cancellation: e.target.value })}
              />
            </label>
            <label>
              Rating (0–5, optional)
              <input
                min="0"
                max="5"
                step="0.1"
                type="number"
                value={p.rating ?? ""}
                onChange={(e) =>
                  set({
                    ...p,
                    rating:
                      e.target.value === ""
                        ? undefined
                        : Number(e.target.value),
                  })
                }
              />
            </label>
          </>
        )}
        <label>
          Photo URL
          <input
            type="url"
            placeholder="https://…"
            value={p.photoUrl ?? ""}
            onChange={(e) => set({ ...p, photoUrl: e.target.value })}
          />
        </label>
        <label>
          Opening hours / booking status
          <input
            value={p.opening ?? ""}
            onChange={(e) => set({ ...p, opening: e.target.value })}
          />
        </label>
        <label>
          Notes
          <textarea
            value={p.notes}
            onChange={(e) => set({ ...p, notes: e.target.value })}
          />
        </label>
        <label>
          Source
          <input
            required
            value={p.source}
            onChange={(e) => set({ ...p, source: e.target.value })}
          />
        </label>
        <div className="row">
          <button className="primary">Save place</button>
          {place && remove && (
            <button
              type="button"
              className="danger"
              onClick={() => {
                if (confirm("Delete this place and its itinerary stops?")) {
                  remove(p.id);
                  close();
                }
              }}
            >
              Delete place
            </button>
          )}
        </div>
      </form>
    </Modal>
  );
}
export function ObservationForm({
  value,
  kind,
  save,
  close,
}: {
  value?: Observation;
  kind: "flight" | "hotel";
  save: (o: Observation) => void;
  close: () => void;
}) {
  const [o, set] = useState<Observation>(
    value ?? {
      id: uid(),
      itemId: "",
      name: "",
      kind,
      amount: 0,
      currency: kind === "hotel" ? "JPY" : "USD",
      at: new Date().toISOString(),
      source: "Manual entry",
      basis: "",
      notes: "",
    },
  );
  return (
    <Modal title="Record price observation" close={close}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          save({ ...o, itemId: o.itemId || o.name });
          close();
        }}
      >
        <label>
          Airline / property
          <input
            required
            value={o.name}
            onChange={(e) => set({ ...o, name: e.target.value })}
          />
        </label>
        <div className="form-grid">
          <label>
            Amount
            <input
              required
              type="number"
              min="0"
              step="0.01"
              value={o.amount}
              onChange={(e) => set({ ...o, amount: Number(e.target.value) })}
            />
          </label>
          <label>
            Currency
            <select
              value={o.currency}
              onChange={(e) =>
                set({ ...o, currency: e.target.value as Currency })
              }
            >
              {["JPY", "TWD", "USD"].map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </label>
        </div>
        <label>
          Observed date
          <input
            type="date"
            required
            value={o.at.slice(0, 10)}
            onChange={(e) => set({ ...o, at: e.target.value + "T12:00:00Z" })}
          />
        </label>
        <label>
          Comparison basis (dates, guests, baggage / room, taxes, refundability)
          <textarea
            required
            value={o.basis}
            onChange={(e) => set({ ...o, basis: e.target.value })}
          />
        </label>
        <label>
          Source
          <input
            required
            value={o.source}
            onChange={(e) => set({ ...o, source: e.target.value })}
          />
        </label>
        <label>
          Booking URL
          <input
            type="url"
            value={o.url ?? ""}
            onChange={(e) => set({ ...o, url: e.target.value })}
          />
        </label>
        <label>
          Schedule, luggage, and other notes
          <textarea
            value={o.notes}
            onChange={(e) => set({ ...o, notes: e.target.value })}
          />
        </label>
        <button className="primary">Save observation</button>
      </form>
    </Modal>
  );
}
