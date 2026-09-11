"use client";
import { useState } from "react";
import { signIn } from "next-auth/react";
export default function LoginForm() {
  const [email, setEmail] = useState(""), [password, setPassword] = useState(""), [err, setErr] = useState(""), [busy, setBusy] = useState(false);
  return (
    <form onSubmit={async (e) => { e.preventDefault(); setBusy(true); setErr("");
      const r = await signIn("credentials", { email, password, redirect: false });
      setBusy(false);
      if (r?.error) setErr("That email and password don't match."); else window.location.href = "/";
    }}>
      <label className="field"><span>Email</span><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" /></label>
      <label className="field"><span>Password</span><input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="current-password" /></label>
      {err && <div className="err">{err}</div>}
      <button className="btn block" disabled={busy}>{busy ? "Signing in…" : "Sign in"}</button>
    </form>
  );
}
