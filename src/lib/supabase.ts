import { createClient } from '@supabase/supabase-js';

const rawUrl = import.meta.env.VITE_SUPABASE_URL || import.meta.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseUrl = rawUrl.replace(/^['"]|['"]$/g, '');

const rawAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || import.meta.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const finalAnonKey = rawAnonKey.replace(/^['"]|['"]$/g, '');

if (!finalAnonKey) {
  console.warn('Supabase Anon Key is missing. Using placeholder key.');
}

export const supabase = createClient(supabaseUrl, finalAnonKey || 'placeholder-key-for-initialization');

// Isolated client for admin operations like creating users without logging out
export const supabaseAdminAuth = createClient(supabaseUrl, finalAnonKey || 'placeholder-key-for-initialization', {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
    storageKey: 'sb-admin-auth-token'
  }
});
