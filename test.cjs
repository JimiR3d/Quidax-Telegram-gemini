const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
(async () => {
  const { data, error } = await supabase.from('tickets')
    .select('id, summary, category, urgency')
    .or('summary.eq."Processing message...",and(urgency.neq.Low,category.not.in.("Praise","Spam/Irrelevant","General Question"))')
    .limit(1);
  console.log(data || error);
})();
