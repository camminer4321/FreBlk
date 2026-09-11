// Timezone helpers without a library: wall-clock <-> instant for an IANA zone.
export type Wall = { y: number; m: number; d: number; h: number; mi: number; wd: number }; // wd: 0=Mon..6=Sun

const fmtCache = new Map<string, Intl.DateTimeFormat>();
function fmt(tz: string) {
  let f = fmtCache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", weekday: "short" });
    fmtCache.set(tz, f);
  }
  return f;
}
const WD: Record<string, number> = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 };
export const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
export const DAY_LABELS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

export function toWall(date: Date, tz: string): Wall {
  const parts = fmt(tz).formatToParts(date);
  const get = (t: string) => parts.find((p) => p.type === t)?.value || "0";
  return { y: +get("year"), m: +get("month"), d: +get("day"), h: +get("hour") % 24, mi: +get("minute"), wd: WD[get("weekday")] ?? 0 };
}
function offsetMs(instant: number, tz: string) {
  const w = toWall(new Date(instant), tz);
  const asUtc = Date.UTC(w.y, w.m - 1, w.d, w.h, w.mi);
  return asUtc - Math.floor(instant / 60000) * 60000;
}
/** instant for wall-clock y/m/d h:mi in tz */
export function fromWall(y: number, m: number, d: number, h: number, mi: number, tz: string): Date {
  const guess = Date.UTC(y, m - 1, d, h, mi);
  const off = offsetMs(guess, tz);
  const t = guess - off;
  const off2 = offsetMs(t, tz);
  return new Date(off2 === off ? t : guess - off2);
}
export function startOfDay(date: Date, tz: string): Date { const w = toWall(date, tz); return fromWall(w.y, w.m, w.d, 0, 0, tz); }
export function addDays(date: Date, n: number): Date { return new Date(date.getTime() + n * 86400000); }
export function dayKey(date: Date, tz: string): string { const w = toWall(date, tz); return `${w.y}-${String(w.m).padStart(2, "0")}-${String(w.d).padStart(2, "0")}`; }
export function parseHHMM(s: string): number { const [h, m] = s.split(":").map(Number); return h * 60 + (m || 0); }
export function fmtTime(date: Date, tz: string): string {
  const w = toWall(date, tz);
  const ap = w.h >= 12 ? "PM" : "AM"; const h12 = w.h % 12 || 12;
  return `${h12}${w.mi ? ":" + String(w.mi).padStart(2, "0") : ""} ${ap}`;
}
export function fmtRange(a: Date, b: Date, tz: string) { return `${fmtTime(a, tz)}–${fmtTime(b, tz)}`; }
export function fmtDay(date: Date, tz: string, now = new Date()): string {
  const k = dayKey(date, tz), t = dayKey(now, tz), tm = dayKey(addDays(now, 1), tz);
  if (k === t) return "Today"; if (k === tm) return "Tomorrow";
  const w = toWall(date, tz); return `${DAY_LABELS[w.wd]} ${w.m}/${w.d}`;
}
export function minutesToHHMM(min: number) { return `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`; }
