import { and, eq, gte, lte, inArray, or, isNull } from "drizzle-orm";
import { db, events, downtimes, groupMembers, users } from "@/db";
import { addDays, fromWall, parseHHMM, startOfDay, toWall } from "./time";

export type Interval = { start: number; end: number; label?: string; kind?: string; eventId?: string; groupId?: string | null; category?: string; mandatory?: boolean };

export function mergeIntervals(list: Interval[]): Interval[] {
  const sorted = [...list].sort((a, b) => a.start - b.start);
  const out: Interval[] = [];
  for (const iv of sorted) {
    const last = out[out.length - 1];
    if (last && iv.start <= last.end) last.end = Math.max(last.end, iv.end);
    else out.push({ start: iv.start, end: iv.end });
  }
  return out;
}

export function gaps(busy: Interval[], winStart: number, winEnd: number): Interval[] {
  const merged = mergeIntervals(busy);
  const out: Interval[] = [];
  let cursor = winStart;
  for (const b of merged) {
    if (b.end <= winStart) continue;
    if (b.start >= winEnd) break;
    if (b.start > cursor) out.push({ start: cursor, end: Math.min(b.start, winEnd) });
    cursor = Math.max(cursor, b.end);
  }
  if (cursor < winEnd) out.push({ start: cursor, end: winEnd });
  return out;
}

export type UserLite = { id: string; name: string | null; wake: string | null; bed: string | null; timezone: string; interests: string[] };

/** Everything that makes these users "not free" in [from,to): events, group events, downtime, sleep. */
export async function busyFor(userIds: string[], from: Date, to: Date): Promise<Map<string, Interval[]>> {
  const map = new Map<string, Interval[]>();
  if (!userIds.length) return map;
  userIds.forEach((id) => map.set(id, []));

  const people = await db.select().from(users).where(inArray(users.id, userIds));
  const memberships = await db.select().from(groupMembers).where(inArray(groupMembers.userId, userIds));
  const groupIds = [...new Set(memberships.map((m) => m.groupId))];
  const groupByUser = new Map<string, Set<string>>();
  memberships.forEach((m) => { if (!groupByUser.has(m.userId)) groupByUser.set(m.userId, new Set()); groupByUser.get(m.userId)!.add(m.groupId); });

  const evs = await db.select().from(events).where(and(
    lte(events.start, to), gte(events.end, from),
    or(inArray(events.userId, userIds), groupIds.length ? inArray(events.groupId, groupIds) : isNull(events.groupId)),
  ));
  for (const e of evs) {
    if (e.allDay) continue;
    const iv: Interval = { start: e.start.getTime(), end: e.end.getTime(), label: e.title, kind: e.groupId ? "group" : "event", eventId: e.id, groupId: e.groupId, category: e.category, mandatory: e.mandatory };
    if (e.userId && map.has(e.userId)) map.get(e.userId)!.push(iv);
    if (e.groupId) for (const [uid, gs] of groupByUser) if (gs.has(e.groupId)) map.get(uid)!.push({ ...iv });
  }

  const dts = await db.select().from(downtimes).where(inArray(downtimes.userId, userIds));
  for (const p of people) {
    const tz = p.timezone || "America/New_York";
    let day = startOfDay(addDays(from, -1), tz);
    const wake = p.wake ? parseHHMM(p.wake) : null, bed = p.bed ? parseHHMM(p.bed) : null;
    const mine = dts.filter((d) => d.userId === p.id);
    while (day.getTime() < to.getTime()) {
      const w = toWall(day, tz);
      // sleep: bed -> next wake
      if (wake !== null && bed !== null) {
        const bedAt = fromWall(w.y, w.m, w.d, Math.floor(bed / 60), bed % 60, tz).getTime();
        const nextDay = toWall(addDays(day, 1), tz);
        const wakeAt = fromWall(nextDay.y, nextDay.m, nextDay.d, Math.floor(wake / 60), wake % 60, tz).getTime();
        if (wakeAt > bedAt) map.get(p.id)!.push({ start: bedAt, end: wakeAt, label: "Sleep", kind: "sleep", category: "blocked" });
      }
      for (const d of mine) {
        if (!d.days.includes(w.wd)) continue;
        const s = parseHHMM(d.start), e = parseHHMM(d.end);
        map.get(p.id)!.push({ start: fromWall(w.y, w.m, w.d, Math.floor(s / 60), s % 60, tz).getTime(), end: fromWall(w.y, w.m, w.d, Math.floor(e / 60), e % 60, tz).getTime(), label: d.label, kind: "downtime", category: "blocked" });
      }
      day = addDays(day, 1);
    }
  }
  for (const [, list] of map) list.sort((a, b) => a.start - b.start);
  return map;
}

/** Shared free windows for a set of users, split per day, limited to a daily window (default 8:00-23:00 in the first user's tz). */
export async function sharedFree(userIds: string[], from: Date, to: Date, minMinutes = 30, tz = "America/New_York", dayWindow: [number, number] = [8 * 60, 23 * 60]) {
  const busy = await busyFor(userIds, from, to);
  const all: Interval[] = [];
  for (const [, list] of busy) all.push(...list);
  const out: Interval[] = [];
  let day = startOfDay(from, tz);
  while (day.getTime() < to.getTime()) {
    const w = toWall(day, tz);
    const ws = Math.max(from.getTime(), fromWall(w.y, w.m, w.d, Math.floor(dayWindow[0] / 60), dayWindow[0] % 60, tz).getTime());
    const we = Math.min(to.getTime(), fromWall(w.y, w.m, w.d, Math.floor(dayWindow[1] / 60), dayWindow[1] % 60, tz).getTime());
    if (we > ws) for (const g of gaps(all, ws, we)) if (g.end - g.start >= minMinutes * 60000) out.push(g);
    day = addDays(day, 1);
  }
  return out;
}

export function isFreeAt(busy: Interval[], t: number): { free: boolean; until: number | null } {
  const merged = mergeIntervals(busy);
  for (const b of merged) if (t >= b.start && t < b.end) return { free: false, until: b.end };
  for (const b of merged) if (b.start > t) return { free: true, until: b.start };
  return { free: true, until: null };
}

export const ACTIVITIES = [
  { name: "Movie night", minutes: 130, rating: 4.7, tags: ["movies", "film", "chill"] },
  { name: "Pickleball at the rec", minutes: 90, rating: 4.8, tags: ["pickleball", "sports", "active"] },
  { name: "Trivia night", minutes: 120, rating: 4.7, tags: ["trivia", "food", "bar", "social"] },
  { name: "Late-night food run", minutes: 60, rating: 4.5, tags: ["food", "chill"] },
  { name: "Hike + sunset", minutes: 180, rating: 4.9, tags: ["hiking", "outdoors", "active"] },
  { name: "Board game night", minutes: 150, rating: 4.6, tags: ["board games", "games", "chill"] },
  { name: "Bowling", minutes: 100, rating: 4.4, tags: ["bowling", "games", "social"] },
  { name: "Live music downtown", minutes: 180, rating: 4.6, tags: ["live music", "music", "social"] },
  { name: "Pickup basketball", minutes: 90, rating: 4.5, tags: ["basketball", "sports", "active"] },
  { name: "Study session + coffee", minutes: 120, rating: 4.3, tags: ["study", "coding", "chill"] },
  { name: "Hockey game watch party", minutes: 150, rating: 4.6, tags: ["hockey", "sports", "social"] },
  { name: "Gym together", minutes: 75, rating: 4.4, tags: ["gym", "active", "sports"] },
];

export function suggest(windows: Interval[], interests: string[][]) {
  const flat = interests.flat().map((s) => s.toLowerCase());
  const count = new Map<string, number>();
  flat.forEach((i) => count.set(i, (count.get(i) || 0) + 1));
  let best: { act: (typeof ACTIVITIES)[number]; win: Interval; score: number } | null = null;
  for (const act of ACTIVITIES) {
    const affinity = act.tags.reduce((s, t) => s + (count.get(t) || 0), 0);
    for (const win of windows) {
      const len = (win.end - win.start) / 60000;
      if (len < act.minutes * 0.8) continue;
      const score = affinity * 3 + act.rating + Math.min(len / act.minutes, 2) * 0.5 - (win.start - Date.now()) / 864e5 * 0.6;
      if (!best || score > best.score) best = { act, win, score };
    }
  }
  return best;
}
