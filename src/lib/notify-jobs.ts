import { and, eq, gte, lte, inArray } from "drizzle-orm";
import { db, users, events, groupMembers, groups, rsvps } from "@/db";
import { notify } from "./push";
import { dayKey, fmtTime, fromWall, parseHHMM, toWall } from "./time";
import { sharedFree, suggest } from "./engine";
import { acceptedFriendIds } from "./friends";

/** Runs from cron (every 15 min): mandatory-event reminders, bedtime wind-down, daily group suggestion. */
export async function runNotificationJobs() {
  const now = new Date();
  const people = await db.select().from(users).where(eq(users.onboardingStep, 99));
  let sent = 0;
  for (const p of people) {
    const tz = p.timezone || "America/New_York";
    const today = dayKey(now, tz);
    // 1. group events in the next 3 hours the person hasn't RSVP'd to
    const gm = await db.select({ groupId: groupMembers.groupId }).from(groupMembers).where(eq(groupMembers.userId, p.id));
    const gids = gm.map((g) => g.groupId);
    if (gids.length) {
      const soon = await db.select().from(events).where(and(inArray(events.groupId, gids), gte(events.start, now), lte(events.start, new Date(now.getTime() + 3 * 3600000))));
      for (const e of soon) {
        const [r] = await db.select().from(rsvps).where(and(eq(rsvps.eventId, e.id), eq(rsvps.userId, p.id)));
        if (r) continue;
        const [g] = await db.select().from(groups).where(eq(groups.id, e.groupId!));
        if (await notify(p.id, "upcoming", `up|${e.id}`, `${e.mandatory ? "Mandatory · " : ""}${g?.name || "Group"} at ${fmtTime(e.start, tz)}`, `${e.title} — you haven't confirmed yet.`, `/groups/${e.groupId}`)) sent++;
      }
    }
    // 2. wind-down 45 min before bed
    if (p.bed) {
      const w = toWall(now, tz); const bed = parseHHMM(p.bed);
      const bedAt = fromWall(w.y, w.m, w.d, Math.floor(bed / 60), bed % 60, tz).getTime();
      const diff = (bedAt - now.getTime()) / 60000;
      if (diff > 0 && diff <= 45) if (await notify(p.id, "bed", `bed|${today}`, "Wind-down", `Bed is at ${fmtTime(new Date(bedAt), tz)} — about ${Math.round(diff)} minutes out.`, "/today")) sent++;
    }
    // 3. daily suggestion at ~9am local, using accepted friends
    const w2 = toWall(now, tz);
    if (w2.h === 9 && w2.mi < 15) {
      const fids = await acceptedFriendIds(p.id);
      const ids = [p.id, ...fids].slice(0, 6);
      if (ids.length >= 2) {
        const wins = await sharedFree(ids, now, new Date(now.getTime() + 4 * 86400000), 60, tz);
        const crew = await db.select({ interests: users.interests }).from(users).where(inArray(users.id, ids));
        const s = suggest(wins, crew.map((c) => c.interests || []));
        if (s && await notify(p.id, "suggest", `sug|${today}`, "Something for the group", `You + ${ids.length - 1} are free ${fmtTime(new Date(s.win.start), tz)}. ${s.act.name} would fit.`, "/ask")) sent++;
      }
    }
  }
  return sent;
}
