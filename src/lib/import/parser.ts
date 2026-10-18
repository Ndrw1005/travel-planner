import { uid, type Trip } from "../model";
import {
  emptyDetails,
  type Draft,
  type ExtractedDocument,
  type ResearchDetails,
} from "./types";
export const normalize = (s: string) =>
  s
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]/gu, "");
export async function digest(data: string | ArrayBuffer) {
  const bytes =
    typeof data === "string" ? new TextEncoder().encode(data) : data;
  return Array.from(
    new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)),
  )
    .map((n) => n.toString(16).padStart(2, "0"))
    .join("");
}
const airlines =
  /\b(Jetstar(?: Japan| Asia)?|Peach(?: Aviation)?|AirAsia(?: X)?|EVA Air|China Airlines|Tigerair Taiwan|Starlux(?: Airlines)?|ANA|All Nippon Airways|Japan Airlines|JAL|Cathay Pacific|Scoot|Hong Kong Express|HK Express|Korean Air|Asiana(?: Airlines)?|United(?: Airlines)?|Delta(?: Air Lines)?|Singapore Airlines)\b/i;
const hotelTitle = /(?:APA\s*(?:Hotel|HOTEL|ホテル)|アパホテル)[^\n]*/i;
const moneyPattern =
  /(US\$|NT\$|TWD|USD|JPY|JP¥|[¥￥$])\s*([0-9][0-9,]*(?:\.[0-9]{1,2})?)|([0-9][0-9,]*(?:\.[0-9]{1,2})?)\s*(USD|TWD|JPY|円)(?=$|\s|[,.])/gi;
export function prices(line: string) {
  return [...line.matchAll(moneyPattern)].map((m) => {
    const symbol = m[1] || m[4],
      amount = (m[2] || m[3]).replaceAll(",", "");
    return {
      amount,
      currency: /USD|US\$/.test(symbol)
        ? ("USD" as const)
        : /TWD|NT\$/.test(symbol)
          ? ("TWD" as const)
          : /JPY|JP¥|[¥￥円]/.test(symbol)
            ? ("JPY" as const)
            : ("" as const),
    };
  });
}
const labeled = (text: string, label: string) =>
  text
    .match(
      new RegExp(`(?:^|\\n)\\s*(?:${label})\\s*[:：]\\s*([^\\n]+)`, "i"),
    )?.[1]
    ?.trim() ?? "";
function context(text: string): Partial<ResearchDetails> {
  const iso = [...text.matchAll(/\b(20\d{2}-\d{2}-\d{2})\b/g)].map((m) => m[1]);
  const route = text.match(/\b([A-Z]{3})\s*(?:→|->|–|to|↔)\s*([A-Z]{3})\b/);
  return {
    origin: labeled(text, "Origin|From|Departure airport") || route?.[1] || "",
    destination:
      labeled(text, "Destination|To|Arrival airport") || route?.[2] || "",
    start:
      labeled(text, "Departure date|Check-in|Outbound date") ||
      (iso.length === 2 ? iso[0] : ""),
    end:
      labeled(text, "Return date|Check-out") ||
      (iso.length === 2 ? iso[1] : ""),
    passengers:
      labeled(text, "Passengers|Guests|Adults") ||
      text.match(/\b(\d+)\s*(?:adults?|passengers?|guests?)\b/i)?.[1] ||
      "",
    priceScope: /round[ -]?trip|roundtrip|往復/i.test(text)
      ? "round-trip (party basis unknown)"
      : "unknown",
    cabin:
      labeled(text, "Cabin") ||
      text.match(/\b(Premium economy|Economy|Business|First class)\b/i)?.[1] ||
      "",
  };
}
function details(
  block: string,
  head: Partial<ResearchDetails>,
  kind: "flight" | "hotel",
): ResearchDetails {
  const times = [
    ...block.matchAll(/\b\d{1,2}:\d{2}\s*(?:AM|PM)?(?:\s*\+\d)?/gi),
  ].map((m) => m[0]);
  const d = { ...emptyDetails(), ...head };
  if (kind === "flight")
    Object.assign(d, {
      flightNumber: labeled(block, "Flight number|Flight"),
      departure:
        labeled(block, "Departure time|Outbound departure") || times[0] || "",
      arrival:
        labeled(block, "Arrival time|Outbound arrival") || times[1] || "",
      returnSchedule: labeled(block, "Return flight|Return schedule"),
      stops:
        block.match(/\b(?:nonstop|non-stop|direct|\d+ stops?)\b/i)?.[0] || "",
      duration:
        block.match(
          /\b\d+\s*h(?:r|ours?)?\s*(?:\d+\s*m(?:in(?:utes?)?)?)?\b/i,
        )?.[0] || "",
      baggage: labeled(block, "Baggage|Luggage|Carry-on|Checked baggage"),
      priceScope: /round[ -]?trip|roundtrip|往復/i.test(block)
        ? "round-trip (party basis unknown)"
        : head.priceScope || "unknown",
    });
  else
    Object.assign(d, {
      propertyId:
        labeled(block, "Property ID|Hotel ID|Hotel No\\.?") ||
        block.match(/\bNo\.\s*(\d+)\b/i)?.[1] ||
        "",
      location: labeled(block, "Location|Area|Address"),
      room: labeled(block, "Room(?: type)?"),
      beds: labeled(block, "Beds?|Bed arrangement"),
      proximity: block
        .split("\n")
        .filter((l) =>
          /\b(?:min(?:ute)?s?|walk)\b.*\bstation\b|\bstation\b.*\b(?:walk|min)|駅.*徒歩|徒歩.*駅/i.test(
            l,
          ),
        )
        .join("; "),
      amenities: labeled(block, "Amenities|Facilities"),
      availability: labeled(block, "Availability"),
      priceScope: /total (?:stay|price)|stay total|合計/i.test(block)
        ? "stay total"
        : /per night|nightly|1泊/i.test(block)
          ? "per night"
          : "unknown",
    });
  d.taxes = labeled(block, "Taxes|Fees");
  d.cancellation = labeled(block, "Cancellation|Refund");
  d.notes = labeled(block, "Description");
  return d;
}
const promotional = (s: string) =>
  /cheapest\s*(?:from|flights?)|prices?\s*from|price graph|date grid|explore destinations|different dates|alternate dates|other dates|cheaper dates|lowest (?:price|fare)|price insights/i.test(
    s,
  );
export function parseDocument(
  doc: ExtractedDocument,
  trip: Trip,
  force: "auto" | "flight" | "hotel" = "auto",
): Draft[] {
  const out: Draft[] = [];
  // Never join pages or columns into a single price block without a repeated heading.
  for (const page of doc.pages) {
    const lines = page.text
      .replace(/\r/g, "")
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
    // Side-by-side listing columns can interleave their rows; do not guess ownership.
    if (
      lines.some(
        (line) =>
          (line.match(/APA\s*(?:Hotel|ホテル)|アパホテル/gi) ?? []).length > 1,
      )
    )
      continue;
    const heads: { i: number; kind: "flight" | "hotel"; name: string }[] = [];
    lines.forEach((line, i) => {
      const h = line.match(hotelTitle);
      const a = line.match(airlines);
      const explicit = line.match(/^(?:Airline|Hotel(?: name)?)\s*:\s*(.+)$/i);
      if (h && force !== "flight")
        heads.push({
          i,
          kind: "hotel",
          name: h[0].split(/\s+(?:Room\s*:|Total\s*:|JPY\s|[¥￥])/i)[0].trim(),
        });
      else if (
        a &&
        force !== "hotel" &&
        !promotional(line) &&
        !/^https?:/i.test(line)
      )
        heads.push({ i, kind: "flight", name: a[0] });
      else if (explicit)
        heads.push({
          i,
          kind: /^Airline/i.test(line) ? "flight" : "hotel",
          name: explicit[1],
        });
    });
    for (let hi = 0; hi < heads.length; hi++) {
      const h = heads[hi];
      if (h.kind !== "flight") continue;
      const lower = hi ? heads[hi - 1].i + 1 : 0;
      for (let j = h.i - 1; j >= Math.max(lower, h.i - 3); j--) {
        if (
          (lines[j].match(/\b\d{1,2}:\d{2}\s*(?:AM|PM)?/gi) || []).length >= 2
        ) {
          h.i = j;
          break;
        }
      }
    }
    const currencyHint = lines
      .find((l) => /^Currency\s*:\s*(USD|JPY|TWD)\s*$/i.test(l))
      ?.match(/(USD|JPY|TWD)\s*$/i)?.[1]
      .toUpperCase() as Draft["currency"] | undefined;
    const occurrences = new Map<string, number>();
    const header = context(
      lines
        .slice(0, heads[0]?.i ?? lines.length)
        .filter((l) => !promotional(l) && !/^https?:/i.test(l))
        .join("\n"),
    );
    heads.forEach((h, index) => {
      const blockLines = lines.slice(h.i, heads[index + 1]?.i ?? lines.length);
      const block = blockLines.filter((l) => !promotional(l)).join("\n");
      const base = details(block, header, h.kind);
      let room = base.room;
      let roomStart = 0;
      blockLines.forEach((line, li) => {
        if (
          /^Room(?: type)?\s*[:：]/i.test(line) ||
          /^(?:Single|Double|Twin|Deluxe|Superior|Standard|Queen|King|Semi-double)\b.*\broom\b/i.test(
            line,
          )
        ) {
          room = line.replace(/^Room(?: type)?\s*[:：]\s*/i, "");
          roomStart = li;
        }
        if (
          promotional(line) ||
          /\b(?:saving|save|discount|tax|fee|baggage|carry-on)\b/i.test(line)
        )
          return;
        const values = prices(line);
        for (let pi = 0; pi < values.length; pi++) {
          const price: { amount: string; currency: Draft["currency"] } = {
            ...values[pi],
            currency: values[pi].currency || currencyHint || "",
          };
          const d = { ...base, room: h.kind === "hotel" ? room : "" };
          // A flight-specific date range must never inherit the selected search dates.
          const ownDates = [...block.matchAll(/\b20\d{2}-\d{2}-\d{2}\b/g)].map(
            (m) => m[0],
          );
          if (ownDates.length === 2) {
            d.start = ownDates[0];
            d.end = ownDates[1];
          } else if (ownDates.length > 0) {
            d.start = "";
            d.end = "";
          }
          if (h.kind === "hotel") {
            const nextRoom = blockLines.findIndex(
              (l, j) =>
                j > roomStart &&
                (/^Room(?: type)?\s*[:：]/i.test(l) ||
                  /^(?:Single|Double|Twin|Deluxe|Superior|Standard|Queen|King|Semi-double)\b.*\broom\b/i.test(
                    l,
                  )),
            );
            const scopeLines = blockLines
              .slice(roomStart, nextRoom < 0 ? blockLines.length : nextRoom)
              .join("\n");
            d.taxes = labeled(scopeLines, "Taxes|Fees");
            d.cancellation = labeled(scopeLines, "Cancellation|Refund");
            d.availability = labeled(scopeLines, "Availability");
            d.priceScope = /total (?:stay|price)|stay total|合計/i.test(
              scopeLines,
            )
              ? "stay total"
              : /per night|nightly|1泊/i.test(scopeLines)
                ? "per night"
                : "unknown";
            d.beds = labeled(scopeLines, "Beds?|Bed arrangement");
            if (
              scopeLines.split("\n").reduce((n, l) => n + prices(l).length, 0) >
              1
            ) {
              d.taxes = "";
              d.cancellation = "";
              d.availability = "";
            }
          }
          const warnings = [
            "Check this price against the source before saving.",
          ];
          if (!d.start || !d.end) {
            d.start ||= trip.start;
            d.end ||= trip.end;
            warnings.push(
              "Trip dates are prefilled suggestions; confirm they apply to this offer.",
            );
          }
          if (!d.passengers) {
            d.passengers = String(trip.travelers.length);
            warnings.push(
              "Traveler count is prefilled from your trip, not established by the source.",
            );
          }
          if (!price.currency)
            warnings.push(
              "The $ symbol does not establish a currency. Choose one.",
            );
          if (d.priceScope === "unknown")
            warnings.push(
              "Price basis unknown: do not assume round-trip or whole-stay total.",
            );
          if (h.kind === "flight" && !d.baggage)
            warnings.push(
              "Baggage not established; return-flight schedule must not be inferred from outbound results.",
            );
          if (h.kind === "hotel" && (!d.room || !d.taxes || !d.cancellation))
            warnings.push(
              "Room, taxes or refund terms are missing; comparison stays uncertain unless completed.",
            );
          if (values.length > 1)
            warnings.push(
              "Multiple amounts on this line. Verify which amount is the payable price.",
            );
          if (page.method === "ocr")
            warnings.push(
              `OCR text${page.confidence === undefined ? "" : ` (${Math.round(page.confidence)}% recognition score)`}; visually check names, digits and layout.`,
            );
          const identity = [
            normalize(h.name),
            normalize(d.room),
            normalize(d.departure),
            normalize(d.arrival),
          ].join(":");
          const occurrence = occurrences.get(identity) ?? 0;
          occurrences.set(identity, occurrence + 1);
          out.push({
            id: uid(),
            kind: h.kind,
            name: h.name,
            amount: price.amount,
            currency: price.currency,
            details: d,
            source: {
              name: doc.name,
              hash: doc.hash,
              page: page.page,
              method: page.method,
              capturedAt: doc.capturedAt,
              dateOrigin: doc.dateOrigin,
              excerpt: block.slice(0, 8000),
            },
            fingerprint: `${doc.hash}:${page.page}:${identity}:${occurrence}`,
            warnings,
            selected: false,
            action: "new",
            matchId: "",
            reviewed: false,
            contextConfirmed: false,
          });
        }
      });
    });
  }
  return out;
}
export function blankDraft(
  trip: Trip,
  kind: "flight" | "hotel" = "flight",
): Draft {
  const id = uid();
  return {
    id,
    kind,
    name: "",
    amount: "",
    currency: "",
    details: {
      ...emptyDetails(),
      start: trip.start,
      end: trip.end,
      passengers: String(trip.travelers.length),
    },
    source: {
      name: "Manual research",
      hash: id,
      page: 1,
      method: "manual",
      capturedAt: new Date().toISOString().slice(0, 10),
      dateOrigin: "Entered manually",
      excerpt: "",
    },
    fingerprint: id,
    warnings: [
      "Complete the details from your source. Trip dates and guests are suggestions.",
    ],
    selected: false,
    action: "new",
    matchId: "",
    reviewed: false,
    contextConfirmed: false,
  };
}
