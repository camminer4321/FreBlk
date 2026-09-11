import { and, eq, inArray, notInArray, or, isNull } from "drizzle-orm";
import { db, groups, groupMembers, users } from "@/db";
import { withUser, json, bad, body } from "@/lib/api";
import { busyFor, isFreeAt } from "@/lib/engine";

const GROUP_PALETTE = [
  { accent: "#a49bd6", plate: "linear-gradient(140deg,#4b4270,#302a4d)" }, { accent: "#94bce3", plate: "linear-gradient(140deg,#33526e,#1e3446)" },
  { accent: "#7fc3bd", plate: "linear-gradient(140deg,#2a5c58,#183b38)" }, { accent: "#96c17c", plate: "linear-gradient(140deg,#3c5c30,#22381c)" },
  { accent: "#d6b57e", plate: "linear-gradient(140deg,#6b5330,#42331d)" }, { accent: "#e39494", plate: "linear-gradient(140deg,#6e3535,#452020)" },
  { accent: "#e3b8dd", plate: "linear-gradient(140deg,#6a3f66,#432941)" }, { accent: "#8fd0d8", plate: "linear-gradient(140deg,#295a60,#1a3a3e)" },
];

/** My groups (with live free-now stats) + groups at my school I could join. */
export const GET = withUser(async (userId) => {
  const [me] = await db.select().from(users).where(eq(users.id, userId));
  const mine = await db.select({ g: groups, role: groupMembers.role }).from(groupMembers).innerJoin(groups, eq(groups.id, groupMembers.groupId)).where(eq(groupMembers.userId, userId));
  const myIds = mine.map((m) => m.g.id);
  const members = myIds.length ? await db.select().from(groupMembers).where(inArray(groupMembers.groupId, myIds)) : [];
  const memberIds = [...new Set(members.map((m) => m.userId))];
  const busy = await busyFor(memberIds, new Date(Date.now() - 3600000), new Date(Date.now() + 6 * 3600000));
  const now = Date.now();
  const result = mine.map(({ g, role }) => {
    const ids = members.filter((m) => m.groupId === g.id).map((m) => m.userId);
    const freeNow = ids.filter((id) => isFreeAt(busy.get(id) || [], now).free).length;
    return { ...g, role, memberCount: ids.length, freeNow };
  });
  const discoverWhere = me?.schoolName
    ? and(eq(groups.schoolName, me.schoolName), myIds.length ? notInArray(groups.id, myIds) : undefined)
    : and(isNull(groups.schoolName), myIds.length ? notInArray(groups.id, myIds) : undefined);
  const discover = await db.select().from(groups).where(discoverWhere).limit(30);
  const dIds = discover.map((d) => d.id);
  const dMembers = dIds.length ? await db.select().from(groupMembers).where(inArray(groupMembers.groupId, dIds)) : [];
  return json({ groups: result, discover: discover.map((d) => ({ ...d, joinCode: undefined, memberCount: dMembers.filter((m) => m.groupId === d.id).length })), palette: GROUP_PALETTE });
});

export const POST = withUser(async (userId, req) => {
  const b = await body<{ name?: string; kicker?: string; paletteIndex?: number; visibility?: string; description?: string; isCouncil?: boolean }>(req);
  const name = String(b.name || "").trim().slice(0, 60);
  if (name.length < 2) return bad("Give the group a name");
  const [me] = await db.select().from(users).where(eq(users.id, userId));
  const pal = GROUP_PALETTE[Math.max(0, Math.min(GROUP_PALETTE.length - 1, Number(b.paletteIndex || 0)))];
  const vis = ["event times only", "free/busy to officers", "free/busy + details", "full details"].includes(String(b.visibility)) ? String(b.visibility) : "free/busy + details";
  const [g] = await db.insert(groups).values({ name, kicker: String(b.kicker || "Group").trim().slice(0, 40) || "Group", accent: pal.accent, plate: pal.plate, visibility: vis, description: b.description ? String(b.description).slice(0, 240) : null, schoolName: me?.schoolName || null, isCouncil: !!b.isCouncil, createdById: userId }).returning();
  await db.insert(groupMembers).values({ groupId: g.id, userId, role: "officer" });
  return json({ group: g });
});
