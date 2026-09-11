import { inArray } from "drizzle-orm";
import { db, users } from "@/db";
import { withUser, json } from "@/lib/api";
import { sharedFree, busyFor, isFreeAt } from "@/lib/engine";
import { acceptedFriendIds } from "@/lib/friends";

/** Shared free windows + live "free now" for me and friends (or given ids). */
export const GET = withUser(async (userId, req) => {
  const sp = new URL(req.url).searchParams;
  const friendIds = await acceptedFriendIds(userId);
  const allowed = new Set([userId, ...friendIds]);
  const ids = (sp.get("ids") || "").split(",").filter((id) => id && allowed.has(id));
  const people = ids.length ? ids : [userId, ...friendIds];
  const from = sp.get("from") ? new Date(sp.get("from")!) : new Date();
  const to = sp.get("to") ? new Date(sp.get("to")!) : new Date(from.getTime() + 3 * 86400000);
  const min = Number(sp.get("min") || 45);
  const [me] = await db.select({ tz: users.timezone }).from(users).where(inArray(users.id, [userId]));
  const windows = await sharedFree(people, from, to, min, me?.tz || "America/New_York");
  const busy = await busyFor(people, new Date(Date.now() - 3600000), new Date(Date.now() + 86400000));
  const now = Date.now();
  const status = people.map((id) => ({ id, ...isFreeAt(busy.get(id) || [], now) }));
  return json({ windows, status });
});
