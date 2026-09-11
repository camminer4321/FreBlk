"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { api, useUI, fmtDayLabel, fmtRange } from "@/components/ui";
type CE = { id: string; title: string; place: string | null; note: string | null; start: string; end: string; warn: boolean; going: boolean; friendsGoing: number };
type Data = { school: string | null; location?: string | null; colors: { c1: string; c2: string; detail: string }; builtin: boolean; games: CE[]; campus: CE[] };
export default function Campus() {
  const [d, setD] = useState<Data | null>(null); const { toast } = useUI();
  const load = () => api<Data>("/api/campus").then(setD);
  useEffect(() => { load(); }, []);
  if (!d) return <div className="skel" style={{ height: 120 }} />;
  const toggle = async (e: CE) => { const r = await api<{ going: boolean }>(`/api/campus/${e.id}/rsvp`, { method: "POST" }); toast(r.going ? `Added ${e.title} to your board` : "Removed from your board"); load(); };
  const card = (e: CE) => <div key={e.id} className="card"><div className="title">{e.title}</div><div className="meta">{fmtDayLabel(e.start)} · {fmtRange(e.start, e.end)}{e.place ? ` · ${e.place}` : ""}{e.note ? ` · ${e.note}` : ""}</div>{e.friendsGoing > 0 && <div className="meta">{e.friendsGoing} of your friends going</div>}<button className={"rsvp " + (e.going ? "on" : "")} onClick={() => toggle(e)}>{e.warn ? (e.going ? "✓ Reminder set" : "Remind me") : e.going ? "✓ Going — tap to leave" : "I'm going"}</button></div>;
  return (
    <div>
      <div className="hero" style={{ background: `linear-gradient(120deg,${d.colors.c1},${d.colors.c2})` }}><h2>{d.school || d.location || "Your area"}</h2><div className="sub">{d.colors.detail || (d.school ? "" : "Campus feed applies to students — you're set up by location.")} <Link href="/settings" style={{ color: "#fff", textDecoration: "underline" }}>Change</Link></div></div>
      {!d.school ? <div className="empty">No campus feed for a location yet — your calendar, groups and friends all work the same.</div> :
        !d.builtin ? <div className="empty">{d.school} isn't built out yet — athletics and campus events land here once we add the feed. Everything else already works for your school.</div> : <>
          <div className="section"><h3>Games & athletics</h3>{d.games.map(card)}</div>
          <div className="section"><h3>Campus</h3>{d.campus.map(card)}</div>
          <p className="faint">Tapping "I'm going" puts a real block on your board, so it counts as busy everywhere.</p>
        </>}
    </div>
  );
}
