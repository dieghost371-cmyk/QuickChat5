// ============================================================
// QuickChat OTP Worker — Deploy to Cloudflare Workers
// Developed By Ghost & Dexter
// ============================================================
//
// SETUP STEPS:
// 1. Go to https://workers.cloudflare.com → Create Worker
// 2. Paste this entire file
// 3. Fill in the 5 constants below (YOUR_* values)
// 4. Deploy → copy your worker URL → paste into app.js
//
// TWILIO SETUP:
// - Account SID & Auth Token: twilio.com/console
// - From Number: your Twilio WhatsApp sandbox number (whatsapp:+14155238886)
// - ContentSid: your approved WhatsApp OTP template SID
//
// ============================================================

// ── Twilio credentials (set these) ──────────────────────────
const TWILIO_ACCOUNT_SID  = "YOUR_TWILIO_ACCOUNT_SID";
const TWILIO_AUTH_TOKEN   = "YOUR_TWILIO_AUTH_TOKEN";
const TWILIO_FROM         = "whatsapp:+14155238886";
const TWILIO_CONTENT_SID  = "YOUR_CONTENT_TEMPLATE_SID";
const WORKER_SECRET       = "YOUR_RANDOM_SECRET_STRING";
// ────────────────────────────────────────────────────────────

const otpStore = new Map();
const OTP_TTL_MS = 5 * 60 * 1000;

function generateOtp(){
  return Math.floor(100000 + Math.random() * 900000).toString();
}

function json(data, status=200){
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
  });
}

async function sendWhatsAppOtp(toPhone, code){
  const url = `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`;
  const body = new URLSearchParams({
    To:               `whatsapp:${toPhone}`,
    From:             TWILIO_FROM,
    ContentSid:       TWILIO_CONTENT_SID,
    ContentVariables: JSON.stringify({ "1": code })
  });
  const credentials = btoa(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`);
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Authorization": `Basic ${credentials}`,
      "Content-Type":  "application/x-www-form-urlencoded"
    },
    body: body.toString()
  });
  const data = await res.json();
  if(!res.ok) throw new Error(data.message || "Twilio error");
  return data.sid;
}

export default {
  async fetch(request, env, ctx){
    if(request.method === "OPTIONS"){
      return new Response(null, {
        status: 204,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type, X-Worker-Secret"
        }
      });
    }

    if(request.method !== "POST") return json({ error: "Method not allowed" }, 405);

    const secret = request.headers.get("X-Worker-Secret");
    if(secret !== WORKER_SECRET) return json({ error: "Unauthorized" }, 401);

    let body;
    try{ body = await request.json(); }
    catch(e){ return json({ error: "Invalid JSON" }, 400); }

    const { action, phone, code } = body;

    if(action === "send"){
      if(!phone) return json({ error: "Phone required" }, 400);
      const existing = otpStore.get(phone);
      if(existing && existing.expires - OTP_TTL_MS + 60000 > Date.now()){
        return json({ error: "Wait 60 seconds before resending" }, 429);
      }
      const otp = generateOtp();
      otpStore.set(phone, { code: otp, expires: Date.now() + OTP_TTL_MS });
      try{
        const sid = await sendWhatsAppOtp(phone, otp);
        return json({ success: true, sid });
      }catch(e){
        otpStore.delete(phone);
        return json({ error: e.message }, 500);
      }
    }

    if(action === "verify"){
      if(!phone || !code) return json({ error: "Phone and code required" }, 400);
      const stored = otpStore.get(phone);
      if(!stored) return json({ verified: false, error: "No OTP found. Request a new code." }, 400);
      if(Date.now() > stored.expires){ otpStore.delete(phone); return json({ verified: false, error: "OTP expired" }, 400); }
      if(stored.code !== code.trim()) return json({ verified: false, error: "Incorrect code" }, 400);
      otpStore.delete(phone);
      return json({ verified: true });
    }

    return json({ error: "Unknown action" }, 400);
  }
};
