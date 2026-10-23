import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { User, Session } from "@supabase/supabase-js";

type AppRole = "owner" | "admin" | "manager" | "employee";

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  role: AppRole | null;
  isAdmin: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  session: null,
  loading: true,
  role: null,
  isAdmin: false,
  signOut: async () => {},
});

export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [role, setRole] = useState<AppRole | null>(null);

  const fetchRole = async (userId: string) => {
    // BUGFIX: .single() lançava exceção quando o usuário tinha múltiplos roles
    // ou nenhum, e o catch silenciosamente rebaixava para "employee" — perdendo
    // privilégios de admin/owner. Agora buscamos todos e escolhemos o de maior
    // prioridade.
    try {
      const { data, error } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", userId);
      if (error) throw error;
      const priority: AppRole[] = ["owner", "admin", "manager", "employee"];
      const roles = (data || []).map((r: any) => r.role as AppRole);
      const best = priority.find((p) => roles.includes(p)) || "employee";
      setRole(best);
    } catch {
      setRole("employee");
    }
  };

  useEffect(() => {
    let isMounted = true;

    // 1. Restore session from storage first
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!isMounted) return;
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        await fetchRole(session.user.id);
      }
      if (isMounted) setLoading(false);
    });

    // 2. Listen for subsequent auth changes — do NOT await inside callback
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        if (!isMounted) return;
        setSession(session);
        setUser(session?.user ?? null);
        if (session?.user) {
          // Fire and forget — no await to prevent deadlocks
          fetchRole(session.user.id);
        } else {
          setRole(null);
        }
      }
    );

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  const isAdmin = role === "owner" || role === "admin";

  return (
    <AuthContext.Provider value={{ user, session, loading, role, isAdmin, signOut }}>
      {children}
    </AuthContext.Provider>
  );
};
