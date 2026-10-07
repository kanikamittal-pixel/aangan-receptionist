// ADAPTER for Vaani Labs' post-call webhook.
//
// Vaani's public docs do not publish the webhook payload or signature scheme, so this
// parser accepts several plausible shapes. When you share the real spec / a sample payload,
// ONLY this file needs to change. Everything downstream consumes NormalizedInteraction,
// which is channel-agnostic: a WhatsApp or web-form webhook would build the same object.

export type NormalizedInteraction = {
  channel: "phone" | "whatsapp" | "web";
  externalId: string;
  from: string | null;
  startedAt: Date;
  endedAt: Date;
  durationSec: number | null;
  transcript: string;
  /** seconds from ring to answer, if the platform reports it; null = assume answered immediately */
  answeredAfterSec: number | null;
};

const pick = (o: any, ...keys: string[]) => { for (const k of keys) { const v = k.split(".").reduce((a, p) => a?.[p], o); if (v != null) return v; } return null; };

function transcriptText(t: any): string {
  if (typeof t === "string") return t;
  if (Array.isArray(t)) {
    return t.map((m) => `${/agent|assistant|bot|ai/i.test(m.role ?? m.speaker ?? "") ? "Agent" : "Caller"}: ${m.text ?? m.content ?? m.message ?? ""}`).join("\n");
  }
  return "";
}

export function parseVaaniWebhook(body: any): NormalizedInteraction {
  const d = body?.data ?? body;
  const id = pick(d, "call_id", "callId", "id", "call.id", "session_id");
  const transcript = transcriptText(pick(d, "transcript", "call.transcript", "conversation", "messages"));
  if (!id || !transcript) throw new Error("Unrecognised Vaani payload: need a call id and a transcript. Update lib/vaani.ts");
  const started = new Date(pick(d, "started_at", "start_time", "startedAt", "call.started_at", "created_at") ?? Date.now());
  const durationSec = Number(pick(d, "duration_seconds", "duration_sec", "duration", "call.duration")) || null;
  const ended = new Date(pick(d, "ended_at", "end_time", "endedAt") ?? started.getTime() + (durationSec ?? 0) * 1000);
  return {
    channel: "phone",
    externalId: String(id),
    from: pick(d, "from_number", "from", "caller_number", "caller", "call.from", "customer.number"),
    startedAt: started,
    endedAt: ended,
    durationSec,
    transcript,
    answeredAfterSec: Number(pick(d, "answer_delay_seconds", "ring_duration")) || null,
  };
}
