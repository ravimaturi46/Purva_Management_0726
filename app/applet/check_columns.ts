import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: '.env' });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  const { data, error } = await supabase.from('project_checklists').select('completed_by, completed_at, is_client_approval').limit(1);
  if (error) {
    console.log("Columns might be missing:", error.message);
  } else {
    console.log("Columns exist!");
  }
}
run();
