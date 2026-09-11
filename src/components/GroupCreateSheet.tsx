"use client";
import { useState } from "react";
import { api } from "@/components/ui";
const PALETTE = ["#a49bd6", "#94bce3", "#7fc3bd", "#96c17c", "#d6b57e", "#e39494", "#e3b8dd", "#8fd0d8"];
const VIS = ["event times only", "free/busy to officers", "free/busy + details", "full details"];
export default function GroupCreateSheet({ onDone }: { onDone: (g: { id: string; name: string }) => void }) {
  const [name, setName] = useState(""), [kicker, setKicker] = useState(""), [pi, setPi] = useState(1), [vis, setVis] = useState(VIS[2]), [council, setCouncil] = useState(false), [busy, setBusy] = useState(false), [err, setErr] = useState("");
  return (
    <div>
      <h2>New group</h2><div className="sub">Chapter, pledge class, intramural team, study group, the boys — anything with its own calendar. You're the first officer.</div>
      <label className="field"><span>Name</span><input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Delta Sig — Kappa Delta" autoFocus /></label>
      <label className="field"><span>Type (optional)</span><input value={kicker} onChange={(e) => setKicker(e.target.value)} placeholder="Chapter, Club team, Close friends…" /></label>
      <div className="field"><span>Color</span><div className="swatches">{PALETTE.map((c, i) => <button key={c} className={"swatch " + (pi === i ? "on" : "")} style={{ background: c }} onClick={() => setPi(i)} />)}</div></div>
      <label className="field"><span>What members share with this group</span><select value={vis} onChange={(e) => setVis(e.target.value)}>{VIS.map((v) => <option key={v}>{v}</option>)}</select></label>
      <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13, color: "var(--ink-soft)" }}><input type="checkbox" checked={council} onChange={(e) => setCouncil(e.target.checked)} /> Council-style group (flags events from different orgs that land on the same night)</label>
      {err && <div className="err">{err}</div>}
      <div className="sheet-actions"><button className="btn block" disabled={busy || name.trim().length < 2} onClick={async () => { setBusy(true); setErr(""); try { const r = await api<{ group: { id: string; name: string } }>("/api/groups", { method: "POST", json: { name, kicker, paletteIndex: pi, visibility: vis, isCouncil: council } }); onDone(r.group); } catch (e) { setErr(e instanceof Error ? e.message : "Couldn't create"); } setBusy(false); }}>{busy ? "Creating…" : "Create group"}</button></div>
    </div>
  );
}
