import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
// TEMPORARY — the "random reload" investigation. Remove with authDiagnostics.ts.
import {
  describeSession,
  installAuthDiagnosticsGlobal,
  logAuthDiagnostic,
  recordPageLoad,
} from '../lib/authDiagnostics';

// Module scope, so this runs exactly once per real page load -- NOT once per React
// mount. That difference is the whole question: a second 'provider-mount' entry with
// no new 'page-load' entry above it is a remount, and proves the browser did not
// reload. StrictMode double-mounts in development, so expect two in dev, one in a
// production build.
recordPageLoad();
installAuthDiagnosticsGlobal();

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, fullName: string) => Promise<void>;
  signOut: () => Promise<void>;
  resetPasswordForEmail: (email: string) => Promise<void>;
  updatePassword: (newPassword: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const currentUserIdRef = useRef<string | null>(null);
  const currentAccessTokenRef = useRef<string | null>(null);

  useEffect(() => {
    // TEMPORARY — see authDiagnostics.ts.
    logAuthDiagnostic('provider-mount');

    const timeout = setTimeout(() => {
      // TEMPORARY — this 5 s escape hatch forces loading false whether or not the
      // session resolved (LOG-9 in the review). If it fires, App.tsx's full-screen
      // gate flips and the whole tree re-renders, so it is worth seeing.
      logAuthDiagnostic('loading-timeout-fired', { afterMs: 5000 });
      setLoading(false);
    }, 5000);

    supabase.auth.getSession()
      .then(({ data: { session } }) => {
        clearTimeout(timeout);
        setSession(session);
        setUser(session?.user ?? null);
        currentUserIdRef.current = session?.user?.id ?? null;
        currentAccessTokenRef.current = session?.access_token ?? null;
        setLoading(false);
      })
      .catch(() => {
        clearTimeout(timeout);
        setLoading(false);
      });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      /*
       * TEMPORARY — see authDiagnostics.ts. This must stay ABOVE every early return
       * below, because the early returns are precisely the cases under investigation:
       * a TOKEN_REFRESHED whose token did not change, and INITIAL_SESSION.
       *
       * Reading the result:
       *   TOKEN_REFRESHED roughly hourly, or on tab focus  -> T-1 / T-2
       *   a SIGNED_OUT nobody asked for                    -> T-3, and check the
       *     Network tab for a 400 on /auth/v1/token?grant_type=refresh_token
       */
      logAuthDiagnostic(`event:${event}`, {
        ...describeSession(session),
        knownUserId: currentUserIdRef.current
          ? currentUserIdRef.current.slice(0, 8)
          : null,
        tokenWillChange:
          (session?.access_token ?? null) !== currentAccessTokenRef.current,
      });

      if (event === 'TOKEN_REFRESHED') {
        if (session) {
          if (session.access_token === currentAccessTokenRef.current) {
            logAuthDiagnostic('decision', { branch: 'refresh/no-op', setUser: false, setSession: false });
            return;
          }
          currentAccessTokenRef.current = session.access_token;
          if (session.user.id !== currentUserIdRef.current) {
            currentUserIdRef.current = session.user.id;
            setSession(session);
            setUser(session.user);
            logAuthDiagnostic('decision', { branch: 'refresh/identity-changed', setUser: true, setSession: true });
          } else {
            setSession(session);
            logAuthDiagnostic('decision', { branch: 'refresh/same-identity', setUser: false, setSession: true });
          }
        }
        return;
      }

      if (event === 'INITIAL_SESSION') {
        logAuthDiagnostic('decision', { branch: 'initial-session/ignored', setUser: false, setSession: false });
        return;
      }

      const newUserId = session?.user?.id ?? null;
      const accessToken = session?.access_token ?? null;
      const userChanged = newUserId !== currentUserIdRef.current;
      const tokenChanged = accessToken !== currentAccessTokenRef.current;

      currentUserIdRef.current = newUserId;
      currentAccessTokenRef.current = accessToken;

      // Always update the session (access token may have rotated).
      setSession(session);
      // Only update the user object when the identity actually changed to
      // avoid propagating a new object reference (and re-triggering effects
      // that depend on user.id) for SIGNED_IN events fired on tab focus.
      if (userChanged || tokenChanged) {
        setUser(session?.user ?? null);
      }

      /*
       * TEMPORARY — this is the R-2 measurement.
       *
       * `setUser: true` with `userChanged: false` is the defect R-2 describes: a brand
       * new user object published for the same person, which re-runs every effect
       * keyed on `user` (R-3's four files) and unmounts whatever they were doing.
       * If that combination never appears in a real session, R-2 is not the trigger
       * and the diagnosis should be corrected rather than the code.
       */
      logAuthDiagnostic('decision', {
        branch: `fallthrough/${event}`,
        userChanged,
        tokenChanged,
        setUser: userChanged || tokenChanged,
        setSession: true,
      });
    });

    return () => {
      // A remount unsubscribes and resubscribes. Paired with 'provider-mount' this
      // shows the teardown directly.
      logAuthDiagnostic('provider-unmount');
      clearTimeout(timeout);
      subscription.unsubscribe();
    };
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) throw error;
  }, []);

  const signUp = useCallback(async (email: string, password: string, fullName: string) => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
    });

    if (error) throw error;

    if (data.user) {
      const { error: profileError } = await supabase
        .from('user_profiles')
        .insert({
          id: data.user.id,
          email,
          full_name: fullName,
        });

      if (profileError) throw profileError;
    }
  }, []);

  const signOut = useCallback(async () => {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  }, []);

  const resetPasswordForEmail = useCallback(async (email: string) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}`,
    });
    if (error) throw error;
  }, []);

  const updatePassword = useCallback(async (newPassword: string) => {
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) throw error;
  }, []);

  const value = useMemo(
    () => ({ user, session, loading, signIn, signUp, signOut, resetPasswordForEmail, updatePassword }),
    [user, session, loading, signIn, signUp, signOut, resetPasswordForEmail, updatePassword]
  );

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
