import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();
const s = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  const { data, error } = await s
    .from('tickets')
    .select('id, raw_text')
    .in('status', ['Open', 'In Review']);

  if (error) return console.log(error);
  
  let count = 0;
  for (const t of data) {
    if (/\b(thanks|thank you|resolved|fixed|worked|solved|appreciate)\b/i.test(t.raw_text)) {
      await s.from('tickets').update({ status: 'Resolved' }).eq('id', t.id);
      count++;
    }
  }
  console.log(`Updated ${count} tickets to Resolved based on text.`);
}
run();
