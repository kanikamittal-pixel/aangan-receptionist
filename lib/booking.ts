import { q } from "./db";
import { loadConfig } from "./config";
import { createBooking, findSlots, getEventLocation, inviteeEmail } from "./calendly";
import { createCalBooking, findCalSlots } from "./cal";
import type { Designer } from "./assign";

export type BookingResult = { start: string; meetingUrl: string | null; provider: "calendly" | "cal" };

/**
 * Book the earliest free slot on the designer's calendar for this lead (Calendly or Cal.com,
 * per designers.scheduler). Throws a human-readable error on failure; callers surface it.
 */
export async function bookConsultation(leadId: string, designer: Designer & { scheduler?: string; cal_api_key?: string | null; cal_event_type_id?: number | null }): Promise<BookingResult> {
  const { settings } = await loadConfig();
  const s = settings.calendly;
  const [lead] = await q("select l.*, (select extraction from calls where lead_id=l.id order by started_at desc limit 1) as ex from leads l where l.id=$1", [leadId]);
  const email: string | null = lead.ex?.email ?? null;
  if (!email && s.email_mode === "collected_only") throw new Error("Caller gave no email and email_mode is collected_only");
  const from = new Date(Date.now() + s.min_notice_hours * 3_600_000);
  const name = lead.name ?? "Aangan enquiry";
  const invitee = inviteeEmail(email, lead.phone, s);

  let start: string, meetingUrl: string | null, externalId: string, eventUri: string | null = null, inviteeUri: string | null = null;
  const provider = designer.scheduler === "cal" ? "cal" : "calendly";

  if (provider === "cal") {
    if (!designer.cal_api_key || !designer.cal_event_type_id) throw new Error(`${designer.name} has no Cal.com API key / event type configured`);
    const slots = await findCalSlots(designer.cal_api_key, designer.cal_event_type_id, from, s.search_days, 1);
    if (!slots.length) throw new Error(`No free ${designer.name} slots in the next ${s.search_days} days`);
    start = slots[0];
    const b = await createCalBooking(designer.cal_api_key, { eventTypeId: designer.cal_event_type_id, start, name, email: invitee, phone: lead.phone, timezone: designer.calendly_timezone });
    externalId = b.uid; meetingUrl = b.meetingUrl;
  } else {
    if (!designer.calendly_token || !designer.calendly_event_type_uri) throw new Error(`${designer.name} has no Calendly token/event type configured`);
    const auth = { token: designer.calendly_token };
    const slots = await findSlots(auth, designer.calendly_event_type_uri, from, s.search_days, 1);
    if (!slots.length) throw new Error(`No free ${designer.name} slots in the next ${s.search_days} days`);
    start = slots[0];
    const b = await createBooking(auth, { eventTypeUri: designer.calendly_event_type_uri, start, name, email: invitee, phone: lead.phone, timezone: designer.calendly_timezone, s });
    eventUri = b.eventUri; inviteeUri = b.inviteeUri; externalId = b.eventUri;
    meetingUrl = await getEventLocation(auth, b.eventUri);
  }

  await q(
    "insert into bookings(lead_id, designer_id, provider, external_id, calendly_event_uri, calendly_invitee_uri, start_time, meeting_url) values($1,$2,$3,$4,$5,$6,$7,$8)",
    [leadId, designer.id, provider, externalId, eventUri, inviteeUri, start, meetingUrl],
  );
  await q(
    "update leads set status='consultation_booked', booking_id=$2, booking_time=$3, booking_status='booked', meeting_url=$4, updated_at=now() where id=$1",
    [leadId, externalId, start, meetingUrl],
  );
  return { start, meetingUrl, provider };
}
