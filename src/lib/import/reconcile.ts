import { uid, type Trip, type Observation, type Place } from "../model";
import { normalize } from "./parser";
import {
  emptyDetails,
  type Draft,
  type ResearchDetails,
  type ResearchRecord,
} from "./types";
const val = (v: string) => v.trim().toLowerCase().replace(/\s+/g, " ");
export function comparable(d: Draft) {
  const x = d.details;
  const common =
    d.contextConfirmed &&
    Boolean(
      x.start &&
      x.end &&
      x.passengers &&
      x.taxes &&
      x.cancellation &&
      !/(?:unknown|unverified|not stated|unconfirmed)/i.test(
        [x.taxes, x.cancellation, x.priceScope].join(" "),
      ),
    );
  return (
    common &&
    (d.kind === "hotel"
      ? Boolean(
          x.room &&
          x.beds &&
          !/(?:unknown|unverified)/i.test(x.room + " " + x.beds),
        )
      : Boolean(
          x.origin &&
          x.destination &&
          x.departure &&
          x.arrival &&
          x.cabin &&
          x.baggage &&
          x.returnSchedule &&
          ["round-trip per person", "round-trip party total"].includes(
            x.priceScope,
          ) &&
          !/(?:unknown|unverified|not stated)/i.test(
            x.baggage + " " + x.returnSchedule,
          ),
        ))
  );
}
export function comparisonBasis(d: Draft) {
  const x = d.details;
  const common = [
    x.start,
    x.end,
    x.passengers,
    x.priceScope,
    x.taxes,
    x.cancellation,
  ];
  const specifics =
    d.kind === "hotel"
      ? [x.room, x.beds, x.amenities]
      : [
          x.origin,
          x.destination,
          x.cabin,
          x.flightNumber,
          x.departure,
          x.arrival,
          x.returnSchedule,
          x.stops,
          x.baggage,
        ];
  const basis = JSON.stringify([...common, ...specifics].map(val));
  return comparable(d)
    ? `Confirmed research basis: ${basis}`
    : `Uncertain research basis (${d.fingerprint}): ${basis}`;
}
export function itineraryKey(name: string, x: ResearchDetails) {
  if (
    !x.origin ||
    !x.destination ||
    !x.start ||
    !x.end ||
    !x.departure ||
    !x.arrival ||
    !x.cabin
  )
    return "";
  return JSON.stringify(
    [
      name,
      x.origin,
      x.destination,
      x.start,
      x.end,
      x.departure,
      x.arrival,
      x.cabin,
      x.flightNumber,
      x.stops,
    ].map(val),
  );
}
export function matches(
  d: Draft,
  trip: Trip,
): { id: string; name: string; reason: string }[] {
  if (d.kind === "hotel")
    return trip.places
      .filter(
        (p) =>
          p.kind === "hotel" &&
          !p.demo &&
          ((d.details.propertyId && p.propertyId === d.details.propertyId) ||
            normalize(p.name) === normalize(d.name)),
      )
      .map((p) => ({
        id: p.id,
        name: p.name,
        reason:
          p.propertyId && p.propertyId === d.details.propertyId
            ? "Same property identifier"
            : "Exact normalized name — verify property",
      }));
  const key = itineraryKey(d.name, d.details);
  if (!key) return [];
  const found = trip.observations.filter(
    (o) =>
      o.kind === "flight" &&
      o.research &&
      itineraryKey(o.name, o.research.details) === key,
  );
  return [
    ...new Map(
      found.map((o) => [
        o.itemId,
        {
          id: o.itemId,
          name: o.name,
          reason: "Matching recorded outbound itinerary and trip dates",
        },
      ]),
    ).values(),
  ];
}
export function suggestMatches(d: Draft, trip: Trip) {
  const found = matches(d, trip);
  return found.length === 1
    ? { ...d, matchId: found[0].id, action: "observation" as const }
    : d;
}
export function validation(d: Draft, trip: Trip) {
  if (!d.selected || d.action === "skip") return [];
  const errors: string[] = [];
  if (!d.reviewed) errors.push("Review and confirm this entry.");
  if (!d.name.trim()) errors.push("Name is required.");
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(d.source.capturedAt) ||
    !Number.isFinite(Date.parse(d.source.capturedAt))
  )
    errors.push("Enter a valid capture date.");
  if (
    d.action !== "update" &&
    (!d.amount.trim() ||
      !Number.isFinite(Number(d.amount)) ||
      Number(d.amount) <= 0)
  )
    errors.push("Enter a positive price.");
  if (d.action !== "update" && !["USD", "JPY", "TWD"].includes(d.currency))
    errors.push("Choose a supported currency.");
  if (d.action === "update" && d.kind !== "hotel")
    errors.push(
      "Flight details are stored per observation; add a new observation instead.",
    );
  if (d.action === "observation" || d.action === "update") {
    const exists =
      d.kind === "hotel"
        ? trip.places.some((p) => p.id === d.matchId && p.kind === "hotel")
        : trip.observations.some(
            (o) => o.itemId === d.matchId && o.kind === "flight",
          );
    if (!exists) errors.push("Choose an existing candidate.");
  }
  if (
    d.contextConfirmed &&
    (!d.details.start ||
      !d.details.end ||
      d.details.end < d.details.start ||
      !/^\d+$/.test(d.details.passengers) ||
      Number(d.details.passengers) < 1)
  )
    errors.push("Confirmed dates and guest count must be valid.");
  return errors;
}
function record(d: Draft): ResearchRecord {
  return {
    details: { ...d.details },
    source: { ...d.source },
    fingerprint: d.fingerprint,
    comparable: comparable(d),
  };
}
export function applyDrafts(
  trip: Trip,
  drafts: Draft[],
  options: { replaceFlights?: boolean } = {},
) {
  const replaceFlights =
    options.replaceFlights &&
    drafts.some(
      (d) => d.kind === "flight" && d.selected && d.action !== "skip",
    );
  if (replaceFlights) {
    // Validate the replacement before removing anything from the cloned trip.
    const problems = drafts.flatMap((d) =>
      validation(d, trip).map((e) => `${d.name || "Entry"}: ${e}`),
    );
    if (problems.length) throw new Error(problems.join("\n"));
    const fingerprints = new Set(
      trip.observations
        .filter((o) => o.kind === "flight")
        .map((o) => o.research?.fingerprint),
    );
    drafts
      .filter((d) => d.kind === "flight")
      .forEach((d) => fingerprints.add(d.fingerprint));
    trip = {
      ...trip,
      observations: trip.observations.filter((o) => o.kind !== "flight"),
      researchReceipts: trip.researchReceipts?.filter(
        (f) => !fingerprints.has(f),
      ),
    };
    drafts = drafts.map((d) =>
      d.kind === "flight"
        ? { ...d, action: d.action === "skip" ? "skip" : "new", matchId: "" }
        : d,
    );
  }
  let next = structuredClone(trip);
  let added = 0,
    updated = 0,
    duplicates = 0;
  const errors = drafts.flatMap((d) =>
    validation(d, trip).map((e) => `${d.name || "Entry"}: ${e}`),
  );
  if (errors.length) throw new Error(errors.join("\n"));
  for (const d of drafts) {
    if (!d.selected || d.action === "skip") continue;
    const known =
      next.observations.some(
        (o) => o.research?.fingerprint === d.fingerprint,
      ) || next.researchReceipts?.includes(d.fingerprint);
    if (known) {
      duplicates++;
      continue;
    }
    let itemId = d.matchId;
    const x = d.details;
    if (d.action === "new") {
      itemId = uid();
      if (d.kind === "hotel") {
        next.places.push({
          id: itemId,
          name: d.name,
          kind: "hotel",
          address: x.location,
          notes: [x.notes, x.proximity, x.availability]
            .filter(Boolean)
            .join("\n"),
          source: `Imported research · ${d.source.name} · page ${d.source.page}`,
          priority: "Interested",
          minutes: 0,
          cost: 0,
          room: x.room,
          amenities: x.amenities,
          cancellation: x.cancellation,
          propertyId: x.propertyId,
          votes: [],
        });
      }
    }
    if (d.action === "update") {
      next.places = next.places.map((p) =>
        p.id === itemId
          ? {
              ...p,
              name: d.name,
              address: x.location || p.address,
              room: x.room || p.room,
              amenities: x.amenities || p.amenities,
              cancellation: x.cancellation || p.cancellation,
              propertyId: x.propertyId || p.propertyId,
              notes: [p.notes, x.notes, x.proximity, x.availability]
                .filter(Boolean)
                .join("\n"),
            }
          : p,
      );
      updated++;
    } else {
      const obs: Observation = {
        id: uid(),
        itemId,
        name: d.name,
        kind: d.kind,
        amount: Number(d.amount),
        currency: d.currency as Observation["currency"],
        at: d.source.capturedAt,
        source: `Manually imported · ${d.source.name} · page ${d.source.page}`,
        basis: comparisonBasis(d),
        notes: [
          x.departure && `Outbound ${x.departure} → ${x.arrival || "unknown"}`,
          x.returnSchedule && `Return: ${x.returnSchedule}`,
          x.duration,
          x.stops,
          x.room,
          x.beds,
          x.baggage
            ? `Baggage: ${x.baggage}`
            : d.kind === "flight"
              ? "Baggage unverified"
              : "",
          x.notes,
          !comparable(d)
            ? "Comparison uncertain. Imported observation is not current availability."
            : "Confirmed comparison basis; availability still requires rechecking.",
        ]
          .filter(Boolean)
          .join(" · "),
        research: record(d),
      };
      next.observations.push(obs);
      added++;
      // Only an explicit new candidate can receive a confirmed JPY stay estimate automatically.
      if (
        d.action === "new" &&
        d.kind === "hotel" &&
        d.currency === "JPY" &&
        d.contextConfirmed &&
        x.priceScope === "stay total" &&
        x.start === trip.start &&
        x.end === trip.end &&
        Number(x.passengers) === trip.travelers.length
      ) {
        next.places = next.places.map((p) =>
          p.id === itemId ? { ...p, cost: Number(d.amount) } : p,
        );
      }
    }
    next.researchReceipts = [...(next.researchReceipts ?? []), d.fingerprint];
  }
  return { trip: next, added, updated, duplicates };
}
export function exportResearch(trip: Trip) {
  return {
    format: "wayfarer-research",
    version: 1,
    exportedAt: new Date().toISOString(),
    trip: { name: trip.name, start: trip.start, end: trip.end },
    places: trip.places.filter(
      (p) => p.kind === "hotel" || p.kind === "attraction",
    ),
    observations: trip.observations,
    receipts: trip.researchReceipts ?? [],
  };
}
export function validateResearchBackup(data: unknown): {
  places: Place[];
  observations: Observation[];
  receipts: string[];
} {
  const d = data as ReturnType<typeof exportResearch>;
  if (
    !d ||
    d.format !== "wayfarer-research" ||
    d.version !== 1 ||
    !Array.isArray(d.places) ||
    !Array.isArray(d.observations) ||
    d.places.length > 2000 ||
    d.observations.length > 20000
  )
    throw new Error("Use a Wayfarer research JSON export (version 1).");
  for (const p of d.places)
    if (
      !p ||
      typeof p.id !== "string" ||
      typeof p.name !== "string" ||
      !["hotel", "attraction"].includes(p.kind) ||
      !Array.isArray(p.votes) ||
      typeof p.notes !== "string" ||
      typeof p.address !== "string" ||
      typeof p.source !== "string" ||
      ((p.lat !== undefined || p.lng !== undefined) &&
        (!Number.isFinite(p.lat) ||
          !Number.isFinite(p.lng) ||
          Math.abs(p.lat!) > 90 ||
          Math.abs(p.lng!) > 180)) ||
      !Number.isFinite(p.cost)
    )
      throw new Error("Invalid place record in backup.");
  for (const o of d.observations) {
    if (
      !o ||
      typeof o.id !== "string" ||
      typeof o.itemId !== "string" ||
      typeof o.name !== "string" ||
      !["flight", "hotel"].includes(o.kind) ||
      !Number.isFinite(o.amount) ||
      o.amount < 0 ||
      !["USD", "JPY", "TWD"].includes(o.currency) ||
      typeof o.at !== "string" ||
      !Number.isFinite(Date.parse(o.at)) ||
      typeof o.basis !== "string" ||
      typeof o.source !== "string" ||
      typeof o.notes !== "string"
    )
      throw new Error("Invalid observation in backup.");
    if (
      o.research &&
      (!o.research.details ||
        typeof o.research.fingerprint !== "string" ||
        !o.research.source ||
        Object.keys(emptyDetails()).some(
          (k) =>
            typeof o.research!.details[k as keyof ResearchDetails] !== "string",
        ))
    )
      throw new Error("Invalid research metadata.");
  }
  return {
    places: d.places,
    observations: d.observations,
    receipts: Array.isArray(d.receipts)
      ? d.receipts.filter((r) => typeof r === "string")
      : [],
  };
}
export function mergeResearch(trip: Trip, input: unknown) {
  const data = validateResearchBackup(input);
  const next = structuredClone(trip);
  const ids = new Map<string, string>();
  let added = 0,
    duplicates = 0;
  for (const p of data.places) {
    const match = next.places.find(
      (x) =>
        x.kind === p.kind &&
        ((x.propertyId && x.propertyId === p.propertyId) ||
          normalize(x.name) === normalize(p.name)),
    );
    if (match) {
      ids.set(p.id, match.id);
      if (
        match.lat === undefined &&
        match.lng === undefined &&
        p.lat !== undefined &&
        p.lng !== undefined
      ) {
        match.lat = p.lat;
        match.lng = p.lng;
        match.coordinateStatus = p.coordinateStatus;
        match.locationEvidence = p.locationEvidence;
        match.demo = p.demo;
      }
    } else {
      const id = uid();
      ids.set(p.id, id);
      next.places.push({
        ...p,
        id,
        placeId: undefined,
        source: p.source + " · transferred",
      });
    }
  }
  for (const o of data.observations) {
    if (
      next.observations.some(
        (x) =>
          x.id === o.id ||
          (o.research && x.research?.fingerprint === o.research.fingerprint),
      )
    ) {
      duplicates++;
      continue;
    }
    let itemId = ids.get(o.itemId);
    if (!itemId) {
      const match =
        o.kind === "flight" && o.research
          ? next.observations.find(
              (x) =>
                x.kind === "flight" &&
                x.research &&
                itineraryKey(x.name, x.research.details) &&
                itineraryKey(x.name, x.research.details) ===
                  itineraryKey(o.name, o.research!.details),
            )
          : undefined;
      itemId = match?.itemId ?? o.itemId;
    }
    next.observations.push({ ...o, itemId });
    added++;
  }
  next.researchReceipts = [
    ...new Set([...(next.researchReceipts ?? []), ...data.receipts]),
  ];
  return { trip: next, added, duplicates };
}
