"use client";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

/* ---------- api ---------- */
export async function api<T = unknown>(path: string, init?: RequestInit & { json?: unknown }): Promise<T> {
  const res = await fetch(path, { ...init, headers: { "Content-Type": "application/json", ...(init?.headers || {}) }, body: init?.json !== undefined ? JSON.stringify(init.json) : init?.body });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error || `Request failed (${res.status})`);
  return data as T;
}

/* ---------- toast + sheet ---------- */
type Toast = { id: number; text: string; action?: string; onAction?: () => void };
type SheetSpec = { node: ReactNode; onClose?: () => void } | null;
const Ctx = createContext<{ toast: (text: string, o?: { action?: string; onAction?: () => void }) => void; openSheet: (node: ReactNode, onClose?: () => void) => void; closeSheet: () => void; confirm: (o: { title: string; body?: string; ok?: string; cancel?: string; danger?: boolean }) => Promise<boolean> } | null>(null);

export function UIProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [sheet, setSheet] = useState<SheetSpec>(null);
  const seq = useRef(1);
  const toast = useCallback((text: string, o?: { action?: string; onAction?: () => void }) => {
    const id = seq.current++;
    setToasts((t) => [...t.slice(-2), { id, text, ...o }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), o?.action ? 6000 : 2800);
  }, []);
  const closeSheet = useCallback(() => setSheet((s) => { s?.onClose?.(); return null; }), []);
  const openSheet = useCallback((node: ReactNode, onClose?: () => void) => setSheet({ node, onClose }), []);
  const confirm = useCallback((o: { title: string; body?: string; ok?: string; cancel?: string; danger?: boolean }) => new Promise<boolean>((resolve) => {
    setSheet({ node: (
      <div>
        <h2>{o.title}</h2>{o.body && <div className="sub">{o.body}</div>}
        <div className="sheet-actions">
          <button className="btn ghost" onClick={() => { setSheet(null); resolve(false); }}>{o.cancel || "Cancel"}</button>
          <button className={"btn " + (o.danger ? "danger" : "")} onClick={() => { setSheet(null); resolve(true); }}>{o.ok || "OK"}</button>
        </div>
      </div>), onClose: () => resolve(false) });
  }), []);
  const value = useMemo(() => ({ toast, openSheet, closeSheet, confirm }), [toast, openSheet, closeSheet, confirm]);
  useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === "Escape") closeSheet(); }; window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k); }, [closeSheet]);
  return (
    <Ctx.Provider value={value}>
      {children}
      <div className="toast-wrap">{toasts.map((t) => <div key={t.id} className="toast"><span>{t.text}</span>{t.action && <button onClick={() => { t.onAction?.(); setToasts((x) => x.filter((y) => y.id !== t.id)); }}>{t.action}</button>}</div>)}</div>
      {sheet && <div className="sheet-overlay" onClick={(e) => { if (e.target === e.currentTarget) closeSheet(); }}><div className="sheet"><div className="grab" />{sheet.node}</div></div>}
    </Ctx.Provider>
  );
}
export function useUI() { const c = useContext(Ctx); if (!c) throw new Error("UIProvider missing"); return c; }

export function initials(name?: string | null) { return (name || "?").trim().split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase(); }
export function Avatar({ name, image, size = 36 }: { name?: string | null; image?: string | null; size?: number }) {
  return <span className="avatar" style={{ width: size, height: size, fontSize: size * 0.36 }}>{image ? <img src={image} alt="" /> : initials(name)}</span>;
}
export const CATS: { id: string; label: string }[] = [{ id: "classes", label: "Classes" }, { id: "greek", label: "Greek Life" }, { id: "sports", label: "Sports" }, { id: "social", label: "Social" }, { id: "personal", label: "Personal" }];
export function fmtT(ms: number | string | Date, tz?: string) { const d = new Date(ms); return d.toLocaleTimeString([], { hour: "numeric", minute: d.getMinutes() ? "2-digit" : undefined, timeZone: tz }); }
export function fmtRange(a: number | string | Date, b: number | string | Date, tz?: string) { return `${fmtT(a, tz)}–${fmtT(b, tz)}`; }
export function fmtDayLabel(ms: number | string | Date, tz?: string) {
  const d = new Date(ms), now = new Date();
  const k = (x: Date) => x.toLocaleDateString([], { timeZone: tz });
  if (k(d) === k(now)) return "Today";
  if (k(d) === k(new Date(now.getTime() + 864e5))) return "Tomorrow";
  return d.toLocaleDateString([], { weekday: "long", month: "numeric", day: "numeric", timeZone: tz });
}
export function toLocalInput(d: Date) { const p = (n: number) => String(n).padStart(2, "0"); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`; }
