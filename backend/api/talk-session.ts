// Creates a Vaani web-call session and exchanges it for LiveKit credentials (server-side, so the API key never reaches the browser).
// Each call is billable: 15-minute cap and a best-effort per-IP limit.
import { freeSlotsForAgent } from "@/backend/integrations/calcom/client";

const hits = new Map<string, number[]>();
const VAANI = "https://api.vaanivoice.ai";

const vaaniGet = (path: string) => fetch(VAANI + path, { headers: { "X-API-Key": process.env.VAANI_API_KEY ?? "" } });

/**
 * The agent's own prompt plus today's date and the designer's real free times from Cal.com, so the agent only offers times that
 * can actually be booked. Any failure returns null and the call simply runs on the stored prompt.
 */
async function promptWithLiveCalendar(): Promise<string | null> {
  try {
    const key = process.env.CAL_API_KEY, eventTypeId = Number(process.env.CAL_EVENT_TYPE_ID);
    if (!key || !eventTypeId) return null;
    const [agentRes, cal] = await Promise.all([vaaniGet(`/api/agents/${process.env.VAANI_AGENT_ID}`), freeSlotsForAgent(key, eventTypeId)]);
    const agent: any = await agentRes.json();
    const base: string | undefined = (agent.data ?? agent)?.persona?.identity?.system_prompt;
    if (!base || !cal) return null;
    return `${base}

# Live calendar (read this carefully)

Right now it is ${cal.today} Indian time. For each date you are given the exact FREE start times and the NOT AVAILABLE start times (booked by someone else, or already past). Every consultation is 30 minutes. Times are written one by one, never as ranges.

${cal.text}

Rules for booking:
- Say a time is available ONLY if that exact time is written under FREE for that date. If it is under NOT AVAILABLE, or not written at all (for example anything after 4:30 pm), say it is not available.
- Ask the caller which day suits them, then offer one or two times from that day's FREE list.
- If the caller asks for a time that is not under FREE, tell them it is not available and offer the closest FREE times. If asked which times are free or taken, read them from these lists.
- Do not use @book_appointment until the caller has agreed to one exact date and time from a FREE list, and you have their name, confirmed phone number and confirmed email.
- When you book, pass exactly that date and time. When you speak the day and date, use the weekday written in the list.`;
  } catch (e) {
    console.error("[talk] live calendar unavailable:", e);
    return null;
  }
}

const vaani = (path: string, body: unknown) =>
  fetch(VAANI + path, { method: "POST", headers: { "X-API-Key": process.env.VAANI_API_KEY ?? "", "content-type": "application/json" }, body: JSON.stringify(body) });

export async function POST(req: Request) {
  const ip = (req.headers.get("x-forwarded-for") ?? "unknown").split(",")[0].trim();
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < 3_600_000);
  if (recent.length >= 6) return Response.json({ error: "Too many call attempts. Please try again later." }, { status: 429 });
  hits.set(ip, [...recent, now]);

  // Default path: Create Dispatch (medium "webrtc") with a per-call override of the initial-silence hang-up (10s -> 45s).
  // `?old=1` falls back to the plain session API (agent config as stored, no override).
  if (!new URL(req.url).searchParams.has("old")) {
    const livePrompt = await promptWithLiveCalendar();
    const res = await vaani("/api/trigger-call/", {
      agent_id: process.env.VAANI_AGENT_ID,
      medium: "webrtc",
      voice_gender: "male", // the agent's configured voice (devansh) is male
      primary_language: "en",
      secondary_language: "hi",
      welcome_message: "Good day, Aangan Studio. This call is recorded to help us serve you better. Is that okay?",
      welcome_interruptible: false,
      modify_agent: {
        experience: { settings: { idle_conversation_settings: { initial_idle_call_hungup_timeout: 45 } } },
        ...(livePrompt ? { persona: { identity: { system_prompt: livePrompt } } } : {}),
      },
    });
    if (!res.ok) { const t = (await res.text()).slice(0, 300); console.error("vaani trigger-call webrtc", res.status, t); return Response.json({ error: /balance|402|payment/i.test(t) ? "The voice assistant is temporarily unavailable. Please try again later." : "Could not start the call. Please try again." }, { status: 502 }); }
    const j: any = await res.json();
    if (j.status_code === 402 || /insufficient balance/i.test(String(j.message ?? ""))) { console.error("VAANI WALLET EMPTY:", j.message); return Response.json({ error: "The voice assistant is temporarily unavailable. Please try again later." }, { status: 503 }); }
    if (!j.token || !j.connection_url) { console.error("vaani trigger-call: unexpected response", JSON.stringify(j).slice(0, 300)); return Response.json({ error: "Could not start the call. Please try again." }, { status: 502 }); }
    return Response.json({ lk_url: j.connection_url, lk_token: j.token, session_token: null, room: j.room_name });
  }

  const created = await vaani("/api/webrtc/session/create", { agent_id: process.env.VAANI_AGENT_ID, ui_type: "widget", session_ttl: 900, grace_period: 30 });
  if (!created.ok) { console.error("vaani session create", created.status, (await created.text()).slice(0, 300)); return Response.json({ error: "Could not start the call. Please try again." }, { status: 502 }); }
  const { session_token } = await created.json();

  const conn = await vaani("/api/webrtc/session/connect", { session_token });
  if (!conn.ok) { console.error("vaani session connect", conn.status, (await conn.text()).slice(0, 300)); return Response.json({ error: "Could not connect the call. Please try again." }, { status: 502 }); }
  const { lk_url, lk_token } = await conn.json();
  return Response.json({ lk_url, lk_token, session_token });
}
