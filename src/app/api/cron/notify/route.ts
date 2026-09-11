import { runNotificationJobs } from "@/lib/notify-jobs";
import { json, bad } from "@/lib/api";
export const maxDuration = 120;
export async function GET(req: Request) {
  if (req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) return bad("nope", 401);
  return json({ sent: await runNotificationJobs() });
}
