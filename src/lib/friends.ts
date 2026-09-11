import { and, eq, or } from "drizzle-orm";
import { db, friendships, users } from "@/db";

export async function acceptedFriendIds(userId: string): Promise<string[]> {
  const rows = await db.select().from(friendships).where(and(eq(friendships.status, "accepted"), or(eq(friendships.userId, userId), eq(friendships.friendId, userId))));
  return rows.map((r) => (r.userId === userId ? r.friendId : r.userId));
}
export async function friendsOf(userId: string) {
  const ids = await acceptedFriendIds(userId);
  if (!ids.length) return [];
  const { inArray } = await import("drizzle-orm");
  return db.select().from(users).where(inArray(users.id, ids));
}
