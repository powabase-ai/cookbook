import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { supabase } from "../lib/supabase";

type AuthState = "loading" | "signed-in" | "signed-out";

export default function ProtectedRoute({ children }: { children: ReactNode }) {
  const [authState, setAuthState] = useState<AuthState>("loading");

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setAuthState(data.session ? "signed-in" : "signed-out");
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setAuthState(session ? "signed-in" : "signed-out");
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  if (authState === "loading") return <div className="p-6">Loading…</div>;
  if (authState === "signed-out") return <Navigate to="/signin" replace />;
  return <>{children}</>;
}
