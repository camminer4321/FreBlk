"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { api, useUI } from "@/components/ui";
import Icon from "@/components/Icon";
import GroupCreateSheet from "@/components/GroupCreateSheet";
type G = { id: string; name: string; kicker: string; plate: string; accent: string; role?: string; memberCount: number; freeNow?: number; isCouncil: boolean };
export default function Groups() {
  const [data, setData] = useState<{ groups: G[]; discover: G[] } | null>(null);
  const [code, setCode] = useState("");
  const { openSheet, closeSheet, toast } = useUI();
  const load = () => api<{ groups: G[]; discover: G[] }>("/api/groups").then(setData);
  useEffect(() => { load(); }, []);
  return (
    <div>
      <div className="group-grid">
        {!data ? <><div className="skel" style={{ height: 140 }} /><div className="skel" style={{ height: 140 }} /></> : data.groups.map((g) => (
          <Link key={g.id} href={`/groups/${g.id}`} className="group-plate" style={{ background: g.plate }}>
            <div className="kicker">{g.kicker}{g.role === "officer" ? " · officer" : ""}</div><div className="gname">{g.name}</div>
            <div className="stats"><div className="stat"><b>{g.memberCount}</b><span>members</span></div><div className="stat"><b>{g.freeNow}/{g.memberCount}</b><span>free now</span></div></div>
          </Link>))}
        <button className="group-plate add" onClick={() => openSheet(<GroupCreateSheet onDone={(g) => { closeSheet(); toast(`Created ${g.name}`); load(); }} />)}><Icon name="plus" size={26} /><div style={{ fontWeight: 700, fontSize: 13.5, marginTop: 4 }}>New group</div></button>
      </div>
      {data && data.discover.length > 0 && <div className="section"><h3>At your school</h3><div className="list">{data.discover.map((g) => <div key={g.id} className="rowcard" style={{ cursor: "default" }}><span className="sp-dot" style={{ background: g.accent }} /><span><span className="t">{g.name}</span><span className="d">{g.kicker} · {g.memberCount} members</span></span><button className="btn sm" style={{ marginLeft: "auto" }} onClick={async () => { await api(`/api/groups/${g.id}/join`, { method: "POST" }); toast(`Joined ${g.name}`); load(); }}>Join</button></div>)}</div></div>}
      <div className="section"><h3>Have a join code?</h3><div style={{ display: "flex", gap: 8 }}><input className="input" placeholder="e.g. K7Q2ZP" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} style={{ letterSpacing: ".12em", fontFamily: "IBM Plex Mono, monospace" }} /><button className="btn" disabled={code.length < 4} onClick={async () => { try { const r = await api<{ group: G }>("/api/groups/code/join", { method: "POST", json: { code } }); toast(`Joined ${r.group.name}`); setCode(""); load(); } catch (e) { toast(e instanceof Error ? e.message : "No group with that code"); } }}>Join</button></div></div>
    </div>
  );
}
