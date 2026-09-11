import { redirect } from "next/navigation";
import { auth, providersEnabled } from "@/auth";
import SignupForm from "./SignupForm";
import OAuthButtons from "@/components/OAuthButtons";
export default async function Signup() {
  const session = await auth();
  if (session?.user) redirect("/");
  return (
    <main className="auth">
      <div className="brand-mark">Fre<span>blk</span></div>
      <h2>Create your account</h2>
      <p className="muted">Step 1 of 7 · takes about two minutes total.</p>
      <OAuthButtons google={providersEnabled.google} microsoft={providersEnabled.microsoft} label="Sign up" />
      {(providersEnabled.google || providersEnabled.microsoft) && <div className="divider">or with email</div>}
      <SignupForm />
      <p className="muted" style={{ marginTop: 18 }}>Already have one? <a href="/login">Sign in</a></p>
    </main>
  );
}
