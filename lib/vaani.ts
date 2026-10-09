// ADAPTER for Vaani's post-call webhook (docs.vaanivoice.ai/guides/webhook-setup).
// Event we use: "call_postprocessing" -> { event, call_id, timestamp, data: { room_name, call_id,
//   call_duration (MILLISECONDS), end_reason, summary, entities, dispositions, recording_url,
//   transcript: "[13:33:14] AGENT: ...\n\n[13:33:19] USER: ..." } }
// The sample payload carries NO caller number; we read it from data.* if present, else the
// extractor takes the number the caller dictated. Only this file knows Vaani's shapes: the rest of
// the app consumes NormalizedInteraction (channel-agnostic: WhatsApp/web would build the same object).

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

const pick = (o: any, ...keys: string[]) => { for (const k of keys) { const v = k.split(".").reduce((a, p) => a?.[p], o); if (v != null && v !== "") return v; } return null; };

/** "[13:33:14] AGENT: hi\n\n[13:33:19] USER: yes" -> "Front Desk: hi\nCaller: yes" (labels the extraction prompt expects) */
export function normalizeTranscript(t: string): string {
  return t
    .replace(/\[\d{1,2}:\d{2}(?::\d{2})?\]\s*/g, "")
    .replace(/^\s*AGENT:/gim, "Front Desk:")
    .replace(/^\s*USER:/gim, "Caller:")
    .replace(/\n{2,}/g, "\n")
    .trim();
}

export function parseVaaniWebhook(body: any): NormalizedInteraction {
  const d = body?.data ?? body;
  const id = pick(d, "call_id", "room_name") ?? body?.call_id;
  const raw = pick(d, "transcript");
  if (!id || typeof raw !== "string") throw new Error("Unrecognised Vaani payload: need data.call_id and data.transcript");
  const ms = Number(pick(d, "call_duration"));
  const durationSec = Number.isFinite(ms) && ms > 0 ? Math.round(ms / 1000) : null; // call_postprocessing is in ms
  const ended = new Date(body?.timestamp ?? Date.now());
  return {
    channel: "phone",
    externalId: String(id),
    from: pick(d, "phone_number", "from_number", "caller_number", "contact_number", "entities.phone", "entities.phone_number"),
    startedAt: new Date(ended.getTime() - (durationSec ?? 0) * 1000),
    endedAt: ended,
    durationSec,
    transcript: normalizeTranscript(raw),
    answeredAfterSec: null,
  };
}
