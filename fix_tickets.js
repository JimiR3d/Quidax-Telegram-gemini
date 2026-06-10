import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();
const s = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  const { data, error } = await s
    .from('tickets')
    .update({ status: 'Dismissed' })
    .in('category', ['Praise', 'Spam/Irrelevant', 'General Question', 'Other'])
    .in('status', ['Open', 'In Review']);

  console.log('Updated tickets:', error || 'Success');
}
run();
