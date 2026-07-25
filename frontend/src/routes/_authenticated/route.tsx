import { createFileRoute, Outlet, redirect, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data } = await supabase.auth.getSession();
    if (!data.session) throw redirect({ to: "/auth" });
  },
  component: AuthedLayout,
});

function AuthedLayout() {
  const navigate = useNavigate();
  const [email, setEmail] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setEmail(data.user?.email ?? null));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      if (!session) navigate({ to: "/auth" });
    });
    return () => sub.subscription.unsubscribe();
  }, [navigate]);

  async function signOut() {
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-3">
            <span className="inline-block h-[9px] w-[9px] bg-primary" />
            <span className="label">BDR / Pipeline</span>
          </Link>
          <nav className="flex items-center gap-6">
            <Link
              to="/"
              className="label inline-flex items-center gap-2 text-muted-foreground hover:text-foreground"
              activeProps={{ className: "label text-foreground" }}
              activeOptions={{ exact: true }}
            >
              <span aria-hidden>⌂</span>
              <span>Home</span>
            </Link>
            <Link
              to="/accounts"
              className="label text-muted-foreground hover:text-foreground"
              activeProps={{ className: "label text-foreground" }}
            >
              Accounts
            </Link>
            <Link
              to="/drafts"
              className="label text-muted-foreground hover:text-foreground"
              activeProps={{ className: "label text-foreground" }}
            >
              Drafts
            </Link>
            <Link
              to="/analytics"
              className="label text-muted-foreground hover:text-foreground"
              activeProps={{ className: "label text-foreground" }}
            >
              Analytics
            </Link>
            <span className="label text-muted-foreground hidden md:inline">{email}</span>
            <button onClick={signOut} className="label text-muted-foreground hover:text-primary">
              Sign out
            </button>
          </nav>
        </div>
      </header>
      <main className="max-w-6xl mx-auto px-6 py-10">
        <Outlet />
      </main>
    </div>
  );
}
