import type { Currency } from "../model";
export type ResearchKind = "flight" | "hotel";
export interface ResearchDetails {
  origin: string;
  destination: string;
  start: string;
  end: string;
  passengers: string;
  cabin: string;
  flightNumber: string;
  departure: string;
  arrival: string;
  returnSchedule: string;
  stops: string;
  duration: string;
  baggage: string;
  propertyId: string;
  location: string;
  room: string;
  beds: string;
  proximity: string;
  amenities: string;
  availability: string;
  priceScope: string;
  taxes: string;
  cancellation: string;
  notes: string;
}
export interface ImportSource {
  name: string;
  hash: string;
  page: number;
  method: "pdf-text" | "ocr" | "paste" | "manual";
  capturedAt: string;
  dateOrigin: string;
  excerpt: string;
}
export interface ResearchRecord {
  details: ResearchDetails;
  source: ImportSource;
  fingerprint: string;
  comparable: boolean;
}
export interface Draft {
  id: string;
  kind: ResearchKind;
  name: string;
  amount: string;
  currency: Currency | "";
  details: ResearchDetails;
  source: ImportSource;
  fingerprint: string;
  warnings: string[];
  selected: boolean;
  action: "observation" | "update" | "new" | "skip";
  matchId: string;
  reviewed: boolean;
  contextConfirmed: boolean;
}
export interface TextPage {
  page: number;
  text: string;
  method: "pdf-text" | "ocr" | "paste" | "manual";
  confidence?: number;
}
export interface ExtractedDocument {
  name: string;
  hash: string;
  pages: TextPage[];
  capturedAt: string;
  dateOrigin: string;
}
export const emptyDetails = (): ResearchDetails => ({
  origin: "",
  destination: "",
  start: "",
  end: "",
  passengers: "",
  cabin: "",
  flightNumber: "",
  departure: "",
  arrival: "",
  returnSchedule: "",
  stops: "",
  duration: "",
  baggage: "",
  propertyId: "",
  location: "",
  room: "",
  beds: "",
  proximity: "",
  amenities: "",
  availability: "",
  priceScope: "unknown",
  taxes: "",
  cancellation: "",
  notes: "",
});
export const fieldLabels: Record<keyof ResearchDetails, string> = {
  origin: "Origin airport",
  destination: "Destination airport",
  start: "Departure / check-in date",
  end: "Return / check-out date",
  passengers: "Passengers / guests",
  cabin: "Cabin class",
  flightNumber: "Flight number(s)",
  departure: "Outbound departure time",
  arrival: "Outbound arrival time",
  returnSchedule: "Return flight details (only if provided)",
  stops: "Stops",
  duration: "Flight duration",
  baggage: "Baggage / fare conditions",
  propertyId: "Property identifier",
  location: "Location / area",
  room: "Room type",
  beds: "Bed arrangement",
  proximity: "Station proximity",
  amenities: "Amenities",
  availability: "Availability indication",
  priceScope: "Price basis",
  taxes: "Taxes / fees",
  cancellation: "Cancellation / refund conditions",
  notes: "Description / other notes",
};
