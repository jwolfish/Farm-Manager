import { createContext, useContext, useEffect, useState } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, fullName: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    console.log('[Auth] Initializing...');
    const timeout = setTimeout(() => {
      console.warn('[Auth] Check timed out, proceeding with no session');
      setLoading(false);
    }, 5000);

    supabase.auth.getSession()
      .then(({ data: { session } }) => {
        console.log('[Auth] Session loaded:', session ? 'logged in' : 'no session');
        clearTimeout(timeout);
        setSession(session);
        setUser(session?.user ?? null);
        setLoading(false);
      })
      .catch((error) => {
        console.error('[Auth] Error getting session:', error);
        clearTimeout(timeout);
        setLoading(false);
      });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      console.log('[Auth] State change:', event, session ? 'logged in' : 'no session');
      if (event === 'TOKEN_REFRESHED' || event === 'INITIAL_SESSION') {
        if (session) {
          setSession(session);
          setUser(session.user);
        }
        return;
      }
      setSession(session);
      setUser(session?.user ?? null);
    });

    return () => {
      clearTimeout(timeout);
      subscription.unsubscribe();
    };
  }, []);

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) throw error;
  };

  const signUp = async (email: string, password: string, fullName: string) => {
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
  };

  const signOut = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  };

  return (
    <AuthContext.Provider value={{ user, session, loading, signIn, signUp, signOut }}>
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
