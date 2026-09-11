import { and, eq, gte, inArray } from "drizzle-orm";
import { db, users, campusEvents, campusRsvps } from "@/db";
import { withUser, json } from "@/lib/api";
import { ensureCampusEvents, schoolColors } from "@/lib/campus";
import { acceptedFriendIds } from "@/lib/friends";
export const GET = withUser(async (userId) => {
  const [me] = await db.select().from(users).where(eq(users.id, userId));
  const school = me?.isStudent ? me?.schoolName : null;
  const colors = schoolColors(school || me?.location || "Freblk");
  if (!school) return json({ school: null, location: me?.location, colors, games: [], campus: [], builtin: false });
  await ensureCampusEvents(school, me.timezone);
  const rows = await db.select().from(campusEvents).where(and(eq(campusEvents.schoolName, school), gte(campusEvents.end, new Date()))).orderBy(campusEvents.start).limit(40);
  const ids = rows.map((r) => r.id);
  const rs = ids.length ? await db.select().from(campusRsvps).where(inArray(campusRsvps.campusEventId, ids)) : [];
  const friends = new Set(await acceptedFriendIds(userId));
  const decorate = (r: typeof rows[number]) => ({ ...r, going: rs.some((x) => x.campusEventId === r.id && x.userId === userId), friendsGoing: rs.filter((x) => x.campusEventId === r.id && friends.has(x.userId)).length });
  return json({ school, colors, builtin: colors.builtin, games: rows.filter((r) => r.kind === "game").map(decorate), campus: rows.filter((r) => r.kind === "campus").map(decorate) });
});
