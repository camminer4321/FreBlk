"use client";
import { signIn } from "next-auth/react";
export default function OAuthButtons({ google, microsoft, callbackUrl = "/", label = "Continue" }: { google: boolean; microsoft: boolean; callbackUrl?: string; label?: string }) {
  if (!google && !microsoft) return null;
  return (
    <div className="oauth">
      {google && <button className="btn ghost block" onClick={() => signIn("google", { callbackUrl })}><span style={{ fontWeight: 800 }}>G</span> {label} with Google</button>}
      {microsoft && <button className="btn ghost block" onClick={() => signIn("microsoft-entra-id", { callbackUrl })}><span style={{ fontWeight: 800 }}>▦</span> {label} with Microsoft</button>}
    </div>
  );
}
