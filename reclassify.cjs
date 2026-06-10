const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const GROQ_SYSTEM_PROMPT = `You are an expert customer support classifier for Quidax (a crypto exchange).
You will receive a user message from Telegram. Output ONLY valid JSON matching this schema:
{
  "category": string,
  "urgency": string,
  "product_area": string,
  "sentiment": string,
  "is_complaint": boolean,
  "summary": string,
  "suggested_action": string
}

=== CATEGORY RULES (pick exactly one) ===
- "Withdrawal Issue"  ?" missing/delayed withdrawal, NGN or crypto
- "Deposit Issue"     ?" deposit hasn't reflected, missing funds
- "KYC/Verification"  ?" tier upgrade, NIN, BVN, identity rejection
- "Account Access"    ?" forgot password, 2FA issues, account locked
- "Trading Problem"   ?" swap failed, order book issue, pair not available
- "App Bug"           ?" app crash, UI error, feature broken, platform glitch
- "Fee Complaint"     ?" charged wrong fee, unexpected deduction, fee dispute
- "Network/Downtime"  ?" platform down, cannot connect, widespread login failure
- "General Question"  ?" asking for information only, no problem reported (e.g. "what is the withdrawal limit?")
- "Praise"            ?" positive feedback, compliment, no issue
- "Spam/Irrelevant"   ?" greetings, off-topic, emojis only, price discussion

=== URGENCY RULES (pick exactly one) ===
- "Critical" ?" money stuck/lost, account hacked, funds withdrawn without consent, 3+ days without resolution
- "High"     ?" active financial problem (deposit/withdrawal issue < 3 days), account locked with funds at risk
- "Medium"   ?" KYC pending, app bug, trading problem, fee dispute, 1-2 day delays
- "Low"      ?" general questions, praise, minor inconvenience, no financial impact`;

async function reclassify() {
  const { data: tickets } = await supabase
    .from('tickets')
    .select('id, raw_text')
    .or("summary.ilike.%Processing message%,summary.ilike.%Classification failed%");

  console.log('Reclassifying ' + tickets.length + ' tickets...');

  for (let i = 0; i < tickets.length; i++) {
    const t = tickets[i];
    try {
      const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.GROQ_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: 'llama-3.1-8b-instant',
          messages: [
            { role: 'system', content: GROQ_SYSTEM_PROMPT },
            { role: 'user', content: t.raw_text + '\nI will now output only the JSON classification:' }
          ],
          response_format: { type: 'json_object' }
        })
      });

      const jsonRes = await res.json();
      if (jsonRes.error) throw new Error(jsonRes.error.message);

      const raw = JSON.parse(jsonRes.choices[0].message.content);
      if (raw.priority && !raw.urgency) raw.urgency = raw.priority;
      
      const isAutoDismiss = raw.category === 'Praise' || raw.category === 'Spam/Irrelevant';
      const needsEscalation = raw.urgency === 'Critical';
      const finalStatus = isAutoDismiss ? 'Dismissed' : (needsEscalation ? 'In Review' : 'Open');
      const finalSummary = needsEscalation ? '[ESCALATED] ' + raw.summary : raw.summary;

      await supabase.from('tickets').update({
        summary: finalSummary || 'User inquiry',
        category: raw.category || 'General Question',
        urgency: raw.urgency || 'Low',
        product_area: raw.product_area || 'Other',
        sentiment: raw.sentiment || 'Neutral',
        is_complaint: raw.is_complaint || false,
        suggested_action: raw.suggested_action || 'Follow up with user',
        status: finalStatus
      }).eq('id', t.id);

      console.log('Classified ticket ' + t.id + ' -> ' + raw.category + ' (' + raw.urgency + ')');
      await new Promise(r => setTimeout(r, 2000)); // Groq allows more RPM than gemini
    } catch (e) {
      console.log('Failed ' + t.id + ': ' + e.message);
      await new Promise(r => setTimeout(r, 2000));
    }
  }
}

reclassify();
