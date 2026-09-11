"use client";
import { useEffect, useState } from "react";
import { api } from "@/components/ui";
import Icon from "@/components/Icon";

export default function InterestPicker({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  const [q, setQ] = useState(""); const [options, setOptions] = useState<string[]>([]); const [extra, setExtra] = useState<string[]>([]);
  useEffect(() => { const t = setTimeout(() => api<{ results: string[] }>(`/api/interests?q=${encodeURIComponent(q)}`).then((r) => setOptions(r.results)), 120); return () => clearTimeout(t); }, [q]);
  const norm = (s: string) => s.trim().toLowerCase();
  const has = (s: string) => value.some((v) => norm(v) === norm(s));
  const toggle = (s: string) => onChange(has(s) ? value.filter((v) => norm(v) !== norm(s)) : [...value, s]);
  async function addCustom() {
    const name = q.trim(); if (name.length < 2) return;
    const r = await api<{ name: string }>("/api/interests", { method: "POST", json: { name } });
    if (!has(r.name)) onChange([...value, r.name]);
    if (!extra.includes(r.name)) setExtra([r.name, ...extra]);
    setQ("");
  }
  const exact = options.some((o) => norm(o) === norm(q));
  const shown = [...new Set([...value, ...extra, ...options])];
  return (
    <div>
      <div style={{ display: "flex", gap: 8 }}>
        <input className="input" placeholder="Search or add anything — hockey, chess, F1…" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); if (q.trim() && !exact) addCustom(); else if (exact) { toggle(options.find((o) => norm(o) === norm(q))!); setQ(""); } } }} />
        {q.trim().length >= 2 && !exact && <button className="btn" onClick={addCustom}><Icon name="plus" /> Add</button>}
      </div>
      <div className="chips" style={{ marginTop: 12 }}>
        {shown.map((s) => <button key={s} className={"chip " + (has(s) ? "on" : "")} onClick={() => toggle(s)}>{s}</button>)}
        {q.trim().length >= 2 && !exact && !shown.some((s) => norm(s) === norm(q)) && <button className="chip" style={{ borderStyle: "dashed" }} onClick={addCustom}>+ "{q.trim()}"</button>}
      </div>
      {value.length > 0 && <p className="faint" style={{ marginTop: 10 }}>{value.length} picked · anything you add shows up here for everyone else too.</p>}
    </div>
  );
}
