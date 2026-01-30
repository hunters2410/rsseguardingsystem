import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { supabase } from '../lib/supabase';
import type { User, Session } from '@supabase/supabase-js';

type AuthContextType = {
  user: User | null;
  session: Session | null;
  role: 'admin' | 'viewer' | null;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signUp: (email: string, password: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
  loading: boolean;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [role, setRole] = useState<'admin' | 'viewer' | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        fetchRole(session.user.id);
      } else {
        setLoading(false);
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        fetchRole(session.user.id);
      } else {
        setRole(null);
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const fetchRole = async (userId: string) => {
    try {
      // First, try to get the existing role
      const { data, error } = await supabase
        .from('user_profiles')
        .select('role')
        .eq('id', userId)
        .maybeSingle();

      if (error) {
        console.error('Error fetching role:', error);
        setRole('viewer'); // Fail-safe default
        return;
      }

      if (data) {
        setRole(data.role);
      } else {
        // If profile doesn't exist, we might be the first user or a new signup
        // Check total user count to decide if this user should be an admin
        const { count } = await supabase
          .from('user_profiles')
          .select('*', { count: 'exact', head: true });

        const newRole = (count === 0) ? 'admin' : 'viewer';

        // Try to create the profile on the fly if trigger failed
        const { data: newProfile } = await supabase
          .from('user_profiles')
          .upsert({
            id: userId,
            email: user?.email || '',
            role: newRole
          })
          .select()
          .single();

        if (newProfile) {
          setRole(newProfile.role);
        } else {
          setRole(newRole);
        }
      }
    } catch (error) {
      console.error('Critical auth error:', error);
      setRole('viewer');
    } finally {
      setLoading(false);
    }
  };

  const signIn = async (email: string, password: string) => {
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      return { error };
    } catch (error) {
      return { error: error as Error };
    }
  };

  const signUp = async (email: string, password: string) => {
    try {
      const { error } = await supabase.auth.signUp({
        email,
        password,
      });
      return { error };
    } catch (error) {
      return { error: error as Error };
    }
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setRole(null);
  };

  return (
    <AuthContext.Provider value={{ user, session, role, signIn, signUp, signOut, loading }}>
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
