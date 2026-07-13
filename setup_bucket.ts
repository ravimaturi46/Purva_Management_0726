import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL || '';
const supabaseKey = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

async function setup() {
  const { data, error } = await supabase.storage.createBucket('petty_cash_receipts', {
    public: true,
    fileSizeLimit: 10485760, // 10MB
  });
  const { data: pfData, error: pfError } = await supabase.storage.createBucket('project_files', {
    public: true,
    fileSizeLimit: 52428800, // 50MB
  });
  if (pfError && pfError.message !== 'The resource already exists') {
    console.error('Bucket creation error for project_files:', pfError);
  } else {
    console.log('Bucket "project_files" is ready.');
  }
}
setup();
