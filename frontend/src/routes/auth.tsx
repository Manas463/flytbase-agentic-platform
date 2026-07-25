import { createFileRoute, useNavigate, redirect } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/auth")({
  ssr: false,
  beforeLoad: async () => {
    const { data } = await supabase.auth.getSession();
    if (data.session) throw redirect({ to: "/" });
  },
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      if (session) navigate({ to: "/" });
    });
    return () => sub.subscription.unsubscribe();
  }, [navigate]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) setError(error.message);
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-6 bg-background">
      <form onSubmit={handleSubmit} className="w-full max-w-sm space-y-8">
        <div>
          <div className="eyebrow">
            <span className="inline-block h-[7px] w-[7px] bg-primary" />
            <span>BDR / Internal</span>
          </div>
          <h1 style={{ fontFamily: "var(--font-serif)" }} className="mt-3 text-4xl">
            Pipeline review
          </h1>
        </div>

        <div className="space-y-4">
          <div className="space-y-1">
            <label className="label text-muted-foreground">Email</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full bg-input/40 border border-border px-3 py-2 text-foreground focus:outline-none focus:border-primary"
            />
          </div>
          <div className="space-y-1">
            <label className="label text-muted-foreground">Password</label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-input/40 border border-border px-3 py-2 text-foreground focus:outline-none focus:border-primary"
            />
          </div>
          {error && <p className="label text-red-400">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="label w-full bg-primary text-primary-foreground py-3 hover:opacity-90 disabled:opacity-50"
          >
            {loading ? "Signing in…" : "Sign in"}
          </button>
        </div>
      </form>
    </div>
  );
}