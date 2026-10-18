import {createContext, useCallback, useContext, useEffect, useMemo, useState} from 'react';
import {api, type User} from './api';

interface AuthState {
  user: User | null;
  needsSetup: boolean;
  setupCodeRequired: boolean;
  ready: boolean;
  login: (email: string, password: string) => Promise<void>;
  setup: (name: string, email: string, password: string, setupCode?: string) => Promise<void>;
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
  const [setupCodeRequired, setSetupCodeRequired] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        setUser((await api.get<{user: User}>('/auth/me')).user);
      } catch {
        try {
          const s = await api.get<{needs_setup: boolean; setup_code_required: boolean}>('/auth/status');
          setNeedsSetup(s.needs_setup);
          setSetupCodeRequired(s.setup_code_required);
        } catch { /* servidor indisponível */ }
      } finally {
        setReady(true);
      }
    })();
  }, []);

  const login = useCallback(async (email: string, password: string) => setUser((await api.post<{user: User}>('/auth/login', {email, password})).user), []);
  const setup = useCallback(async (name: string, email: string, password: string, setupCode?: string) => {
    setUser((await api.post<{user: User}>('/auth/setup', {name, email, password, setup_code: setupCode})).user);
    setNeedsSetup(false);
  }, []);
  const logout = useCallback(async () => { await api.post('/auth/logout'); setUser(null); }, []);
  const can = useCallback((...roles: User['role'][]) => !!user && roles.includes(user.role), [user]);
  const value = useMemo(() => ({user, needsSetup, setupCodeRequired, ready, login, setup, logout, can}), [user, needsSetup, setupCodeRequired, ready, login, setup, logout, can]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
