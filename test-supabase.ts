import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

const supabaseUrl = (process.env.VITE_SUPABASE_URL || '').replace(/^['"]|['"]$/g, '');
const supabaseAnonKey = (process.env.VITE_SUPABASE_ANON_KEY || '').replace(/^['"]|['"]$/g, '');
console.log('Supabase URL resolved:', JSON.stringify(supabaseUrl));
console.log('Supabase Anon Key resolved length:', supabaseAnonKey.length);

const supabase = createClient(supabaseUrl, supabaseAnonKey);
async function test() {
  const { data: fetch, error: fetchErr } = await supabase.from('workspace_settings').select('id, file_permissions_config').limit(1).maybeSingle();
  console.log('Fetch:', fetch, fetchErr);
  
  // Simulate updating
  if (fetch?.id) {
     const { data, error } = await supabase.from('workspace_settings').update({ file_permissions_config: { test: true } }).eq('id', fetch.id).select();
     console.log('Update:', data, error);
  } else {
     const { data, error } = await supabase.from('workspace_settings').insert([{ file_permissions_config: { test: true } }]).select();
     console.log('Insert:', data, error);
  }
}
test();
