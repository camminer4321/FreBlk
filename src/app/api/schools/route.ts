import schools from "@/lib/schools.json";
import { json } from "@/lib/api";
import { SCHOOL_SEED } from "@/lib/campus";
const LIST = schools as string[];
export async function GET(req: Request) {
  const q = (new URL(req.url).searchParams.get("q") || "").trim().toLowerCase();
  const featured = Object.keys(SCHOOL_SEED);
  if (!q) return json({ results: featured, featured });
  const starts = LIST.filter((n) => n.toLowerCase().startsWith(q));
  const contains = LIST.filter((n) => !n.toLowerCase().startsWith(q) && n.toLowerCase().includes(q));
  return json({ results: [...starts, ...contains].slice(0, 40), featured });
}
