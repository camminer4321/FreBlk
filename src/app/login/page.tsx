import { redirect } from "next/navigation";
import { auth, providersEnabled } from "@/auth";
import LoginForm from "./LoginForm";
import OAuthButtons from "@/components/OAuthButtons";
export default async function Login() {
  const session = await auth();
  if (session?.user) redirect("/");
  return (
    <main className="auth">
      <div className="brand-mark">Fre<span>blk</span></div>
      <h2>Welcome back</h2>
      <p className="muted">Every calendar you have, one board.</p>
      <OAuthButtons google={providersEnabled.google} microsoft={providersEnabled.microsoft} />
      {(providersEnabled.google || providersEnabled.microsoft) && <div className="divider">or with email</div>}
      <LoginForm />
      <p className="muted" style={{ marginTop: 18 }}>New here? <a href="/signup">Create an account</a></p>
    </main>
  );
}
