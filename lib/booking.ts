import { q } from "./db";
import { loadConfig } from "./config";
import { createBooking, findSlots, inviteeEmail } from "./calendly";
import type { Designer } from "./assign";

/** Fetch the designer's slots, book the earliest, store it. Throws a human-readable error on failure. */
export async function bookConsultation(leadId: string, designer: Designer) {
  const { settings } = await loadConfig();
  const s = settings.calendly;
  if (!designer.calendly_token || !designer.calendly_event_type_uri) throw new Error(`${designer.name} has no Calendly token/event type configured`);
  const [lead] = await q("select l.*, (select extraction from calls where lead_id=l.id order by started_at desc limit 1) as ex from leads l where l.id=$1", [leadId]);
  const email: string | null = lead.ex?.email ?? null;
  if (!email && s.email_mode === "collected_only") throw new Error("Caller gave no email and email_mode is collected_only");

  const auth = { token: designer.calendly_token };
  const from = new Date(Date.now() + s.min_notice_hours * 3_600_000);
  const slots = await findSlots(auth, designer.calendly_event_type_uri, from, s.search_days, 1);
  if (!slots.length) throw new Error(`No free ${designer.name} slots in the next ${s.search_days} days`);

  const b = await createBooking(auth, {
    eventTypeUri: designer.calendly_event_type_uri, start: slots[0], name: lead.name ?? "Aangan enquiry",
    email: inviteeEmail(email, lead.phone, s), phone: lead.phone, timezone: designer.calendly_timezone, s,
  });
  await q(
    "insert into bookings(lead_id, designer_id, calendly_event_uri, calendly_invitee_uri, start_time) values($1,$2,$3,$4,$5)",
    [leadId, designer.id, b.eventUri, b.inviteeUri, slots[0]],
  );
  await q(
    "update leads set status='consultation_booked', booking_id=$2, booking_time=$3, booking_status='booked', updated_at=now() where id=$1",
    [leadId, b.eventUri, slots[0]],
  );
  return { start: slots[0], eventUri: b.eventUri };
}
