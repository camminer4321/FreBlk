import { and, eq, gte } from "drizzle-orm";
import { db, campusEvents, type Category } from "@/db";
import seed from "./campus-seed.json";
import { addDays, fromWall, parseHHMM, startOfDay, toWall } from "./time";

type Seed = Record<string, { short: string; c1: string; c2: string; detail: string; games: { title: string; place: string; note: string; day: string; start: string; end: string; cat: string }[]; campus: { title: string; place: string; warn: boolean; day: string; start: string; end: string; cat: string }[] }>;
export const SCHOOL_SEED = seed as Seed;
const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export function hashHue(str: string) { let h = 0; for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0; return h % 360; }
export function schoolColors(name: string) {
  const s = SCHOOL_SEED[name]; if (s) return { c1: s.c1, c2: s.c2, short: s.short, builtin: true, detail: s.detail };
  const hue = hashHue(name || "School");
  const stop: Record<string, 1> = { of: 1, the: 1, at: 1, and: 1, for: 1 };
  const short = (name || "").replace(/[^A-Za-z ]/g, " ").trim().split(/\s+/).filter((w) => w && !stop[w.toLowerCase()]).map((w) => w[0]).join("").toUpperCase().slice(0, 4) || "SCH";
  return { c1: `hsl(${hue},52%,32%)`, c2: `hsl(${(hue + 42) % 360},58%,50%)`, short, builtin: false, detail: "" };
}

/** Make sure a built-out school has upcoming sample campus events (next ~3 weeks). Real schools would get a feed here. */
export async function ensureCampusEvents(schoolName: string, tz = "America/New_York") {
  const s = SCHOOL_SEED[schoolName]; if (!s) return;
  const upcoming = await db.select({ id: campusEvents.id }).from(campusEvents).where(and(eq(campusEvents.schoolName, schoolName), gte(campusEvents.start, new Date())));
  if (upcoming.length) return;
  const rows: typeof campusEvents.$inferInsert[] = [];
  const today = startOfDay(new Date(), tz);
  const todayWd = toWall(today, tz).wd;
  const place = (kind: "game" | "campus", items: (typeof s.games[number] | typeof s.campus[number])[]) => {
    for (let week = 0; week < 3; week++) for (const it of items) {
      const wd = DAYS.indexOf(it.day);
      let delta = wd - todayWd; if (delta < 0) delta += 7;
      const day = addDays(today, delta + week * 7); const w = toWall(day, tz);
      const st = parseHHMM(it.start), en = parseHHMM(it.end);
      rows.push({ schoolName, kind, title: it.title, place: it.place, note: (it as { note?: string }).note || null, category: (it.cat as Category) || "social", warn: !!(it as { warn?: boolean }).warn,
        start: fromWall(w.y, w.m, w.d, Math.floor(st / 60), st % 60, tz), end: fromWall(w.y, w.m, w.d, Math.floor(en / 60), en % 60, tz) });
    }
  };
  place("game", s.games); place("campus", s.campus);
  if (rows.length) await db.insert(campusEvents).values(rows);
}
