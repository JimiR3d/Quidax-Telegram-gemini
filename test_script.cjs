require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  const req = {
    query: {
      issues_only: 'false',
      urgency: 'All',
    }
  };

  let statsQuery = supabase
    .from('tickets')
    .select('id, status, urgency, created_at, updated_at, category')
    .order('created_at', { ascending: false })
    .limit(5000);

  const applyBaseFilters = (q) => { return q; };
  const applyStatsFilters = (q) => { return q; };

  statsQuery = applyStatsFilters(applyBaseFilters(statsQuery));
  
  const { data: statsData, error: statsError } = await statsQuery;
  const allData = statsData || [];
  const resolved = allData.filter(t => t.status === 'Resolved' || t.status === 'Dismissed');
  const openCount = allData.filter(t => t.status === 'Open').length;

  console.log('allData:', allData.length);
  console.log('resolved:', resolved.length);
  console.log('open:', openCount);
}

run();

