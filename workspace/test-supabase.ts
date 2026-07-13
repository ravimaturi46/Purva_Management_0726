import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

// read the .env file
require('dotenv').config();

const supabaseUrl = process.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY || '';

const supabase = createClient(supabaseUrl, supabaseAnonKey);
async function test() {
  const { data: fetch, error: fetchErr } = await supabase.from('workspace_settings').select('id, file_permissions_config').limit(1).maybeSingle();
  console.log('Fetch:', fetch, fetchErr);
}
test();
