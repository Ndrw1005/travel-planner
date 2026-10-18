import type { ResearchRecord } from "./import/types";
export type Currency = "JPY" | "TWD" | "USD";
export type Kind =
  "airport" | "hotel" | "attraction" | "restaurant" | "station";
export interface Place {
  id: string;
  name: string;
  kind: Kind;
  lat?: number;
  lng?: number;
  placeId?: string;
  address: string;
  notes: string;
  source: string;
  demo?: boolean;
  priority: "Must visit" | "Interested" | "Optional";
  minutes: number;
  cost: number;
  rating?: number;
  photoUrl?: string;
  photoKey?: string;
  researchKey?: string;
  researchKeys?: string[];
  researchData?: Record<string, string>;
  coordinateStatus?: string;
  locationEvidence?: import("./import/coordinates").LocationEvidence;
  locationReview?: {
    reason: string;
    evidence?: import("./import/coordinates").LocationEvidence;
  }[];
  mapQuery?: string;
  officialUrl?: string;
  closureWarning?: string;
  ratingScale?: number;
  ratingProvider?: string;
  propertyId?: string;
  room?: string;
  amenities?: string;
  cancellation?: string;
  opening?: string;
  votes: string[];
}
export interface Observation {
  researchKey?: string;
  flightDirection?: "outbound" | "return" | "round-trip";
  id: string;
  itemId: string;
  name: string;
  kind: "flight" | "hotel";
  amount: number;
  currency: Currency;
  at: string;
  source: string;
  basis: string;
  notes: string;
  url?: string;
  research?: ResearchRecord;
}
export interface Stop {
  id: string;
  placeId: string;
  time: string;
  duration: number;
}
export interface Expense {
  id: string;
  name: string;
  category: string;
  amount: number;
  currency: Currency;
  actual: boolean;
  cash: boolean;
  paidBy: string;
}
export interface Watch {
  id: string;
  kind: "flight" | "hotel";
  query: string;
  origin: string;
  destination: string;
  target: number;
  currency: Currency;
  enabled: boolean;
  hours: number;
  dropAmount?: number;
  dropPercent?: number;
  newLow?: boolean;
}
export interface Trip {
  datasetImports?: {
    id: string;
    at: string;
    name: string;
    added: number;
    matched: number;
    skipped: number;
    needingConfirmation: number;
    issues: string[];
  }[];
  researchReceipts?: string[];
  id: string;
  name: string;
  origin: string;
  destination: string;
  start: string;
  end: string;
  travelers: string[];
  currency: Currency;
  timezone: string;
  archived: boolean;
  places: Place[];
  observations: Observation[];
  itinerary: Record<string, Stop[]>;
  expenses: Expense[];
  packing: { id: string; name: string; traveler: string; done: boolean }[];
  bookings: {
    id: string;
    name: string;
    reference: string;
    url: string;
    deadline: string;
    notes: string;
  }[];
  watches: Watch[];
  baseId?: string;
  airportId?: string;
  cards: boolean;
  margin: number;
  rates: Record<Currency, number>;
  ratesAt: string;
  notes: string;
}
export const uid = (): string => crypto.randomUUID();
export const money = (n: number, c: string) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: c,
    maximumFractionDigits: c === "JPY" ? 0 : 2,
  }).format(n);
export function dates(start: string, end: string) {
  const out: string[] = [];
  const a = new Date(start + "T12:00:00Z"),
    b = new Date(end + "T12:00:00Z");
  while (a <= b && out.length < 90) {
    out.push(a.toISOString().slice(0, 10));
    a.setUTCDate(a.getUTCDate() + 1);
  }
  return out;
}
export function stats(obs: Observation[]) {
  const sorted = [...obs].sort((a, b) => a.at.localeCompare(b.at));
  if (!sorted.length) return null;
  const values = sorted.map((o) => o.amount),
    first = values[0],
    latest = values.at(-1)!;
  return {
    min: Math.min(...values),
    max: Math.max(...values),
    latest,
    change: latest - first,
    percent: first ? ((latest - first) / first) * 100 : 0,
  };
}
export function cashNeed(
  expenses: Expense[],
  rates: Record<Currency, number>,
  cards: boolean,
  margin: number,
) {
  return (
    expenses
      .filter((e) => !e.actual && (!cards || e.cash))
      .reduce((s, e) => s + e.amount * rates[e.currency], 0) *
    (1 + margin / 100)
  );
}
export function scoreHotel(
  price: number | undefined,
  minutes: number | undefined,
  rating: number | undefined,
  weights: number[],
) {
  const vals = [
    price === undefined ? undefined : Math.max(0, 100 - price / 2000),
    minutes === undefined ? undefined : Math.max(0, 100 - minutes),
    rating === undefined ? undefined : rating * 20,
  ];
  const denominator = vals.reduce<number>(
    (s, v, i) => s + (v === undefined ? 0 : weights[i]),
    0,
  );
  return {
    score: denominator
      ? Math.round(
          vals.reduce<number>((s, v, i) => s + (v ?? 0) * weights[i], 0) /
            denominator,
        )
      : null,
    coverage: vals.filter((v) => v !== undefined).length,
    vals,
  };
}
export function moveStop(stops: Stop[], from: number, to: number) {
  const copy = [...stops];
  const [item] = copy.splice(from, 1);
  if (item) copy.splice(to, 0, item);
  return copy;
}
export function conflict(stops: Stop[]) {
  return stops.map((s, i) => {
    if (!i) return "";
    const prev = stops[i - 1];
    const mins = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3));
    return mins(s.time) < mins(prev.time) + prev.duration + 15
      ? "Overlap or less than 15 min travel buffer"
      : "";
  });
}
export function safeUrl(url: string) {
  try {
    const u = new URL(url);
    return ["https:", "http:"].includes(u.protocol) ? u.href : undefined;
  } catch {
    return undefined;
  }
}
export function exportFile(
  name: string,
  data: string,
  type = "application/json",
) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([data], { type }));
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

/** Interpret an itinerary wall-clock time in its destination, never the browser's zone. */
export function localToUtc(local: string, timezone: string): string {
  const target = Date.parse(local + "Z");
  if (!Number.isFinite(target))
    throw new Error("Enter a valid departure time.");
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  let time = target;
  for (let i = 0; i < 4; i++) {
    const parts = Object.fromEntries(
      fmt.formatToParts(new Date(time)).map((p) => [p.type, p.value]),
    );
    const wall = Date.parse(
      `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}Z`,
    );
    const delta = target - wall;
    if (delta === 0) return new Date(time).toISOString();
    time += delta;
  }
  throw new Error(
    "This local time does not exist because of a daylight-saving transition. Choose another time.",
  );
}
