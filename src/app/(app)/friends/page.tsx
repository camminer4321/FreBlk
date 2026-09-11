"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { api, useUI, Avatar, fmtT } from "@/components/ui";
import Icon from "@/components/Icon";
import ContactsConnect from "@/components/ContactsConnect";
type P = { id: string; name: string | null; image: string | null; schoolName: string | null; free?: boolean; until?: number | null };
export default function Friends() {
  const [d, setD] = useState<{ friends: P[]; incoming: P[]; outgoing: P[] } | null>(null); const [adding, setAdding] = useState(false);
  const { toast, confirm } = useUI();
  const load = () => api<typeof d>("/api/friends").then(setD);
  useEffect(() => { load(); }, []);
  if (!d) return <div className="skel" />;
  return (
    <div>
      {d.incoming.length > 0 && <div className="section" style={{ marginTop: 0 }}><h3>Requests</h3>{d.incoming.map((p) => <div key={p.id} className="friend"><Avatar name={p.name} image={p.image} /><div className="grow"><div className="fname">{p.name}</div><div className="fstatus">{p.schoolName}</div></div><button className="btn sm" onClick={async () => { await api("/api/friends/accept", { method: "POST", json: { userId: p.id } }); toast(`Connected with ${p.name}`); load(); }}>Accept</button><button className="btn sm ghost" onClick={async () => { await api("/api/friends", { method: "DELETE", json: { userId: p.id } }); load(); }}>Ignore</button></div>)}</div>}
      <div className="section" style={{ marginTop: 0 }}><h3>Your people · live</h3>
        {!d.friends.length && <div className="empty"><div className="big">👋</div>Nobody connected yet. Freblk gets good once your people are on it.</div>}
        {d.friends.map((p) => <Link key={p.id} href={`/today?user=${p.id}`} className="friend"><Avatar name={p.name} image={p.image} /><div className="grow"><div className="fname">{p.name}</div><div className="fstatus">{p.free ? (p.until ? `Free until ${fmtT(p.until)}` : "Free the rest of today") : `Busy until ${p.until ? fmtT(p.until) : "later"}`}</div></div><span className={"pill " + (p.free ? "free" : "busy")}>{p.free ? "Free" : "Busy"}</span></Link>)}
        {d.outgoing.length > 0 && <p className="faint" style={{ marginTop: 8 }}>Waiting on: {d.outgoing.map((p) => p.name).join(", ")}</p>}
      </div>
      <button className="btn ghost block" style={{ marginTop: 10 }} onClick={() => setAdding(!adding)}><Icon name="plus" /> {adding ? "Done" : "Find people"}</button>
      {adding && <div className="section"><ContactsConnect /></div>}
    </div>
  );
}
