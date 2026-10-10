// Public "talk to Aangan" link: creates a Vaani web (WebRTC) session for the receptionist agent and sends the visitor to it.
// Each visit starts a billable session, so: 15-minute cap, and a best-effort per-IP limit.
const hits = new Map<string, number[]>();

export async function GET(req: Request) {
  const ip = (req.headers.get("x-forwarded-for") ?? "unknown").split(",")[0].trim();
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < 3_600_000);
  if (recent.length >= 6) return new Response("Too many call attempts from this connection. Please try again later.", { status: 429 });
  hits.set(ip, [...recent, now]);

  const res = await fetch("https://api.vaanivoice.ai/api/webrtc/session/create", {
    method: "POST",
    headers: { "X-API-Key": process.env.VAANI_API_KEY ?? "", "content-type": "application/json" },
    body: JSON.stringify({ agent_id: process.env.VAANI_AGENT_ID, ui_type: "fullpage", session_ttl: 900, grace_period: 30 }),
  });
  if (!res.ok) {
    console.error("vaani session create failed", res.status, (await res.text()).slice(0, 300));
    return new Response("Sorry, we couldn't start the call right now. Please try again in a moment.", { status: 502 });
  }
  const { session_url } = await res.json();
  return Response.redirect(session_url, 302);
}
