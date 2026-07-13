import React, { createContext, useContext, useState, useEffect } from 'react';
import { Profile } from '../types';
import { supabase } from '../lib/supabase';

interface UserContextType {
  user: Profile | null;
  setUser: (user: Profile | null) => void;
  allUsers: Profile[];
  refreshUsers: () => Promise<void>;
  loading: boolean;
  recoveryMode: boolean;
  setRecoveryMode: (mode: boolean) => void;
}

const UserContext = createContext<UserContextType | undefined>(undefined);

export const UserProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<Profile | null>(null);
  const [allUsers, setAllUsers] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [recoveryMode, setRecoveryMode] = useState(false);

  useEffect(() => {
    // Check active session
    supabase.auth.getSession()
      .then((res) => {
        const session = res?.data?.session;
        const error = res?.error;

        if (error) {
          console.error("Session fetch error:", error);
          // If the refresh token is invalid or not found, sign out to clear storage
          if (
            error.message?.toLowerCase().includes('refresh token') ||
            error.message?.toLowerCase().includes('invalid_grant') ||
            error.message?.toLowerCase().includes('not found')
          ) {
            supabase.auth.signOut()
              .finally(() => {
                setLoading(false);
              });
            return;
          }
        }

        if (session?.user) {
          fetchCurrentUserProfile(session.user);
        } else {
          setLoading(false);
        }
      })
      .catch((err) => {
        console.error("Critical error in getSession handler:", err);
        supabase.auth.signOut()
          .finally(() => {
            setLoading(false);
          });
      });

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY') {
        setRecoveryMode(true);
      }

      if (session?.user) {
        fetchCurrentUserProfile(session.user);
      } else {
        setUser(null);
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  // Fetch all profiles only when user is authenticated
  useEffect(() => {
    if (user) {
      fetchProfiles();
    } else {
      setAllUsers([]);
    }
  }, [user]);

  const fetchCurrentUserProfile = async (sessionUser: any) => {
    try {
      // Fetch by email (case-insensitive) instead of ID to prevent mismatch issues
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .ilike('email', sessionUser.email)
        .maybeSingle();
      
      if (error) throw error;

      if (data) {
        // If the IDs don't match (e.g. user was recreated in auth), we should ideally use the session ID
        // But to keep the UI working, we will load the profile we found.
        setUser({ ...data, id: sessionUser.id } as Profile);
      } else {
        // Fallback if profile doesn't exist in the database yet
        const isInitialAdmin = sessionUser.email?.toLowerCase() === 'ravi.maturi46@gmail.com' || 
                               sessionUser.email?.toLowerCase() === 'raviteja.m@purvavedic.com';
                               
        const fallbackProfile: Profile = {
          id: sessionUser.id,
          email: sessionUser.email,
          full_name: sessionUser.user_metadata?.full_name || sessionUser.email?.split('@')[0] || 'User',
          role: isInitialAdmin ? 'admin' : 'employee'
        };
        setUser(fallbackProfile);
        
        // Attempt to auto-create the profile
        supabase.from('profiles').insert([fallbackProfile]).then(({error: insertError}) => {
          if (insertError) console.error('Failed to auto-create profile:', insertError);
        });
      }
    } catch (err) {
      console.error('Error fetching current user profile:', err);
      // Ensure user is set even if fetch fails so they aren't stuck on login screen
      const isInitialAdmin = sessionUser.email?.toLowerCase() === 'ravi.maturi46@gmail.com' || 
                             sessionUser.email?.toLowerCase() === 'raviteja.m@purvavedic.com';
      setUser({
        id: sessionUser.id,
        email: sessionUser.email,
        full_name: sessionUser.email?.split('@')[0] || 'User',
        role: isInitialAdmin ? 'admin' : 'employee'
      } as Profile);
    } finally {
      setLoading(false);
    }
  };

  const fetchProfiles = async () => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .order('full_name', { ascending: true });
      
      if (error) throw error;
      if (data && data.length > 0) {
        setAllUsers(data);
      }
    } catch (err) {
      console.error('Error fetching profiles in context:', err);
    }
  };

  return (
    <UserContext.Provider value={{ user, setUser, allUsers, refreshUsers: fetchProfiles, loading, recoveryMode, setRecoveryMode }}>
      {children}
    </UserContext.Provider>
  );
};

export const useUser = () => {
  const context = useContext(UserContext);
  if (context === undefined) {
    throw new Error('useUser must be used within a UserProvider');
  }
  return context;
};
