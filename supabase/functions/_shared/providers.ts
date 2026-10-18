export interface PriceQuery {
  kind: "flight" | "hotel";
  query: string;
  origin: string;
  destination: string;
  currency: string;
  start: string;
  end: string;
  adults: number;
}
export interface Quote {
  name: string;
  amount: number;
  key: string;
  url?: string;
  notes: string;
}
export interface PriceProvider {
  search(q: PriceQuery): Promise<Quote[]>;
}
// Server-only adapter. No credentials or raw response are returned to the client.
export class SerpApiProvider implements PriceProvider {
  async search(q: PriceQuery): Promise<Quote[]> {
    const key = Deno.env.get("SERPAPI_KEY");
    if (!key)
      throw new Error("Live pricing inactive: SERPAPI_KEY is not configured.");
    const params = new URLSearchParams({
      api_key: key,
      engine: q.kind === "flight" ? "google_flights" : "google_hotels",
      currency: q.currency,
      adults: String(q.adults),
      hl: "en",
    });
    if (q.kind === "flight") {
      if (!/^[A-Z]{3}$/.test(q.origin) || !/^[A-Z]{3}$/.test(q.destination))
        throw new Error("Choose valid departure and arrival airport codes.");
      Object.entries({
        departure_id: q.origin,
        arrival_id: q.destination,
        outbound_date: q.start,
        return_date: q.end,
        type: "1",
      }).forEach(([k, v]) => params.set(k, v));
    } else {
      if (!q.query.trim()) throw new Error("Hotel query required");
      Object.entries({
        q: q.query,
        check_in_date: q.start,
        check_out_date: q.end,
      }).forEach(([k, v]) => params.set(k, v));
    }
    const response = await fetch("https://serpapi.com/search.json?" + params, {
      signal: AbortSignal.timeout(25000),
    });
    if (!response.ok)
      throw new Error("Pricing provider unavailable or quota exhausted.");
    const d = await response.json();
    if (d.error)
      throw new Error(
        "Pricing provider returned no usable result. Check query, dates and provider account.",
      );
    if (q.kind === "flight")
      return [...(d.best_flights ?? []), ...(d.other_flights ?? [])]
        .filter((f: any) => Number.isFinite(f.price))
        .slice(0, 10)
        .map((f: any) => ({
          name:
            f.flights?.map((l: any) => l.airline).join(" / ") ||
            "Flight search result",
          amount: f.price,
          key:
            f.flights
              ?.map((l: any) => l.flight_number || l.airline)
              .join("-") || "search",
          url: d.search_metadata?.google_flights_url,
          notes: `Search-level round-trip price shown with outbound selection; confirm return selection before booking. Baggage, taxes breakdown, party-price basis and booking conditions unverified. Outbound duration: ${f.total_duration ?? "unknown"} minutes. ${f.flights?.map((l: any) => `${l.departure_airport?.id} ${l.departure_airport?.time} → ${l.arrival_airport?.id} ${l.arrival_airport?.time}`).join("; ") || ""}`,
        }));
    return (d.properties ?? [])
      .filter((p: any) => Number.isFinite(p.total_rate?.extracted_lowest))
      .slice(0, 10)
      .map((p: any) => ({
        name: p.name,
        amount: p.total_rate.extracted_lowest,
        key: p.property_token || p.name,
        url: p.link,
        notes:
          "Whole-stay lowest advertised rate. Exact room, refundability, breakfast, taxes and availability must be verified. Not an equivalent-room comparison.",
      }));
  }
}
