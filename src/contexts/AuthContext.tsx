import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';

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
    const timeout = setTimeout(() => {
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
      if (event === 'TOKEN_REFRESHED') {
        if (session) {
          if (session.access_token === currentAccessTokenRef.current) {
            return;
          }
          currentAccessTokenRef.current = session.access_token;
          if (session.user.id !== currentUserIdRef.current) {
            currentUserIdRef.current = session.user.id;
            setSession(session);
            setUser(session.user);
          } else {
            setSession(session);
          }
        }
        return;
      }

      if (event === 'INITIAL_SESSION') {
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
    });

    return () => {
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
