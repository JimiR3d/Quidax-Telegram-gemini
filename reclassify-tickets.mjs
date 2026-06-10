import { createClient } from "@supabase/supabase-js";
import OpenAI from "openai";
import dotenv from "dotenv";
dotenv.config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const openai = new OpenAI({
  apiKey: process.env.GROQ_API_KEY,
  baseURL: "https://api.groq.com/openai/v1",
});

const GROQ_SYSTEM_PROMPT = `You are a ticket classifier for Quidax, a Nigerian crypto exchange (BTC, ETH, USDT, XRP, QDX). Your job is to classify user support messages accurately.
Respond ONLY with raw JSON matching the schema. No markdown. No explanation. Just JSON.

=== CATEGORIES (pick exactly one) ===
- "Withdrawal Issue"  — user cannot withdraw NGN or crypto, withdrawal pending/stuck/failed
- "Deposit Issue"     — deposit not received, unconfirmed on-chain, balance not updated
- "Account Access"    — cannot login, locked out, 2FA problems, password reset, account compromised/hacked
- "KYC/Verification" — Tier 1/2/3 upgrade, BVN/NIN submission, document review pending, identity verification
- "Trading Problem"   — order stuck, wrong fill, limit order not executed, swap issue
- "App Bug"           — app crash, UI error, feature broken, platform glitch
- "Fee Complaint"     — charged wrong fee, unexpected deduction, fee dispute
- "Network/Downtime"  — platform down, cannot connect, widespread login failure
- "General Question"  — asking for information only, no problem reported (e.g. "what is the withdrawal limit?")
- "Praise"            — positive feedback, compliment, no issue
- "Spam/Irrelevant"   — greetings, off-topic, emojis only, price discussion

=== URGENCY RULES (pick exactly one) ===
- "Critical" — money stuck/lost, account hacked, funds withdrawn without consent, 3+ days without resolution
- "High"     — active financial problem (deposit/withdrawal issue < 3 days), account locked with funds at risk
- "Medium"   — KYC pending, app bug, trading problem, fee dispute, 1-2 day delays
- "Low"      — general questions, praise, minor inconvenience, no financial impact

=== URGENCY EXAMPLES ===
"I have been trying to withdraw ₦250,000 since Monday" -> Critical
"My deposit hasn't reflected after 2 hours" -> High
"My KYC was rejected, I need to resubmit" -> Medium
"What are the withdrawal limits for Tier 1?" -> Low

=== KEY CONTEXT ===
- ₦ = Nigerian Naira. NGN withdrawals go to Nigerian bank accounts.
- TRC20/BEP20/ERC20 = crypto network types for USDT deposits.

=== OUTPUT SCHEMA (STRICT JSON) ===
{
  "summary": "Short 1-sentence summary of the issue",
  "category": "Must be exactly one of the categories listed above",
  "urgency": "Critical | High | Medium | Low",
  "product_area": "Wallet | Exchange | Mobile App | Identity/KYC | Other",
  "sentiment": "Frustrated | Confused | Neutral | Positive | Angry",
  "is_complaint": true or false,
  "suggested_action": "1 short sentence suggesting what the support agent should do"
}
`;

function safePrompt(text) {
  return text.length > 800 ? text.substring(0, 800) + "... [truncated]" : text;
}

function parseAndValidateClassification(jsonStr) {
  try {
    const parsed = JSON.parse(jsonStr);
    const validCategories = ["Withdrawal Issue", "Deposit Issue", "Account Access", "KYC/Verification", "Trading Problem", "App Bug", "Fee Complaint", "Network/Downtime", "General Question", "Praise", "Spam/Irrelevant"];
    const validUrgencies = ["Critical", "High", "Medium", "Low"];
    
    if (!validCategories.includes(parsed.category)) parsed.category = "General Question";
    if (!validUrgencies.includes(parsed.urgency)) parsed.urgency = "Low";
    
    return {
      summary: parsed.summary || "No summary provided",
      category: parsed.category,
      urgency: parsed.urgency,
      product_area: parsed.product_area || "Other",
      sentiment: parsed.sentiment || "Neutral",
      is_complaint: Boolean(parsed.is_complaint),
      suggested_action: parsed.suggested_action || "Review manually"
    };
  } catch (err) {
    return {
      summary: "Classification failed",
      category: "General Question",
      urgency: "Low",
      product_area: "Other",
      sentiment: "Neutral",
      is_complaint: false,
      suggested_action: "Review manually due to parsing error"
    };
  }
}

async function reclassify() {
  const { data: tickets, error } = await supabase
    .from("tickets")
    .select("*")
    .eq("summary", "Processing message...");

  if (error) {
    console.error("Error fetching tickets:", error);
    return;
  }

  console.log(`Found ${tickets.length} tickets to reclassify.`);

  for (const t of tickets) {
    // Determine deep link
    let deepLink = t.telegram_deep_link;
    if (!deepLink && t.telegram_message_id) {
      deepLink = `https://t.me/${t.group_id}/${t.telegram_message_id}`;
    }

    try {
      const response = await openai.chat.completions.create({
        model: "llama-3.3-70b-versatile",
        temperature: 0,
        messages: [
          { role: "system", content: GROQ_SYSTEM_PROMPT },
          { role: "user", content: safePrompt(t.raw_text) },
          { role: "assistant", content: "I will now output only the JSON classification:" },
        ],
        response_format: { type: "json_object" },
      });

      const jsonStr = response.choices[0]?.message?.content?.trim() || "{}";
      const ticketData = parseAndValidateClassification(jsonStr);

      const needsEscalation = ticketData.urgency === "Critical";
      const finalStatus = needsEscalation ? "In Review" : "Open";
      const finalSummary = needsEscalation ? `[ESCALATED] ${ticketData.summary}` : ticketData.summary;

      await supabase
        .from("tickets")
        .update({
          summary: finalSummary,
          category: ticketData.category,
          urgency: ticketData.urgency,
          product_area: ticketData.product_area,
          sentiment: ticketData.sentiment,
          is_complaint: ticketData.is_complaint,
          suggested_action: ticketData.suggested_action,
          status: finalStatus,
          telegram_deep_link: deepLink
        })
        .eq("id", t.id);

      console.log(`Successfully reclassified ticket ${t.id}`);
    } catch (e) {
      console.error(`Error reclassifying ticket ${t.id}:`, e.message);
    }
  }
  
  console.log("Done.");
}

reclassify();
