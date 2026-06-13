// Primitive display formatters shared across the presentational components.
// Pure functions only — no domain logic, no React.

import type { Lang } from "./i18n";

export function eur(v: number): string {
  return v < 0 ? `−€${Math.abs(v).toFixed(0)}` : `€${v.toFixed(0)}`;
}

export function fmtHour(h: number): string {
  return `${String(h).padStart(2, "0")}:00`;
}

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

export function fmtDate(d: Date, lang: Lang): string {
  if (lang === "zh") {
    return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
  }
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

export function addDays(d: Date, n: number): Date {
  const r = new Date(d.getTime());
  r.setDate(r.getDate() + n);
  return r;
}

export function extractHref(raw: string): string | null {
  const first = raw.split(/\s/)[0];
  if (!first.includes(".")) return null;
  return first.startsWith("http") ? first : `https://${first}`;
}
