import {createContext, useCallback, useContext, useEffect, useMemo, useState} from 'react';
import {api, type User} from './api';

interface AuthState {
  user: User | null;
  needsSetup: boolean;
  ready: boolean;
  login: (email: string, password: string) => Promise<void>;
  setup: (name: string, email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  can: (...roles: User['role'][]) => boolean;
}
const Ctx = createContext<AuthState | null>(null);
export const useAuth = () => {
  const c = useContext(Ctx);
  if (!c) throw new Error('useAuth fora do AuthProvider');
  return c;
};

export function AuthProvider({children}: {children: React.ReactNode}) {
  const [user, setUser] = useState<User | null>(null);
  const [needsSetup, setNeedsSetup] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        setUser((await api.get<{user: User}>('/auth/me')).user);
      } catch {
        try { setNeedsSetup((await api.get<{needs_setup: boolean}>('/auth/status')).needs_setup); } catch { /* servidor indisponível */ }
      } finally {
        setReady(true);
      }
    })();
  }, []);

  const login = useCallback(async (email: string, password: string) => setUser((await api.post<{user: User}>('/auth/login', {email, password})).user), []);
  const setup = useCallback(async (name: string, email: string, password: string) => {
    setUser((await api.post<{user: User}>('/auth/setup', {name, email, password})).user);
    setNeedsSetup(false);
  }, []);
  const logout = useCallback(async () => { await api.post('/auth/logout'); setUser(null); }, []);
  const can = useCallback((...roles: User['role'][]) => !!user && roles.includes(user.role), [user]);
  const value = useMemo(() => ({user, needsSetup, ready, login, setup, logout, can}), [user, needsSetup, ready, login, setup, logout, can]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
