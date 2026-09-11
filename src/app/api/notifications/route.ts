import { desc, eq } from "drizzle-orm";
import { db, notifications } from "@/db";
import { withUser, json } from "@/lib/api";
export const GET = withUser(async (userId) => json({ notifications: await db.select().from(notifications).where(eq(notifications.userId, userId)).orderBy(desc(notifications.createdAt)).limit(30) }));
