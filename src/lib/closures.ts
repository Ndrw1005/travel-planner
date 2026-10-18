import type { Place } from "./model";
export function closureOnDate(place: Place | undefined, day: string): string {
  const warning = place?.closureWarning;
  if (!warning) return "";
  const dates = warning.match(/\b\d{4}-\d{2}-\d{2}\b/g) || [];
  if (dates.length >= 2 && /through|until|entire trip/i.test(warning))
    return day >= dates[0] && day <= dates[1] ? warning : "";
  if (dates.length) return dates.includes(day) ? warning : "";
  return warning;
}
